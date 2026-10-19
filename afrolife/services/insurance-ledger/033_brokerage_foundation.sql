CREATE TABLE insurance_brokerage_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE CHECK (tenant_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 200),
  registration_reference text NOT NULL CHECK (length(trim(registration_reference)) BETWEEN 2 AND 160),
  contract_reference text NOT NULL CHECK (length(trim(contract_reference)) BETWEEN 2 AND 200),
  onboarding_evidence_reference text NOT NULL CHECK (length(trim(onboarding_evidence_reference)) BETWEEN 2 AND 200),
  authorized_contact_name text NOT NULL CHECK (length(trim(authorized_contact_name)) BETWEEN 2 AND 160),
  contact_email text NOT NULL CHECK (length(trim(contact_email)) BETWEEN 3 AND 254),
  contact_phone text NOT NULL CHECK (length(trim(contact_phone)) BETWEEN 8 AND 32),
  locale text NOT NULL DEFAULT 'en-ET' CHECK (length(trim(locale)) BETWEEN 2 AND 20),
  currency char(3) NOT NULL DEFAULT 'ETB',
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning','active','suspended','retired')),
  licence_reference text,
  licence_valid_until date,
  licence_evidence_reference text,
  pi_policy_reference text,
  pi_valid_until date,
  pi_evidence_reference text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_reference),
  CHECK (
    status <> 'active'
    OR (licence_reference IS NOT NULL AND licence_valid_until IS NOT NULL
      AND licence_evidence_reference IS NOT NULL AND pi_policy_reference IS NOT NULL
      AND pi_valid_until IS NOT NULL AND pi_evidence_reference IS NOT NULL)
  )
);

CREATE TABLE insurance_brokerage_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES insurance_brokerage_tenants(id),
  branch_key text NOT NULL CHECK (branch_key ~ '^[a-z][a-z0-9-]{1,49}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 5 AND 500),
  is_head_office boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_key),
  UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX insurance_brokerage_one_head_office_idx
  ON insurance_brokerage_branches (tenant_id) WHERE is_head_office;

CREATE TABLE insurance_brokerage_staff (
  tenant_id uuid NOT NULL REFERENCES insurance_brokerage_tenants(id),
  user_id uuid NOT NULL,
  branch_id uuid,
  role text NOT NULL CHECK (role IN (
    'broker_owner','broker_admin','broker_adviser','operations','compliance','finance','auditor'
  )),
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  granted_by uuid NOT NULL,
  grant_reason text NOT NULL CHECK (length(trim(grant_reason)) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role),
  FOREIGN KEY (branch_id, tenant_id) REFERENCES insurance_brokerage_branches(id, tenant_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX insurance_brokerage_staff_user_idx
  ON insurance_brokerage_staff (user_id, tenant_id) WHERE active;
ALTER TABLE insurance_brokerage_staff
  ADD CONSTRAINT insurance_brokerage_tenant_admin_is_tenant_wide
  CHECK (role NOT IN ('broker_owner','broker_admin') OR branch_id IS NULL);

CREATE TABLE insurance_brokerage_insurers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES insurance_brokerage_tenants(id),
  insurer_key text NOT NULL CHECK (insurer_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 200),
  licence_reference text NOT NULL CHECK (length(trim(licence_reference)) BETWEEN 2 AND 160),
  supported_lines text[] NOT NULL CHECK (
    cardinality(supported_lines) > 0
    AND supported_lines <@ ARRAY['life','general']::text[]
  ),
  submission_channels text[] NOT NULL DEFAULT ARRAY['manual']::text[]
    CHECK (cardinality(submission_channels) > 0
      AND submission_channels <@ ARRAY['api','secure_file','manual']::text[]),
  agreement_reference text NOT NULL CHECK (length(trim(agreement_reference)) BETWEEN 2 AND 200),
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, insurer_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE insurance_brokerage_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  insurer_id uuid NOT NULL,
  product_key text NOT NULL CHECK (product_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  line text NOT NULL CHECK (line IN ('life','general')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (insurer_id, tenant_id)
    REFERENCES insurance_brokerage_insurers(id, tenant_id),
  UNIQUE (tenant_id, product_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE insurance_brokerage_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  effective_from date NOT NULL,
  effective_to date,
  product_terms jsonb NOT NULL CHECK (jsonb_typeof(product_terms) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, tenant_id)
    REFERENCES insurance_brokerage_products(id, tenant_id),
  UNIQUE (product_id, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX insurance_brokerage_product_versions_current_idx
  ON insurance_brokerage_product_versions (tenant_id, product_id, effective_from DESC);

CREATE TABLE insurance_brokerage_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES insurance_brokerage_tenants(id),
  branch_id uuid,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 2 AND 100),
  entity text NOT NULL CHECK (length(trim(entity)) BETWEEN 2 AND 80),
  entity_id text NOT NULL CHECK (length(trim(entity_id)) BETWEEN 1 AND 160),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (branch_id, tenant_id)
    REFERENCES insurance_brokerage_branches(id, tenant_id)
);
CREATE INDEX insurance_brokerage_audit_recent_idx
  ON insurance_brokerage_audit (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION insurance_brokerage_has_role(target_tenant uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM insurance_brokerage_staff staff
    WHERE staff.tenant_id = target_tenant
      AND staff.user_id = app_user_id()
      AND staff.active
      AND staff.valid_from <= now()
      AND (staff.valid_until IS NULL OR staff.valid_until > now())
      AND (staff.role = ANY(allowed_roles)
        OR staff.role = 'broker_owner' AND 'broker_admin' = ANY(allowed_roles))
  )
$$;

CREATE OR REPLACE FUNCTION insurance_brokerage_has_tenant_role(target_tenant uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM insurance_brokerage_staff staff
    WHERE staff.tenant_id = target_tenant
      AND staff.user_id = app_user_id()
      AND staff.branch_id IS NULL
      AND staff.active
      AND staff.valid_from <= now()
      AND (staff.valid_until IS NULL OR staff.valid_until > now())
      AND (staff.role = ANY(allowed_roles)
        OR staff.role = 'broker_owner' AND 'broker_admin' = ANY(allowed_roles))
  )
$$;

CREATE OR REPLACE FUNCTION insurance_brokerage_has_branch_role(
  target_tenant uuid,
  target_branch uuid,
  allowed_roles text[]
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM insurance_brokerage_staff staff
    WHERE staff.tenant_id = target_tenant
      AND staff.user_id = app_user_id()
      AND (staff.branch_id IS NULL OR staff.branch_id = target_branch)
      AND staff.active
      AND staff.valid_from <= now()
      AND (staff.valid_until IS NULL OR staff.valid_until > now())
      AND (staff.role = ANY(allowed_roles)
        OR staff.role = 'broker_owner' AND 'broker_admin' = ANY(allowed_roles))
  )
$$;

CREATE OR REPLACE FUNCTION insurance_brokerage_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance brokerage audit and product-version history is immutable';
END
$$;
CREATE OR REPLACE FUNCTION insurance_brokerage_guard_tenant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.tenant_key IS DISTINCT FROM OLD.tenant_key
     OR NEW.registration_reference IS DISTINCT FROM OLD.registration_reference
     OR NEW.contract_reference IS DISTINCT FROM OLD.contract_reference
     OR NEW.onboarding_evidence_reference IS DISTINCT FROM OLD.onboarding_evidence_reference THEN
    RAISE EXCEPTION 'Brokerage tenant identity and onboarding evidence are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.licence_reference IS DISTINCT FROM OLD.licence_reference
     OR NEW.licence_valid_until IS DISTINCT FROM OLD.licence_valid_until
     OR NEW.licence_evidence_reference IS DISTINCT FROM OLD.licence_evidence_reference
     OR NEW.pi_policy_reference IS DISTINCT FROM OLD.pi_policy_reference
     OR NEW.pi_valid_until IS DISTINCT FROM OLD.pi_valid_until
     OR NEW.pi_evidence_reference IS DISTINCT FROM OLD.pi_evidence_reference THEN
    IF NOT insurance_brokerage_has_tenant_role(OLD.id, ARRAY['compliance'])
       OR OLD.created_by = app_user_id()
       OR NEW.legal_name IS DISTINCT FROM OLD.legal_name
       OR NEW.registration_reference IS DISTINCT FROM OLD.registration_reference
       OR NEW.contract_reference IS DISTINCT FROM OLD.contract_reference
       OR NEW.onboarding_evidence_reference IS DISTINCT FROM OLD.onboarding_evidence_reference
       OR NEW.authorized_contact_name IS DISTINCT FROM OLD.authorized_contact_name
       OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
       OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
       OR NEW.locale IS DISTINCT FROM OLD.locale
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.updated_by IS DISTINCT FROM app_user_id()
       OR NEW.status <> 'active'
       OR NEW.licence_reference IS NULL
       OR NEW.licence_valid_until < current_date
       OR NEW.licence_evidence_reference IS NULL
       OR NEW.pi_policy_reference IS NULL
       OR NEW.pi_valid_until < current_date
       OR NEW.pi_evidence_reference IS NULL THEN
      RAISE EXCEPTION 'Tenant activation requires independent compliance verification of current licence and PI evidence';
    END IF;
  ELSIF NOT insurance_brokerage_has_tenant_role(OLD.id, ARRAY['broker_admin']) THEN
    RAISE EXCEPTION 'Brokerage tenant profile changes require an active tenant administrator';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_audit_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_audit
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();
CREATE TRIGGER insurance_brokerage_product_version_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_product_versions
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();
CREATE TRIGGER insurance_brokerage_tenant_update_guard
  BEFORE UPDATE ON insurance_brokerage_tenants
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_guard_tenant_update();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'insurance_brokerage_tenants',
    'insurance_brokerage_branches',
    'insurance_brokerage_staff',
    'insurance_brokerage_insurers',
    'insurance_brokerage_products',
    'insurance_brokerage_product_versions',
    'insurance_brokerage_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

CREATE POLICY insurance_brokerage_tenant_read ON insurance_brokerage_tenants
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR insurance_brokerage_has_role(id, ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor'])
  );
CREATE POLICY insurance_brokerage_tenant_create ON insurance_brokerage_tenants
  FOR INSERT WITH CHECK (app_role() = 'super_admin' AND created_by = app_user_id() AND updated_by = app_user_id());
CREATE POLICY insurance_brokerage_tenant_update ON insurance_brokerage_tenants
  FOR UPDATE USING (
    app_role() = 'super_admin'
    OR insurance_brokerage_has_role(id, ARRAY['broker_admin','compliance'])
  ) WITH CHECK (
    app_role() = 'super_admin'
    OR insurance_brokerage_has_role(id, ARRAY['broker_admin','compliance'])
  );

CREATE POLICY insurance_brokerage_branch_read ON insurance_brokerage_branches
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id, id, ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_branch_write ON insurance_brokerage_branches
  FOR ALL USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_tenant_role(tenant_id, ARRAY['broker_admin'])
  ) WITH CHECK (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_tenant_role(tenant_id, ARRAY['broker_admin'])
  );

CREATE POLICY insurance_brokerage_staff_read ON insurance_brokerage_staff
  FOR SELECT USING (
    user_id = app_user_id()
    OR app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_role(tenant_id, ARRAY['broker_admin'])
  );
CREATE POLICY insurance_brokerage_staff_manage ON insurance_brokerage_staff
  FOR ALL USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_tenant_role(tenant_id, ARRAY['broker_admin'])
  ) WITH CHECK (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_tenant_role(tenant_id, ARRAY['broker_admin'])
  );

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'insurance_brokerage_insurers',
    'insurance_brokerage_products',
    'insurance_brokerage_product_versions'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (app_role() = ''super_admin'' OR tenant_id = nullif(current_setting(''app.brokerage_tenant_id'', true), '''')::uuid AND insurance_brokerage_has_role(tenant_id, ARRAY[''broker_admin'',''broker_adviser'',''operations'',''compliance'',''finance'',''auditor''])) WITH CHECK (app_role() = ''super_admin'' OR tenant_id = nullif(current_setting(''app.brokerage_tenant_id'', true), '''')::uuid AND insurance_brokerage_has_tenant_role(tenant_id, ARRAY[''broker_admin'']))',
      table_name || '_tenant_access',
      table_name
    );
  END LOOP;
END
$$;
CREATE POLICY insurance_brokerage_audit_read ON insurance_brokerage_audit
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND CASE
        WHEN branch_id IS NULL THEN insurance_brokerage_has_tenant_role(
          tenant_id, ARRAY['broker_admin','compliance','auditor']
        )
        ELSE insurance_brokerage_has_branch_role(
          tenant_id, branch_id, ARRAY['compliance','auditor']
        )
      END
  );
CREATE POLICY insurance_brokerage_audit_create ON insurance_brokerage_audit
  FOR INSERT WITH CHECK (
    actor_id = app_user_id()
    AND (app_role() = 'super_admin'
      OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
        AND CASE
          WHEN branch_id IS NULL THEN insurance_brokerage_has_tenant_role(
            tenant_id, ARRAY['broker_admin','compliance','auditor']
          )
          ELSE insurance_brokerage_has_branch_role(
            tenant_id, branch_id,
            ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
          )
        END)
  );

REVOKE ALL ON TABLE insurance_brokerage_tenants FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_branches FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_staff FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_insurers FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_products FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_product_versions FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_audit FROM "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_tenants TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_branches TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_staff TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_insurers TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_products TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_product_versions TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_audit TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE insurance_brokerage_audit_id_seq TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_brokerage_has_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance_brokerage_has_role(uuid, text[]) TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_brokerage_has_tenant_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance_brokerage_has_tenant_role(uuid, text[]) TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_brokerage_has_branch_role(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance_brokerage_has_branch_role(uuid, uuid, text[]) TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_brokerage_prevent_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_brokerage_guard_tenant_update() FROM PUBLIC;
