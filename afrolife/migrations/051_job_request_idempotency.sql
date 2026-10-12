-- Make retries of a timed-out job-request submission safe without changing legacy rows.
ALTER TABLE job_requests
  ADD COLUMN idempotency_user_id uuid REFERENCES users(id),
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN payload_hash text,
  ADD CONSTRAINT job_requests_idempotency_fields_together CHECK (
    (idempotency_user_id IS NULL AND idempotency_key IS NULL AND payload_hash IS NULL) OR
    (idempotency_user_id IS NOT NULL AND idempotency_key IS NOT NULL AND payload_hash IS NOT NULL AND payload_hash ~ '^[0-9a-f]{64}$')
  );

CREATE UNIQUE INDEX job_requests_idempotency_user_key
  ON job_requests (idempotency_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
