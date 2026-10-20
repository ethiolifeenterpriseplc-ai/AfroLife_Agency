-- Global System Admin owns shared platform configuration. Super Admins may
-- configure only the modules assigned to their own active tenant deployments.
DROP POLICY platform_services_control_plane_admin ON platform_services;
CREATE POLICY platform_services_global_admin ON platform_services FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_services_assigned_read ON platform_services;
CREATE POLICY platform_services_assigned_read ON platform_services FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_service_package_items i
    JOIN platform_tenant_packages tp ON tp.package_id=i.package_id
    JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE i.service_key=platform_services.service_key AND a.user_id=app_user_id()
  ));

DROP POLICY platform_packages_control_plane_admin ON platform_service_packages;
CREATE POLICY platform_packages_global_admin ON platform_service_packages FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_packages_assigned_read ON platform_service_packages;
CREATE POLICY platform_packages_assigned_read ON platform_service_packages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_packages tp
    JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE tp.package_id=id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_package_items_control_plane_admin ON platform_service_package_items;
CREATE POLICY platform_package_items_global_admin ON platform_service_package_items FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_package_items_assigned_read ON platform_service_package_items;
CREATE POLICY platform_package_items_assigned_read ON platform_service_package_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_packages tp
    JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE tp.package_id=platform_service_package_items.package_id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_tenants_control_plane_admin ON platform_tenants;
CREATE POLICY platform_tenants_global_admin ON platform_tenants FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_tenants_assigned_read ON platform_tenants;
CREATE POLICY platform_tenants_assigned_read ON platform_tenants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()
  ));
DROP POLICY IF EXISTS platform_tenants_assigned_registration_update ON platform_tenants;
CREATE POLICY platform_tenants_assigned_registration_update ON platform_tenants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM platform_tenant_admins a WHERE a.tenant_id=id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_tenant_packages_control_plane_admin ON platform_tenant_packages;
CREATE POLICY platform_tenant_packages_global_admin ON platform_tenant_packages FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_tenant_packages_assigned_read ON platform_tenant_packages;
CREATE POLICY platform_tenant_packages_assigned_read ON platform_tenant_packages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_tenant_admins a
    WHERE a.tenant_id=platform_tenant_packages.tenant_id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_tenant_events_control_plane_admin ON platform_tenant_events;
CREATE POLICY platform_tenant_events_global_admin ON platform_tenant_events FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY IF EXISTS platform_tenant_events_assigned_insert ON platform_tenant_events;
CREATE POLICY platform_tenant_events_assigned_insert ON platform_tenant_events FOR INSERT
  WITH CHECK (actor_id=app_user_id() AND EXISTS (
    SELECT 1 FROM platform_tenant_admins a
    WHERE a.tenant_id=platform_tenant_events.tenant_id AND a.user_id=app_user_id()
  ));

DROP POLICY platform_catalog_products_control_plane_admin ON platform_catalog_products;
CREATE POLICY platform_catalog_products_global_admin ON platform_catalog_products FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
DROP POLICY platform_catalog_product_events_control_plane_admin ON platform_catalog_product_events;
CREATE POLICY platform_catalog_product_events_global_admin ON platform_catalog_product_events FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');

DROP POLICY platform_tenant_admins_write ON platform_tenant_admins;
CREATE POLICY platform_tenant_admins_write ON platform_tenant_admins FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');

CREATE TABLE platform_tenant_module_config (
  tenant_id uuid PRIMARY KEY REFERENCES platform_tenants(id) ON DELETE CASCADE,
  enabled_services text[] NOT NULL CHECK (
    enabled_services <@ ARRAY[
      'agency','workforce','staffing','property','marketplace','accounting','insurance',
      'sacco_mfi','edir','learning','privacy','operations','global_bi'
    ]::text[]
  ),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_tenant_module_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_module_config FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_module_config_scoped ON platform_tenant_module_config FOR ALL
  USING (
    current_setting('app.role',true)='global_admin'
    OR (current_setting('app.role',true)='super_admin' AND EXISTS (
      SELECT 1 FROM platform_tenant_admins a
      WHERE a.tenant_id=platform_tenant_module_config.tenant_id AND a.user_id=app_user_id()
    ))
  )
  WITH CHECK (
    current_setting('app.role',true)='global_admin'
    OR (current_setting('app.role',true)='super_admin' AND EXISTS (
      SELECT 1 FROM platform_tenant_admins a
      WHERE a.tenant_id=platform_tenant_module_config.tenant_id AND a.user_id=app_user_id()
    ))
  );
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE platform_tenant_module_config TO "{{role}}";

ALTER TABLE platform_tenant_events DROP CONSTRAINT platform_tenant_events_event_type_check;
ALTER TABLE platform_tenant_events ADD CONSTRAINT platform_tenant_events_event_type_check CHECK (
  event_type IN (
    'tenant_created','tenant_updated','deployment_registered','deployment_verified',
    'tenant_suspended','tenant_reactivated','tenant_retired','service_package_assigned',
    'tenant_modules_updated'
  )
);

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
REVOKE ALL ON FUNCTION limit_tenant_admin_registration_updates() FROM PUBLIC;
