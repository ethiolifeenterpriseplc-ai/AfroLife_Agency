CREATE TABLE accounting_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid NOT NULL UNIQUE,
  source_entity_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounting_event_outbox_delivery_idx
  ON accounting_event_outbox (next_attempt_at, created_at) WHERE status = 'pending';
ALTER TABLE accounting_event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_event_outbox_enqueue ON accounting_event_outbox FOR INSERT
  WITH CHECK (app_role() = 'super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager']));
CREATE POLICY accounting_event_outbox_dispatch_read ON accounting_event_outbox FOR SELECT
  USING (app_role() = 'super_admin' OR (source_entity_id=app_edir_id()::text
    AND insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance','auditor'])));
CREATE POLICY accounting_event_outbox_dispatch_update ON accounting_event_outbox FOR UPDATE
  USING (app_role() = 'super_admin' OR (source_entity_id=app_edir_id()::text
    AND insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager'])))
  WITH CHECK (app_role() = 'super_admin' OR (source_entity_id=app_edir_id()::text
    AND insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager'])));
GRANT SELECT, INSERT, UPDATE ON accounting_event_outbox TO "{{role}}";
