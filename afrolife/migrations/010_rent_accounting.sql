CREATE TABLE rent_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id),
  rent_charge_id uuid REFERENCES rent_charges(id),
  kind text NOT NULL CHECK (kind IN ('rent','deposit','deposit_refund')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  channel text NOT NULL,
  reference text NOT NULL UNIQUE,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reconciled')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  reconciled_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  CHECK ((kind = 'rent' AND rent_charge_id IS NOT NULL AND reason IS NULL)
      OR (kind = 'deposit' AND rent_charge_id IS NULL AND reason IS NULL)
      OR (kind = 'deposit_refund' AND rent_charge_id IS NULL AND length(trim(reason)) >= 10))
);

CREATE UNIQUE INDEX rent_transactions_charge_once
  ON rent_transactions (rent_charge_id) WHERE kind = 'rent';
CREATE UNIQUE INDEX rent_transactions_deposit_once
  ON rent_transactions (lease_id) WHERE kind = 'deposit';
CREATE INDEX rent_transactions_lease_created_idx ON rent_transactions (lease_id, created_at DESC);

ALTER TABLE rent_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rent_transactions_scope ON rent_transactions
  USING (app_is_staff() OR EXISTS (
    SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id)
  ))
  WITH CHECK (app_is_staff());
