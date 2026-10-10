CREATE TABLE IF NOT EXISTS edir_staff (
  user_id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN (
    'edir_admin','member_support','compliance','auditor',
    'finance_manager','treasurer','credit_officer','credit_manager'
  )),
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

DROP TRIGGER IF EXISTS edir_membership_identity_guard ON edir_memberships;
CREATE TRIGGER edir_membership_identity_guard
BEFORE UPDATE ON edir_memberships
FOR EACH ROW EXECUTE FUNCTION edir_prevent_membership_identity_change();

ALTER TABLE edir_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_staff FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS edir_membership_read ON edir_memberships;
CREATE POLICY edir_membership_read ON edir_memberships
  FOR SELECT USING (
    user_id = app_user_id() OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor'])
  );

DROP POLICY IF EXISTS edir_membership_review ON edir_memberships;
CREATE POLICY edir_membership_review ON edir_memberships
  FOR UPDATE USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

DROP POLICY IF EXISTS edir_group_read ON edir_groups;
CREATE POLICY edir_group_read ON edir_groups
  FOR SELECT USING (edir_is_platform_admin() OR edir_has_active_membership()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor']));
DROP POLICY IF EXISTS edir_group_manage ON edir_groups;
CREATE POLICY edir_group_manage ON edir_groups
  FOR ALL USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

DROP POLICY IF EXISTS edir_group_membership_read ON edir_group_memberships;
CREATE POLICY edir_group_membership_read ON edir_group_memberships
  FOR SELECT USING (
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor'])
    OR member_id IN (SELECT id FROM edir_memberships WHERE user_id = app_user_id())
  );
DROP POLICY IF EXISTS edir_group_membership_manage ON edir_group_memberships;
CREATE POLICY edir_group_membership_manage ON edir_group_memberships
  FOR ALL USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin']));

DROP POLICY IF EXISTS edir_audit_read ON edir_audit_logs;
CREATE POLICY edir_audit_read ON edir_audit_logs
  FOR SELECT USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','compliance','auditor']));
DROP POLICY IF EXISTS edir_staff_self_read ON edir_staff;
CREATE POLICY edir_staff_self_read ON edir_staff
  FOR SELECT USING (user_id = app_user_id() OR edir_is_platform_admin());
DROP POLICY IF EXISTS edir_staff_platform_management ON edir_staff;
CREATE POLICY edir_staff_platform_management ON edir_staff
  FOR ALL USING (edir_is_platform_admin()) WITH CHECK (edir_is_platform_admin());

GRANT EXECUTE ON FUNCTION edir_has_staff_role(text[]) TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_staff TO "{{role}}";
