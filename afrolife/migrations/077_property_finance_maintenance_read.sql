CREATE POLICY property_maintenance_finance_read ON maintenance_requests FOR SELECT
  USING (app_role() IN ('finance','finance_manager','super_admin','global_admin'));
