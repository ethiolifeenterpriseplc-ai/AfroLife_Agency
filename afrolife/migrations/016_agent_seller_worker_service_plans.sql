ALTER TABLE user_signups
  DROP CONSTRAINT user_signups_payment_status_check,
  ADD CONSTRAINT user_signups_payment_status_check
    CHECK (payment_status IN ('not_required','not_configured','paid')),
  DROP CONSTRAINT user_signups_check,
  ADD CONSTRAINT user_signups_check CHECK (
    (
      account_type = 'agent'
      AND requested_plan IS NOT NULL
      AND agent_type IS NOT NULL
      AND territory_id IS NOT NULL
    )
    OR
    (
      account_type <> 'agent'
      AND agent_type IS NULL
      AND territory_id IS NULL
      AND parent_agent_id IS NULL
      AND (
        account_type = 'property_owner'
        OR (account_type = 'worker' AND (requested_plan IS NULL OR requested_plan = 'enterprise'))
        OR (account_type = 'customer' AND requested_plan IS NULL)
      )
    )
  );
