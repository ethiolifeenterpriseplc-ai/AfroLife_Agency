ALTER TABLE maintenance_requests
  DROP CONSTRAINT maintenance_requests_status_check,
  ADD CONSTRAINT maintenance_requests_status_check
    CHECK (status IN ('open','triaged','assigned','in_progress','awaiting_review','completed','rework_required','done','cancelled')),
  ADD COLUMN completion_submitted_by uuid REFERENCES users(id),
  ADD COLUMN completion_submitted_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text,
  ADD CONSTRAINT maintenance_review_note_length
    CHECK (review_note IS NULL OR length(trim(review_note)) BETWEEN 5 AND 1000),
  ADD CONSTRAINT maintenance_completion_submission_required
    CHECK (status NOT IN ('awaiting_review','completed','rework_required') OR
      (completion_submitted_by IS NOT NULL AND completion_submitted_at IS NOT NULL)),
  ADD CONSTRAINT maintenance_completion_review_required
    CHECK (status NOT IN ('completed','rework_required') OR
      (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> completion_submitted_by
        AND length(trim(review_note)) >= 5));

ALTER TABLE maintenance_request_events
  DROP CONSTRAINT maintenance_request_events_event_type_check,
  ADD CONSTRAINT maintenance_request_events_event_type_check
    CHECK (event_type IN ('opened','triaged','assigned','in_progress','awaiting_review','completed','rework_required','cancelled','note'));

INSERT INTO role_activity_defaults(role_name, activity_key, enabled)
VALUES ('corporate_business_manager', 'property.maintenance.manage', true)
ON CONFLICT (role_name, activity_key) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_maintenance_workflow_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NOT (CASE OLD.status
    WHEN 'open' THEN NEW.status IN ('triaged','cancelled')
    WHEN 'triaged' THEN NEW.status IN ('assigned','cancelled')
    WHEN 'assigned' THEN NEW.status IN ('in_progress','cancelled')
    WHEN 'in_progress' THEN NEW.status IN ('awaiting_review','cancelled')
    WHEN 'awaiting_review' THEN NEW.status IN ('completed','rework_required')
    WHEN 'rework_required' THEN NEW.status IN ('in_progress','cancelled')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'Invalid maintenance status transition: % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'triaged' AND length(trim(COALESCE(NEW.resolution_note,''))) < 5 THEN
    RAISE EXCEPTION 'Maintenance triage requires a documented note' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'assigned' AND length(trim(COALESCE(NEW.assigned_to,''))) < 2 THEN
    RAISE EXCEPTION 'Maintenance assignment requires an assignee' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'awaiting_review' AND (
    length(trim(COALESCE(NEW.resolution_note,''))) < 5
    OR NEW.completion_submitted_by IS DISTINCT FROM app_user_id()
    OR NEW.completion_submitted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Maintenance work submission is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('completed','rework_required') AND (
    app_role() NOT IN ('corporate_business_manager','super_admin','global_admin')
    OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
    OR NEW.reviewed_by = NEW.completion_submitted_by
    OR NEW.reviewed_at IS NULL
    OR length(trim(COALESCE(NEW.review_note,''))) < 5
  ) THEN
    RAISE EXCEPTION 'Maintenance completion requires an independent authorized reviewer and reason' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND length(trim(COALESCE(NEW.review_note,''))) < 5 THEN
    RAISE EXCEPTION 'Maintenance cancellation requires a reason' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER maintenance_workflow_transition_guard
  BEFORE UPDATE OF status ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_maintenance_workflow_transition();
