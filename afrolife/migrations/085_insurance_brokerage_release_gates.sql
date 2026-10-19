ALTER TABLE release_readiness_evidence
  DROP CONSTRAINT IF EXISTS release_readiness_evidence_category_check;

ALTER TABLE release_readiness_evidence
  ADD CONSTRAINT release_readiness_evidence_category_check CHECK (category IN (
    'legal','provider','finance','security','operations','accessibility',
    'capacity','dr','incident','service_account','release_owner','privacy',
    'insurance_license','insurance_professional_indemnity','insurance_ceo_oversight',
    'insurance_branch_oversight','insurance_market_comparison','insurance_customer_choice_exception',
    'insurance_disclosure_consent','insurance_policy_issuance','insurance_premium_custody',
    'insurance_claims_records','insurance_data_rights','insurance_tenant_isolation',
    'insurance_integration_reconciliation','insurance_business_continuity','insurance_global_financial_reporting',
    'insurance_commission_distribution','insurance_legal_signoff'
  ));
