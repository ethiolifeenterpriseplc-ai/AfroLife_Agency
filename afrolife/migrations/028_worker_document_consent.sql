ALTER TABLE user_signups
  ADD COLUMN worker_document_consent_at timestamptz,
  ADD COLUMN worker_document_consent_version text;

ALTER TABLE user_signups
  ADD CONSTRAINT user_signups_worker_consent_pair_check
  CHECK ((worker_document_consent_at IS NULL) = (worker_document_consent_version IS NULL));
