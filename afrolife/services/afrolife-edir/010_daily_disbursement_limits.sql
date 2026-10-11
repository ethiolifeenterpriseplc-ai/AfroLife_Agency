CREATE TABLE edir_disbursement_limit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  version integer NOT NULL CHECK (version>0),
  daily_limit numeric(14,2) CHECK (daily_limit IS NULL OR daily_limit>0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','superseded','rejected')),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  UNIQUE (organization_id,version),
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE UNIQUE INDEX edir_disbursement_limit_one_pending_idx ON edir_disbursement_limit_versions(organization_id) WHERE status='pending';
CREATE UNIQUE INDEX edir_disbursement_limit_one_active_idx ON edir_disbursement_limit_versions(organization_id) WHERE status='active';
ALTER TABLE edir_disbursement_limit_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_disbursement_limit_versions NO FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_disbursement_limit_read ON edir_disbursement_limit_versions FOR SELECT
  USING(edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_disbursement_limit_create ON edir_disbursement_limit_versions FOR INSERT
  WITH CHECK(created_by=app_user_id() AND (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager'])));
CREATE POLICY edir_disbursement_limit_review ON edir_disbursement_limit_versions FOR UPDATE
  USING(edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']))
  WITH CHECK(edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']));
CREATE POLICY edir_disbursement_limit_tenant_scope ON edir_disbursement_limit_versions AS RESTRICTIVE FOR ALL
  USING(organization_id=app_edir_id() OR edir_is_platform_admin()) WITH CHECK(organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE TRIGGER edir_disbursement_limit_tenant_guard BEFORE UPDATE OF organization_id ON edir_disbursement_limit_versions
  FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE FUNCTION edir_guard_disbursement_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir disbursement limit history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') THEN
    RAISE EXCEPTION 'Edir disbursement limit terms and authorship are immutable';
  END IF;
  IF OLD.status='pending' AND NEW.status IN ('active','rejected') THEN
    IF NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL
       OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Edir limit decision requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='superseded' THEN
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN RAISE EXCEPTION 'Edir limit evidence is immutable'; END IF;
  ELSE RAISE EXCEPTION 'Invalid Edir disbursement limit transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_disbursement_limit_guard BEFORE UPDATE OR DELETE ON edir_disbursement_limit_versions
  FOR EACH ROW EXECUTE FUNCTION edir_guard_disbursement_limit();
GRANT SELECT,INSERT,UPDATE ON TABLE edir_disbursement_limit_versions TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_disbursement_limit() TO "{{role}}";
