DROP POLICY rent_transactions_agent_facilitation ON rent_transactions;
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
        )
      )
    )
  );

DROP POLICY rent_transactions_activity_submit ON rent_transactions;
CREATE POLICY rent_transactions_activity_submit ON rent_transactions
  FOR INSERT WITH CHECK (
    app_has_permission('rent.payments.submit')
    AND recorded_by = app_user_id()
    AND status = 'pending'
    AND reconciled_by IS NULL AND reconciled_at IS NULL
    AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL
    AND (
      (
        kind = 'rent' AND rent_charge_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM leases l JOIN rent_charges c ON c.lease_id = l.id
          WHERE l.id = rent_transactions.lease_id
            AND c.id = rent_transactions.rent_charge_id
            AND c.status = 'due' AND c.amount = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
        )
      )
      OR (
        kind = 'deposit' AND rent_charge_id IS NULL
        AND EXISTS (
          SELECT 1 FROM leases l
          WHERE l.id = rent_transactions.lease_id
            AND l.status = 'active' AND l.deposit > 0
            AND l.deposit = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
        )
      )
    )
  );
