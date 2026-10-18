ALTER TABLE edir_registration_applications
  ADD COLUMN upload_token_hash text CHECK (
    upload_token_hash IS NULL OR upload_token_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN upload_token_expires_at timestamptz,
  ADD CONSTRAINT edir_registration_upload_token_pair CHECK (
    (upload_token_hash IS NULL AND upload_token_expires_at IS NULL)
    OR (upload_token_hash IS NOT NULL AND upload_token_expires_at IS NOT NULL)
  );

CREATE TABLE edir_registration_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES edir_registration_applications(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('legal_registration','governance_charter')),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected')),
  uploaded_by uuid NOT NULL,
  reviewer_id uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, document_type),
  CHECK (
    (status='uploaded' AND reviewer_id IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('verified','rejected') AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  )
);

ALTER TABLE edir_registration_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_registration_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY edir_registration_public_upload_lookup ON edir_registration_applications FOR SELECT
  USING (
    app_role()='public'
    AND status='pending'
    AND upload_token_hash=current_setting('app.edir_registration_upload_token_hash',true)
    AND upload_token_expires_at>now()
  );
CREATE POLICY edir_registration_documents_public_submit ON edir_registration_documents FOR INSERT
  WITH CHECK (
    app_role()='public' AND EXISTS (
      SELECT 1 FROM edir_registration_applications application
      WHERE application.id=application_id AND application.status='pending'
        AND application.upload_token_hash IS NOT NULL
        AND application.upload_token_expires_at > now()
    )
  );
CREATE POLICY edir_registration_documents_public_replace ON edir_registration_documents FOR UPDATE
  USING (
    app_role()='public' AND status='rejected' AND EXISTS (
      SELECT 1 FROM edir_registration_applications application
      WHERE application.id=application_id AND application.status='pending'
        AND application.upload_token_hash=current_setting('app.edir_registration_upload_token_hash',true)
        AND application.upload_token_expires_at>now()
    )
  )
  WITH CHECK (
    app_role()='public' AND status='uploaded' AND EXISTS (
      SELECT 1 FROM edir_registration_applications application
      WHERE application.id=application_id AND application.status='pending'
        AND application.upload_token_hash=current_setting('app.edir_registration_upload_token_hash',true)
        AND application.upload_token_expires_at>now()
    )
  );
CREATE POLICY edir_registration_documents_master_read ON edir_registration_documents FOR SELECT
  USING (edir_is_master_operator());
CREATE POLICY edir_registration_documents_master_review ON edir_registration_documents FOR UPDATE
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());

GRANT SELECT, INSERT, UPDATE ON TABLE edir_registration_documents TO "{{role}}";
GRANT SELECT, UPDATE ON TABLE edir_registration_applications TO "{{role}}";
