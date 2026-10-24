ALTER TABLE support_case_events
  DROP CONSTRAINT support_case_events_event_type_check;
ALTER TABLE support_case_events
  ADD CONSTRAINT support_case_events_event_type_check CHECK (
    event_type IN ('created','status_changed','resolved','appealed','access_requested','access_decided','appeal_reviewed')
  );

CREATE TABLE support_case_appeal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES support_cases(id),
  decision text NOT NULL CHECK (decision IN ('upheld','overturned')),
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 2000),
  corrective_action text CHECK (corrective_action IS NULL OR length(trim(corrective_action)) BETWEEN 5 AND 2000),
  formal_workflow_reference text CHECK (
    formal_workflow_reference IS NULL OR length(trim(formal_workflow_reference)) BETWEEN 3 AND 200
  ),
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'overturned' OR corrective_action IS NOT NULL)
);
CREATE INDEX support_case_appeal_reviews_reviewer_idx
  ON support_case_appeal_reviews(reviewed_by, reviewed_at DESC);

CREATE OR REPLACE FUNCTION app_support_appeal_queue()
RETURNS TABLE (
  id uuid,
  category text,
  priority text,
  resolved_at timestamptz,
  appealed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT c.id, c.category, c.priority, c.resolved_at, e.created_at AS appealed_at
  FROM support_cases c
  JOIN LATERAL (
    SELECT event.created_at
    FROM support_case_events event
    WHERE event.case_id = c.id AND event.event_type = 'appealed'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1
  ) e ON true
  WHERE app_role() IN ('global_admin','super_admin','compliance')
    AND c.status = 'appealed'
    AND c.resolved_by <> app_user_id()
    AND NOT EXISTS (
      SELECT 1 FROM support_case_appeal_reviews review WHERE review.case_id = c.id
    )
  ORDER BY e.created_at
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION app_support_appeal_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_support_appeal_queue() TO "{{role}}";

CREATE OR REPLACE FUNCTION app_support_case_can_request_access(target_case uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    AND EXISTS (
      SELECT 1 FROM support_cases c
      WHERE c.id = target_case
        AND (c.status <> 'appealed' OR c.resolved_by <> app_user_id())
    )
$$;
REVOKE ALL ON FUNCTION app_support_case_can_request_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_support_case_can_request_access(uuid) TO "{{role}}";

DROP POLICY support_case_access_insert ON support_case_access_requests;
CREATE POLICY support_case_access_insert ON support_case_access_requests
  FOR INSERT WITH CHECK (
    requested_by=app_user_id()
    AND app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    AND app_support_case_can_request_access(case_id)
    AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND expires_at IS NULL
  );

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
CREATE POLICY support_case_appeal_reviews_authorized_read
  ON support_case_appeal_reviews FOR SELECT
  USING (app_support_case_can_access(case_id));
CREATE POLICY support_case_appeal_reviews_independent_insert
  ON support_case_appeal_reviews FOR INSERT
  WITH CHECK (
    app_role() IN ('global_admin','super_admin','compliance')
    AND reviewed_by = app_user_id()
    AND app_support_case_can_access(case_id)
    AND EXISTS (
      SELECT 1 FROM support_cases c
      WHERE c.id = case_id
        AND c.status = 'appealed'
        AND c.resolved_by <> app_user_id()
        AND (
          c.category NOT IN ('financial','legal')
          OR decision <> 'overturned'
          OR formal_workflow_reference IS NOT NULL
        )
    )
  );
GRANT SELECT, INSERT ON support_case_appeal_reviews TO "{{role}}";
