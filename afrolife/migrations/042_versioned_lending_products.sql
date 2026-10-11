CREATE TABLE mfi_loan_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','superseded','rejected')),
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms)='object'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,institution_id),
  UNIQUE (institution_id,id),
  UNIQUE (institution_id,product_id,version),
  FOREIGN KEY (institution_id,product_id) REFERENCES mfi_products(institution_id,id),
  CHECK (
    (status='pending_approval' AND approved_by IS NULL AND approved_at IS NULL AND review_reason IS NULL)
    OR (status IN ('active','superseded','rejected') AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (approved_by IS NULL OR approved_by<>created_by)
);
CREATE UNIQUE INDEX mfi_loan_product_one_pending_idx
  ON mfi_loan_product_versions(institution_id,product_id) WHERE status='pending_approval';
CREATE UNIQUE INDEX mfi_loan_product_one_active_idx
  ON mfi_loan_product_versions(institution_id,product_id) WHERE status='active';

CREATE OR REPLACE FUNCTION mfi_guard_loan_product_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loan product version history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'approved_by'-'approved_at'-'review_reason') <>
     (to_jsonb(OLD)-'status'-'approved_by'-'approved_at'-'review_reason') THEN
    RAISE EXCEPTION 'Loan product terms and authorship are immutable';
  END IF;
  IF OLD.status='pending_approval' AND NEW.status IN ('active','rejected') THEN
    IF NEW.approved_by IS DISTINCT FROM app_user_id() OR NEW.approved_by=OLD.created_by
       OR NEW.approved_at IS NULL OR NEW.review_reason IS NULL
       OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Loan product approval requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='superseded' THEN
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Loan product review evidence is immutable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid loan product version transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mfi_loan_product_version_guard
  BEFORE UPDATE OR DELETE ON mfi_loan_product_versions
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_loan_product_version();
CREATE OR REPLACE FUNCTION mfi_loan_product_prevent_tenant_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    RAISE EXCEPTION 'Loan product versions cannot change institution';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mfi_loan_product_tenant_guard
  BEFORE UPDATE OF institution_id ON mfi_loan_product_versions
  FOR EACH ROW EXECUTE FUNCTION mfi_loan_product_prevent_tenant_change();

ALTER TABLE mfi_loans ADD COLUMN product_version_id uuid;
ALTER TABLE mfi_loans ADD COLUMN product_terms jsonb;
ALTER TABLE mfi_loans ADD COLUMN eligibility_context jsonb;
ALTER TABLE mfi_loans ADD CONSTRAINT mfi_loan_product_version_fk
  FOREIGN KEY (institution_id,product_version_id) REFERENCES mfi_loan_product_versions(institution_id,id);
ALTER TABLE mfi_loans ADD CONSTRAINT mfi_loan_product_snapshot_object_check
  CHECK ((product_terms IS NULL OR jsonb_typeof(product_terms)='object')
     AND (eligibility_context IS NULL OR jsonb_typeof(eligibility_context)='object'));
ALTER TABLE mfi_loan_installments
  ADD COLUMN interest_due numeric(16,2) NOT NULL DEFAULT 0 CHECK (interest_due>=0),
  ADD COLUMN interest_paid numeric(16,2) NOT NULL DEFAULT 0 CHECK (interest_paid>=0 AND interest_paid<=interest_due),
  ADD COLUMN penalty_due numeric(16,2) NOT NULL DEFAULT 0 CHECK (penalty_due>=0),
  ADD COLUMN penalty_paid numeric(16,2) NOT NULL DEFAULT 0 CHECK (penalty_paid>=0 AND penalty_paid<=penalty_due),
  ADD COLUMN penalty_assessed_at timestamptz;

INSERT INTO mfi_gl_accounts(institution_id,account_code,name,account_type)
SELECT id,'4100','Loan interest income','income' FROM mfi_institutions
ON CONFLICT (institution_id,account_code) DO NOTHING;
INSERT INTO mfi_gl_accounts(institution_id,account_code,name,account_type)
SELECT id,'4200','Loan fee income','income' FROM mfi_institutions
ON CONFLICT (institution_id,account_code) DO NOTHING;
INSERT INTO mfi_gl_accounts(institution_id,account_code,name,account_type)
SELECT id,'4300','Loan penalty income','income' FROM mfi_institutions
ON CONFLICT (institution_id,account_code) DO NOTHING;

ALTER TABLE mfi_loan_product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loan_product_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_loan_product_version_scope ON mfi_loan_product_versions
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));

GRANT SELECT,INSERT,UPDATE ON TABLE mfi_loan_product_versions TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_loan_product_version() TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_loan_product_prevent_tenant_change() TO "{{role}}";
GRANT SELECT,UPDATE ON TABLE mfi_loans TO "{{role}}";
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_loan_installments TO "{{role}}";
