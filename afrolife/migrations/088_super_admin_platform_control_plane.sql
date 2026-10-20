-- Super Admin has the same platform control-plane configuration authority as
-- Global Admin. Other Global Admin-only capabilities remain unchanged.
INSERT INTO platform_services(service_key,display_name,description)
VALUES('global_bi','Global BI','Read-only aggregate analytics workspace')
ON CONFLICT(service_key) DO NOTHING;

DROP POLICY platform_services_global_admin ON platform_services;
CREATE POLICY platform_services_control_plane_admin ON platform_services FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));
CREATE POLICY platform_services_assigned_read ON platform_services FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_service_package_items i
    JOIN platform_tenant_packages tp ON tp.package_id=i.package_id
    JOIN platform_tenant_admins a ON a.tenant_id=tp.tenant_id
    WHERE i.service_key=platform_services.service_key AND a.user_id=app_user_id()
  ));

DROP POLICY platform_packages_global_admin ON platform_service_packages;
CREATE POLICY platform_packages_control_plane_admin ON platform_service_packages FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_package_items_global_admin ON platform_service_package_items;
CREATE POLICY platform_package_items_control_plane_admin ON platform_service_package_items FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_tenants_global_admin ON platform_tenants;
CREATE POLICY platform_tenants_control_plane_admin ON platform_tenants FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_tenant_packages_global_admin ON platform_tenant_packages;
CREATE POLICY platform_tenant_packages_control_plane_admin ON platform_tenant_packages FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_tenant_events_global_admin ON platform_tenant_events;
CREATE POLICY platform_tenant_events_control_plane_admin ON platform_tenant_events FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_catalog_products_global_admin ON platform_catalog_products;
CREATE POLICY platform_catalog_products_control_plane_admin ON platform_catalog_products FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_catalog_product_events_global_admin ON platform_catalog_product_events;
CREATE POLICY platform_catalog_product_events_control_plane_admin ON platform_catalog_product_events FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

DROP POLICY platform_tenant_admins_write ON platform_tenant_admins;
CREATE POLICY platform_tenant_admins_write ON platform_tenant_admins FOR ALL
  USING (current_setting('app.role',true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role',true) IN ('global_admin','super_admin'));

CREATE OR REPLACE FUNCTION limit_tenant_admin_registration_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.role',true)='super_admin'
    AND current_setting('app.platform_control_plane',true) IS DISTINCT FROM 'true' AND (
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
