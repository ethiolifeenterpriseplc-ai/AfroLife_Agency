DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_charges_id_lease_unique') THEN
    ALTER TABLE rent_charges ADD CONSTRAINT rent_charges_id_lease_unique UNIQUE (id, lease_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_transactions_rent_charge_id_fkey') THEN
    ALTER TABLE rent_transactions DROP CONSTRAINT rent_transactions_rent_charge_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rent_transactions'::regclass
      AND confrelid = 'rent_charges'::regclass
      AND contype = 'f'
      AND cardinality(conkey) = 2
  ) THEN
    ALTER TABLE rent_transactions
      ADD CONSTRAINT rent_transactions_charge_lease_fk
      FOREIGN KEY (rent_charge_id, lease_id) REFERENCES rent_charges(id, lease_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_transactions_refund_reason_required') THEN
    ALTER TABLE rent_transactions
      ADD CONSTRAINT rent_transactions_refund_reason_required
      CHECK (kind <> 'deposit_refund' OR (reason IS NOT NULL AND length(trim(reason)) >= 10));
  END IF;
END $$;
