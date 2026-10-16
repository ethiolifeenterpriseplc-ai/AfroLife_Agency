CREATE TABLE platform_services (
  service_key text PRIMARY KEY CHECK (service_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 1000),
  available boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_services (service_key, display_name, description) VALUES
  ('agency', 'Agency operations', 'Leads, contracts, commissions, and agency administration'),
  ('workforce', 'Workforce management', 'Worker onboarding, profiles, verification, and documents'),
  ('staffing', 'Staffing and matching', 'Staffing requests, candidate matching, and assignment'),
  ('property', 'Property management', 'Property listings, leases, rent, deposits, and maintenance'),
  ('marketplace', 'Marketplace', 'Service and product listings, discovery, and seller workflows'),
  ('insurance', 'Insurance brokerage', 'Insurance information, brokerage sandbox, and ledger service'),
  ('sacco_mfi', 'SACCO / MFI', 'Member services, savings, credit, servicing, and financial controls'),
  ('edir', 'Edir', 'Edir membership, governance, credit, and ledger workflows'),
  ('learning', 'Training and support', 'Role-targeted learning and support content'),
  ('privacy', 'Privacy and data rights', 'Privacy requests, incidents, and data-subject workflows'),
  ('operations', 'Operations and readiness', 'Operational controls, evidence, and incident readiness')
ON CONFLICT (service_key) DO NOTHING;

CREATE TABLE platform_service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE CHECK (package_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 1000),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_service_package_items (
  package_id uuid NOT NULL REFERENCES platform_service_packages(id),
  service_key text NOT NULL REFERENCES platform_services(service_key),
  PRIMARY KEY (package_id, service_key)
);

CREATE TABLE platform_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE CHECK (tenant_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning','active','suspended','retired')),
  hosting_mode text NOT NULL CHECK (hosting_mode IN ('cloud','on_premises')),
  region text CHECK (region IS NULL OR length(trim(region)) BETWEEN 2 AND 120),
  deployment_reference text CHECK (
    deployment_reference IS NULL OR
    (length(trim(deployment_reference)) BETWEEN 2 AND 200 AND
     deployment_reference !~* '(password|secret|token|credential|postgres(ql)?://)')
  ),
  deployment_status text NOT NULL DEFAULT 'not_registered'
    CHECK (deployment_status IN ('not_registered','registered','verified')),
  deployment_verification_reference text CHECK (
    deployment_verification_reference IS NULL OR
    (length(trim(deployment_verification_reference)) BETWEEN 2 AND 200 AND
     deployment_verification_reference !~* '(password|secret|token|credential|://|postgres(ql)?)')
  ),
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR deployment_status = 'verified')
);

CREATE TABLE platform_tenant_packages (
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id),
  package_id uuid NOT NULL REFERENCES platform_service_packages(id),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, package_id)
);

CREATE TABLE platform_tenant_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'tenant_created','tenant_updated','deployment_registered','deployment_verified',
    'tenant_suspended','tenant_reactivated','tenant_retired','service_package_assigned'
  )),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL UNIQUE CHECK (product_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 2000),
  category text NOT NULL DEFAULT 'catalog'
    CHECK (category IN ('catalog','marketplace','service_addon')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_catalog_product_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES platform_catalog_products(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('product_created','product_updated','product_activated','product_retired')),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_platform_control_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Platform control-plane event history is append-only';
END
$$;

CREATE TRIGGER platform_tenant_events_immutable
  BEFORE UPDATE OR DELETE ON platform_tenant_events
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_control_event_mutation();
CREATE TRIGGER platform_catalog_product_events_immutable
  BEFORE UPDATE OR DELETE ON platform_catalog_product_events
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_control_event_mutation();

ALTER TABLE platform_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_services FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_service_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_service_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_service_package_items FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_events FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_catalog_products FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_catalog_product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_catalog_product_events FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_services_admin ON platform_services
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_packages_admin ON platform_service_packages
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_package_items_admin ON platform_service_package_items
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_tenants_admin ON platform_tenants
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_tenant_packages_admin ON platform_tenant_packages
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_tenant_events_admin ON platform_tenant_events
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_catalog_products_admin ON platform_catalog_products
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');
CREATE POLICY platform_catalog_product_events_admin ON platform_catalog_product_events
  FOR ALL USING (current_setting('app.role', true) = 'global_admin')
  WITH CHECK (current_setting('app.role', true) = 'global_admin');

GRANT SELECT, INSERT, UPDATE ON TABLE platform_services TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE platform_service_packages TO "{{role}}";
GRANT SELECT, INSERT, DELETE ON TABLE platform_service_package_items TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE platform_tenants TO "{{role}}";
GRANT SELECT, INSERT, DELETE ON TABLE platform_tenant_packages TO "{{role}}";
GRANT SELECT, INSERT ON TABLE platform_tenant_events TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE platform_catalog_products TO "{{role}}";
GRANT SELECT, INSERT ON TABLE platform_catalog_product_events TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE platform_tenant_events_id_seq TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE platform_catalog_product_events_id_seq TO "{{role}}";
REVOKE ALL ON FUNCTION prevent_platform_control_event_mutation() FROM PUBLIC;
