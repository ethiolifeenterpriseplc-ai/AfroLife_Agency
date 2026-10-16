CREATE TABLE insurance_brokerage_sandbox_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_reference text NOT NULL UNIQUE DEFAULT (
    'SYN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  created_by uuid NOT NULL REFERENCES users(id),
  sandbox_only boolean NOT NULL DEFAULT true CHECK (sandbox_only),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurance_brokerage_sandbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES insurance_brokerage_sandbox_cases(id),
  scenario_run_id uuid NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'synthetic_intake',
    'needs_assessment_simulated',
    'disclosures_acknowledged_simulated',
    'advice_review_simulated',
    'product_comparison_simulated',
    'quote_generated_simulated',
    'proposal_created_simulated',
    'insurer_submission_simulated',
    'policy_issuance_simulated',
    'policy_change_simulated',
    'notice_delivery_simulated',
    'premium_due_simulated',
    'premium_receipt_simulated',
    'premium_refund_simulated',
    'commission_calculated_simulated',
    'commission_settlement_simulated',
    'claim_intake_simulated',
    'claim_referral_simulated',
    'claim_decision_simulated',
    'complaint_opened_simulated',
    'complaint_resolved_simulated'
  )),
  event_data jsonb NOT NULL CHECK (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, scenario_run_id, sequence_number)
);

CREATE INDEX insurance_brokerage_sandbox_case_history_idx
  ON insurance_brokerage_sandbox_events (case_id, id);

CREATE FUNCTION insurance_prevent_brokerage_sandbox_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance brokerage sandbox events are append-only';
END $$;

CREATE TRIGGER insurance_brokerage_sandbox_event_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_sandbox_events
  FOR EACH ROW EXECUTE FUNCTION insurance_prevent_brokerage_sandbox_event_mutation();

ALTER TABLE insurance_brokerage_sandbox_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_sandbox_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_sandbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_sandbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_brokerage_sandbox_case_read ON insurance_brokerage_sandbox_cases
  FOR SELECT USING (
    created_by = app_user_id()
    OR app_role() IN ('global_admin','super_admin')
  );
CREATE POLICY insurance_brokerage_sandbox_case_create ON insurance_brokerage_sandbox_cases
  FOR INSERT WITH CHECK (
    created_by = app_user_id()
    AND sandbox_only
    AND (
      app_role() IN ('global_admin','super_admin')
      OR insurance_ledger_has_role(ARRAY['insurance_admin','compliance','finance_manager'])
    )
  );
CREATE POLICY insurance_brokerage_sandbox_event_read ON insurance_brokerage_sandbox_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM insurance_brokerage_sandbox_cases scenario
      WHERE scenario.id = case_id AND scenario.created_by = app_user_id()
    )
    OR app_role() IN ('global_admin','super_admin')
  );
CREATE POLICY insurance_brokerage_sandbox_event_create ON insurance_brokerage_sandbox_events
  FOR INSERT WITH CHECK (
    actor_id = app_user_id()
    AND EXISTS (
      SELECT 1 FROM insurance_brokerage_sandbox_cases scenario
      WHERE scenario.id = case_id AND (
        scenario.created_by = app_user_id()
        OR app_role() IN ('global_admin','super_admin')
      )
    )
  );

REVOKE ALL ON TABLE insurance_brokerage_sandbox_cases FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_sandbox_events FROM "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_sandbox_cases TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_sandbox_events TO "{{role}}";
REVOKE ALL ON SEQUENCE insurance_brokerage_sandbox_events_id_seq FROM "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE insurance_brokerage_sandbox_events_id_seq TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_prevent_brokerage_sandbox_event_mutation() FROM PUBLIC;
