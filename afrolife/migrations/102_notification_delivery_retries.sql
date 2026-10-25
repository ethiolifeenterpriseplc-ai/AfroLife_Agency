ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check,
  ADD CONSTRAINT notifications_status_check
    CHECK (status IN ('pending','sending','sent','read','dead')),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN total_attempt_count integer NOT NULL DEFAULT 0 CHECK (total_attempt_count >= attempt_count),
  ADD COLUMN retry_generation integer NOT NULL DEFAULT 0 CHECK (retry_generation >= 0),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN last_error text CHECK (last_error IS NULL OR length(last_error) <= 1000);

UPDATE notifications SET claimed_at=created_at WHERE status='sending';

CREATE INDEX notifications_webhook_due_idx
  ON notifications(next_attempt_at,id)
  WHERE channel='webhook' AND status='pending';
CREATE INDEX notifications_webhook_claimed_idx
  ON notifications(claimed_at,id)
  WHERE channel='webhook' AND status='sending';
