ALTER TABLE staffing_engagements
  ADD COLUMN worker_type text
  CHECK (worker_type IN (
    'full_time_employee',
    'part_time_employee',
    'hourly_professional',
    'contracted_service_provider'
  ));

CREATE POLICY workforce_worker_self_read ON workers
  FOR SELECT USING (
    app_role() = 'worker'
    AND phone = (SELECT u.phone FROM users u WHERE u.id = app_user_id())
  );

CREATE OR REPLACE FUNCTION app_worker_can_view_engagement_client(target_lead uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT app_role() = 'worker'
    AND EXISTS (
      SELECT 1
      FROM staffing_engagements e
      JOIN workers w ON w.id = e.worker_id
      JOIN users u ON u.id = app_user_id()
      WHERE e.client_lead_id = target_lead AND w.phone = u.phone
    )
$$;
REVOKE ALL ON FUNCTION app_worker_can_view_engagement_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_worker_can_view_engagement_client(uuid) TO "{{role}}";

CREATE POLICY staffing_engagement_worker_client_read ON leads
  FOR SELECT USING (app_worker_can_view_engagement_client(id));

CREATE POLICY staffing_work_period_worker_read ON staffing_work_periods
  FOR SELECT USING (
    app_role() = 'worker'
    AND EXISTS (
      SELECT 1
      FROM staffing_engagements e
      JOIN workers w ON w.id = e.worker_id
      JOIN users u ON u.id = app_user_id()
      WHERE e.id = engagement_id AND w.phone = u.phone
    )
  );

CREATE POLICY staffing_work_period_worker_submit ON staffing_work_periods
  FOR INSERT WITH CHECK (
    app_role() = 'worker'
    AND recorded_by = app_user_id()
    AND EXISTS (
      SELECT 1
      FROM staffing_engagements e
      JOIN workers w ON w.id = e.worker_id
      JOIN users u ON u.id = app_user_id()
      WHERE e.id = engagement_id AND w.phone = u.phone AND e.status = 'active'
    )
  );

CREATE POLICY staffing_settlement_worker_read ON staffing_settlements
  FOR SELECT USING (
    app_role() = 'worker'
    AND kind = 'worker_payment'
    AND EXISTS (
      SELECT 1
      FROM staffing_engagements e
      JOIN workers w ON w.id = e.worker_id
      JOIN users u ON u.id = app_user_id()
      WHERE e.id = engagement_id AND w.phone = u.phone
    )
  );

CREATE TABLE worker_support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN (
    'work_assignment',
    'contract_terms',
    'work_report_or_pay',
    'safety_and_wellbeing',
    'other'
  )),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  response text CHECK (response IS NULL OR length(trim(response)) BETWEEN 5 AND 2000),
  responded_by uuid REFERENCES users(id),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((responded_by IS NULL) = (responded_at IS NULL))
);

CREATE INDEX worker_support_requests_user_idx
  ON worker_support_requests(user_id, created_at DESC);
CREATE INDEX worker_support_requests_queue_idx
  ON worker_support_requests(status, created_at)
  WHERE status <> 'resolved';

ALTER TABLE worker_support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_support_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_support_requests_owner_read ON worker_support_requests
  FOR SELECT USING (app_role() = 'worker' AND user_id = app_user_id());
CREATE POLICY worker_support_requests_support_read ON worker_support_requests
  FOR SELECT USING (app_role() IN ('global_admin','super_admin','corporate_business_manager','master_agent'));
CREATE POLICY worker_support_requests_owner_insert ON worker_support_requests
  FOR INSERT WITH CHECK (app_role() = 'worker' AND user_id = app_user_id());
CREATE POLICY worker_support_requests_support_update ON worker_support_requests
  FOR UPDATE USING (app_role() IN ('global_admin','super_admin','corporate_business_manager','master_agent'))
  WITH CHECK (app_role() IN ('global_admin','super_admin','corporate_business_manager','master_agent'));

GRANT SELECT, INSERT, UPDATE ON staffing_engagements, staffing_work_periods, worker_support_requests TO "{{role}}";
