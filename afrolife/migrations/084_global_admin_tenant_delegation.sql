-- Central Global Admin owns platform templates. Entity Super Admins receive only
-- explicitly assigned tenant deployment-registration authority.
CREATE TABLE platform_tenant_admins (
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE INDEX platform_tenant_admins_user_idx ON platform_tenant_admins(user_id,tenant_id);

ALTER TABLE platform_tenant_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_admins_read ON platform_tenant_admins FOR SELECT
  USING (current_setting('app.role',true)='global_admin' OR user_id=app_user_id());
CREATE POLICY platform_tenant_admins_write ON platform_tenant_admins FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
GRANT SELECT,INSERT,DELETE ON TABLE platform_tenant_admins TO "{{role}}";

-- Keep tenant membership readable only for that assigned Super Admin; all tenant edits remain Global Admin owned.
DROP POLICY platform_tenants_admin ON platform_tenants;
CREATE POLICY platform_tenants_global_admin ON platform_tenants FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_tenants_assigned_read ON platform_tenants FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()));
CREATE POLICY platform_tenants_assigned_registration_update ON platform_tenants FOR UPDATE
  USING (EXISTS (SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()));

CREATE OR REPLACE FUNCTION limit_tenant_admin_registration_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.role',true)='super_admin' AND (
    NEW.tenant_key IS DISTINCT FROM OLD.tenant_key OR
    NEW.display_name IS DISTINCT FROM OLD.display_name OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.hosting_mode IS DISTINCT FROM OLD.hosting_mode OR
    NEW.region IS DISTINCT FROM OLD.region OR
    NEW.deployment_verification_reference IS DISTINCT FROM OLD.deployment_verification_reference OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.deployment_status='verified'
  ) THEN
    RAISE EXCEPTION 'Tenant Super Admins may only submit deployment registration details';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER platform_tenant_admin_update_guard
  BEFORE UPDATE ON platform_tenants
  FOR EACH ROW EXECUTE FUNCTION limit_tenant_admin_registration_updates();
REVOKE ALL ON FUNCTION limit_tenant_admin_registration_updates() FROM PUBLIC;

DROP POLICY platform_packages_admin ON platform_service_packages;
CREATE POLICY platform_packages_global_admin ON platform_service_packages FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_packages_assigned_read ON platform_service_packages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_packages tp JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE tp.package_id=id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_package_items_admin ON platform_service_package_items;
CREATE POLICY platform_package_items_global_admin ON platform_service_package_items FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_package_items_assigned_read ON platform_service_package_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_packages tp JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE tp.package_id=platform_service_package_items.package_id AND a.user_id=app_user_id()
  ));

DROP POLICY IF EXISTS platform_tenant_packages_admin ON platform_tenant_packages;
CREATE POLICY platform_tenant_packages_global_admin ON platform_tenant_packages FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_tenant_packages_assigned_read ON platform_tenant_packages FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=platform_tenant_packages.tenant_id AND a.user_id=app_user_id()));

DROP POLICY platform_tenant_events_admin ON platform_tenant_events;
CREATE POLICY platform_tenant_events_global_admin ON platform_tenant_events FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_tenant_events_assigned_insert ON platform_tenant_events FOR INSERT
  WITH CHECK (actor_id=app_user_id() AND EXISTS (
    SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=platform_tenant_events.tenant_id AND a.user_id=app_user_id()
  ));

-- All shared platform configuration templates stay under Global System Admin control.
DROP POLICY platform_services_admin ON platform_services;
CREATE POLICY platform_services_global_admin ON platform_services FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY platform_catalog_products_admin ON platform_catalog_products;
CREATE POLICY platform_catalog_products_global_admin ON platform_catalog_products FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY platform_catalog_product_events_admin ON platform_catalog_product_events;
CREATE POLICY platform_catalog_product_events_global_admin ON platform_catalog_product_events FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');

DROP POLICY user_app_access_profiles_platform_admin_write ON user_app_access_profiles;
CREATE POLICY user_app_access_profiles_global_admin_write ON user_app_access_profiles FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY user_app_access_grants_platform_admin_write ON user_app_access_grants;
CREATE POLICY user_app_access_grants_global_admin_write ON user_app_access_grants FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY user_app_access_audit_platform_admin_read ON user_app_access_audit;
CREATE POLICY user_app_access_audit_global_admin_read ON user_app_access_audit FOR SELECT
  USING (current_setting('app.role',true)='global_admin');
DROP POLICY user_app_access_audit_platform_admin_insert ON user_app_access_audit;
CREATE POLICY user_app_access_audit_global_admin_insert ON user_app_access_audit FOR INSERT
  WITH CHECK (current_setting('app.role',true)='global_admin');

DROP POLICY role_activity_permissions_super_admin ON role_activity_permissions;
CREATE POLICY role_activity_permissions_global_admin ON role_activity_permissions FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY role_activity_permission_audit_super_admin ON role_activity_permission_audit;
CREATE POLICY role_activity_permission_audit_global_admin ON role_activity_permission_audit FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');

DROP POLICY marketplace_configuration_admin_write ON marketplace_configuration;
CREATE POLICY marketplace_configuration_admin_write ON marketplace_configuration FOR ALL
  USING (
    current_setting('app.role',true)='global_admin'
    OR (app_role()='corporate_business_manager' AND scope IN ('products','services','properties','rentals'))
  )
  WITH CHECK (
    current_setting('app.role',true)='global_admin'
    OR (app_role()='corporate_business_manager' AND scope IN ('products','services','properties','rentals'))
  );
