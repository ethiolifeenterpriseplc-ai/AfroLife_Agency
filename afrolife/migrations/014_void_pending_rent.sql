ALTER TABLE rent_transactions
  DROP CONSTRAINT rent_transactions_status_check,
  ADD CONSTRAINT rent_transactions_status_check CHECK (status IN ('pending','reconciled','void')),
  ADD COLUMN voided_by uuid REFERENCES users(id),
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN void_reason text;

ALTER TABLE rent_transactions
  ADD CONSTRAINT rent_transactions_void_reason_required
  CHECK (status <> 'void' OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND void_reason IS NOT NULL AND length(trim(void_reason)) >= 10));

DROP INDEX rent_transactions_charge_once;
CREATE UNIQUE INDEX rent_transactions_charge_once
  ON rent_transactions (rent_charge_id) WHERE kind = 'rent' AND status <> 'void';
DROP INDEX rent_transactions_deposit_once;
CREATE UNIQUE INDEX rent_transactions_deposit_once
  ON rent_transactions (lease_id) WHERE kind = 'deposit' AND status <> 'void';
