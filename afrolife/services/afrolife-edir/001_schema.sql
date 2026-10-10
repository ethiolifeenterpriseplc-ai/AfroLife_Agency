CREATE SEQUENCE edir_member_number_seq START 1;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN nullif(current_setting('app.role', true), '') = 'global_admin' THEN 'super_admin'
    ELSE coalesce(nullif(current_setting('app.role', true), ''), '')
  END
$$;

CREATE OR REPLACE FUNCTION edir_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_role() = 'super_admin'
$$;

CREATE TABLE edir_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  member_number text NOT NULL UNIQUE DEFAULT (
    'EDR-' || lpad(nextval('edir_member_number_seq')::text, 8, '0')
  ),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone text NOT NULL CHECK (length(trim(phone)) BETWEEN 7 AND 32),
  email text CHECK (email IS NULL OR length(trim(email)) <= 254),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','rejected','suspended','closed')),
  terms_version text NOT NULL DEFAULT 'nonfinancial-pilot-v1',
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR
    (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);

CREATE OR REPLACE FUNCTION edir_has_active_membership() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM edir_memberships
    WHERE user_id = app_user_id() AND status = 'active'
  )
$$;

CREATE TABLE edir_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code text NOT NULL UNIQUE CHECK (group_code ~ '^[A-Z0-9-]{2,20}$'),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE edir_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES edir_groups(id),
  member_id uuid NOT NULL REFERENCES edir_memberships(id),
  assigned_by uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id)
);

CREATE TABLE edir_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE edir_staff (
  user_id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('edir_admin','member_support','compliance','auditor')),
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION edir_has_staff_role(allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM edir_staff
    WHERE user_id = app_user_id() AND active AND role = ANY(allowed_roles)
  )
$$;

CREATE OR REPLACE FUNCTION edir_prevent_membership_identity_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id
     OR NEW.member_number <> OLD.member_number
     OR NEW.full_name <> OLD.full_name
     OR NEW.phone <> OLD.phone
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at
     OR NEW.terms_version <> OLD.terms_version
     OR NEW.terms_accepted_at <> OLD.terms_accepted_at THEN
    RAISE EXCEPTION 'Edir identity and membership evidence are immutable';
  END IF;
  IF OLD.status = 'pending' THEN
    IF NEW.status <> OLD.status THEN
      IF NEW.status NOT IN ('active','rejected')
         OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
         OR NEW.reviewed_by = NEW.created_by
         OR NEW.reviewed_at IS NULL
         OR NEW.review_reason IS NULL
         OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
        RAISE EXCEPTION 'Invalid Edir membership review';
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Pending membership review fields cannot change independently';
    END IF;
  ELSIF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'active' AND NEW.status IN ('suspended','closed'))
      OR (OLD.status = 'suspended' AND NEW.status IN ('active','closed'))
    ) OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
      OR NEW.reviewed_by = NEW.user_id
      OR NEW.reviewed_at IS NULL
      OR NEW.review_reason IS NULL
      OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Invalid Edir membership lifecycle transition';
    END IF;
  ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
    RAISE EXCEPTION 'Membership lifecycle evidence cannot change independently';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER edir_membership_identity_guard
BEFORE UPDATE ON edir_memberships
FOR EACH ROW EXECUTE FUNCTION edir_prevent_membership_identity_change();

CREATE OR REPLACE FUNCTION edir_prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Edir audit records are immutable';
END
$$;

CREATE TRIGGER edir_audit_immutable
BEFORE UPDATE OR DELETE ON edir_audit_logs
FOR EACH ROW EXECUTE FUNCTION edir_prevent_audit_mutation();

CREATE INDEX edir_memberships_status_idx ON edir_memberships (status, created_at DESC);
CREATE INDEX edir_group_memberships_member_idx ON edir_group_memberships (member_id, group_id);
CREATE INDEX edir_audit_recent_idx ON edir_audit_logs (created_at DESC);

ALTER TABLE edir_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_group_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_staff FORCE ROW LEVEL SECURITY;

CREATE POLICY edir_membership_read ON edir_memberships
  FOR SELECT USING (
    user_id = app_user_id() OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor'])
  );
CREATE POLICY edir_membership_enroll ON edir_memberships
  FOR INSERT WITH CHECK (
    edir_is_platform_admin()
    OR (user_id = app_user_id() AND created_by = app_user_id() AND status = 'pending'
      AND reviewed_by IS NULL AND reviewed_at IS NULL)
  );
CREATE POLICY edir_membership_review ON edir_memberships
  FOR UPDATE USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

CREATE POLICY edir_group_read ON edir_groups
  FOR SELECT USING (edir_is_platform_admin() OR edir_has_active_membership()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor']));
CREATE POLICY edir_group_manage ON edir_groups
  FOR ALL USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

CREATE POLICY edir_group_membership_read ON edir_group_memberships
  FOR SELECT USING (
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor'])
    OR member_id IN (SELECT id FROM edir_memberships WHERE user_id = app_user_id())
  );
CREATE POLICY edir_group_membership_manage ON edir_group_memberships
  FOR ALL USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

CREATE POLICY edir_audit_read ON edir_audit_logs
  FOR SELECT USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','compliance','auditor']));
CREATE POLICY edir_audit_insert ON edir_audit_logs
  FOR INSERT WITH CHECK (actor_id = app_user_id());
CREATE POLICY edir_staff_self_read ON edir_staff
  FOR SELECT USING (user_id = app_user_id() OR edir_is_platform_admin());
CREATE POLICY edir_staff_platform_management ON edir_staff
  FOR ALL USING (edir_is_platform_admin()) WITH CHECK (edir_is_platform_admin());

GRANT EXECUTE ON FUNCTION edir_has_staff_role(text[]) TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_user_id() TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_role() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_is_platform_admin() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_has_active_membership() TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_memberships TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_groups TO "{{role}}";
GRANT SELECT, INSERT ON TABLE edir_group_memberships TO "{{role}}";
GRANT SELECT, INSERT ON TABLE edir_audit_logs TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_staff TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE edir_member_number_seq TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE edir_audit_logs_id_seq TO "{{role}}";
