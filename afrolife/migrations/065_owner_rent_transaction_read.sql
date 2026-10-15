CREATE POLICY rent_transactions_owner_read ON rent_transactions
  FOR SELECT
  USING (
    app_role() = 'property_owner'
    AND EXISTS (
      SELECT 1
      FROM leases l
      JOIN property_units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = rent_transactions.lease_id
        AND p.owner_user_id = app_user_id()
    )
  );
