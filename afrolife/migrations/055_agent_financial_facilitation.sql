DROP POLICY rent_transactions_scope ON rent_transactions;

CREATE POLICY rent_transactions_read_scope ON rent_transactions
  FOR SELECT
  USING (
    app_is_staff()
    OR EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = rent_transactions.lease_id
        AND app_can_access_agent(l.source_agent_id)
    )
  );

CREATE POLICY rent_transactions_staff_write ON rent_transactions
  FOR ALL
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

CREATE POLICY rent_transactions_agent_facilitation ON rent_transactions
  FOR INSERT
  WITH CHECK (
    app_role() IN ('master_agent','field_agent')
    AND rent_transactions.recorded_by = app_user_id()
    AND rent_transactions.status = 'pending'
    AND rent_transactions.reconciled_by IS NULL
    AND rent_transactions.reconciled_at IS NULL
    AND rent_transactions.voided_by IS NULL
    AND rent_transactions.voided_at IS NULL
    AND rent_transactions.void_reason IS NULL
    AND (
      (
        rent_transactions.kind = 'rent'
        AND rent_transactions.rent_charge_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM leases l
          JOIN rent_charges c ON c.lease_id = l.id
          WHERE l.id = rent_transactions.lease_id
            AND c.id = rent_transactions.rent_charge_id
            AND c.status = 'due'
            AND c.amount = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
            AND NOT EXISTS (
              SELECT 1 FROM rent_transactions prior
              WHERE prior.rent_charge_id = c.id
                AND prior.kind = 'rent'
                AND prior.status <> 'void'
            )
        )
      )
      OR (
        rent_transactions.kind = 'deposit'
        AND rent_transactions.rent_charge_id IS NULL
        AND EXISTS (
          SELECT 1 FROM leases l
          WHERE l.id = rent_transactions.lease_id
            AND l.status = 'active'
            AND l.deposit > 0
            AND l.deposit = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
            AND NOT EXISTS (
              SELECT 1 FROM rent_transactions prior
              WHERE prior.lease_id = l.id
                AND prior.kind = 'deposit'
                AND prior.status <> 'void'
            )
        )
      )
    )
  );
