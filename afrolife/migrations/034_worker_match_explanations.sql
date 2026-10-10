-- Keep the inputs behind each worker ranking so staff can explain and review
-- a recommendation after matching weights or worker data change.
ALTER TABLE matches
  ADD COLUMN score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE matches
  ADD CONSTRAINT matches_score_breakdown_object
  CHECK (jsonb_typeof(score_breakdown) = 'object');
