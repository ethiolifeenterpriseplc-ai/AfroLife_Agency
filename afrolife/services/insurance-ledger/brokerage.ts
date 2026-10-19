import { Request, RequestHandler, Response, Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from '../../src/auth-types.js';
import { HttpError } from '../../src/http-error.js';

type WithUser = <T>(user: AuthUser, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
type WithIdentityUser = <T>(user: AuthUser, fn: (client: PoolClient) => Promise<T>) => Promise<T>;

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };
const idSchema = z.string().uuid();
const opaqueReferenceSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$/);
const platformAdmin = (user: AuthUser) => ['global_admin', 'super_admin'].includes(user.role);
const tenantAdminRoles = ['broker_admin'];
const tenantReadRoles = ['broker_admin', 'broker_adviser', 'operations', 'compliance', 'finance', 'auditor'];

async function withTenant<T>(
  withUser: WithUser,
  user: AuthUser,
  tenantId: string,
  roles: string[],
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withUser(user, async (client) => {
    await client.query("SELECT set_config('app.brokerage_tenant_id',$1,true)", [tenantId]);
    const allowed = platformAdmin(user) || Boolean((await client.query(
      'SELECT insurance_brokerage_has_role($1::uuid,$2::text[]) AS allowed',
      [tenantId, roles],
    )).rows[0]?.allowed);
    if (!allowed) throw new HttpError(403, 'Active Insurance brokerage tenant access is required');
    return action(client);
  });
}

async function audit(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown>,
  branchId: string | null = null,
) {
  await client.query(
    `INSERT INTO insurance_brokerage_audit
       (tenant_id, branch_id, actor_id, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, branchId, actorId, action, entity, entityId, JSON.stringify(details)],
  );
}

export const insuranceProductTermsSchema = z.object({
  coverage: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  exclusions: z.array(z.string().trim().min(1).max(500)).max(100),
  limits: z.record(z.string(), z.string().trim().min(1).max(160)),
  deductibles: z.array(z.string().trim().min(1).max(300)).max(50),
  eligibility: z.array(z.string().trim().min(1).max(500)).max(100),
  required_fields: z.array(z.string().trim().min(1).max(120)).max(100),
}).strict();

const consentSchema = z.object({
  purpose: z.enum(['brokerage_advice', 'quote_submission']),
  granted: z.boolean(),
  notice_version: opaqueReferenceSchema.max(80),
  notice_reference: opaqueReferenceSchema,
  evidence_reference: opaqueReferenceSchema,
  reason: z.string().trim().min(10).max(1000),
}).strict();

export const insuranceNeedsAssessmentSchema = z.object({
  objectives: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
  requested_lines: z.array(z.enum(['life', 'general'])).min(1).max(2)
    .refine((lines) => new Set(lines).size === lines.length, 'Requested insurance lines must be unique'),
  coverage_gaps: z.array(z.string().trim().min(2).max(300)).max(30),
  existing_cover: z.boolean(),
  annual_premium_budget_minor: z.number().int().min(1).max(1_000_000_000_000).nullable(),
  budget_basis: z.enum(['customer_stated', 'not_provided']),
  exposure_categories: z.array(z.enum([
    'property', 'liability', 'income', 'life', 'business_interruption', 'other',
  ])).max(20),
  customer_confirmed: z.literal(true),
  conflict_disclosure_reference: opaqueReferenceSchema,
  limitations_disclosure_reference: opaqueReferenceSchema,
  confirmation_evidence_reference: opaqueReferenceSchema,
}).strict().superRefine((assessment, context) => {
  if (assessment.budget_basis === 'not_provided' && assessment.annual_premium_budget_minor !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['annual_premium_budget_minor'],
      message: 'A budget amount cannot be recorded when the customer did not provide one',
    });
  }
  if (assessment.budget_basis === 'customer_stated' && assessment.annual_premium_budget_minor === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['annual_premium_budget_minor'],
      message: 'A customer-stated budget amount is required',
    });
  }
});

export const insuranceQuoteOfferSchema = z.object({
  external_quote_reference: opaqueReferenceSchema,
  premium_minor: z.number().int().positive().max(1_000_000_000_000),
  valid_until: z.string().datetime(),
  coverage_summary: z.object({
    covered_items: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
    exclusions: z.array(z.string().trim().min(1).max(500)).max(100),
    limits: z.record(z.string(), z.string().trim().min(1).max(160)),
    deductibles: z.array(z.string().trim().min(1).max(300)).max(50),
    insurer_conditions: z.array(z.string().trim().min(1).max(500)).max(100),
  }).strict(),
  quote_document_reference: opaqueReferenceSchema,
}).strict();

export const insuranceAdviceProposalSchema = z.object({
  client_id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  recommended_quote_id: z.string().uuid(),
  recommendation_rationale: z.string().trim().min(50).max(5000),
  customer_fit_summary: z.string().trim().min(20).max(3000),
  affordability_summary: z.string().trim().min(20).max(3000),
  conflict_disclosure_reference: opaqueReferenceSchema,
  limitations_disclosure_reference: opaqueReferenceSchema,
  alternatives: z.array(z.object({
    quote_id: z.string().uuid(),
    comparison_reason: z.string().trim().min(20).max(2000),
  }).strict()).max(20),
}).strict().superRefine((proposal, context) => {
  const ids = [proposal.recommended_quote_id, ...proposal.alternatives.map((item) => item.quote_id)];
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['alternatives'],
      message: 'Recommended and alternative quote identifiers must be unique',
    });
  }
});

export function createInsuranceBrokerageRouter(
  withUser: WithUser,
  withIdentityUser: WithIdentityUser,
) {
  const router = Router();

  router.use((req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication is required'));
      return;
    }
    next();
  });

  router.get('/tenants/:tenantId/clients', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT id, client_reference, customer_user_id, status, opened_by, created_at
         FROM insurance_brokerage_clients WHERE tenant_id=$1
         ORDER BY created_at DESC LIMIT 500`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/clients', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      client_reference: z.string().trim().min(2).max(100),
      customer_user_id: z.string().uuid(),
      branch_id: z.string().uuid(),
      consent: consentSchema.extend({
        purpose: z.literal('brokerage_advice'),
        granted: z.literal(true),
      }).strict(),
    }).strict().parse(req.body);
    await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const tenant = (await client.query(
        'SELECT status FROM insurance_brokerage_tenants WHERE id=$1',
        [tenantId],
      )).rows[0];
      if (!tenant) throw new HttpError(404, 'Insurance brokerage tenant not found');
      if (tenant.status !== 'active') throw new HttpError(409, 'Brokerage tenant must be active before accepting clients');
    });
    const customer = await withIdentityUser(req.user!, async (client) => (await client.query(
      `SELECT id FROM users
       WHERE id=$1 AND active AND kyc_status='verified' AND role IN ('customer','property_owner')`,
      [body.customer_user_id],
    )).rows[0]);
    if (!customer) throw new HttpError(404, 'Active, KYC-verified customer account was not found');
    const created = await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const tenant = (await client.query(
        'SELECT status FROM insurance_brokerage_tenants WHERE id=$1',
        [tenantId],
      )).rows[0];
      if (!tenant || tenant.status !== 'active') throw new HttpError(409, 'Brokerage tenant is not active');
      const branch = await client.query(
        'SELECT id FROM insurance_brokerage_branches WHERE id=$1 AND tenant_id=$2 AND active',
        [body.branch_id, tenantId],
      );
      if (!branch.rowCount) throw new HttpError(422, 'Choose an active branch available to your staff assignment');
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_clients
           (tenant_id, branch_id, client_reference, customer_user_id, opened_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, branch_id, client_reference, customer_user_id, status, opened_by, created_at`,
        [tenantId, body.branch_id, body.client_reference, body.customer_user_id, req.user!.id],
      )).rows[0];
      await client.query(
        `INSERT INTO insurance_brokerage_client_consents
           (tenant_id, client_id, purpose, granted, notice_version, notice_reference,
            evidence_reference, reason, recorded_by)
         VALUES ($1,$2,'brokerage_advice',true,$3,$4,$5,$6,$7)`,
        [tenantId, row.id, body.consent.notice_version, body.consent.notice_reference,
          body.consent.evidence_reference, body.consent.reason, req.user!.id],
      );
      await audit(client, tenantId, req.user!.id, 'brokerage_client_opened', 'client', row.id, {
        consent_purpose: 'brokerage_advice',
        consent_notice_version: body.consent.notice_version,
      }, body.branch_id);
      return row;
    });
    res.status(201).json(created);
  }));

  router.post('/tenants/:tenantId/clients/:clientId/consents', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const clientId = idSchema.parse(req.params.clientId);
    const body = consentSchema.parse(req.body);
    const result = await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const brokerageClient = (await client.query(
        `SELECT id, branch_id, status FROM insurance_brokerage_clients
         WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
        [clientId, tenantId],
      )).rows[0];
      if (!brokerageClient || brokerageClient.status !== 'active') {
        throw new HttpError(404, 'Active brokerage client was not found');
      }
      const consent = (await client.query(
        `INSERT INTO insurance_brokerage_client_consents
           (tenant_id, client_id, purpose, granted, notice_version, notice_reference,
            evidence_reference, reason, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, purpose, granted, notice_version, notice_reference,
                   evidence_reference, reason, recorded_by, recorded_at`,
        [tenantId, clientId, body.purpose, body.granted, body.notice_version,
          body.notice_reference, body.evidence_reference, body.reason, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id,
        body.granted ? 'client_consent_granted' : 'client_consent_withdrawn',
        'client_consent', consent.id, { client_id: clientId, purpose: body.purpose },
        brokerageClient.branch_id);
      return consent;
    });
    res.status(201).json(result);
  }));

  router.post('/tenants/:tenantId/clients/:clientId/assessments', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const clientId = idSchema.parse(req.params.clientId);
    const assessment = insuranceNeedsAssessmentSchema.parse(req.body);
    const result = await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const brokerageClient = (await client.query(
        `SELECT id, branch_id FROM insurance_brokerage_clients
         WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE`,
        [clientId, tenantId],
      )).rows[0];
      if (!brokerageClient) throw new HttpError(404, 'Active brokerage client was not found');
      const adviceConsent = (await client.query(
        `SELECT granted FROM insurance_brokerage_client_consents
         WHERE tenant_id=$1 AND client_id=$2 AND purpose='brokerage_advice'
         ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [tenantId, clientId],
      )).rows[0];
      if (!adviceConsent?.granted) {
        throw new HttpError(409, 'Current customer consent for brokerage advice is required');
      }
      const version = Number((await client.query(
        `SELECT coalesce(max(version),0)::int+1 AS version
         FROM insurance_brokerage_needs_assessments WHERE client_id=$1`,
        [clientId],
      )).rows[0].version);
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_needs_assessments
           (tenant_id, client_id, version, assessment, completed_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, client_id, version, assessment, completed_by, completed_at`,
        [tenantId, clientId, version, JSON.stringify(assessment), req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'needs_assessment_completed', 'needs_assessment', row.id, {
        client_id: clientId, version,
      }, brokerageClient.branch_id);
      return row;
    });
    res.status(201).json(result);
  }));

  router.get('/tenants/:tenantId/clients/:clientId/assessments', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const clientId = idSchema.parse(req.params.clientId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT id, client_id, version, assessment, completed_by, completed_at
         FROM insurance_brokerage_needs_assessments
         WHERE tenant_id=$1 AND client_id=$2 ORDER BY version DESC`,
        [tenantId, clientId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/quote-submissions', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      client_id: z.string().uuid(),
      assessment_id: z.string().uuid(),
      product_id: z.string().uuid(),
      channel: z.enum(['api', 'secure_file', 'manual']),
      submission_reference: opaqueReferenceSchema,
    }).strict().parse(req.body);
    const result = await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const brokerageClient = (await client.query(
        `SELECT id, branch_id FROM insurance_brokerage_clients
         WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE`,
        [body.client_id, tenantId],
      )).rows[0];
      if (!brokerageClient) throw new HttpError(404, 'Active brokerage client was not found');
      const consent = (await client.query(
        `SELECT id, granted FROM insurance_brokerage_client_consents
         WHERE tenant_id=$1 AND client_id=$2 AND purpose='quote_submission'
         ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [tenantId, body.client_id],
      )).rows[0];
      if (!consent?.granted) throw new HttpError(409, 'Current customer consent for insurer quote submission is required');
      const assessment = (await client.query(
        `SELECT id, assessment FROM insurance_brokerage_needs_assessments
         WHERE id=$1 AND tenant_id=$2 AND client_id=$3`,
        [body.assessment_id, tenantId, body.client_id],
      )).rows[0];
      if (!assessment) throw new HttpError(404, 'Needs assessment was not found for this client');
      const requestedLines = assessment.assessment.requested_lines;
      const product = (await client.query(
        `SELECT product.id, product.line, insurer.id AS insurer_id,
                insurer.submission_channels, tenant.status AS tenant_status,
                tenant.licence_valid_until, tenant.pi_valid_until
         FROM insurance_brokerage_products product
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
         JOIN insurance_brokerage_tenants tenant ON tenant.id=product.tenant_id
         WHERE product.id=$1 AND product.tenant_id=$2
           AND product.status='active' AND insurer.active
           AND tenant.status='active' AND tenant.licence_valid_until>=current_date
           AND tenant.pi_valid_until>=current_date
           AND $3=ANY(insurer.submission_channels)
           AND EXISTS (
             SELECT 1 FROM insurance_brokerage_product_versions version
             WHERE version.product_id=product.id
               AND version.effective_from<=current_date
               AND (version.effective_to IS NULL OR version.effective_to>=current_date)
           )
         FOR SHARE OF product, insurer, tenant`,
        [body.product_id, tenantId, body.channel],
      )).rows[0];
      if (!product) throw new HttpError(409, 'An active product, insurer channel, tenant licence, and effective product version are required');
      if (!requestedLines.includes(product.line)) {
        throw new HttpError(422, 'Selected product line is not included in the customer needs assessment');
      }
      const version = (await client.query(
        `SELECT id FROM insurance_brokerage_product_versions
         WHERE product_id=$1 AND effective_from<=current_date
           AND (effective_to IS NULL OR effective_to>=current_date)
         ORDER BY effective_from DESC, version DESC LIMIT 1`,
        [body.product_id],
      )).rows[0];
      if (!version) throw new HttpError(409, 'No currently effective product terms are available');
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_quote_submissions
           (tenant_id, branch_id, client_id, assessment_id, product_id,
            product_version_id, consent_id, channel, submission_reference, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, client_id, assessment_id, product_id, product_version_id,
                   channel, submission_reference, submitted_by, submitted_at`,
        [tenantId, brokerageClient.branch_id, body.client_id, body.assessment_id,
          body.product_id, version.id, consent.id, body.channel,
          body.submission_reference, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'insurer_quote_requested',
        'quote_submission', row.id, { channel: body.channel, product_id: body.product_id },
        brokerageClient.branch_id);
      return row;
    });
    res.status(201).json(result);
  }));

  router.get('/tenants/:tenantId/clients/:clientId/quotes', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const clientId = idSchema.parse(req.params.clientId);
    const result = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) => {
      const submissions = (await client.query(
        `SELECT submission.id, submission.branch_id, submission.assessment_id,
                submission.product_id, product.name AS product_name,
                insurer.legal_name AS insurer_name, submission.channel,
                submission.submission_reference, submission.submitted_at
         FROM insurance_brokerage_quote_submissions submission
         JOIN insurance_brokerage_products product
           ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
         WHERE submission.tenant_id=$1 AND submission.client_id=$2
         ORDER BY submission.submitted_at DESC LIMIT 200`,
        [tenantId, clientId],
      )).rows;
      const offers = (await client.query(
        `SELECT offer.id, offer.submission_id, offer.external_quote_reference,
                offer.premium_minor, offer.currency, offer.valid_until,
                offer.coverage_summary, offer.quote_document_reference,
                offer.captured_at, insurer.legal_name AS insurer_name
         FROM insurance_brokerage_quote_offers offer
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=offer.insurer_id AND insurer.tenant_id=offer.tenant_id
         WHERE offer.tenant_id=$1 AND offer.client_id=$2
         ORDER BY offer.captured_at DESC LIMIT 500`,
        [tenantId, clientId],
      )).rows;
      return { submissions, offers };
    });
    res.json(result);
  }));

  router.post('/tenants/:tenantId/quote-submissions/:submissionId/offers', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const submissionId = idSchema.parse(req.params.submissionId);
    const body = insuranceQuoteOfferSchema.parse(req.body);
    if (new Date(body.valid_until).getTime() <= Date.now()) {
      throw new HttpError(422, 'Insurer quote must be valid in the future');
    }
    const result = await withTenant(withUser, req.user!, tenantId, ['operations', 'broker_adviser'], async (client) => {
      const submission = (await client.query(
        `SELECT submission.id, submission.branch_id, submission.client_id,
                product.insurer_id, insurer.active, tenant.status AS tenant_status,
                tenant.licence_valid_until, tenant.pi_valid_until
         FROM insurance_brokerage_quote_submissions submission
         JOIN insurance_brokerage_products product
           ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
         JOIN insurance_brokerage_tenants tenant ON tenant.id=submission.tenant_id
         WHERE submission.id=$1 AND submission.tenant_id=$2`,
        [submissionId, tenantId],
      )).rows[0];
      if (!submission) throw new HttpError(404, 'Quote submission was not found');
      if (!submission.active || submission.tenant_status !== 'active'
        || new Date(submission.licence_valid_until).getTime() < Date.now()
        || new Date(submission.pi_valid_until).getTime() < Date.now()) {
        throw new HttpError(409, 'Current insurer agreement and tenant licence/PI evidence are required');
      }
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_quote_offers
           (tenant_id, branch_id, client_id, submission_id, insurer_id,
            external_quote_reference, premium_minor, valid_until,
            coverage_summary, quote_document_reference, captured_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, submission_id, external_quote_reference, premium_minor,
                   currency, valid_until, coverage_summary, quote_document_reference, captured_at`,
        [tenantId, submission.branch_id, submission.client_id, submissionId,
          submission.insurer_id, body.external_quote_reference, body.premium_minor,
          body.valid_until, JSON.stringify(body.coverage_summary),
          body.quote_document_reference, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'insurer_quote_recorded',
        'quote_offer', row.id, { submission_id: submissionId, premium_minor: row.premium_minor },
        submission.branch_id);
      return row;
    });
    res.status(201).json(result);
  }));

  router.get('/tenants/:tenantId/clients/:clientId/advice', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const clientId = idSchema.parse(req.params.clientId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT advice.id, advice.assessment_id, advice.recommended_quote_id,
                advice.recommendation_rationale, advice.customer_fit_summary,
                advice.affordability_summary, advice.alternatives,
                advice.conflict_disclosure_reference, advice.limitations_disclosure_reference,
                advice.status, advice.proposed_by, advice.proposed_at,
                advice.reviewed_by, advice.review_reason, advice.reviewed_at,
                quote.external_quote_reference, quote.premium_minor, quote.currency,
                quote.valid_until, insurer.legal_name AS insurer_name
         FROM insurance_brokerage_advice advice
         JOIN insurance_brokerage_quote_offers quote
           ON quote.id=advice.recommended_quote_id AND quote.tenant_id=advice.tenant_id
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
         WHERE advice.tenant_id=$1 AND advice.client_id=$2
         ORDER BY advice.proposed_at DESC LIMIT 200`,
        [tenantId, clientId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/advice', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = insuranceAdviceProposalSchema.parse(req.body);
    const result = await withTenant(withUser, req.user!, tenantId, ['broker_adviser'], async (client) => {
      const brokerageClient = (await client.query(
        `SELECT id, branch_id FROM insurance_brokerage_clients
         WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE`,
        [body.client_id, tenantId],
      )).rows[0];
      if (!brokerageClient) throw new HttpError(404, 'Active brokerage client was not found');
      const adviceConsent = (await client.query(
        `SELECT granted FROM insurance_brokerage_client_consents
         WHERE tenant_id=$1 AND client_id=$2 AND purpose='brokerage_advice'
         ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [tenantId, body.client_id],
      )).rows[0];
      if (!adviceConsent?.granted) throw new HttpError(409, 'Current customer consent for brokerage advice is required');
      const assessment = await client.query(
        `SELECT 1 FROM insurance_brokerage_needs_assessments
         WHERE id=$1 AND tenant_id=$2 AND client_id=$3`,
        [body.assessment_id, tenantId, body.client_id],
      );
      if (!assessment.rowCount) throw new HttpError(404, 'Needs assessment was not found for this client');
      const quoteIds = [body.recommended_quote_id, ...body.alternatives.map((item) => item.quote_id)];
      const quotes = (await client.query(
        `SELECT quote.id, quote.valid_until, submission.assessment_id,
                product.status AS product_status, insurer.active AS insurer_active
         FROM insurance_brokerage_quote_offers quote
         JOIN insurance_brokerage_quote_submissions submission
           ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
         JOIN insurance_brokerage_products product
           ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
         WHERE quote.tenant_id=$1 AND quote.client_id=$2 AND quote.branch_id=$3
           AND quote.id=ANY($4::uuid[])`,
        [tenantId, body.client_id, brokerageClient.branch_id, quoteIds],
      )).rows;
      if (quotes.length !== quoteIds.length
        || quotes.some((quote) => quote.assessment_id !== body.assessment_id
          || new Date(quote.valid_until).getTime() <= Date.now()
          || quote.product_status !== 'active' || !quote.insurer_active)) {
        throw new HttpError(409, 'Advice requires current insurer quotes for the selected assessment and active products');
      }
      const advice = (await client.query(
        `INSERT INTO insurance_brokerage_advice
           (tenant_id, branch_id, client_id, assessment_id, recommended_quote_id,
            proposed_by, recommendation_rationale, customer_fit_summary,
            affordability_summary, alternatives, conflict_disclosure_reference,
            limitations_disclosure_reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, client_id, assessment_id, recommended_quote_id,
                   recommendation_rationale, customer_fit_summary, affordability_summary,
                   alternatives, status, proposed_by, proposed_at`,
        [tenantId, brokerageClient.branch_id, body.client_id, body.assessment_id,
          body.recommended_quote_id, req.user!.id, body.recommendation_rationale,
          body.customer_fit_summary, body.affordability_summary,
          JSON.stringify(body.alternatives), body.conflict_disclosure_reference,
          body.limitations_disclosure_reference],
      )).rows[0];
      for (const alternative of body.alternatives) {
        await client.query(
          `INSERT INTO insurance_brokerage_advice_alternatives
             (tenant_id, advice_id, client_id, branch_id, quote_id, comparison_reason)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, advice.id, body.client_id, brokerageClient.branch_id,
            alternative.quote_id, alternative.comparison_reason],
        );
      }
      await audit(client, tenantId, req.user!.id, 'advice_submitted_for_review',
        'advice', advice.id, { assessment_id: body.assessment_id, quote_count: quoteIds.length },
        brokerageClient.branch_id);
      return advice;
    });
    res.status(201).json(result);
  }));

  router.post('/tenants/:tenantId/advice/:adviceId/decision', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const adviceId = idSchema.parse(req.params.adviceId);
    const body = z.object({
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().trim().min(10).max(1000),
    }).strict().parse(req.body);
    const result = await withTenant(withUser, req.user!, tenantId, ['broker_admin', 'compliance'], async (client) => {
      const advice = (await client.query(
        `SELECT id, branch_id, client_id, proposed_by, recommended_quote_id, status
         FROM insurance_brokerage_advice
         WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
        [adviceId, tenantId],
      )).rows[0];
      if (!advice || advice.status !== 'pending_review') {
        throw new HttpError(404, 'Pending advice recommendation was not found');
      }
      if (advice.proposed_by === req.user!.id) {
        throw new HttpError(403, 'The advice maker cannot review their own recommendation');
      }
      const consent = (await client.query(
        `SELECT granted FROM insurance_brokerage_client_consents
         WHERE tenant_id=$1 AND client_id=$2 AND purpose='brokerage_advice'
         ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [tenantId, advice.client_id],
      )).rows[0];
      const quote = (await client.query(
        `SELECT quote.valid_until, product.status AS product_status, insurer.active AS insurer_active
         FROM insurance_brokerage_quote_offers quote
         JOIN insurance_brokerage_quote_submissions submission
           ON submission.id=quote.submission_id AND submission.tenant_id=quote.tenant_id
         JOIN insurance_brokerage_products product
           ON product.id=submission.product_id AND product.tenant_id=submission.tenant_id
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=quote.insurer_id AND insurer.tenant_id=quote.tenant_id
         WHERE quote.id=$1 AND quote.tenant_id=$2 AND quote.client_id=$3`,
        [advice.recommended_quote_id, tenantId, advice.client_id],
      )).rows[0];
      if (body.decision === 'approved' && (!consent?.granted || !quote
        || new Date(quote.valid_until).getTime() <= Date.now()
        || quote.product_status !== 'active' || !quote.insurer_active)) {
        throw new HttpError(409, 'Approval requires current customer consent and a valid quote from an active insurer/product');
      }
      await client.query(
        `UPDATE insurance_brokerage_advice
         SET status=$2, reviewed_by=$3, review_reason=$4, reviewed_at=now()
         WHERE id=$1`,
        [adviceId, body.decision, req.user!.id, body.reason],
      );
      const decision = (await client.query(
        `INSERT INTO insurance_brokerage_advice_decisions
           (tenant_id, branch_id, advice_id, decision, decided_by, reason)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, advice_id, decision, decided_by, reason, decided_at`,
        [tenantId, advice.branch_id, adviceId, body.decision, req.user!.id, body.reason],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, `advice_${body.decision}`,
        'advice', adviceId, { reason: body.reason, maker_id: advice.proposed_by },
        advice.branch_id);
      return decision;
    });
    res.json(result);
  }));

  router.get('/tenants', h(async (req, res) => {
    const rows = await withUser(req.user!, async (client) => (await client.query(
      `SELECT tenant.id, tenant.tenant_key, tenant.legal_name, tenant.registration_reference,
              tenant.locale, tenant.currency, tenant.status, tenant.created_at, tenant.updated_at
       FROM insurance_brokerage_tenants tenant
       ORDER BY tenant.created_at DESC LIMIT 200`,
    )).rows);
    res.json(rows);
  }));

  router.post('/tenants', h(async (req, res) => {
    if (!platformAdmin(req.user!)) throw new HttpError(403, 'Platform administrator access is required');
    const body = z.object({
      tenant_key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,79}$/),
      legal_name: z.string().trim().min(2).max(200),
      registration_reference: z.string().trim().min(2).max(160),
      contract_reference: z.string().trim().min(2).max(200),
      onboarding_evidence_reference: z.string().trim().min(2).max(200),
      authorized_contact_name: z.string().trim().min(2).max(160),
      contact_email: z.string().trim().email().max(254),
      contact_phone: z.string().trim().min(8).max(32),
      locale: z.string().trim().min(2).max(20).default('en-ET'),
      currency: z.literal('ETB').default('ETB'),
      head_office: z.object({
        branch_key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,49}$/),
        name: z.string().trim().min(2).max(160),
        address: z.string().trim().min(5).max(500),
      }).strict(),
    }).strict().parse(req.body);
    const tenant = await withUser(req.user!, async (client) => {
      const created = (await client.query(
        `INSERT INTO insurance_brokerage_tenants
           (tenant_key, legal_name, registration_reference, contract_reference,
            onboarding_evidence_reference, authorized_contact_name, contact_email,
            contact_phone, locale, currency, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         RETURNING id, tenant_key, legal_name, registration_reference, status, created_at`,
        [
          body.tenant_key, body.legal_name, body.registration_reference, body.contract_reference,
          body.onboarding_evidence_reference, body.authorized_contact_name, body.contact_email,
          body.contact_phone, body.locale, body.currency, req.user!.id,
        ],
      )).rows[0];
      await client.query("SELECT set_config('app.brokerage_tenant_id',$1,true)", [created.id]);
      await client.query(
        `INSERT INTO insurance_brokerage_branches
           (tenant_id, branch_key, name, address, is_head_office, created_by)
         VALUES ($1,$2,$3,$4,true,$5)`,
        [created.id, body.head_office.branch_key, body.head_office.name, body.head_office.address, req.user!.id],
      );
      await audit(client, created.id, req.user!.id, 'tenant_provisioned', 'tenant', created.id, {
        contract_reference: body.contract_reference,
        onboarding_evidence_reference: body.onboarding_evidence_reference,
      });
      return created;
    });
    res.status(201).json(tenant);
  }));

  router.post('/tenants/:tenantId/staff', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      user_id: z.string().uuid(),
      role: z.enum(['broker_owner', 'broker_admin', 'broker_adviser', 'operations', 'compliance', 'finance', 'auditor']),
      branch_id: z.string().uuid().nullable().default(null),
      valid_until: z.string().datetime().nullable().default(null),
      grant_reason: z.string().trim().min(10).max(1000),
    }).strict().superRefine((value, context) => {
      if (['broker_owner', 'broker_admin'].includes(value.role) && value.branch_id !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['branch_id'],
          message: 'Brokerage Owners and Administrators must be tenant-wide roles',
        });
      }
    }).parse(req.body);
    if (!platformAdmin(req.user!) && ['broker_owner', 'broker_admin', 'compliance'].includes(body.role)) {
      throw new HttpError(403, 'Only a platform administrator may grant owner, administrator, or compliance roles');
    }
    if (body.valid_until && new Date(body.valid_until).getTime() <= Date.now()) {
      throw new HttpError(422, 'Tenant staff assignment must expire in the future');
    }
    if (body.user_id === req.user!.id) throw new HttpError(403, 'A different administrator must assign your tenant role');
    await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const tenant = await client.query(
        'SELECT id FROM insurance_brokerage_tenants WHERE id=$1',
        [tenantId],
      );
      if (!tenant.rowCount) throw new HttpError(404, 'Insurance brokerage tenant not found');
    });
    const target = await withIdentityUser(req.user!, async (client) => (await client.query(
      'SELECT id, active FROM users WHERE id=$1',
      [body.user_id],
    )).rows[0]);
    if (!target?.active) throw new HttpError(404, 'Active user was not found');
    const result = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const tenant = (await client.query(
        'SELECT id FROM insurance_brokerage_tenants WHERE id=$1',
        [tenantId],
      )).rows[0];
      if (!tenant) throw new HttpError(404, 'Insurance brokerage tenant not found');
      if (body.branch_id) {
        const branch = await client.query(
          'SELECT 1 FROM insurance_brokerage_branches WHERE id=$1 AND tenant_id=$2 AND active',
          [body.branch_id, tenantId],
        );
        if (!branch.rowCount) throw new HttpError(422, 'Choose an active branch belonging to this tenant');
      }
      const member = (await client.query(
        `INSERT INTO insurance_brokerage_staff
           (tenant_id, user_id, branch_id, role, valid_until, granted_by, grant_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id,user_id,role) DO UPDATE
           SET branch_id=EXCLUDED.branch_id, active=true, valid_from=now(),
               valid_until=EXCLUDED.valid_until, granted_by=EXCLUDED.granted_by,
               grant_reason=EXCLUDED.grant_reason
         RETURNING tenant_id, user_id, branch_id, role, active, valid_from, valid_until`,
        [tenantId, body.user_id, body.branch_id, body.role, body.valid_until, req.user!.id, body.grant_reason],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'staff_role_granted', 'staff', body.user_id, {
        role: body.role, branch_id: body.branch_id, valid_until: body.valid_until, reason: body.grant_reason,
      });
      return member;
    });
    res.status(201).json(result);
  }));

  router.get('/tenants/:tenantId/staff', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT user_id, branch_id, role, active, valid_from, valid_until,
                granted_by, grant_reason, created_at
         FROM insurance_brokerage_staff WHERE tenant_id=$1 ORDER BY role, user_id`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/staff/:userId/:role/revoke', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const userId = idSchema.parse(req.params.userId);
    const role = z.enum(['broker_owner', 'broker_admin', 'broker_adviser', 'operations', 'compliance', 'finance', 'auditor']).parse(req.params.role);
    const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
    if (!platformAdmin(req.user!) && ['broker_owner', 'broker_admin', 'compliance'].includes(role)) {
      throw new HttpError(403, 'Only a platform administrator may revoke owner, administrator, or compliance roles');
    }
    const result = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      await client.query('SELECT id FROM insurance_brokerage_tenants WHERE id=$1 FOR UPDATE', [tenantId]);
      const existing = (await client.query(
        `SELECT active FROM insurance_brokerage_staff
         WHERE tenant_id=$1 AND user_id=$2 AND role=$3 FOR UPDATE`,
        [tenantId, userId, role],
      )).rows[0];
      if (!existing?.active) throw new HttpError(404, 'Active tenant staff assignment not found');
      if (role === 'broker_owner') {
        const owners = Number((await client.query(
          `SELECT count(*)::int AS count FROM insurance_brokerage_staff
           WHERE tenant_id=$1 AND role='broker_owner' AND active
             AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
          [tenantId],
        )).rows[0].count);
        if (owners <= 1) throw new HttpError(409, 'Assign another active Brokerage Owner before revoking the final owner');
      }
      const updated = (await client.query(
        `UPDATE insurance_brokerage_staff SET active=false, valid_until=now()
         WHERE tenant_id=$1 AND user_id=$2 AND role=$3
         RETURNING tenant_id, user_id, branch_id, role, active, valid_from, valid_until`,
        [tenantId, userId, role],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'staff_role_revoked', 'staff', userId, { role, reason });
      return updated;
    });
    res.json(result);
  }));

  router.post('/tenants/:tenantId/activate', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      licence_reference: z.string().trim().min(2).max(160),
      licence_valid_until: z.string().date(),
      licence_evidence_reference: z.string().trim().min(2).max(200),
      pi_policy_reference: z.string().trim().min(2).max(160),
      pi_valid_until: z.string().date(),
      pi_evidence_reference: z.string().trim().min(2).max(200),
      reason: z.string().trim().min(10).max(1000),
    }).strict().parse(req.body);
    if (new Date(`${body.licence_valid_until}T00:00:00Z`) < new Date()
      || new Date(`${body.pi_valid_until}T00:00:00Z`) < new Date()) {
      throw new HttpError(422, 'Broker licence and professional indemnity evidence must be current');
    }
    const result = await withTenant(withUser, req.user!, tenantId, ['compliance'], async (client) => {
      const tenantWideCompliance = platformAdmin(req.user!) || Boolean((await client.query(
        `SELECT insurance_brokerage_has_tenant_role($1::uuid, ARRAY['compliance']) AS allowed`,
        [tenantId],
      )).rows[0]?.allowed);
      if (!tenantWideCompliance) {
        throw new HttpError(403, 'Tenant activation requires a tenant-wide Compliance officer');
      }
      const tenant = (await client.query(
        'SELECT id, created_by, status FROM insurance_brokerage_tenants WHERE id=$1 FOR UPDATE',
        [tenantId],
      )).rows[0];
      if (!tenant) throw new HttpError(404, 'Insurance brokerage tenant not found');
      if (tenant.created_by === req.user!.id) throw new HttpError(403, 'A different compliance officer must verify and activate this tenant');
      if (!['provisioning', 'suspended'].includes(tenant.status)) throw new HttpError(409, `Tenant is ${tenant.status}`);
      const updated = (await client.query(
        `UPDATE insurance_brokerage_tenants
         SET status='active', licence_reference=$2, licence_valid_until=$3,
             licence_evidence_reference=$4, pi_policy_reference=$5, pi_valid_until=$6,
             pi_evidence_reference=$7, updated_by=$8, updated_at=now()
         WHERE id=$1
         RETURNING id, tenant_key, legal_name, status, licence_valid_until, pi_valid_until`,
        [tenantId, body.licence_reference, body.licence_valid_until,
          body.licence_evidence_reference, body.pi_policy_reference,
          body.pi_valid_until, body.pi_evidence_reference, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'tenant_activated', 'tenant', tenantId, {
        reason: body.reason,
        licence_evidence_reference: body.licence_evidence_reference,
        pi_evidence_reference: body.pi_evidence_reference,
      });
      return updated;
    });
    res.json(result);
  }));

  router.get('/tenants/:tenantId/branches', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT id, branch_key, name, address, is_head_office, active, created_at
         FROM insurance_brokerage_branches WHERE tenant_id=$1 ORDER BY is_head_office DESC, name`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/branches', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      branch_key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,49}$/),
      name: z.string().trim().min(2).max(160),
      address: z.string().trim().min(5).max(500),
    }).strict().parse(req.body);
    const branch = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_branches
           (tenant_id, branch_key, name, address, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, tenant_id, branch_key, name, address, is_head_office, active`,
        [tenantId, body.branch_key, body.name, body.address, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'branch_created', 'branch', row.id, { branch_key: body.branch_key });
      return row;
    });
    res.status(201).json(branch);
  }));

  router.get('/tenants/:tenantId/insurers', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT id, insurer_key, legal_name, licence_reference, supported_lines,
                submission_channels, agreement_reference, active, created_at, updated_at
         FROM insurance_brokerage_insurers WHERE tenant_id=$1 ORDER BY legal_name`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/insurers', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      insurer_key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,79}$/),
      legal_name: z.string().trim().min(2).max(200),
      licence_reference: z.string().trim().min(2).max(160),
      supported_lines: z.array(z.enum(['life', 'general'])).min(1).max(2)
        .refine((lines) => new Set(lines).size === lines.length, 'Insurance lines must be unique'),
      submission_channels: z.array(z.enum(['api', 'secure_file', 'manual'])).min(1).default(['manual']),
      agreement_reference: z.string().trim().min(2).max(200),
    }).strict().parse(req.body);
    const insurer = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const tenant = (await client.query(
        'SELECT status FROM insurance_brokerage_tenants WHERE id=$1',
        [tenantId],
      )).rows[0];
      if (!tenant) throw new HttpError(404, 'Insurance brokerage tenant not found');
      if (tenant.status !== 'active') throw new HttpError(409, 'Activate the brokerage tenant before configuring insurer agreements');
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_insurers
           (tenant_id, insurer_key, legal_name, licence_reference, supported_lines,
            submission_channels, agreement_reference, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         RETURNING id, insurer_key, legal_name, licence_reference, supported_lines,
                   submission_channels, agreement_reference, active`,
        [tenantId, body.insurer_key, body.legal_name, body.licence_reference,
          body.supported_lines, body.submission_channels, body.agreement_reference, req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'insurer_registered', 'insurer', row.id, {
        insurer_key: body.insurer_key, agreement_reference: body.agreement_reference,
      });
      return row;
    });
    res.status(201).json(insurer);
  }));

  router.post('/tenants/:tenantId/insurers/:insurerId/activate', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const insurerId = idSchema.parse(req.params.insurerId);
    const body = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
    const insurer = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const row = (await client.query(
        `UPDATE insurance_brokerage_insurers insurer
         SET active=true, updated_by=$3, updated_at=now()
         WHERE insurer.id=$1 AND insurer.tenant_id=$2
           AND insurer.created_by<>$3 AND insurer.active=false
           AND EXISTS (
             SELECT 1 FROM insurance_brokerage_tenants tenant
             WHERE tenant.id=$2 AND tenant.status='active'
               AND tenant.licence_valid_until >= current_date
               AND tenant.pi_valid_until >= current_date
           )
         RETURNING insurer.id, insurer.insurer_key, insurer.legal_name, insurer.active`,
        [insurerId, tenantId, req.user!.id],
      )).rows[0];
      if (!row) throw new HttpError(409, 'Insurer or active tenant licence/PI evidence is missing or expired');
      await audit(client, tenantId, req.user!.id, 'insurer_activated', 'insurer', row.id, { reason: body.reason });
      return row;
    });
    res.json(insurer);
  }));

  router.get('/tenants/:tenantId/products', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, tenantReadRoles, async (client) =>
      (await client.query(
        `SELECT product.id, product.product_key, product.line, product.name, product.status,
                insurer.id AS insurer_id, insurer.legal_name AS insurer_name,
                version.version, version.effective_from, version.effective_to, version.product_terms
         FROM insurance_brokerage_products product
         JOIN insurance_brokerage_insurers insurer
           ON insurer.id=product.insurer_id AND insurer.tenant_id=product.tenant_id
         LEFT JOIN LATERAL (
           SELECT version, effective_from, effective_to, product_terms
           FROM insurance_brokerage_product_versions
           WHERE product_id=product.id
           ORDER BY (effective_from <= current_date
                     AND (effective_to IS NULL OR effective_to >= current_date)) DESC,
                    effective_from DESC, version DESC
           LIMIT 1
         ) version ON true
         WHERE product.tenant_id=$1 ORDER BY product.created_at DESC`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  router.post('/tenants/:tenantId/products', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const body = z.object({
      insurer_id: z.string().uuid(),
      product_key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,79}$/),
      line: z.enum(['life', 'general']),
      name: z.string().trim().min(2).max(160),
      effective_from: z.string().date(),
      effective_to: z.string().date().nullable().default(null),
      terms: insuranceProductTermsSchema,
    }).strict().parse(req.body);
    if (body.effective_to && body.effective_to < body.effective_from) {
      throw new HttpError(422, 'Product effective-to date must not precede effective-from');
    }
    const product = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const insurer = (await client.query(
        `SELECT id, supported_lines FROM insurance_brokerage_insurers
         WHERE id=$1 AND tenant_id=$2 AND active`,
        [body.insurer_id, tenantId],
      )).rows[0];
      if (!insurer) throw new HttpError(422, 'An active insurer agreement for this tenant is required');
      if (!insurer.supported_lines.includes(body.line)) throw new HttpError(422, 'The insurer agreement does not include this product line');
      const created = (await client.query(
        `INSERT INTO insurance_brokerage_products
           (tenant_id, insurer_id, product_key, line, name, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id, product_key, line, name, status`,
        [tenantId, body.insurer_id, body.product_key, body.line, body.name, req.user!.id],
      )).rows[0];
      const version = (await client.query(
        `INSERT INTO insurance_brokerage_product_versions
           (tenant_id, product_id, version, effective_from, effective_to, product_terms, created_by)
         VALUES ($1,$2,1,$3,$4,$5,$6)
         RETURNING id, version, effective_from, effective_to`,
        [tenantId, created.id, body.effective_from, body.effective_to, JSON.stringify(body.terms), req.user!.id],
      )).rows[0];
      await audit(client, tenantId, req.user!.id, 'product_created', 'product', created.id, {
        product_key: body.product_key, version: version.version, status: 'draft',
      });
      return { ...created, effective_version: version };
    });
    res.status(201).json(product);
  }));

  router.post('/tenants/:tenantId/products/:productId/versions', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const productId = idSchema.parse(req.params.productId);
    const body = z.object({
      effective_from: z.string().date(),
      effective_to: z.string().date().nullable().default(null),
      terms: insuranceProductTermsSchema,
    }).strict().parse(req.body);
    if (body.effective_to && body.effective_to < body.effective_from) {
      throw new HttpError(422, 'Product effective-to date must not precede effective-from');
    }
    const version = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const product = (await client.query(
        'SELECT id FROM insurance_brokerage_products WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
        [productId, tenantId],
      )).rows[0];
      if (!product) throw new HttpError(404, 'Insurance product not found');
      const overlap = await client.query(
        `SELECT 1 FROM insurance_brokerage_product_versions
         WHERE product_id=$1
           AND daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')
               && daterange($2::date, coalesce($3::date, 'infinity'::date), '[]')
         LIMIT 1`,
        [productId, body.effective_from, body.effective_to],
      );
      if (overlap.rowCount) throw new HttpError(409, 'Product effective dates overlap an existing immutable version');
      const nextVersion = Number((await client.query(
        'SELECT coalesce(max(version),0)::int + 1 AS version FROM insurance_brokerage_product_versions WHERE product_id=$1',
        [productId],
      )).rows[0].version);
      const row = (await client.query(
        `INSERT INTO insurance_brokerage_product_versions
           (tenant_id, product_id, version, effective_from, effective_to, product_terms, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, version, effective_from, effective_to`,
        [tenantId, productId, nextVersion, body.effective_from, body.effective_to, JSON.stringify(body.terms), req.user!.id],
      )).rows[0];
      await client.query(
        'UPDATE insurance_brokerage_products SET updated_by=$2, updated_at=now() WHERE id=$1',
        [productId, req.user!.id],
      );
      await audit(client, tenantId, req.user!.id, 'product_version_created', 'product', productId, { version: row.version });
      return row;
    });
    res.status(201).json(version);
  }));

  router.post('/tenants/:tenantId/products/:productId/activate', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const productId = idSchema.parse(req.params.productId);
    const body = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
    const product = await withTenant(withUser, req.user!, tenantId, tenantAdminRoles, async (client) => {
      const row = (await client.query(
        `UPDATE insurance_brokerage_products product
         SET status='active', updated_by=$3, updated_at=now()
         WHERE product.id=$1 AND product.tenant_id=$2 AND product.status='draft'
           AND product.created_by<>$3
           AND EXISTS (
             SELECT 1 FROM insurance_brokerage_insurers insurer
             WHERE insurer.id=product.insurer_id AND insurer.tenant_id=$2 AND insurer.active
           )
           AND EXISTS (
             SELECT 1 FROM insurance_brokerage_tenants tenant
             WHERE tenant.id=$2 AND tenant.status='active'
               AND tenant.licence_valid_until >= current_date
               AND tenant.pi_valid_until >= current_date
           )
           AND EXISTS (
             SELECT 1 FROM insurance_brokerage_product_versions version
             WHERE version.product_id=product.id
               AND version.created_by<>$3
               AND version.effective_from <= current_date
               AND (version.effective_to IS NULL OR version.effective_to >= current_date)
           )
         RETURNING product.id, product.product_key, product.line, product.name, product.status`,
        [productId, tenantId, req.user!.id],
      )).rows[0];
      if (!row) throw new HttpError(409, 'Product requires an active tenant, current licence/PI, active insurer agreement, and effective terms');
      await audit(client, tenantId, req.user!.id, 'product_activated', 'product', row.id, { reason: body.reason });
      return row;
    });
    res.json(product);
  }));

  router.get('/tenants/:tenantId/audit', h(async (req, res) => {
    const tenantId = idSchema.parse(req.params.tenantId);
    const rows = await withTenant(withUser, req.user!, tenantId, ['compliance', 'auditor'], async (client) =>
      (await client.query(
        `SELECT id, actor_id, action, entity, entity_id, details, created_at
         FROM insurance_brokerage_audit
         WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500`,
        [tenantId],
      )).rows);
    res.json(rows);
  }));

  return router;
}
