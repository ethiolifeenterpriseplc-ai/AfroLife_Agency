CREATE POLICY workers_staff_update ON workers
  FOR UPDATE
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

CREATE POLICY contracts_staff_update ON contracts
  FOR UPDATE
  USING (app_is_staff())
  WITH CHECK (app_is_staff());
