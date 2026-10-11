CREATE TABLE edir_loan_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  member_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type ~ '^[a-z][a-z0-9_-]{1,79}$'),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected')),
  uploaded_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (member_id,organization_id) REFERENCES edir_memberships(id,organization_id),
  UNIQUE (id,organization_id),
  CHECK ((status='uploaded' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('verified','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>uploaded_by)
);
CREATE INDEX edir_loan_documents_member_idx ON edir_loan_documents(organization_id,member_id,document_type,status);
CREATE FUNCTION edir_guard_loan_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan document history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') THEN
    RAISE EXCEPTION 'Edir loan document content and uploader metadata are immutable';
  END IF;
  IF OLD.status<>'uploaded' OR NEW.status NOT IN ('verified','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.uploaded_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000
     OR NOT edir_has_staff_role(ARRAY['edir_admin','compliance','credit_manager']) THEN
    RAISE EXCEPTION 'Edir loan document review requires an independent reviewer and reason';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_loan_document_guard BEFORE UPDATE OR DELETE ON edir_loan_documents
  FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_document();
CREATE FUNCTION edir_require_national_id_for_verified_kyc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kyc_status='verified' AND OLD.kyc_status IS DISTINCT FROM 'verified'
     AND NOT EXISTS (
       SELECT 1 FROM edir_loan_documents document
       WHERE document.organization_id=NEW.organization_id AND document.member_id=NEW.id
         AND document.document_type='national_id' AND document.status='verified'
         AND document.reviewed_by IS DISTINCT FROM app_user_id()
     ) THEN
    RAISE EXCEPTION 'An independently verified Edir national ID document is required for KYC approval';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edir_membership_national_id_kyc_guard BEFORE UPDATE OF kyc_status ON edir_memberships
  FOR EACH ROW EXECUTE FUNCTION edir_require_national_id_for_verified_kyc();
CREATE FUNCTION edir_guard_loan_document_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan document history cannot be deleted'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'Edir loan document tenant cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_loan_document_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_documents
  FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_document_tenant();
ALTER TABLE edir_loan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_loan_documents_read ON edir_loan_documents FOR SELECT
  USING (organization_id=app_edir_id() AND (edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','credit_officer','credit_manager','auditor'])
    OR member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())));
CREATE POLICY edir_loan_documents_upload ON edir_loan_documents FOR INSERT
  WITH CHECK (organization_id=app_edir_id() AND uploaded_by=app_user_id() AND status='uploaded'
    AND member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id() AND status='active'));
CREATE POLICY edir_loan_documents_review ON edir_loan_documents FOR UPDATE
  USING (organization_id=app_edir_id() AND edir_has_staff_role(ARRAY['edir_admin','compliance','credit_manager']))
  WITH CHECK (organization_id=app_edir_id() AND edir_has_staff_role(ARRAY['edir_admin','compliance','credit_manager']));
GRANT SELECT,INSERT,UPDATE ON TABLE edir_loan_documents TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_document() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_document_tenant() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_require_national_id_for_verified_kyc() TO "{{role}}";
