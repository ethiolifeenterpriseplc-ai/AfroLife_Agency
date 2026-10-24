ALTER TABLE support_case_events
  DROP CONSTRAINT support_case_events_event_type_check;
ALTER TABLE support_case_events
  ADD CONSTRAINT support_case_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','resolved','appealed','access_requested','access_decided','appeal_reviewed'
  ));

CREATE TABLE support_case_appeal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES support_cases(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL CHECK (outcome IN ('upheld','overturned')),
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION validate_support_case_appeal_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_status text;
        original_resolver uuid;
BEGIN
  SELECT status,resolved_by INTO case_status,original_resolver
  FROM support_cases WHERE id=NEW.case_id;
  IF case_status IS DISTINCT FROM 'appealed' THEN
    RAISE EXCEPTION 'Only appealed support cases can be reviewed';
  END IF;
  IF original_resolver IS NULL OR NEW.reviewer_id=original_resolver THEN
    RAISE EXCEPTION 'The original resolver cannot review their own case appeal';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM support_case_access_requests
    WHERE case_id=NEW.case_id AND requested_by=NEW.reviewer_id
      AND status='approved' AND expires_at>now()
  ) THEN
    RAISE EXCEPTION 'An active independent sensitive-access approval is required to review the appeal';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER support_case_appeal_review_validate
BEFORE INSERT ON support_case_appeal_reviews
FOR EACH ROW EXECUTE FUNCTION validate_support_case_appeal_review();
REVOKE ALL ON FUNCTION validate_support_case_appeal_review() FROM PUBLIC;

CREATE OR REPLACE FUNCTION prevent_support_case_appeal_review_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Support case appeal reviews are append-only';
END
$$;
CREATE TRIGGER support_case_appeal_reviews_immutable
BEFORE UPDATE OR DELETE ON support_case_appeal_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_support_case_appeal_review_mutation();
REVOKE ALL ON FUNCTION prevent_support_case_appeal_review_mutation() FROM PUBLIC;

ALTER TABLE support_case_appeal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_appeal_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY support_case_appeal_reviews_read ON support_case_appeal_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_cases c
      WHERE c.id=case_id AND c.user_id=app_user_id()
    )
    OR app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
  );
CREATE POLICY support_case_appeal_reviews_insert ON support_case_appeal_reviews
  FOR INSERT WITH CHECK (
    reviewer_id=app_user_id()
    AND app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
  );
REVOKE ALL ON TABLE support_case_appeal_reviews FROM PUBLIC;
REVOKE ALL ON TABLE support_case_appeal_reviews FROM "{{role}}";
GRANT SELECT,INSERT ON TABLE support_case_appeal_reviews TO "{{role}}";
