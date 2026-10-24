CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('general','service','agent_complaint','financial','legal','privacy','safety','fraud')),
  subject_user_id uuid REFERENCES users(id),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 4000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_customer','escalated','resolved','appealed')),
  outcome text CHECK (outcome IS NULL OR length(trim(outcome)) BETWEEN 5 AND 2000),
  rationale text CHECK (rationale IS NULL OR length(trim(rationale)) BETWEEN 10 AND 2000),
  corrective_action text CHECK (corrective_action IS NULL OR length(trim(corrective_action)) BETWEEN 5 AND 2000),
  refund_reference text CHECK (refund_reference IS NULL OR length(trim(refund_reference)) BETWEEN 2 AND 200),
  formal_workflow_reference text CHECK (formal_workflow_reference IS NULL OR length(trim(formal_workflow_reference)) BETWEEN 3 AND 200),
  appeal_route text CHECK (appeal_route IS NULL OR length(trim(appeal_route)) BETWEEN 5 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  CHECK ((category='agent_complaint' AND subject_user_id IS NOT NULL)
    OR (category<>'agent_complaint' AND subject_user_id IS NULL)),
  CHECK (category NOT IN ('safety','fraud','privacy','legal') OR priority='urgent'),
  CHECK ((status IN ('resolved','appealed')
      AND outcome IS NOT NULL AND rationale IS NOT NULL AND corrective_action IS NOT NULL
      AND refund_reference IS NOT NULL AND appeal_route IS NOT NULL
      AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status NOT IN ('resolved','appealed')
      AND resolved_by IS NULL AND resolved_at IS NULL)),
  CHECK (category NOT IN ('financial','legal') OR status NOT IN ('resolved','appealed')
      OR formal_workflow_reference IS NOT NULL),
  CHECK (user_id <> subject_user_id)
);

CREATE INDEX support_cases_owner_idx ON support_cases(user_id,created_at DESC);
CREATE INDEX support_cases_queue_idx ON support_cases(status,priority,created_at)
  WHERE status <> 'resolved';

CREATE TABLE support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES support_cases(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('created','status_changed','resolved','appealed','access_requested','access_decided')),
  prior_status text,
  new_status text,
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 5 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_case_events_case_idx ON support_case_events(case_id,created_at);

CREATE TABLE support_case_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES support_cases(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  request_reason text NOT NULL CHECK (length(trim(request_reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  reviewed_by uuid REFERENCES users(id),
  review_reason text CHECK (review_reason IS NULL OR length(trim(review_reason)) BETWEEN 10 AND 1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND expires_at IS NULL)
    OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND expires_at IS NOT NULL
      AND expires_at > reviewed_at AND expires_at <= reviewed_at + interval '15 minutes')
    OR (status IN ('denied','expired') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND expires_at IS NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);
CREATE INDEX support_case_access_pending_idx ON support_case_access_requests(status,requested_at)
  WHERE status='pending';

CREATE OR REPLACE FUNCTION prevent_support_case_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Support case events are append-only';
END
$$;
CREATE TRIGGER support_case_events_immutable
BEFORE UPDATE OR DELETE ON support_case_events
FOR EACH ROW EXECUTE FUNCTION prevent_support_case_event_mutation();
REVOKE ALL ON FUNCTION prevent_support_case_event_mutation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION guard_support_case_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='appealed' OR (OLD.status='resolved' AND NEW.status<>'appealed') THEN
    RAISE EXCEPTION 'Resolved support cases are immutable except for a user appeal';
  END IF;
  IF OLD.status='resolved' AND (
    NEW.outcome IS DISTINCT FROM OLD.outcome
    OR NEW.rationale IS DISTINCT FROM OLD.rationale
    OR NEW.corrective_action IS DISTINCT FROM OLD.corrective_action
    OR NEW.refund_reference IS DISTINCT FROM OLD.refund_reference
    OR NEW.formal_workflow_reference IS DISTINCT FROM OLD.formal_workflow_reference
    OR NEW.appeal_route IS DISTINCT FROM OLD.appeal_route
    OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
  ) THEN
    RAISE EXCEPTION 'Resolved support case findings are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN (
    'in_progress','pending_customer','escalated','resolved','appealed'
  ) THEN
    RAISE EXCEPTION 'Invalid support case state transition';
  END IF;
  IF NEW.user_id<>OLD.user_id OR NEW.category<>OLD.category
    OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
    OR NEW.subject<>OLD.subject OR NEW.description<>OLD.description
    OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Support case intake evidence is immutable';
  END IF;
  IF NEW.category IN ('safety','fraud','privacy','legal') AND NEW.priority<>'urgent' THEN
    RAISE EXCEPTION 'Safety, fraud, privacy and legal cases must remain urgent';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER support_case_update_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION guard_support_case_update();
REVOKE ALL ON FUNCTION guard_support_case_update() FROM PUBLIC;

CREATE OR REPLACE FUNCTION validate_support_case_intake()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category='agent_complaint' AND NOT EXISTS (
    SELECT 1 FROM users WHERE id=NEW.subject_user_id
      AND role IN ('master_agent','field_agent') AND active=true
  ) THEN
    RAISE EXCEPTION 'Agent complaints must identify an active Agent';
  END IF;
  IF NEW.category IN ('safety','fraud','privacy','legal') THEN
    NEW.priority := 'urgent';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER support_case_intake_guard
BEFORE INSERT ON support_cases
FOR EACH ROW EXECUTE FUNCTION validate_support_case_intake();
REVOKE ALL ON FUNCTION validate_support_case_intake() FROM PUBLIC;

CREATE OR REPLACE FUNCTION record_support_case_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_actor uuid;
        transition_reason text;
        transition_type text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    event_actor := app_user_id();
    IF event_actor IS NULL THEN
      RAISE EXCEPTION 'Support case transitions require an authenticated actor';
    END IF;
    transition_reason := nullif(current_setting('app.support_case_reason',true),'');
    transition_type := CASE NEW.status WHEN 'resolved' THEN 'resolved'
      WHEN 'appealed' THEN 'appealed' ELSE 'status_changed' END;
    INSERT INTO support_case_events (case_id,actor_id,event_type,prior_status,new_status,reason)
    VALUES (NEW.id,event_actor,transition_type,OLD.status,NEW.status,transition_reason);
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER support_case_status_event
AFTER UPDATE OF status ON support_cases
FOR EACH ROW EXECUTE FUNCTION record_support_case_status_transition();
REVOKE ALL ON FUNCTION record_support_case_status_transition() FROM PUBLIC;

ALTER TABLE support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY support_cases_owner_read ON support_cases
  FOR SELECT USING (user_id=app_user_id());
CREATE POLICY support_cases_staff_read ON support_cases
  FOR SELECT USING (app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager'));
CREATE POLICY support_cases_owner_insert ON support_cases
  FOR INSERT WITH CHECK (user_id=app_user_id() AND resolved_by IS NULL AND resolved_at IS NULL);
CREATE POLICY support_cases_staff_update ON support_cases
  FOR UPDATE USING (app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager'))
  WITH CHECK (app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager'));
CREATE POLICY support_cases_owner_appeal ON support_cases
  FOR UPDATE USING (user_id=app_user_id() AND status='resolved')
  WITH CHECK (user_id=app_user_id() AND status='appealed');
GRANT SELECT,INSERT,UPDATE (status,priority,outcome,rationale,corrective_action,refund_reference,
  formal_workflow_reference,appeal_route,updated_at,resolved_by,resolved_at) ON support_cases TO "{{role}}";

ALTER TABLE support_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_events FORCE ROW LEVEL SECURITY;
CREATE POLICY support_case_events_read ON support_case_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_cases c WHERE c.id=case_id AND c.user_id=app_user_id())
    OR app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
  );
CREATE POLICY support_case_events_insert ON support_case_events
  FOR INSERT WITH CHECK (
    actor_id=app_user_id() AND (
      EXISTS (SELECT 1 FROM support_cases c WHERE c.id=case_id AND c.user_id=app_user_id())
      OR app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    )
  );
GRANT SELECT,INSERT ON support_case_events TO "{{role}}";

ALTER TABLE support_case_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_access_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY support_case_access_read ON support_case_access_requests
  FOR SELECT USING (
    requested_by=app_user_id() OR app_role() IN ('global_admin','super_admin','compliance')
  );
CREATE POLICY support_case_access_insert ON support_case_access_requests
  FOR INSERT WITH CHECK (
    requested_by=app_user_id()
    AND app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND expires_at IS NULL
  );
CREATE POLICY support_case_access_review ON support_case_access_requests
  FOR UPDATE USING (
    app_role() IN ('global_admin','super_admin','compliance') AND status='pending'
  )
  WITH CHECK (
    app_role() IN ('global_admin','super_admin','compliance')
    AND reviewed_by=app_user_id() AND reviewed_by<>requested_by
    AND status IN ('approved','denied')
  );
GRANT SELECT,INSERT,UPDATE ON support_case_access_requests TO "{{role}}";
