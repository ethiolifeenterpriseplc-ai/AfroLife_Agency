CREATE TABLE staffing_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id),
  request_id uuid NOT NULL REFERENCES job_requests(id),
  worker_id uuid NOT NULL REFERENCES workers(id),
  client_lead_id uuid NOT NULL REFERENCES leads(id),
  source_agent_id uuid NOT NULL REFERENCES agents(id),
  billing_unit text NOT NULL CHECK (billing_unit IN ('hour','day','week','month','fixed')),
  client_rate numeric(14,2) NOT NULL CHECK (client_rate > 0),
  worker_rate numeric(14,2) NOT NULL CHECK (worker_rate > 0 AND worker_rate <= client_rate),
  starts_on date NOT NULL,
  ends_on date,
  status text NOT NULL DEFAULT 'terms_pending' CHECK (status IN ('terms_pending','active','completed','cancelled')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  terms_approved_by uuid REFERENCES users(id),
  terms_approval_reason text,
  terms_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (terms_approved_by IS NULL OR terms_approved_by <> recorded_by),
  CHECK ((status='terms_pending' AND terms_approved_by IS NULL AND terms_approved_at IS NULL)
      OR (status IN ('active','completed','cancelled') AND terms_approved_by IS NOT NULL AND terms_approved_at IS NOT NULL))
);

CREATE TABLE staffing_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES staffing_engagements(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  client_amount numeric(14,2) NOT NULL CHECK (client_amount > 0),
  worker_amount numeric(14,2) NOT NULL CHECK (worker_amount > 0 AND worker_amount <= client_amount),
  description text NOT NULL CHECK (length(trim(description)) >= 5),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (reviewed_by IS NULL OR reviewed_by <> recorded_by),
  CHECK ((status='submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE staffing_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES staffing_engagements(id),
  kind text NOT NULL CHECK (kind IN ('client_receipt','worker_payment')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  channel text NOT NULL CHECK (length(trim(channel)) BETWEEN 2 AND 40),
  reference text NOT NULL UNIQUE CHECK (length(trim(reference)) BETWEEN 3 AND 160),
  payment_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reconciled','rejected')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  reconciled_by uuid REFERENCES users(id),
  reason text,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reconciled_by IS NULL OR reconciled_by <> recorded_by),
  CHECK ((status='pending' AND reconciled_by IS NULL AND reconciled_at IS NULL)
      OR (status IN ('reconciled','rejected') AND reconciled_by IS NOT NULL AND reconciled_at IS NOT NULL))
);

CREATE INDEX staffing_engagements_agent_idx ON staffing_engagements(source_agent_id,created_at DESC);
CREATE INDEX staffing_work_periods_engagement_idx ON staffing_work_periods(engagement_id,period_start);
CREATE INDEX staffing_settlements_engagement_idx ON staffing_settlements(engagement_id,kind,status);

ALTER TABLE staffing_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_work_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY staffing_engagements_scope ON staffing_engagements
  USING (app_is_staff() OR app_can_access_agent(source_agent_id))
  WITH CHECK (app_is_staff() OR app_can_access_agent(source_agent_id));
CREATE POLICY staffing_work_periods_scope ON staffing_work_periods
  USING (app_is_staff() OR EXISTS (SELECT 1 FROM staffing_engagements e WHERE e.id=engagement_id AND app_can_access_agent(e.source_agent_id)))
  WITH CHECK (app_is_staff() OR EXISTS (SELECT 1 FROM staffing_engagements e WHERE e.id=engagement_id AND app_can_access_agent(e.source_agent_id)));
CREATE POLICY staffing_settlements_scope ON staffing_settlements
  USING (app_is_staff() OR EXISTS (SELECT 1 FROM staffing_engagements e WHERE e.id=engagement_id AND app_can_access_agent(e.source_agent_id)))
  WITH CHECK (app_is_staff() OR EXISTS (SELECT 1 FROM staffing_engagements e WHERE e.id=engagement_id AND app_can_access_agent(e.source_agent_id)));
GRANT SELECT,INSERT,UPDATE ON staffing_engagements,staffing_work_periods,staffing_settlements TO "{{role}}";
