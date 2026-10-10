ALTER TABLE documents
  ADD COLUMN review_note text;

ALTER TABLE user_documents
  ADD COLUMN review_note text;

-- Older rejected records predate reviewer feedback. Keep their history readable
-- without inventing a reason that was never captured.
UPDATE documents
SET review_note = 'No review reason was recorded for this earlier decision.'
WHERE status = 'rejected' AND review_note IS NULL;

UPDATE user_documents
SET review_note = 'No review reason was recorded for this earlier decision.'
WHERE status = 'rejected' AND review_note IS NULL;

ALTER TABLE documents
  ADD CONSTRAINT documents_rejection_note_required
  CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND length(btrim(review_note)) >= 10));

ALTER TABLE user_documents
  ADD CONSTRAINT user_documents_rejection_note_required
  CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND length(btrim(review_note)) >= 10));

CREATE INDEX documents_review_queue_idx
  ON documents (created_at) WHERE status IN ('uploaded', 'under_review');

CREATE INDEX user_documents_review_queue_idx
  ON user_documents (created_at) WHERE status = 'uploaded';
