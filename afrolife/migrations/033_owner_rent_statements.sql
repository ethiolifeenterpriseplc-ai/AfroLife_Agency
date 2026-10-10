DROP POLICY leases_scope ON leases;
CREATE POLICY leases_scope ON leases FOR SELECT
  USING (
    app_can_access_agent(source_agent_id)
    OR app_role()='property_owner' AND EXISTS (
      SELECT 1 FROM property_units u JOIN properties p ON p.id=u.property_id
      WHERE u.id=leases.unit_id AND p.owner_user_id=app_user_id()
    )
  );
CREATE POLICY leases_write_scope ON leases FOR ALL
  USING (app_can_access_agent(source_agent_id))
  WITH CHECK (app_role()='super_admin' OR source_agent_id=app_user_id());

DROP POLICY charges_scope ON rent_charges;
CREATE POLICY charges_scope ON rent_charges FOR SELECT
  USING (
    app_is_staff()
    OR EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id))
    OR app_role()='property_owner' AND EXISTS (
      SELECT 1 FROM leases l JOIN property_units u ON u.id=l.unit_id
      JOIN properties p ON p.id=u.property_id
      WHERE l.id=rent_charges.lease_id AND p.owner_user_id=app_user_id()
    )
  );
CREATE POLICY charges_write_scope ON rent_charges FOR ALL
  USING (app_is_staff() OR EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)))
  WITH CHECK (app_is_staff() OR EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)));

DROP POLICY rent_transactions_scope ON rent_transactions;
CREATE POLICY rent_transactions_scope ON rent_transactions FOR SELECT
  USING (
    app_is_staff()
    OR EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id))
    OR app_role()='property_owner' AND EXISTS (
      SELECT 1 FROM leases l JOIN property_units u ON u.id=l.unit_id
      JOIN properties p ON p.id=u.property_id
      WHERE l.id=rent_transactions.lease_id AND p.owner_user_id=app_user_id()
    )
  );
CREATE POLICY rent_transactions_write_scope ON rent_transactions FOR ALL
  USING (app_is_staff() OR EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)))
  WITH CHECK (app_is_staff());
