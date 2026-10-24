ALTER TABLE workers
  ADD COLUMN employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','terminated')),
  ADD COLUMN terminated_at timestamptz,
  ADD COLUMN terminated_by uuid REFERENCES users(id),
  ADD COLUMN termination_reason text,
  ADD CONSTRAINT workers_termination_state_check CHECK (
    (employment_status='active' AND terminated_at IS NULL AND terminated_by IS NULL AND termination_reason IS NULL)
    OR (employment_status='terminated' AND terminated_at IS NOT NULL AND terminated_by IS NOT NULL
      AND termination_reason IS NOT NULL AND length(trim(termination_reason)) >= 10)
  );

ALTER TABLE role_activity_permissions DROP CONSTRAINT IF EXISTS role_activity_permissions_activity_key_check;
ALTER TABLE role_activity_permissions ADD CONSTRAINT role_activity_permissions_activity_key_check CHECK (activity_key IN (
  'workforce.workers.view','workforce.workers.register','workforce.documents.view','workforce.documents.upload',
  'workforce.documents.review','workforce.workers.verify','workforce.shifts.manage','workforce.time.review',
  'workforce.leave.review','workforce.payroll.export','workforce.policy.manage','workforce.workers.offboard',
  'staffing.requests.manage','property.listings.view','property.listings.manage','property.tenancy.manage',
  'property.tenancy.approve','property.tenancy.execute','property.maintenance.manage','rent.payments.submit',
  'rent.transactions.view','rent.transactions.reconcile','rent.transactions.void','rent.deposit.refund_request',
  'learning.content.view','learning.content.manage'
));
ALTER TABLE role_activity_defaults DROP CONSTRAINT IF EXISTS role_activity_defaults_activity_key_check;
ALTER TABLE role_activity_defaults ADD CONSTRAINT role_activity_defaults_activity_key_check CHECK (activity_key IN (
  'workforce.workers.view','workforce.workers.register','workforce.documents.view','workforce.documents.upload',
  'workforce.documents.review','workforce.workers.verify','workforce.shifts.manage','workforce.time.review',
  'workforce.leave.review','workforce.payroll.export','workforce.policy.manage','workforce.workers.offboard',
  'staffing.requests.manage','property.listings.view','property.listings.manage','property.tenancy.manage',
  'property.tenancy.approve','property.tenancy.execute','property.maintenance.manage','rent.payments.submit',
  'rent.transactions.view','rent.transactions.reconcile','rent.transactions.void','rent.deposit.refund_request',
  'learning.content.view','learning.content.manage'
));

INSERT INTO role_activity_defaults (role_name, activity_key, enabled) VALUES
  ('global_admin','workforce.shifts.manage',true),
  ('global_admin','workforce.time.review',true),
  ('global_admin','workforce.leave.review',true),
  ('global_admin','workforce.payroll.export',true),
  ('global_admin','workforce.policy.manage',true),
  ('global_admin','workforce.workers.offboard',true),
  ('corporate_business_manager','workforce.workers.view',true),
  ('super_admin','workforce.shifts.manage',true),
  ('super_admin','workforce.time.review',true),
  ('super_admin','workforce.leave.review',true),
  ('super_admin','workforce.payroll.export',true),
  ('super_admin','workforce.policy.manage',true),
  ('super_admin','workforce.workers.offboard',true),
  ('corporate_business_manager','workforce.shifts.manage',true),
  ('corporate_business_manager','workforce.time.review',true),
  ('corporate_business_manager','workforce.leave.review',true),
  ('corporate_business_manager','workforce.workers.offboard',true),
  ('finance_manager','workforce.time.review',true),
  ('finance_manager','workforce.payroll.export',true),
  ('compliance','workforce.policy.manage',true),
  ('compliance','workforce.workers.offboard',true),
  ('master_agent','workforce.shifts.manage',true),
  ('master_agent','workforce.time.review',true),
  ('master_agent','workforce.leave.review',true),
  ('field_agent','workforce.shifts.manage',true),
  ('field_agent','workforce.time.review',true),
  ('field_agent','workforce.leave.review',true)
ON CONFLICT (role_name, activity_key) DO NOTHING;

CREATE TABLE workforce_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version text NOT NULL UNIQUE CHECK (length(trim(policy_version)) BETWEEN 1 AND 80),
  jurisdiction text NOT NULL CHECK (length(trim(jurisdiction)) BETWEEN 2 AND 80),
  citation text NOT NULL CHECK (length(trim(citation)) BETWEEN 10 AND 2000),
  effective_from date NOT NULL,
  effective_to date,
  warning_daily_minutes integer NOT NULL CHECK (warning_daily_minutes > 0),
  warning_weekly_minutes integer NOT NULL CHECK (warning_weekly_minutes > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  test_evidence text NOT NULL CHECK (length(trim(test_evidence)) BETWEEN 10 AND 4000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approval_evidence text CHECK (approval_evidence IS NULL OR length(trim(approval_evidence)) BETWEEN 10 AND 2000),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (created_by <> approved_by),
  CHECK ((status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_evidence IS NOT NULL)
    OR (status<>'approved' AND approved_by IS NULL AND approved_at IS NULL AND approval_evidence IS NULL))
);

CREATE TABLE workforce_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES staffing_engagements(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  worker_response text NOT NULL DEFAULT 'pending' CHECK (worker_response IN ('pending','accepted','declined')),
  worker_response_reason text CHECK (worker_response_reason IS NULL OR length(trim(worker_response_reason)) BETWEEN 10 AND 1000),
  worker_responded_by uuid REFERENCES users(id),
  worker_responded_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((worker_response='pending' AND worker_responded_by IS NULL AND worker_responded_at IS NULL)
    OR (worker_response<>'pending' AND worker_responded_by IS NOT NULL AND worker_responded_at IS NOT NULL)),
  CHECK (worker_response='pending' OR worker_response_reason IS NOT NULL)
);

CREATE TABLE workforce_clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES workforce_shifts(id),
  event_type text NOT NULL CHECK (event_type IN ('clock_in','clock_out')),
  client_event_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES users(id),
  source text NOT NULL CHECK (source IN ('online','offline')),
  UNIQUE (recorded_by, client_event_id),
  UNIQUE (shift_id, event_type)
);

CREATE TABLE workforce_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL UNIQUE REFERENCES workforce_shifts(id),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','needs_review','approved','payable','exported')),
  exception_reason text CHECK (exception_reason IS NULL OR length(trim(exception_reason)) BETWEEN 5 AND 1000),
  approved_clock_in_at timestamptz,
  approved_clock_out_at timestamptz,
  approved_minutes integer CHECK (approved_minutes IS NULL OR approved_minutes > 0),
  payable_minutes integer CHECK (payable_minutes IS NULL OR payable_minutes > 0),
  policy_version_id uuid REFERENCES workforce_policy_versions(id),
  policy_warnings text[] NOT NULL DEFAULT '{}',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_reason text CHECK (approval_reason IS NULL OR length(trim(approval_reason)) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('approved','payable','exported')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'needs_review' OR exception_reason IS NOT NULL),
  CHECK (status NOT IN ('approved','payable','exported') OR
    (approval_reason IS NOT NULL AND approved_clock_in_at IS NOT NULL
      AND approved_clock_out_at IS NOT NULL AND approved_minutes IS NOT NULL)),
  CHECK (status NOT IN ('payable','exported') OR
    (payable_minutes IS NOT NULL AND policy_version_id IS NOT NULL AND approved_clock_in_at IS NOT NULL AND approved_clock_out_at IS NOT NULL)),
  CHECK (status <> 'exported' OR payable_minutes IS NOT NULL)
);

CREATE TABLE workforce_time_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES workforce_shifts(id),
  proposed_clock_in_at timestamptz,
  proposed_clock_out_at timestamptz,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  review_reason text CHECK (review_reason IS NULL OR length(trim(review_reason)) BETWEEN 10 AND 1000),
  reviewed_at timestamptz,
  CHECK (proposed_clock_in_at IS NOT NULL OR proposed_clock_out_at IS NOT NULL),
  CHECK (requested_by <> reviewed_by),
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL))
);

CREATE TABLE workforce_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES staffing_engagements(id),
  user_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('leave','availability')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','withdrawn')),
  reviewed_by uuid REFERENCES users(id),
  review_reason text CHECK (review_reason IS NULL OR length(trim(review_reason)) BETWEEN 10 AND 1000),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (reviewed_by IS NULL OR reviewed_by <> user_id),
  CHECK ((status IN ('submitted','withdrawn') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL))
);

CREATE TABLE workforce_payroll_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  policy_version_id uuid NOT NULL REFERENCES workforce_policy_versions(id),
  mapping_version text NOT NULL CHECK (length(trim(mapping_version)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','handoff_failed','handed_off')),
  row_count integer NOT NULL CHECK (row_count > 0),
  total_payable_minutes bigint NOT NULL CHECK (total_payable_minutes > 0),
  control_hash text NOT NULL CHECK (control_hash ~ '^[0-9a-f]{64}$'),
  encryption_key_id text NOT NULL CHECK (length(trim(encryption_key_id)) BETWEEN 1 AND 80),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  handoff_reason text CHECK (handoff_reason IS NULL OR length(trim(handoff_reason)) BETWEEN 10 AND 1000),
  handoff_reference text CHECK (handoff_reference IS NULL OR length(trim(handoff_reference)) BETWEEN 3 AND 160),
  handed_off_by uuid REFERENCES users(id),
  handed_off_at timestamptz,
  CHECK (period_end >= period_start),
  CHECK ((status='generated' AND handoff_reason IS NULL AND handed_off_by IS NULL AND handed_off_at IS NULL)
    OR (status IN ('handoff_failed','handed_off') AND handoff_reason IS NOT NULL AND handed_off_by IS NOT NULL AND handed_off_at IS NOT NULL)),
  CHECK (status<>'handed_off' OR handoff_reference IS NOT NULL)
);

CREATE TABLE workforce_payroll_export_items (
  export_id uuid NOT NULL REFERENCES workforce_payroll_exports(id),
  time_entry_id uuid NOT NULL REFERENCES workforce_time_entries(id),
  PRIMARY KEY (export_id, time_entry_id),
  UNIQUE (time_entry_id)
);

CREATE TABLE workforce_payroll_export_payloads (
  export_id uuid PRIMARY KEY REFERENCES workforce_payroll_exports(id),
  encrypted_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workforce_shifts_engagement_date_idx ON workforce_shifts(engagement_id, starts_at);
CREATE INDEX workforce_shifts_queue_idx ON workforce_shifts(status, starts_at);
CREATE INDEX workforce_time_entries_status_idx ON workforce_time_entries(status, updated_at);
CREATE INDEX workforce_time_corrections_queue_idx ON workforce_time_corrections(status, requested_at);
CREATE UNIQUE INDEX workforce_time_corrections_one_pending_per_shift_idx
  ON workforce_time_corrections(shift_id) WHERE status='pending';
CREATE INDEX workforce_leave_requests_user_idx ON workforce_leave_requests(user_id, starts_on DESC);
CREATE INDEX workforce_leave_requests_queue_idx ON workforce_leave_requests(status, starts_on);
CREATE INDEX workforce_payroll_exports_period_idx ON workforce_payroll_exports(period_start, period_end, created_at DESC);

CREATE OR REPLACE FUNCTION app_worker_owns_engagement(target_engagement uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT app_role() = 'worker' AND EXISTS (
    SELECT 1 FROM staffing_engagements e
    JOIN workers w ON w.id = e.worker_id
    JOIN users u ON u.id = app_user_id()
    WHERE e.id = target_engagement AND w.phone = u.phone
  )
$$;
CREATE OR REPLACE FUNCTION app_worker_owns_shift(target_shift uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT app_role() = 'worker' AND EXISTS (
    SELECT 1 FROM workforce_shifts s
    JOIN staffing_engagements e ON e.id = s.engagement_id
    JOIN workers w ON w.id = e.worker_id
    JOIN users u ON u.id = app_user_id()
    WHERE s.id = target_shift AND w.phone = u.phone
  )
$$;
CREATE OR REPLACE FUNCTION app_worker_owns_time_entry(target_entry uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT app_role() = 'worker' AND EXISTS (
    SELECT 1 FROM workforce_time_entries t
    JOIN workforce_shifts s ON s.id = t.shift_id
    JOIN staffing_engagements e ON e.id = s.engagement_id
    JOIN workers w ON w.id = e.worker_id
    JOIN users u ON u.id = app_user_id()
    WHERE t.id = target_entry AND w.phone = u.phone
  )
$$;
CREATE OR REPLACE FUNCTION app_can_manage_workforce_engagement(target_engagement uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM staffing_engagements e
    WHERE e.id=target_engagement AND (
      app_role() IN ('global_admin','super_admin','corporate_business_manager','finance_manager')
      OR (
        app_can_access_agent(e.source_agent_id)
        AND (
          app_has_permission('workforce.shifts.manage')
          OR app_has_permission('workforce.time.review')
          OR app_has_permission('workforce.leave.review')
          OR app_has_permission('workforce.payroll.export')
        )
      )
    )
  )
$$;
CREATE OR REPLACE FUNCTION app_can_manage_workforce_shift(target_shift uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM workforce_shifts s
    WHERE s.id=target_shift AND app_can_manage_workforce_engagement(s.engagement_id)
  )
$$;
REVOKE ALL ON FUNCTION app_worker_owns_engagement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_worker_owns_shift(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_worker_owns_time_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_can_manage_workforce_engagement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_can_manage_workforce_shift(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_worker_owns_engagement(uuid) TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_worker_owns_shift(uuid) TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_worker_owns_time_entry(uuid) TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_can_manage_workforce_engagement(uuid) TO "{{role}}";
GRANT EXECUTE ON FUNCTION app_can_manage_workforce_shift(uuid) TO "{{role}}";

CREATE OR REPLACE FUNCTION app_offboard_worker(target_worker uuid, reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE worker_record workers%ROWTYPE;
        worker_user_id uuid;
BEGIN
  IF NOT app_has_permission('workforce.workers.offboard')
    OR length(trim(coalesce(reason,''))) < 10 THEN
    RAISE EXCEPTION 'Worker offboarding is not authorized or the reason is too short';
  END IF;
  SELECT * INTO worker_record FROM workers WHERE id=target_worker;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found'; END IF;
  IF app_role() NOT IN ('global_admin','super_admin','corporate_business_manager','compliance')
    AND NOT app_can_access_agent(worker_record.source_agent_id) THEN
    RAISE EXCEPTION 'Worker is outside the actor scope';
  END IF;
  PERFORM set_config('app.access_change_reason',trim(reason),true);
  PERFORM 1 FROM staffing_engagements
    WHERE worker_id=target_worker ORDER BY id FOR UPDATE;
  SELECT * INTO worker_record FROM workers WHERE id=target_worker FOR UPDATE;
  IF worker_record.employment_status='terminated' THEN RAISE EXCEPTION 'Worker is already terminated'; END IF;
  UPDATE workers SET employment_status='terminated',terminated_at=now(),terminated_by=app_user_id(),
    termination_reason=trim(reason) WHERE id=target_worker;
  SELECT id INTO worker_user_id FROM users WHERE role='worker' AND phone=worker_record.phone FOR UPDATE;
  IF worker_user_id IS NOT NULL THEN
    UPDATE users SET active=false WHERE id=worker_user_id;
    UPDATE auth_sessions SET revoked_at=now() WHERE user_id=worker_user_id AND revoked_at IS NULL;
  END IF;
  UPDATE workforce_shifts SET status='cancelled'
    WHERE engagement_id IN (SELECT id FROM staffing_engagements WHERE worker_id=target_worker)
      AND status='scheduled' AND starts_at>now()
      AND NOT EXISTS (SELECT 1 FROM workforce_clock_events c WHERE c.shift_id=workforce_shifts.id);
  UPDATE staffing_engagements SET status='completed'
    WHERE worker_id=target_worker AND status='active';
  RETURN worker_user_id;
END
$$;
REVOKE ALL ON FUNCTION app_offboard_worker(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_offboard_worker(uuid,text) TO "{{role}}";

CREATE OR REPLACE FUNCTION prevent_workforce_clock_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Workforce evidence records are append-only';
END
$$;
CREATE TRIGGER workforce_clock_events_immutable
BEFORE UPDATE OR DELETE ON workforce_clock_events
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_clock_event_mutation();
CREATE TRIGGER workforce_payroll_export_payloads_immutable
BEFORE UPDATE OR DELETE ON workforce_payroll_export_payloads
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_clock_event_mutation();

CREATE OR REPLACE FUNCTION validate_workforce_time_entry_source_events()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_clock_in timestamptz;
        source_clock_out timestamptz;
BEGIN
  SELECT occurred_at INTO source_clock_in FROM workforce_clock_events
    WHERE shift_id=NEW.shift_id AND event_type='clock_in';
  SELECT occurred_at INTO source_clock_out FROM workforce_clock_events
    WHERE shift_id=NEW.shift_id AND event_type='clock_out';
  IF NEW.clock_in_at IS DISTINCT FROM source_clock_in THEN
    RAISE EXCEPTION 'Recorded clock-in time must match its immutable source event';
  END IF;
  IF NEW.clock_out_at IS DISTINCT FROM source_clock_out THEN
    RAISE EXCEPTION 'Recorded clock-out time must match its immutable source event';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workforce_time_entry_source_event_guard
BEFORE INSERT OR UPDATE ON workforce_time_entries
FOR EACH ROW EXECUTE FUNCTION validate_workforce_time_entry_source_events();

CREATE OR REPLACE FUNCTION prevent_workforce_approved_policy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='approved' THEN
    RAISE EXCEPTION 'Approved workforce policy versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workforce_approved_policy_immutable
BEFORE UPDATE OR DELETE ON workforce_policy_versions
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_approved_policy_mutation();

CREATE OR REPLACE FUNCTION prevent_workforce_exported_time_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='exported' THEN
    RAISE EXCEPTION 'Exported workforce time is immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workforce_exported_time_immutable
BEFORE UPDATE OR DELETE ON workforce_time_entries
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_exported_time_mutation();

CREATE OR REPLACE FUNCTION prevent_workforce_reviewed_record_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Reviewed workforce corrections are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workforce_reviewed_correction_immutable
BEFORE UPDATE OR DELETE ON workforce_time_corrections
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_reviewed_record_mutation();

CREATE OR REPLACE FUNCTION prevent_workforce_decided_leave_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'submitted' THEN
    RAISE EXCEPTION 'Decided workforce leave requests are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workforce_decided_leave_immutable
BEFORE UPDATE OR DELETE ON workforce_leave_requests
FOR EACH ROW EXECUTE FUNCTION prevent_workforce_decided_leave_mutation();

REVOKE ALL ON FUNCTION prevent_workforce_clock_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_workforce_time_entry_source_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_workforce_approved_policy_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_workforce_exported_time_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_workforce_reviewed_record_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_workforce_decided_leave_mutation() FROM PUBLIC;

ALTER TABLE workforce_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_policy_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_policy_manager_read ON workforce_policy_versions
  FOR SELECT USING (
    app_has_permission('workforce.policy.manage')
    OR app_has_permission('workforce.time.review')
    OR app_has_permission('workforce.payroll.export')
  );
CREATE POLICY workforce_policy_compliance_insert ON workforce_policy_versions
  FOR INSERT WITH CHECK (
    app_has_permission('workforce.policy.manage') AND created_by = app_user_id() AND status = 'draft'
  );
CREATE POLICY workforce_policy_compliance_update ON workforce_policy_versions
  FOR UPDATE USING (app_has_permission('workforce.policy.manage'))
  WITH CHECK (app_has_permission('workforce.policy.manage'));
GRANT SELECT, INSERT, UPDATE ON workforce_policy_versions TO "{{role}}";

ALTER TABLE workforce_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_shifts_manager_all ON workforce_shifts
  FOR ALL USING (app_can_manage_workforce_engagement(engagement_id))
  WITH CHECK (app_can_manage_workforce_engagement(engagement_id));
CREATE POLICY workforce_shifts_worker_read ON workforce_shifts
  FOR SELECT USING (app_worker_owns_shift(id));
CREATE POLICY workforce_shifts_worker_response ON workforce_shifts
  FOR UPDATE USING (app_worker_owns_shift(id) AND worker_response='pending' AND status='scheduled')
  WITH CHECK (
    app_worker_owns_shift(id) AND status='scheduled'
    AND worker_response IN ('accepted','declined')
    AND worker_responded_by=app_user_id()
  );
GRANT SELECT, INSERT ON workforce_shifts TO "{{role}}";
GRANT UPDATE (status) ON workforce_shifts TO "{{role}}";
GRANT UPDATE (worker_response, worker_response_reason, worker_responded_by, worker_responded_at) ON workforce_shifts TO "{{role}}";

ALTER TABLE workforce_clock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_clock_events FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_clock_events_read ON workforce_clock_events
  FOR SELECT USING (app_can_manage_workforce_shift(shift_id) OR app_worker_owns_shift(shift_id));
CREATE POLICY workforce_clock_events_worker_insert ON workforce_clock_events
  FOR INSERT WITH CHECK (
    app_role()='worker' AND recorded_by=app_user_id() AND app_worker_owns_shift(shift_id)
    AND EXISTS (
      SELECT 1 FROM workforce_shifts s
      JOIN staffing_engagements e ON e.id=s.engagement_id
      JOIN workers w ON w.id=e.worker_id
      WHERE s.id=shift_id AND s.status='scheduled' AND s.worker_response='accepted'
        AND e.status='active' AND w.employment_status='active'
    )
    AND (event_type='clock_in' OR EXISTS (
      SELECT 1 FROM workforce_clock_events prior
      WHERE prior.shift_id=workforce_clock_events.shift_id
        AND prior.event_type='clock_in' AND prior.occurred_at<workforce_clock_events.occurred_at
    ))
  );
GRANT SELECT, INSERT ON workforce_clock_events TO "{{role}}";

ALTER TABLE workforce_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_time_entries_read ON workforce_time_entries
  FOR SELECT USING (app_can_manage_workforce_shift(shift_id) OR app_worker_owns_shift(shift_id));
CREATE POLICY workforce_time_entries_worker_insert ON workforce_time_entries
  FOR INSERT WITH CHECK (
    app_role()='worker' AND app_worker_owns_shift(shift_id)
    AND status IN ('recorded','needs_review') AND clock_in_at IS NOT NULL
    AND approved_clock_in_at IS NULL AND approved_clock_out_at IS NULL
    AND approved_minutes IS NULL AND payable_minutes IS NULL AND policy_version_id IS NULL
    AND approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL
  );
CREATE POLICY workforce_time_entries_worker_clock_update ON workforce_time_entries
  FOR UPDATE USING (app_role()='worker' AND app_worker_owns_shift(shift_id))
  WITH CHECK (
    app_role()='worker' AND app_worker_owns_shift(shift_id)
    AND status IN ('recorded','needs_review') AND clock_in_at IS NOT NULL
    AND approved_clock_in_at IS NULL AND approved_clock_out_at IS NULL
    AND approved_minutes IS NULL AND payable_minutes IS NULL AND policy_version_id IS NULL
    AND approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL
  );
CREATE POLICY workforce_time_entries_manager_update ON workforce_time_entries
  FOR UPDATE USING (app_has_permission('workforce.time.review') AND app_can_manage_workforce_shift(shift_id))
  WITH CHECK (app_has_permission('workforce.time.review') AND app_can_manage_workforce_shift(shift_id));
GRANT SELECT, INSERT ON workforce_time_entries TO "{{role}}";
GRANT UPDATE (clock_in_at, clock_out_at, status, exception_reason, updated_at) ON workforce_time_entries TO "{{role}}";
GRANT UPDATE (status, exception_reason, approved_clock_in_at, approved_clock_out_at, approved_minutes, payable_minutes,
  policy_version_id, policy_warnings, approved_by, approved_at, approval_reason, updated_at) ON workforce_time_entries TO "{{role}}";

ALTER TABLE workforce_time_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_time_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_time_corrections_read ON workforce_time_corrections
  FOR SELECT USING (
    app_can_manage_workforce_shift(shift_id)
    OR app_worker_owns_shift(shift_id)
  );
CREATE POLICY workforce_time_corrections_insert ON workforce_time_corrections
  FOR INSERT WITH CHECK (
    (app_role()='worker' AND requested_by=app_user_id() AND app_worker_owns_shift(shift_id)
      AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (app_has_permission('workforce.time.review') AND requested_by=app_user_id()
      AND app_can_manage_workforce_shift(shift_id) AND status='pending'
      AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
  );
CREATE POLICY workforce_time_corrections_review ON workforce_time_corrections
  FOR UPDATE USING (app_has_permission('workforce.time.review') AND app_can_manage_workforce_shift(shift_id))
  WITH CHECK (app_has_permission('workforce.time.review') AND app_can_manage_workforce_shift(shift_id));
GRANT SELECT, INSERT ON workforce_time_corrections TO "{{role}}";
GRANT UPDATE (status, reviewed_by, review_reason, reviewed_at) ON workforce_time_corrections TO "{{role}}";

ALTER TABLE workforce_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_leave_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_leave_requests_read ON workforce_leave_requests
  FOR SELECT USING (
    user_id=app_user_id()
    OR (app_has_permission('workforce.leave.review') AND app_can_manage_workforce_engagement(engagement_id))
  );
CREATE POLICY workforce_leave_requests_worker_insert ON workforce_leave_requests
  FOR INSERT WITH CHECK (
    app_role()='worker' AND user_id=app_user_id() AND app_worker_owns_engagement(engagement_id)
    AND status='submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL
  );
CREATE POLICY workforce_leave_requests_worker_withdraw ON workforce_leave_requests
  FOR UPDATE USING (app_role()='worker' AND user_id=app_user_id() AND status='submitted')
  WITH CHECK (app_role()='worker' AND user_id=app_user_id() AND status='withdrawn');
CREATE POLICY workforce_leave_requests_manager_review ON workforce_leave_requests
  FOR UPDATE USING (app_has_permission('workforce.leave.review') AND app_can_manage_workforce_engagement(engagement_id))
  WITH CHECK (app_has_permission('workforce.leave.review') AND app_can_manage_workforce_engagement(engagement_id));
GRANT SELECT, INSERT ON workforce_leave_requests TO "{{role}}";
GRANT UPDATE (status, updated_at) ON workforce_leave_requests TO "{{role}}";
GRANT UPDATE (status, reviewed_by, review_reason, reviewed_at, updated_at) ON workforce_leave_requests TO "{{role}}";

ALTER TABLE workforce_payroll_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_payroll_exports_manager_read ON workforce_payroll_exports
  FOR SELECT USING (app_has_permission('workforce.payroll.export'));
CREATE POLICY workforce_payroll_exports_manager_insert ON workforce_payroll_exports
  FOR INSERT WITH CHECK (
    app_has_permission('workforce.payroll.export') AND created_by=app_user_id()
    AND status='generated' AND handoff_reason IS NULL AND handoff_reference IS NULL
    AND handed_off_by IS NULL AND handed_off_at IS NULL
  );
CREATE POLICY workforce_payroll_exports_manager_update ON workforce_payroll_exports
  FOR UPDATE USING (app_has_permission('workforce.payroll.export'))
  WITH CHECK (app_has_permission('workforce.payroll.export'));
CREATE POLICY workforce_payroll_exports_worker_read ON workforce_payroll_exports
  FOR SELECT USING (
    app_role()='worker'
    AND EXISTS (
      SELECT 1 FROM workforce_payroll_export_items i
      WHERE i.export_id=id AND app_worker_owns_time_entry(i.time_entry_id)
    )
  );
GRANT SELECT, INSERT ON workforce_payroll_exports TO "{{role}}";
GRANT UPDATE (status, handoff_reason, handoff_reference, handed_off_by, handed_off_at) ON workforce_payroll_exports TO "{{role}}";

ALTER TABLE workforce_payroll_export_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_payloads FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_payroll_export_payloads_manager_all ON workforce_payroll_export_payloads
  FOR ALL USING (app_has_permission('workforce.payroll.export'))
  WITH CHECK (app_has_permission('workforce.payroll.export'));
GRANT SELECT, INSERT ON workforce_payroll_export_payloads TO "{{role}}";

ALTER TABLE workforce_payroll_export_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_items FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_payroll_export_items_manager_all ON workforce_payroll_export_items
  FOR ALL USING (app_has_permission('workforce.payroll.export'))
  WITH CHECK (app_has_permission('workforce.payroll.export'));
CREATE POLICY workforce_payroll_export_items_worker_read ON workforce_payroll_export_items
  FOR SELECT USING (app_worker_owns_time_entry(time_entry_id));
GRANT SELECT, INSERT ON workforce_payroll_export_items TO "{{role}}";
