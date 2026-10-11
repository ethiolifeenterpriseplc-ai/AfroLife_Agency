CREATE TABLE edir_loan_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  product_code text NOT NULL CHECK (product_code ~ '^[A-Z0-9-]{2,20}$'),
  version integer NOT NULL CHECK (version>0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','superseded','rejected','paused')),
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms)='object'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,product_code,version),
  CHECK (
    (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('active','superseded','rejected','paused') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE UNIQUE INDEX edir_loan_product_one_pending_idx
  ON edir_loan_product_versions(organization_id,product_code) WHERE status='pending';
CREATE UNIQUE INDEX edir_loan_product_one_active_idx
  ON edir_loan_product_versions(organization_id,product_code) WHERE status='active';

CREATE OR REPLACE FUNCTION edir_guard_loan_product_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan product history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') <>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') THEN
    RAISE EXCEPTION 'Edir loan product terms and authorship are immutable';
  END IF;
  IF OLD.status='pending' AND NEW.status IN ('active','rejected') THEN
    IF NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by
       OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
       OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Edir loan product decision requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status IN ('superseded','paused') THEN
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Edir loan product review evidence is immutable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid Edir loan product version transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edir_loan_product_version_guard
  BEFORE UPDATE OR DELETE ON edir_loan_product_versions
  FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_product_version();
CREATE TRIGGER edir_loan_product_tenant_guard
  BEFORE UPDATE OF organization_id ON edir_loan_product_versions
  FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();

ALTER TABLE edir_loan_applications ADD COLUMN product_version_id uuid;
ALTER TABLE edir_loan_applications ADD COLUMN product_terms jsonb;
ALTER TABLE edir_loan_applications ADD COLUMN eligibility_context jsonb;
ALTER TABLE edir_loan_applications ADD CONSTRAINT edir_loan_application_product_fk
  FOREIGN KEY (organization_id,product_version_id) REFERENCES edir_loan_product_versions(organization_id,id);
ALTER TABLE edir_loan_applications ADD CONSTRAINT edir_loan_application_product_snapshot_check
  CHECK ((product_terms IS NULL OR jsonb_typeof(product_terms)='object')
     AND (eligibility_context IS NULL OR jsonb_typeof(eligibility_context)='object'));

CREATE POLICY edir_loan_product_read ON edir_loan_product_versions FOR SELECT
  USING (status='active' AND edir_has_active_membership()
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','compliance','auditor']));
CREATE POLICY edir_loan_product_create ON edir_loan_product_versions FOR INSERT
  WITH CHECK (created_by=app_user_id() AND status='pending'
    AND (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager'])));
CREATE POLICY edir_loan_product_review ON edir_loan_product_versions FOR UPDATE
  USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']));
CREATE POLICY edir_loan_product_tenant_scope ON edir_loan_product_versions AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());

GRANT SELECT,INSERT,UPDATE ON TABLE edir_loan_product_versions TO "{{role}}";
GRANT SELECT,UPDATE ON TABLE edir_loan_applications TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_product_version() TO "{{role}}";
