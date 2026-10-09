ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'super_admin','corporate_business_manager','compliance','finance','finance_manager',
  'master_agent','field_agent','customer','worker','property_owner'
));

ALTER TABLE agents ADD COLUMN service_specialization text
  CHECK (service_specialization IS NULL OR service_specialization IN (
    'financial_service','growth_partnership','workforce_property'
  ));

CREATE TABLE contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id),
  document_stage text NOT NULL CHECK (document_stage IN ('party_signed','company_countersigned')),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_documents_contract_idx ON contract_documents(contract_id, created_at DESC);

CREATE TABLE contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE REFERENCES contracts(id),
  document_id uuid NOT NULL REFERENCES contract_documents(id),
  signed_by uuid NOT NULL REFERENCES users(id),
  signer_role text NOT NULL CHECK (signer_role IN ('super_admin','corporate_business_manager')),
  signed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_documents_scope ON contract_documents
  USING (app_is_staff() OR EXISTS (
    SELECT 1 FROM contracts k WHERE k.id = contract_id AND app_can_access_agent(k.source_agent_id)
  ));
CREATE POLICY contract_signatures_scope ON contract_signatures
  USING (app_is_staff() OR EXISTS (
    SELECT 1 FROM contracts k WHERE k.id = contract_id AND app_can_access_agent(k.source_agent_id)
  ));

-- Keep this new role scoped to contract review and signature; it does not gain general staff RLS access.
CREATE POLICY contracts_corporate_manager_read ON contracts FOR SELECT
  USING (app_role() = 'corporate_business_manager');
CREATE POLICY contracts_corporate_manager_update ON contracts FOR UPDATE
  USING (app_role() = 'corporate_business_manager' AND state = 'signature_pending')
  WITH CHECK (app_role() = 'corporate_business_manager');
CREATE POLICY documents_corporate_manager_read ON contract_documents FOR SELECT
  USING (app_role() = 'corporate_business_manager');
CREATE POLICY documents_corporate_manager_countersign_upload ON contract_documents FOR INSERT
  WITH CHECK (app_role() = 'corporate_business_manager' AND uploaded_by = app_user_id() AND document_stage = 'company_countersigned');
CREATE POLICY signatures_corporate_manager_read ON contract_signatures FOR SELECT
  USING (app_role() = 'corporate_business_manager');
CREATE POLICY signatures_corporate_manager_insert ON contract_signatures FOR INSERT
  WITH CHECK (app_role() = 'corporate_business_manager' AND signed_by = app_user_id());
CREATE POLICY invoices_corporate_manager_sign ON invoices FOR INSERT
  WITH CHECK (app_role() = 'corporate_business_manager');

CREATE OR REPLACE FUNCTION prevent_unverified_activation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND NEW.role NOT IN ('super_admin','corporate_business_manager','compliance','finance','finance_manager')
     AND NEW.kyc_status <> 'verified' THEN
    RAISE EXCEPTION 'Account must be KYC verified before activation';
  END IF;
  RETURN NEW;
END
$$;
