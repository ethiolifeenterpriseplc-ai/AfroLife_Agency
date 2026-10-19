import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { buildInsuranceServiceMigration } from '../services/insurance-ledger/schema.js';
import {
  createInsuranceBrokerageRouter,
  insuranceAdviceProposalSchema,
  insuranceNeedsAssessmentSchema,
  insuranceProductTermsSchema,
  insuranceQuoteOfferSchema,
} from '../services/insurance-ledger/brokerage.js';

const validTerms = {
  coverage: ['Specified risk coverage'],
  exclusions: ['Unlisted exclusions apply'],
  limits: { annual: 'ETB 100,000' },
  deductibles: ['ETB 500 per claim'],
  eligibility: ['Policyholder meets insurer criteria'],
  required_fields: ['policyholder_name'],
};

const validAssessment = {
  objectives: ['Protect household income'],
  requested_lines: ['life'],
  coverage_gaps: ['No current income protection'],
  existing_cover: false,
  annual_premium_budget_minor: 120000,
  budget_basis: 'customer_stated',
  exposure_categories: ['income'],
  customer_confirmed: true,
  conflict_disclosure_reference: 'conflict-disclosure-2026-01',
  limitations_disclosure_reference: 'limitations-2026-01',
  confirmation_evidence_reference: 'customer-confirmation-2026-01',
};

const validQuoteOffer = {
  external_quote_reference: 'insurer-quote-2026-01',
  premium_minor: 420000,
  valid_until: '2027-01-01T00:00:00.000Z',
  coverage_summary: {
    covered_items: ['Declared household contents'],
    exclusions: ['Wear and tear'],
    limits: { total: 'ETB 250,000' },
    deductibles: ['ETB 1,000'],
    insurer_conditions: ['Subject to final underwriting'],
  },
  quote_document_reference: 'quote-evidence-2026-01',
};

const validAdvice = {
  client_id: '10000000-0000-4000-8000-000000000001',
  assessment_id: '20000000-0000-4000-8000-000000000001',
  recommended_quote_id: '30000000-0000-4000-8000-000000000001',
  recommendation_rationale: 'This offer fits the documented household protection objective and provides clear limits.',
  customer_fit_summary: 'The stated protection gap matches the covered property and eligible household use.',
  affordability_summary: 'The customer-stated annual budget supports this quoted premium without an affordability assumption.',
  conflict_disclosure_reference: 'conflict-2026-01',
  limitations_disclosure_reference: 'limitations-2026-01',
  alternatives: [{
    quote_id: '30000000-0000-4000-8000-000000000002',
    comparison_reason: 'This alternative has a higher deductible and a lower stated annual limit.',
  }],
};

test('brokerage product terms require versionable coverage and disclosure fields', () => {
  assert.equal(insuranceProductTermsSchema.safeParse(validTerms).success, true);
  assert.equal(insuranceProductTermsSchema.safeParse({
    ...validTerms,
    coverage: [],
  }).success, false);
  assert.equal(insuranceProductTermsSchema.safeParse({
    ...validTerms,
    internal_unreviewed_premium: 100,
  }).success, false);
});

test('needs assessments require customer confirmation and reject unrelated sensitive fields', () => {
  assert.equal(insuranceNeedsAssessmentSchema.safeParse(validAssessment).success, true);
  assert.equal(insuranceNeedsAssessmentSchema.safeParse({
    ...validAssessment,
    annual_premium_budget_minor: 0,
  }).success, false);
  assert.equal(insuranceNeedsAssessmentSchema.safeParse({
    ...validAssessment,
    budget_basis: 'not_provided',
  }).success, false);
  assert.equal(insuranceNeedsAssessmentSchema.safeParse({
    ...validAssessment,
    customer_confirmed: false,
  }).success, false);
  assert.equal(insuranceNeedsAssessmentSchema.safeParse({
    ...validAssessment,
    medical_history: 'must not be collected in this workflow',
  }).success, false);
});

test('insurer quotes require positive ETB premium, future validity, and normalized coverage terms', () => {
  assert.equal(insuranceQuoteOfferSchema.safeParse(validQuoteOffer).success, true);
  assert.equal(insuranceQuoteOfferSchema.safeParse({
    ...validQuoteOffer,
    premium_minor: 0,
  }).success, false);
  assert.equal(insuranceQuoteOfferSchema.safeParse({
    ...validQuoteOffer,
    coverage_summary: { ...validQuoteOffer.coverage_summary, medical_data: 'not allowed' },
  }).success, false);
  assert.equal(insuranceQuoteOfferSchema.safeParse({
    ...validQuoteOffer,
    quote_document_reference: 'customer@example.invalid',
  }).success, false);
});

test('advice proposals require substantial rationale and distinct selected/alternative quotes', () => {
  assert.equal(insuranceAdviceProposalSchema.safeParse(validAdvice).success, true);
  assert.equal(insuranceAdviceProposalSchema.safeParse({
    ...validAdvice,
    alternatives: [{ ...validAdvice.alternatives[0], quote_id: validAdvice.recommended_quote_id }],
  }).success, false);
  assert.equal(insuranceAdviceProposalSchema.safeParse({
    ...validAdvice,
    recommendation_rationale: 'Too short',
  }).success, false);
  assert.equal(insuranceAdviceProposalSchema.safeParse({
    ...validAdvice,
    conflict_disclosure_reference: 'customer private notes',
  }).success, false);
});

test('brokerage tenant creation denies non-platform users before database access', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001', role: 'finance' };
    next();
  });
  app.use('/brokerage', createInsuranceBrokerageRouter(
    async () => { throw new Error('Tenant creation must be denied before database access'); },
    async () => { throw new Error('Identity database must not be queried'); },
  ));
  app.use((error: Error & { status?: number }, _req, res, _next) =>
    res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/brokerage/tenants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Platform administrator access is required' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('brokerage compliance authority cannot be self-assigned by a tenant administrator', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '00000000-0000-4000-8000-000000000002', role: 'finance' };
    next();
  });
  app.use('/brokerage', createInsuranceBrokerageRouter(
    async () => { throw new Error('Role escalation must be denied before tenant access'); },
    async () => { throw new Error('Identity database must not be queried'); },
  ));
  app.use((error: Error & { status?: number }, _req, res, _next) =>
    res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/brokerage/tenants/00000000-0000-4000-8000-000000000003/staff`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: '00000000-0000-4000-8000-000000000004',
          role: 'compliance',
          grant_reason: 'Required independent licensing verification',
        }),
      },
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Only a platform administrator may grant owner, administrator, or compliance roles',
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('brokerage foundation migration enforces tenant scope and immutable product/audit history', async () => {
  const migration = await readFile(
    new URL('../services/insurance-ledger/033_brokerage_foundation.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /insurance_brokerage_has_role/);
  assert.match(migration, /insurance_brokerage_has_tenant_role/);
  assert.match(migration, /insurance_brokerage_has_branch_role/);
  assert.match(migration, /insurance_brokerage_tenant_admin_is_tenant_wide/);
  assert.match(migration, /staff\.branch_id IS NULL OR staff\.branch_id = target_branch/);
  assert.match(migration, /insurance_brokerage_has_branch_role\(\s*tenant_id, branch_id, ARRAY\['compliance','auditor'\]/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /insurance_brokerage_tenant_update_guard/);
  assert.match(migration, /insurance_brokerage_audit_immutable/);
  assert.match(migration, /insurance_brokerage_product_version_immutable/);
  assert.match(migration, /FOREIGN KEY \(insurer_id, tenant_id\)/);
  assert.match(migration, /UNIQUE \(tenant_id, product_key\)/);
  assert.match(migration, /insurance_brokerage_has_tenant_role\(tenant_id, ARRAY\['broker_admin'\]\)/);
});

test('brokerage client-intake migration enforces consent and immutable tenant-scoped assessments', async () => {
  const source = await readFile(
    new URL('../services/insurance-ledger/034_brokerage_client_intake.sql', import.meta.url),
    'utf8',
  );
  const migration = buildInsuranceServiceMigration(source, 'insurance_runtime');
  const dockerfile = await readFile(
    new URL('../services/insurance-ledger/Dockerfile', import.meta.url),
    'utf8',
  );
  assert.match(migration, /insurance_brokerage_client_consent_immutable/);
  assert.match(migration, /insurance_brokerage_needs_assessment_immutable/);
  assert.match(migration, /branch_id uuid NOT NULL/);
  assert.match(migration, /insurance_brokerage_has_branch_role/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /insurance_brokerage_has_branch_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON insurance_brokerage_needs_assessments TO "insurance_runtime"/);
  assert.match(dockerfile, /COPY services\/insurance-ledger\/034_brokerage_client_intake\.sql/);
  assert.match(dockerfile, /COPY --from=build .*services\/insurance-ledger\/034_brokerage_client_intake\.sql/);
});

test('quote and advice migration requires independent immutable decisions and tenant/branch scope', async () => {
  const source = await readFile(
    new URL('../services/insurance-ledger/035_brokerage_quotes_advice.sql', import.meta.url),
    'utf8',
  );
  const migration = buildInsuranceServiceMigration(source, 'insurance_runtime');
  const dockerfile = await readFile(
    new URL('../services/insurance-ledger/Dockerfile', import.meta.url),
    'utf8',
  );
  assert.match(migration, /insurance_brokerage_quote_offer_immutable/);
  assert.match(migration, /insurance_brokerage_advice_decision_immutable/);
  assert.match(migration, /insurance_brokerage_advice_update_guard/);
  assert.match(migration, /NEW\.reviewed_by = OLD\.proposed_by/);
  assert.match(migration, /insurance_brokerage_quote_submission_reference_idx/);
  assert.match(migration, /submission_reference ~ '\^\[A-Za-z0-9\]/);
  assert.match(migration, /insurance_brokerage_quote_submission_guard/);
  assert.match(migration, /insurance_brokerage_quote_offer_guard/);
  assert.match(migration, /insurance_brokerage_advice_insert_guard/);
  assert.match(migration, /insurance_brokerage_advice_alternative_guard/);
  assert.match(migration, /advice\.review_reason=insurance_brokerage_advice_decisions\.reason/);
  assert.match(migration, /insurance_brokerage_has_branch_role/);
  assert.match(migration, /UNIQUE \(tenant_id, insurer_id, external_quote_reference\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_advice TO "insurance_runtime"/);
  assert.match(dockerfile, /COPY services\/insurance-ledger\/035_brokerage_quotes_advice\.sql/);
  assert.match(dockerfile, /COPY --from=build .*services\/insurance-ledger\/035_brokerage_quotes_advice\.sql/);
});

test('product activation independently reviews the currently effective immutable version', async () => {
  const brokerage = await readFile(
    new URL('../services/insurance-ledger/brokerage.ts', import.meta.url),
    'utf8',
  );
  assert.match(brokerage, /version\.created_by<>\$3/);
  assert.match(brokerage, /version\.effective_from <= current_date/);
  assert.match(brokerage, /ORDER BY \(effective_from <= current_date/);
});

test('Insurance service exposes the brokerage router only behind gateway authentication', async () => {
  const server = await readFile(
    new URL('../services/insurance-ledger/server.ts', import.meta.url),
    'utf8',
  );
  assert.match(server, /app\.use\('\/api\/v1\/insurance\/brokerage', authenticateGateway/);
  assert.match(server, /createInsuranceBrokerageRouter\(withUser, withIdentityUser\)/);
  const gateway = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(gateway, /api\.use\('\/insurance\/brokerage', process\.env\.INSURANCE_SERVICE_URL/);
  assert.match(gateway, /servicePath: '\/api\/v1\/insurance\/brokerage'/);
});

test('Insurance migrator registers and loads the brokerage foundation from the service package', async () => {
  const migrator = await readFile(
    new URL('../services/insurance-ledger/migrate.ts', import.meta.url),
    'utf8',
  );
  assert.match(migrator, /insurance-brokerage-v1-foundation/);
  assert.match(migrator, /033_brokerage_foundation\.sql/);
  assert.match(migrator, /insurance-brokerage-v2-client-intake/);
  assert.match(migrator, /034_brokerage_client_intake\.sql/);
  assert.match(migrator, /insurance-brokerage-v3-quotes-advice/);
  assert.match(migrator, /035_brokerage_quotes_advice\.sql/);
});
