-- Qualification controls for platform configuration and self-onboarded accounts.
-- KYC and account activation approvals are stored separately so one event cannot overwrite the other.
ALTER TABLE user_signups
  ADD COLUMN kyc_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN kyc_reviewed_at timestamptz,
  ADD COLUMN kyc_review_reason text,
  ADD COLUMN activation_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN activation_reviewed_at timestamptz,
  ADD COLUMN activation_review_reason text;

-- Preserve prior recorded KYC actors for pending/rejected cases; legacy review reasons were not captured.
UPDATE user_signups s
SET kyc_reviewed_by=s.reviewed_by,
    kyc_reviewed_at=s.reviewed_at,
    kyc_review_reason='Legacy KYC review; decision rationale was not captured.'
FROM users u
WHERE u.id=s.user_id AND s.reviewed_by IS NOT NULL AND s.reviewed_at IS NOT NULL
  AND s.status IN ('pending','rejected') AND u.kyc_status IN ('verified','rejected');

DROP POLICY marketplace_configuration_admin_write ON marketplace_configuration;
ALTER TABLE marketplace_configuration
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE POLICY marketplace_configuration_admin_write ON marketplace_configuration FOR ALL
  USING (
    app_role() IN ('super_admin','global_admin')
    OR (app_role() = 'corporate_business_manager' AND scope IN ('products','services','properties','rentals'))
  )
  WITH CHECK (
    app_role() IN ('super_admin','global_admin')
    OR (app_role() = 'corporate_business_manager' AND scope IN ('products','services','properties','rentals'))
  );

-- Platform configuration is manageable by Super Admin and Global Admin, with every write audited in the API.
DROP POLICY platform_services_admin ON platform_services;
CREATE POLICY platform_services_admin ON platform_services FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_packages_admin ON platform_service_packages;
CREATE POLICY platform_packages_admin ON platform_service_packages FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_package_items_admin ON platform_service_package_items;
CREATE POLICY platform_package_items_admin ON platform_service_package_items FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_tenants_admin ON platform_tenants;
CREATE POLICY platform_tenants_admin ON platform_tenants FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_tenant_packages_admin ON platform_tenant_packages;
CREATE POLICY platform_tenant_packages_admin ON platform_tenant_packages FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_tenant_events_admin ON platform_tenant_events;
CREATE POLICY platform_tenant_events_admin ON platform_tenant_events FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_catalog_products_admin ON platform_catalog_products;
CREATE POLICY platform_catalog_products_admin ON platform_catalog_products FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
DROP POLICY platform_catalog_product_events_admin ON platform_catalog_product_events;
CREATE POLICY platform_catalog_product_events_admin ON platform_catalog_product_events FOR ALL
  USING (current_setting('app.role', true) IN ('global_admin','super_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('global_admin','super_admin'));
