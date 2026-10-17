ALTER TABLE maintenance_requests ALTER COLUMN source_agent_id DROP NOT NULL;
DROP POLICY IF EXISTS property_maintenance_activity_manage ON maintenance_requests;
CREATE POLICY property_maintenance_activity_manage ON maintenance_requests
  FOR ALL USING (
    app_has_permission('property.maintenance.manage')
    AND (app_can_access_agent(source_agent_id)
      OR EXISTS (SELECT 1 FROM properties p WHERE p.id=property_id AND p.owner_user_id=app_user_id())
      OR app_role() IN ('super_admin','global_admin','corporate_business_manager'))
  )
  WITH CHECK (
    app_has_permission('property.maintenance.manage')
    AND (app_can_access_agent(source_agent_id)
      OR EXISTS (SELECT 1 FROM properties p WHERE p.id=property_id AND p.owner_user_id=app_user_id())
      OR app_role() IN ('super_admin','global_admin','corporate_business_manager'))
  );
INSERT INTO role_activity_defaults(role_name,activity_key,enabled)
VALUES('property_owner','property.maintenance.manage',true)
ON CONFLICT(role_name,activity_key) DO NOTHING;
