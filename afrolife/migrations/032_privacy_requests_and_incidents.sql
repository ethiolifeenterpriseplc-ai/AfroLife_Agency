CREATE TABLE personal_data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('access','correction','deletion','portability','restriction','objection','other')),
  details text NOT NULL CHECK (length(trim(details)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','awaiting_requester','completed','declined','withdrawn')),
  assigned_to uuid REFERENCES users(id),
  response text CHECK (response IS NULL OR length(response) <= 4000),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status IN ('completed','declined','withdrawn') AND completed_at IS NOT NULL)
      OR (status NOT IN ('completed','declined','withdrawn') AND completed_at IS NULL))
);
CREATE INDEX personal_data_requests_owner_idx ON personal_data_requests (requester_id,received_at DESC);
CREATE INDEX personal_data_requests_status_idx ON personal_data_requests (status,received_at);

CREATE TABLE privacy_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('INC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  reported_by uuid NOT NULL REFERENCES users(id),
  incident_type text NOT NULL CHECK (incident_type IN ('unauthorized_access','loss','disclosure','alteration','unavailability','other')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 10 AND 500),
  details text NOT NULL CHECK (length(trim(details)) BETWEEN 10 AND 8000),
  affected_data text NOT NULL CHECK (length(trim(affected_data)) BETWEEN 2 AND 1000),
  affected_people_estimate integer CHECK (affected_people_estimate IS NULL OR affected_people_estimate >= 0),
  occurred_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  containment_actions text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','contained','review','closed')),
  assigned_to uuid REFERENCES users(id),
  outcome text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='closed' AND closed_at IS NOT NULL) OR (status<>'closed' AND closed_at IS NULL))
);
CREATE INDEX privacy_incidents_status_idx ON privacy_incidents (status,severity,discovered_at DESC);

CREATE TABLE privacy_case_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  case_type text NOT NULL CHECK (case_type IN ('personal_data_request','privacy_incident')),
  case_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_case_events_case_idx ON privacy_case_events (case_type,case_id,created_at);

ALTER TABLE personal_data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_data_requests_read ON personal_data_requests FOR SELECT
  USING (requester_id=app_user_id() OR app_role() IN ('super_admin','compliance'));
CREATE POLICY personal_data_requests_create ON personal_data_requests FOR INSERT
  WITH CHECK (requester_id=app_user_id() AND status='received' AND assigned_to IS NULL AND response IS NULL AND completed_at IS NULL);
CREATE POLICY personal_data_requests_update ON personal_data_requests FOR UPDATE
  USING (app_role() IN ('super_admin','compliance')) WITH CHECK (app_role() IN ('super_admin','compliance'));
CREATE POLICY privacy_incidents_read ON privacy_incidents FOR SELECT
  USING (app_role() IN ('super_admin','compliance'));
CREATE POLICY privacy_incidents_create ON privacy_incidents FOR INSERT
  WITH CHECK (reported_by=app_user_id() AND app_role() IN ('super_admin','compliance','finance','finance_manager'));
CREATE POLICY privacy_incidents_update ON privacy_incidents FOR UPDATE
  USING (app_role() IN ('super_admin','compliance')) WITH CHECK (app_role() IN ('super_admin','compliance'));
CREATE POLICY privacy_case_events_read ON privacy_case_events FOR SELECT
  USING (app_role() IN ('super_admin','compliance') OR case_type='personal_data_request' AND case_id IN (
    SELECT id FROM personal_data_requests WHERE requester_id=app_user_id()
  ));
CREATE POLICY privacy_case_events_create ON privacy_case_events FOR INSERT
  WITH CHECK (actor_id=app_user_id() AND (
    app_role() IN ('super_admin','compliance','finance','finance_manager')
    OR case_type='personal_data_request' AND case_id IN (
      SELECT id FROM personal_data_requests WHERE requester_id=app_user_id()
    )
  ));
GRANT SELECT, INSERT, UPDATE ON TABLE personal_data_requests TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE privacy_incidents TO "{{role}}";
GRANT SELECT, INSERT ON TABLE privacy_case_events TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE privacy_case_events_id_seq TO "{{role}}";
