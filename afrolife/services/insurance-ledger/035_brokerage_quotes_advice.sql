ALTER TABLE insurance_brokerage_product_versions
  ADD CONSTRAINT insurance_brokerage_product_version_tenant_identity
  UNIQUE (id, tenant_id, product_id);

CREATE TABLE insurance_brokerage_quote_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  client_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_version_id uuid NOT NULL,
  consent_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('api','secure_file','manual')),
  submission_reference text NOT NULL
    CHECK (submission_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$'),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, tenant_id) REFERENCES insurance_brokerage_clients(id, tenant_id),
  FOREIGN KEY (branch_id, tenant_id) REFERENCES insurance_brokerage_branches(id, tenant_id),
  FOREIGN KEY (assessment_id, tenant_id, client_id)
    REFERENCES insurance_brokerage_needs_assessments(id, tenant_id, client_id),
  FOREIGN KEY (product_id, tenant_id) REFERENCES insurance_brokerage_products(id, tenant_id),
  FOREIGN KEY (product_version_id, tenant_id, product_id)
    REFERENCES insurance_brokerage_product_versions(id, tenant_id, product_id),
  FOREIGN KEY (consent_id, tenant_id, client_id)
    REFERENCES insurance_brokerage_client_consents(id, tenant_id, client_id),
  UNIQUE (id, tenant_id, client_id, branch_id)
);
CREATE UNIQUE INDEX insurance_brokerage_quote_submission_reference_idx
  ON insurance_brokerage_quote_submissions (tenant_id, submission_reference);
CREATE INDEX insurance_brokerage_quote_submissions_client_idx
  ON insurance_brokerage_quote_submissions (tenant_id, client_id, submitted_at DESC);

CREATE TABLE insurance_brokerage_quote_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  client_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  insurer_id uuid NOT NULL,
  external_quote_reference text NOT NULL
    CHECK (external_quote_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$'),
  premium_minor bigint NOT NULL CHECK (premium_minor > 0),
  currency char(3) NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  valid_until timestamptz NOT NULL,
  coverage_summary jsonb NOT NULL CHECK (jsonb_typeof(coverage_summary) = 'object'),
  quote_document_reference text NOT NULL
    CHECK (quote_document_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$'),
  captured_by uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (submission_id, tenant_id, client_id, branch_id)
    REFERENCES insurance_brokerage_quote_submissions(id, tenant_id, client_id, branch_id),
  FOREIGN KEY (insurer_id, tenant_id)
    REFERENCES insurance_brokerage_insurers(id, tenant_id),
  UNIQUE (tenant_id, insurer_id, external_quote_reference),
  UNIQUE (id, tenant_id, client_id, branch_id)
);
CREATE INDEX insurance_brokerage_quote_offers_client_idx
  ON insurance_brokerage_quote_offers (tenant_id, client_id, valid_until DESC);

CREATE TABLE insurance_brokerage_advice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  client_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  recommended_quote_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  recommendation_rationale text NOT NULL CHECK (length(trim(recommendation_rationale)) BETWEEN 50 AND 5000),
  customer_fit_summary text NOT NULL CHECK (length(trim(customer_fit_summary)) BETWEEN 20 AND 3000),
  affordability_summary text NOT NULL CHECK (length(trim(affordability_summary)) BETWEEN 20 AND 3000),
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(alternatives) = 'array' AND jsonb_array_length(alternatives) <= 20),
  conflict_disclosure_reference text NOT NULL
    CHECK (conflict_disclosure_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$'),
  limitations_disclosure_reference text NOT NULL
    CHECK (limitations_disclosure_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$'),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','rejected')),
  reviewed_by uuid,
  review_reason text,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  FOREIGN KEY (client_id, tenant_id) REFERENCES insurance_brokerage_clients(id, tenant_id),
  FOREIGN KEY (branch_id, tenant_id) REFERENCES insurance_brokerage_branches(id, tenant_id),
  FOREIGN KEY (assessment_id, tenant_id, client_id)
    REFERENCES insurance_brokerage_needs_assessments(id, tenant_id, client_id),
  FOREIGN KEY (recommended_quote_id, tenant_id, client_id, branch_id)
    REFERENCES insurance_brokerage_quote_offers(id, tenant_id, client_id, branch_id),
  UNIQUE (id, tenant_id),
  CHECK (
    (status = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL
      AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  )
);
CREATE UNIQUE INDEX insurance_brokerage_one_pending_advice_per_client_idx
  ON insurance_brokerage_advice (tenant_id, client_id) WHERE status = 'pending_review';
CREATE INDEX insurance_brokerage_advice_recent_idx
  ON insurance_brokerage_advice (tenant_id, client_id, proposed_at DESC);

CREATE TABLE insurance_brokerage_advice_alternatives (
  tenant_id uuid NOT NULL,
  advice_id uuid NOT NULL,
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  comparison_reason text NOT NULL CHECK (length(trim(comparison_reason)) BETWEEN 20 AND 2000),
  PRIMARY KEY (advice_id, quote_id),
  FOREIGN KEY (advice_id, tenant_id) REFERENCES insurance_brokerage_advice(id, tenant_id),
  FOREIGN KEY (quote_id, tenant_id, client_id, branch_id)
    REFERENCES insurance_brokerage_quote_offers(id, tenant_id, client_id, branch_id)
);

CREATE TABLE insurance_brokerage_advice_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  advice_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  decided_by uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (advice_id, tenant_id) REFERENCES insurance_brokerage_advice(id, tenant_id),
  FOREIGN KEY (branch_id, tenant_id) REFERENCES insurance_brokerage_branches(id, tenant_id),
  UNIQUE (advice_id)
);

CREATE TRIGGER insurance_brokerage_quote_offer_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_quote_offers
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();
CREATE TRIGGER insurance_brokerage_advice_decision_immutable
  BEFORE UPDATE OR DELETE ON insurance_brokerage_advice_decisions
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_prevent_mutation();

CREATE OR REPLACE FUNCTION insurance_brokerage_validate_quote_submission()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT insurance_brokerage_has_branch_role(NEW.tenant_id, NEW.branch_id, ARRAY['broker_adviser'])
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_clients client
       WHERE client.id=NEW.client_id AND client.tenant_id=NEW.tenant_id
         AND client.branch_id=NEW.branch_id AND client.status='active'
     )
     OR (SELECT consent.id FROM insurance_brokerage_client_consents consent
         WHERE consent.tenant_id=NEW.tenant_id AND consent.client_id=NEW.client_id
           AND consent.purpose='quote_submission'
         ORDER BY consent.recorded_at DESC, consent.id DESC LIMIT 1)
         IS DISTINCT FROM NEW.consent_id
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_client_consents consent
       WHERE consent.id=NEW.consent_id AND consent.granted
     )
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_needs_assessments assessment
       JOIN insurance_brokerage_products product
         ON product.id=NEW.product_id AND product.tenant_id=NEW.tenant_id
       JOIN insurance_brokerage_insurers insurer
         ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
       JOIN insurance_brokerage_tenants tenant ON tenant.id=NEW.tenant_id
       WHERE assessment.id=NEW.assessment_id AND assessment.tenant_id=NEW.tenant_id
         AND assessment.client_id=NEW.client_id
         AND product.status='active' AND insurer.active
         AND NEW.channel=ANY(insurer.submission_channels)
         AND product.line IN (
           SELECT jsonb_array_elements_text(assessment.assessment->'requested_lines')
         )
         AND tenant.status='active'
         AND tenant.licence_valid_until>=current_date
         AND tenant.pi_valid_until>=current_date
         AND EXISTS (
           SELECT 1 FROM insurance_brokerage_product_versions version
           WHERE version.id=NEW.product_version_id AND version.product_id=product.id
             AND version.tenant_id=NEW.tenant_id
             AND version.effective_from<=current_date
             AND (version.effective_to IS NULL OR version.effective_to>=current_date)
         )
     ) THEN
    RAISE EXCEPTION 'Quote submission requires active branch access, current consent, an assessed active product, and current broker evidence';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_quote_submission_guard
  BEFORE INSERT ON insurance_brokerage_quote_submissions
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_validate_quote_submission();

CREATE OR REPLACE FUNCTION insurance_brokerage_validate_quote_offer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT insurance_brokerage_has_branch_role(NEW.tenant_id, NEW.branch_id, ARRAY['operations','broker_adviser'])
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_quote_submissions submission
       JOIN insurance_brokerage_products product
         ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
       JOIN insurance_brokerage_insurers insurer
         ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
       JOIN insurance_brokerage_tenants tenant ON tenant.id=submission.tenant_id
       WHERE submission.id=NEW.submission_id AND submission.tenant_id=NEW.tenant_id
         AND submission.client_id=NEW.client_id AND submission.branch_id=NEW.branch_id
         AND insurer.id=NEW.insurer_id AND insurer.active
         AND tenant.status='active'
         AND tenant.licence_valid_until>=current_date
         AND tenant.pi_valid_until>=current_date
     )
     OR NEW.valid_until<=now() THEN
    RAISE EXCEPTION 'Quote response requires an active insurer agreement, current broker evidence, and a valid quote';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_quote_offer_guard
  BEFORE INSERT ON insurance_brokerage_quote_offers
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_validate_quote_offer();

CREATE OR REPLACE FUNCTION insurance_brokerage_validate_advice_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT insurance_brokerage_has_branch_role(NEW.tenant_id, NEW.branch_id, ARRAY['broker_adviser'])
     OR NEW.status<>'pending_review' OR NEW.proposed_by IS DISTINCT FROM app_user_id()
     OR (SELECT consent.granted FROM insurance_brokerage_client_consents consent
         WHERE consent.tenant_id=NEW.tenant_id AND consent.client_id=NEW.client_id
           AND consent.purpose='brokerage_advice'
         ORDER BY consent.recorded_at DESC, consent.id DESC LIMIT 1) IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_needs_assessments assessment
       JOIN insurance_brokerage_clients client
         ON client.id=assessment.client_id AND client.tenant_id=assessment.tenant_id
       WHERE assessment.id=NEW.assessment_id AND assessment.tenant_id=NEW.tenant_id
         AND assessment.client_id=NEW.client_id AND client.branch_id=NEW.branch_id
         AND client.status='active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_quote_offers quote
       JOIN insurance_brokerage_quote_submissions submission
         ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
       JOIN insurance_brokerage_products product
         ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
       JOIN insurance_brokerage_insurers insurer
         ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
       JOIN insurance_brokerage_tenants tenant ON tenant.id=quote.tenant_id
       WHERE quote.id=NEW.recommended_quote_id
         AND quote.tenant_id=NEW.tenant_id AND quote.client_id=NEW.client_id
         AND quote.branch_id=NEW.branch_id AND submission.assessment_id=NEW.assessment_id
         AND quote.valid_until>now() AND product.status='active' AND insurer.active
         AND tenant.status='active' AND tenant.licence_valid_until>=current_date
         AND tenant.pi_valid_until>=current_date
     ) THEN
    RAISE EXCEPTION 'Advice proposal requires current customer consent, assessment, valid quote, active product, and adviser branch access';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_advice_insert_guard
  BEFORE INSERT ON insurance_brokerage_advice
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_validate_advice_insert();

CREATE OR REPLACE FUNCTION insurance_brokerage_validate_advice_alternative()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM insurance_brokerage_advice advice
    JOIN insurance_brokerage_quote_offers quote
      ON quote.id=NEW.quote_id AND quote.tenant_id=NEW.tenant_id
        AND quote.client_id=NEW.client_id AND quote.branch_id=NEW.branch_id
    JOIN insurance_brokerage_quote_submissions submission
      ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
    WHERE advice.id=NEW.advice_id AND advice.tenant_id=NEW.tenant_id
      AND advice.client_id=NEW.client_id AND advice.branch_id=NEW.branch_id
      AND advice.proposed_by=app_user_id() AND advice.status='pending_review'
      AND advice.recommended_quote_id<>NEW.quote_id
      AND submission.assessment_id=advice.assessment_id
      AND quote.valid_until>now()
      AND insurance_brokerage_has_branch_role(NEW.tenant_id,NEW.branch_id,ARRAY['broker_adviser'])
  ) THEN
    RAISE EXCEPTION 'Alternative quote must be valid for the same client assessment and advice maker';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_advice_alternative_guard
  BEFORE INSERT ON insurance_brokerage_advice_alternatives
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_validate_advice_alternative();

CREATE OR REPLACE FUNCTION insurance_brokerage_guard_advice_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending_review'
     OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by = OLD.proposed_by
     OR NEW.reviewed_at IS NULL
     OR NEW.review_reason IS NULL
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.recommended_quote_id IS DISTINCT FROM OLD.recommended_quote_id
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
     OR NEW.recommendation_rationale IS DISTINCT FROM OLD.recommendation_rationale
     OR NEW.customer_fit_summary IS DISTINCT FROM OLD.customer_fit_summary
     OR NEW.affordability_summary IS DISTINCT FROM OLD.affordability_summary
     OR NEW.alternatives IS DISTINCT FROM OLD.alternatives
     OR NEW.conflict_disclosure_reference IS DISTINCT FROM OLD.conflict_disclosure_reference
     OR NEW.limitations_disclosure_reference IS DISTINCT FROM OLD.limitations_disclosure_reference
     OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at
     OR NOT insurance_brokerage_has_branch_role(
       OLD.tenant_id, OLD.branch_id, ARRAY['broker_admin','compliance']
     ) THEN
    RAISE EXCEPTION 'Advice decision requires an independent authorized reviewer and an immutable proposal';
  END IF;
  IF NEW.status='approved' AND (
     (SELECT consent.granted FROM insurance_brokerage_client_consents consent
      WHERE consent.tenant_id=OLD.tenant_id AND consent.client_id=OLD.client_id
        AND consent.purpose='brokerage_advice'
      ORDER BY consent.recorded_at DESC, consent.id DESC LIMIT 1) IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1 FROM insurance_brokerage_quote_offers quote
       JOIN insurance_brokerage_quote_submissions submission
         ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
       JOIN insurance_brokerage_products product
         ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
       JOIN insurance_brokerage_insurers insurer
         ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
       JOIN insurance_brokerage_tenants tenant ON tenant.id=quote.tenant_id
       WHERE quote.id=OLD.recommended_quote_id
         AND quote.tenant_id=OLD.tenant_id AND quote.client_id=OLD.client_id
         AND quote.valid_until>now() AND product.status='active' AND insurer.active
         AND tenant.status='active' AND tenant.licence_valid_until>=current_date
         AND tenant.pi_valid_until>=current_date
     )
     OR EXISTS (
       SELECT 1 FROM insurance_brokerage_advice_alternatives alternative
       LEFT JOIN insurance_brokerage_quote_offers quote
         ON quote.id=alternative.quote_id AND quote.tenant_id=alternative.tenant_id
       LEFT JOIN insurance_brokerage_quote_submissions submission
         ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
       LEFT JOIN insurance_brokerage_products product
         ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
       LEFT JOIN insurance_brokerage_insurers insurer
         ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
       WHERE alternative.advice_id=OLD.id AND alternative.tenant_id=OLD.tenant_id
         AND (quote.id IS NULL OR quote.valid_until<=now()
           OR product.status<>'active' OR insurer.active IS DISTINCT FROM true)
     )
  ) THEN
    RAISE EXCEPTION 'Advice approval requires current customer consent, valid offers, active insurer/products, and current broker evidence';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER insurance_brokerage_advice_update_guard
  BEFORE UPDATE ON insurance_brokerage_advice
  FOR EACH ROW EXECUTE FUNCTION insurance_brokerage_guard_advice_update();

ALTER TABLE insurance_brokerage_quote_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_quote_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_quote_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_quote_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice_alternatives FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_brokerage_advice_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_brokerage_quote_submissions_read ON insurance_brokerage_quote_submissions
  FOR SELECT USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id,branch_id,ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_quote_submissions_create ON insurance_brokerage_quote_submissions
  FOR INSERT WITH CHECK (
    submitted_by=app_user_id()
    AND (app_role()='super_admin'
      OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
        AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['broker_adviser']))
  );

CREATE POLICY insurance_brokerage_quote_offers_read ON insurance_brokerage_quote_offers
  FOR SELECT USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id,branch_id,ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_quote_offers_create ON insurance_brokerage_quote_offers
  FOR INSERT WITH CHECK (
    captured_by=app_user_id()
    AND (app_role()='super_admin'
      OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
        AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['operations','broker_adviser']))
  );

CREATE POLICY insurance_brokerage_advice_read ON insurance_brokerage_advice
  FOR SELECT USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id,branch_id,ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_advice_create ON insurance_brokerage_advice
  FOR INSERT WITH CHECK (
    proposed_by=app_user_id() AND status='pending_review'
    AND (app_role()='super_admin'
      OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
        AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['broker_adviser']))
  );
CREATE POLICY insurance_brokerage_advice_decide ON insurance_brokerage_advice
  FOR UPDATE USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['broker_admin','compliance'])
  ) WITH CHECK (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['broker_admin','compliance'])
  );

CREATE POLICY insurance_brokerage_advice_alternatives_read ON insurance_brokerage_advice_alternatives
  FOR SELECT USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id,branch_id,ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_advice_alternatives_create ON insurance_brokerage_advice_alternatives
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM insurance_brokerage_advice advice
      WHERE advice.id=insurance_brokerage_advice_alternatives.advice_id
        AND advice.tenant_id=insurance_brokerage_advice_alternatives.tenant_id
        AND advice.status='pending_review' AND advice.proposed_by=app_user_id()
    )
  );

CREATE POLICY insurance_brokerage_advice_decisions_read ON insurance_brokerage_advice_decisions
  FOR SELECT USING (
    app_role()='super_admin'
    OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
      AND insurance_brokerage_has_branch_role(
        tenant_id,branch_id,ARRAY['broker_admin','broker_adviser','operations','compliance','finance','auditor']
      )
  );
CREATE POLICY insurance_brokerage_advice_decisions_create ON insurance_brokerage_advice_decisions
  FOR INSERT WITH CHECK (
    decided_by=app_user_id()
    AND (app_role()='super_admin'
      OR tenant_id=nullif(current_setting('app.brokerage_tenant_id',true),'')::uuid
        AND insurance_brokerage_has_branch_role(tenant_id,branch_id,ARRAY['broker_admin','compliance']))
    AND EXISTS (
      SELECT 1 FROM insurance_brokerage_advice advice
      WHERE advice.id=insurance_brokerage_advice_decisions.advice_id
        AND advice.tenant_id=insurance_brokerage_advice_decisions.tenant_id
        AND advice.branch_id=insurance_brokerage_advice_decisions.branch_id
        AND advice.status=insurance_brokerage_advice_decisions.decision
        AND advice.reviewed_by=insurance_brokerage_advice_decisions.decided_by
        AND advice.review_reason=insurance_brokerage_advice_decisions.reason
        AND advice.proposed_by<>insurance_brokerage_advice_decisions.decided_by
    )
  );

REVOKE ALL ON TABLE insurance_brokerage_quote_submissions FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_quote_offers FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_advice FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_advice_alternatives FROM "{{role}}";
REVOKE ALL ON TABLE insurance_brokerage_advice_decisions FROM "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_quote_submissions TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_quote_offers TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_advice TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_advice_alternatives TO "{{role}}";
GRANT SELECT, INSERT ON insurance_brokerage_advice_decisions TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE insurance_brokerage_advice_decisions_id_seq TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_brokerage_guard_advice_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_brokerage_validate_quote_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_brokerage_validate_quote_offer() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_brokerage_validate_advice_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_brokerage_validate_advice_alternative() FROM PUBLIC;
