ALTER TABLE maintenance_requests
  ADD COLUMN idempotency_user_id uuid REFERENCES users(id),
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN idempotency_payload_hash text
    CHECK (idempotency_payload_hash IS NULL OR idempotency_payload_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT maintenance_idempotency_fields_check CHECK (
    (idempotency_key IS NULL AND idempotency_user_id IS NULL AND idempotency_payload_hash IS NULL)
    OR (idempotency_key IS NOT NULL AND idempotency_user_id IS NOT NULL AND idempotency_payload_hash IS NOT NULL)
  );

CREATE UNIQUE INDEX maintenance_idempotency_user_key_unique
  ON maintenance_requests (idempotency_user_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX documents_expiry_review_idx
  ON documents (expires_on,status,worker_id)
  WHERE expires_on IS NOT NULL AND status IN ('verified','uploaded','under_review');
