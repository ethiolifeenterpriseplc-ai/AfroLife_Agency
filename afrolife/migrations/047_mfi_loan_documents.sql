CREATE TABLE mfi_loan_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type ~ '^[a-z][a-z0-9_-]{1,79}$'),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id,member_id) REFERENCES mfi_members(institution_id,id),
  UNIQUE (institution_id,id),
  CHECK ((status='uploaded' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('verified','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>uploaded_by)
);
CREATE INDEX mfi_loan_documents_member_idx ON mfi_loan_documents(institution_id,member_id,document_type,status);
CREATE FUNCTION mfi_guard_loan_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loan document history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') THEN
    RAISE EXCEPTION 'Loan document content and uploader metadata are immutable';
  END IF;
  IF OLD.status<>'uploaded' OR NEW.status NOT IN ('verified','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.uploaded_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Loan document review requires an independent reviewer and reason';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_loan_document_guard BEFORE UPDATE OR DELETE ON mfi_loan_documents
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_loan_document();
CREATE FUNCTION mfi_require_national_id_for_verified_kyc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kyc_status='verified' AND OLD.kyc_status IS DISTINCT FROM 'verified'
     AND NOT EXISTS (
       SELECT 1 FROM mfi_loan_documents document
       WHERE document.institution_id=NEW.institution_id AND document.member_id=NEW.id
         AND document.document_type='national_id' AND document.status='verified'
         AND document.reviewed_by IS DISTINCT FROM app_user_id()
     ) THEN
    RAISE EXCEPTION 'An independently verified national ID document is required for KYC approval';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_member_national_id_kyc_guard BEFORE UPDATE OF kyc_status ON mfi_members
  FOR EACH ROW EXECUTE FUNCTION mfi_require_national_id_for_verified_kyc();
ALTER TABLE mfi_loan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loan_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_loan_documents_scope ON mfi_loan_documents
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_loan_documents TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_loan_document() TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_require_national_id_for_verified_kyc() TO "{{role}}";
