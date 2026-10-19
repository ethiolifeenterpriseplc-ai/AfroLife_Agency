CREATE TABLE insurance_brokerage_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES insurance_brokerage_tenants(id),
  branch_id uuid NOT NULL,
  client_reference text NOT NULL CHECK (length(trim(client_reference)) BETWEEN 2 AND 100),
  customer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_reference),
  UNIQUE (tenant_id, customer_user_id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (branch_id, tenant_id)
    REFERENCES insurance_brokerage_branches(id, tenant_id)
);

CREATE TABLE insurance_brokerage_client_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('brokerage_advice','quote_submission')),
  granted boolean NOT NULL,
  notice_version text NOT NULL CHECK (length(trim(notice_version)) BETWEEN 1 AND 80),
  notice_reference text NOT NULL CHECK (length(trim(notice_reference)) BETWEEN 2 AND 200),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 2 AND 200),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, tenant_id)
    REFERENCES insurance_brokerage_clients(id, tenant_id),
  UNIQUE (id, tenant_id, client_id)
);
CREATE INDEX insurance_brokerage_client_consents_latest_idx
  ON insurance_brokerage_client_consents (tenant_id, client_id, purpose, recorded_at DESC, id DESC);

CREATE TABLE insurance_brokerage_needs_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object'),
  completed_by uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, tenant_id)
    REFERENCES insurance_brokerage_clients(id, tenant_id),
  UNIQUE (client_id, version),
  UNIQUE (id, tenant_id, client_id)
);
CREATE INDEX insurance_brokerage_needs_assessments_recent_idx
  ON insurance_brokerage_needs_assessments (tenant_id, client_id, completed_at DESC);

CREATE TRIGGER insurance_brokerage_client_consent_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_client_consents
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();
CREATE TRIGGER insurance_brokerage_needs_assessment_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_needs_assessments
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();

ALTER TABLE insurance_brokerage_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_client_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_client_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_needs_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_needs_assessments FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_brokerage_clients_read ON insurance_brokerage_clients
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id, branch_id, ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_clients_create ON insurance_brokerage_clients
  FOR INSERT WITH CHECK (
    opened_by = app_user_id()
    AND (app_role() = 'super_admin'
      OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
        AND insurance_brokerage_has_branch_role(
          tenant_id, branch_id, ARRAY['broker_adviser']
        ))
  );

CREATE POLICY insurance_brokerage_client_consents_read ON insurance_brokerage_client_consents
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM insurance_brokerage_clients client
        WHERE client.id = insurance_brokerage_client_consents.client_id
          AND client.tenant_id = insurance_brokerage_client_consents.tenant_id
          AND insurance_brokerage_has_branch_role(
            client.tenant_id, client.branch_id,
            ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
          )
      )
  );
CREATE POLICY insurance_brokerage_client_consents_create ON insurance_brokerage_client_consents
  FOR INSERT WITH CHECK (
    recorded_by = app_user_id()
    AND (app_role() = 'super_admin'
      OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM insurance_brokerage_clients client
          WHERE client.id = insurance_brokerage_client_consents.client_id
            AND client.tenant_id = insurance_brokerage_client_consents.tenant_id
            AND insurance_brokerage_has_branch_role(
              client.tenant_id, client.branch_id, ARRAY['broker_adviser']
            )
        ))
  );

CREATE POLICY insurance_brokerage_needs_assessments_read ON insurance_brokerage_needs_assessments
  FOR SELECT USING (
    app_role() = 'super_admin'
    OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM insurance_brokerage_clients client
        WHERE client.id = insurance_brokerage_needs_assessments.client_id
          AND client.tenant_id = insurance_brokerage_needs_assessments.tenant_id
          AND insurance_brokerage_has_branch_role(
            client.tenant_id, client.branch_id,
            ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
          )
      )
  );
CREATE POLICY insurance_brokerage_needs_assessments_create ON insurance_brokerage_needs_assessments
  FOR INSERT WITH CHECK (
    completed_by = app_user_id()
    AND (app_role() = 'super_admin'
      OR tenant_id = nullif(current_setting('app.brokerage_tenant_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM insurance_brokerage_clients client
          WHERE client.id = insurance_brokerage_needs_assessments.client_id
            AND client.tenant_id = insurance_brokerage_needs_assessments.tenant_id
            AND insurance_brokerage_has_branch_role(
              client.tenant_id, client.branch_id, ARRAY['broker_adviser']
            )
        ))
  );

REVOKE ALL ON TABLE insurance_brokerage_clients FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_client_consents FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_needs_assessments FROM "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_clients TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_client_consents TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_needs_assessments TO "{{role}}";
