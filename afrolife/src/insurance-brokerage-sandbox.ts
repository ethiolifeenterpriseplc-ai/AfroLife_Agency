import { randomUUID } from 'node:crypto';
import { Request, RequestHandler, Response, Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from './auth-types.js';
import { HttpError } from './http-error.js';

type WithUser = <T>(user: AuthUser, fn: (client: PoolClient) => Promise<T>) => Promise<T>;

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

const workflowEventTypes = [
  'synthetic_intake',
  'needs_assessment_simulated',
  'disclosures_acknowledged_simulated',
  'advice_review_simulated',
  'product_comparison_simulated',
  'quote_generated_simulated',
  'proposal_created_simulated',
  'insurer_submission_simulated',
  'policy_issuance_simulated',
  'policy_change_simulated',
  'notice_delivery_simulated',
  'premium_due_simulated',
  'premium_receipt_simulated',
  'premium_refund_simulated',
  'commission_calculated_simulated',
  'commission_settlement_simulated',
  'claim_intake_simulated',
  'claim_referral_simulated',
  'claim_decision_simulated',
  'complaint_opened_simulated',
  'complaint_resolved_simulated',
] as const;

const products = [
  { key: 'demo-life-a', category: 'life', label: 'Synthetic term-life training product A', monthlyPremiumMinor: 1250, features: ['fixed-term-demo', 'synthetic-benefit-demo'] },
  { key: 'demo-life-b', category: 'life', label: 'Synthetic term-life training product B', monthlyPremiumMinor: 1800, features: ['flex-term-demo', 'synthetic-benefit-demo'] },
  { key: 'demo-household-a', category: 'household', label: 'Synthetic household training product A', monthlyPremiumMinor: 900, features: ['contents-demo', 'synthetic-excess-demo'] },
  { key: 'demo-household-b', category: 'household', label: 'Synthetic household training product B', monthlyPremiumMinor: 1450, features: ['building-demo', 'contents-demo'] },
  { key: 'demo-property-a', category: 'property', label: 'Synthetic property training product A', monthlyPremiumMinor: 2200, features: ['property-demo', 'synthetic-excess-demo'] },
  { key: 'demo-property-b', category: 'property', label: 'Synthetic property training product B', monthlyPremiumMinor: 3100, features: ['property-demo', 'synthetic-support-demo'] },
] as const;

function buildDemoWorkflow() {
  return [
    ['synthetic_intake', { scenario: 'SYNTHETIC_TRAINING_ONLY', customer_data: 'NONE' }],
    ['needs_assessment_simulated', { product_category: 'household', needs_profile: 'training_family', objective: 'training_comparison' }],
    ['disclosures_acknowledged_simulated', { disclosure_keys: ['sandbox_limitations', 'synthetic_product_data', 'no_coverage', 'no_real_payment'], acknowledgement: 'SYNTHETIC_ONLY' }],
    ['advice_review_simulated', { review_type: 'training_suitability_check', result: 'human_review_required', recommendation: 'NONE', real_advice: false }],
    ['product_comparison_simulated', { product_keys: ['demo-household-a', 'demo-household-b'], criteria: ['training_feature_set', 'synthetic_price_only'] }],
    ['quote_generated_simulated', {
      product_key: 'demo-household-a',
      term_months: 12,
      currency: 'ETB',
      synthetic_monthly_premium_minor: 900,
      synthetic_total_minor: 10800,
      quote_reference: `SYN-QUOTE-${randomUUID()}`,
      quote_state: 'SYNTHETIC_NOT_AN_OFFER',
    }],
    ['proposal_created_simulated', { proposal_state: 'SYNTHETIC_DRAFT', acceptance: 'NOT_ACCEPTED' }],
    ['insurer_submission_simulated', { provider: 'MOCK_INSURER_ONLY', transmission: 'NOT_SENT' }],
    ['policy_issuance_simulated', { policy_state: 'SYNTHETIC_NOT_IN_FORCE', policy_reference: `SYN-POL-${randomUUID()}` }],
    ['policy_change_simulated', { change_type: 'endorsement', result: 'SYNTHETIC_ONLY' }],
    ['policy_change_simulated', { change_type: 'renewal', result: 'SYNTHETIC_ONLY' }],
    ['notice_delivery_simulated', { notice_type: 'renewal_reminder', delivery: 'MOCK_ONLY', legal_effect: 'NONE' }],
    ['premium_due_simulated', { amount_minor: 10800, currency: 'ETB', ledger_posting: 'NONE' }],
    ['premium_receipt_simulated', { receipt_reference: `SYN-PAY-${randomUUID()}`, amount_minor: 10800, payment_provider: 'MOCK_ONLY', money_moved: false }],
    ['premium_refund_simulated', { refund_reference: `SYN-REF-${randomUUID()}`, amount_minor: 1000, money_moved: false }],
    ['commission_calculated_simulated', { amount_minor: 540, rate_basis_points: 500, ledger_posting: 'NONE' }],
    ['commission_settlement_simulated', { settlement_reference: `SYN-COM-${randomUUID()}`, settlement: 'MOCK_ONLY', money_moved: false }],
    ['claim_intake_simulated', { claim_type: 'training_household_loss', claim_data: 'SYNTHETIC_ONLY', claim_reference: `SYN-CLM-${randomUUID()}` }],
    ['claim_referral_simulated', { destination: 'MOCK_INSURER_ONLY', transmission: 'NOT_SENT' }],
    ['claim_decision_simulated', { decision: 'training_pending', decision_maker: 'MOCK_INSURER_ONLY', legal_effect: 'NONE' }],
    ['complaint_opened_simulated', { category: 'training_service_query', complaint_reference: `SYN-CMP-${randomUUID()}` }],
    ['complaint_resolved_simulated', { outcome: 'training_response_recorded', real_customer_effect: false }],
  ] as const;
}

export function isInsuranceBrokerageSandboxEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.NODE_ENV !== 'production'
    && environment.INSURANCE_BROKERAGE_MODE === 'sandbox';
}

async function requireSandboxStaff(
  req: Request,
  withUser: WithUser,
): Promise<void> {
  if (['global_admin', 'super_admin'].includes(req.user!.role)) return;
  const permitted = await withUser(req.user!, async (client) => Boolean((await client.query(
    `SELECT insurance_ledger_has_role($1::text[]) AS allowed`,
    [['insurance_admin', 'compliance', 'finance_manager']],
  )).rows[0]?.allowed));
  if (!permitted) throw new HttpError(403, 'Assigned Insurance sandbox access is required');
}

async function appendScenarioEvent(
  client: PoolClient,
  caseId: string,
  runId: string,
  sequenceNumber: number,
  actorId: string,
  eventType: string,
  eventData: unknown,
) {
  const result = await client.query(
    `INSERT INTO insurance_brokerage_sandbox_events
       (case_id, scenario_run_id, sequence_number, actor_id, event_type, event_data)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, sequence_number, event_type, event_data, created_at`,
    [caseId, runId, sequenceNumber, actorId, eventType, JSON.stringify(eventData)],
  );
  return result.rows[0];
}

export function createInsuranceBrokerageSandboxRouter(withUser: WithUser) {
  const router = Router();

  router.use((req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication is required'));
      return;
    }
    next();
  });

  router.use((req, _res, next) => {
    if (!isInsuranceBrokerageSandboxEnabled()) {
      next(new HttpError(404, 'Insurance brokerage sandbox is disabled'));
      return;
    }
    next();
  });

  router.get('/status', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    res.json({
      enabled: true,
      mode: 'sandbox',
      production_activities_enabled: false,
      supports_only_synthetic_scenarios: true,
      event_types: workflowEventTypes,
      synthetic_products: products,
    });
  }));

  router.get('/cases/mine', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    const rows = await withUser(req.user!, async (client) => (await client.query(
      `SELECT scenario.id, scenario.scenario_reference, scenario.created_at,
              count(event.id)::int AS event_count,
              max(event.created_at) AS last_activity_at
       FROM insurance_brokerage_sandbox_cases scenario
       LEFT JOIN insurance_brokerage_sandbox_events event ON event.case_id = scenario.id
       WHERE scenario.created_by = $1 OR $2::boolean
       GROUP BY scenario.id
       ORDER BY scenario.created_at DESC LIMIT 100`,
      [req.user!.id, ['global_admin', 'super_admin'].includes(req.user!.role)],
    )).rows);
    res.json(rows);
  }));

  router.post('/cases', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    z.object({ acknowledge_synthetic_only: z.literal(true) }).strict().parse(req.body);
    const row = await withUser(req.user!, async (client) => {
      const created = await client.query(
        `INSERT INTO insurance_brokerage_sandbox_cases (created_by)
         VALUES ($1)
         RETURNING id, scenario_reference, sandbox_only, created_at`,
        [req.user!.id],
      );
      return created.rows[0];
    });
    res.status(201).json(row);
  }));

  router.get('/cases/:caseId/events', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    const caseId = z.string().uuid().parse(req.params.caseId);
    const rows = await withUser(req.user!, async (client) => {
      const scenario = await client.query(
        'SELECT id FROM insurance_brokerage_sandbox_cases WHERE id=$1',
        [caseId],
      );
      if (!scenario.rowCount) throw new HttpError(404, 'Insurance sandbox case not found');
      return (await client.query(
        `SELECT event.id, event.scenario_run_id, event.sequence_number,
                event.event_type, event.event_data, event.created_at
         FROM insurance_brokerage_sandbox_events event
         WHERE event.case_id=$1 ORDER BY event.id`,
        [caseId],
      )).rows;
    });
    res.json(rows);
  }));

  router.get('/cases/:caseId/comparison', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    const caseId = z.string().uuid().parse(req.params.caseId);
    const body = z.object({
      category: z.enum(['life', 'household', 'property']),
    }).strict().parse(req.query);
    const availableProducts = products.filter((product) => product.category === body.category);
    const rows = await withUser(req.user!, async (client) => {
      const scenario = await client.query(
        'SELECT id FROM insurance_brokerage_sandbox_cases WHERE id=$1',
        [caseId],
      );
      if (!scenario.rowCount) throw new HttpError(404, 'Insurance sandbox case not found');
      const events = (await client.query(
        `SELECT event.id, event.scenario_run_id, event.sequence_number,
                event.event_type, event.event_data, event.created_at
         FROM insurance_brokerage_sandbox_events event
         WHERE event.case_id=$1
           AND event.event_type IN ('needs_assessment_simulated','disclosures_acknowledged_simulated','advice_review_simulated')
         ORDER BY event.id`,
        [caseId],
      )).rows;
      const assessment = events.find((event) => event.event_type === 'needs_assessment_simulated');
      const runEvents = events.filter((event) => event.scenario_run_id === assessment?.scenario_run_id);
      const disclosures = runEvents.find((event) => event.event_type === 'disclosures_acknowledged_simulated');
      const adviceReview = runEvents.find((event) => event.event_type === 'advice_review_simulated');
      if (!assessment || !disclosures || !adviceReview
        || assessment.event_data.product_category !== body.category
        || disclosures.event_data.acknowledgement !== 'SYNTHETIC_ONLY'
        || adviceReview.event_data.real_advice !== false
        || adviceReview.event_data.recommendation !== 'NONE') {
        throw new HttpError(409, 'Complete a matching synthetic needs assessment, disclosure, and non-advice review before comparison');
      }
      return runEvents;
    });
    res.json({
      mode: 'sandbox',
      production_activities_enabled: false,
      comparison_basis: ['synthetic_feature_labels', 'synthetic_monthly_price_only'],
      products: availableProducts,
      notes: ['Training illustration only.', 'No product is recommended.', 'This comparison is not a quote or offer of cover.'],
      review_events: rows,
    });
  }));

  router.post('/cases/:caseId/quotes', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    const caseId = z.string().uuid().parse(req.params.caseId);
    const body = z.object({
      scenario_run_id: z.string().uuid(),
      product_key: z.string().min(1),
      term_months: z.number().int().min(1).max(120),
      acknowledge_synthetic_only: z.literal(true),
    }).strict().parse(req.body);
    const product = products.find((item) => item.key === body.product_key);
    if (!product) throw new HttpError(404, 'Synthetic training product not found');
    const event = await withUser(req.user!, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [caseId]);
      const scenario = await client.query(
        'SELECT id FROM insurance_brokerage_sandbox_cases WHERE id=$1',
        [caseId],
      );
      if (!scenario.rowCount) throw new HttpError(404, 'Insurance sandbox case not found');
      const prerequisites = await client.query(
        `SELECT event_type, event_data
         FROM insurance_brokerage_sandbox_events
         WHERE case_id=$1 AND scenario_run_id=$2
         ORDER BY sequence_number`,
        [caseId, body.scenario_run_id],
      );
      const completedPrerequisites = new Set(prerequisites.rows.map((item) => item.event_type));
      for (const requiredEvent of [
        'synthetic_intake',
        'needs_assessment_simulated',
        'disclosures_acknowledged_simulated',
        'advice_review_simulated',
      ]) {
        if (!completedPrerequisites.has(requiredEvent)) {
          throw new HttpError(409, `Complete ${requiredEvent} in the synthetic scenario before simulating a quote`);
        }
      }
      const assessment = prerequisites.rows.find((item) => item.event_type === 'needs_assessment_simulated');
      const disclosures = prerequisites.rows.find((item) => item.event_type === 'disclosures_acknowledged_simulated');
      const adviceReview = prerequisites.rows.find((item) => item.event_type === 'advice_review_simulated');
      if (assessment.event_data.product_category !== product.category
        || disclosures.event_data.acknowledgement !== 'SYNTHETIC_ONLY'
        || adviceReview.event_data.real_advice !== false
        || adviceReview.event_data.recommendation !== 'NONE') {
        throw new HttpError(409, 'Synthetic quote must match the training needs and follow completed non-advice disclosures');
      }
      const existing = await client.query(
        `SELECT id, sequence_number, event_type, event_data, created_at
         FROM insurance_brokerage_sandbox_events
         WHERE case_id=$1 AND scenario_run_id=$2 AND event_type='quote_generated_simulated'`,
        [caseId, body.scenario_run_id],
      );
      if (existing.rowCount) {
        if (existing.rows[0].event_data.product_key !== body.product_key
          || existing.rows[0].event_data.term_months !== body.term_months) {
          throw new HttpError(409, 'Scenario run ID was already used for different quote inputs');
        }
        return existing.rows[0];
      }
      const nextSequence = await client.query(
        `SELECT coalesce(max(sequence_number),0)::int + 1 AS sequence_number
         FROM insurance_brokerage_sandbox_events
         WHERE case_id=$1 AND scenario_run_id=$2`,
        [caseId, body.scenario_run_id],
      );
      return appendScenarioEvent(
        client,
        caseId,
        body.scenario_run_id,
        nextSequence.rows[0].sequence_number,
        req.user!.id,
        'quote_generated_simulated',
        {
          product_key: product.key,
          term_months: body.term_months,
          currency: 'ETB',
          synthetic_monthly_premium_minor: product.monthlyPremiumMinor,
          synthetic_total_minor: product.monthlyPremiumMinor * body.term_months,
          quote_reference: `SYN-QUOTE-${randomUUID()}`,
          quote_state: 'SYNTHETIC_NOT_AN_OFFER',
        },
      );
    });
    res.status(201).json({ mode: 'sandbox', production_activities_enabled: false, quote: event });
  }));

  router.post('/cases/:caseId/run-demo', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    const caseId = z.string().uuid().parse(req.params.caseId);
    const body = z.object({
      scenario_run_id: z.string().uuid(),
      acknowledge_synthetic_only: z.literal(true),
    }).strict().parse(req.body);
    const scenarioWorkflow = buildDemoWorkflow();
    const events = await withUser(req.user!, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [caseId]);
      const scenario = await client.query(
        'SELECT id FROM insurance_brokerage_sandbox_cases WHERE id=$1',
        [caseId],
      );
      if (!scenario.rowCount) throw new HttpError(404, 'Insurance sandbox case not found');
      const existingRun = await client.query(
        `SELECT id, sequence_number, event_type, event_data, created_at
         FROM insurance_brokerage_sandbox_events
         WHERE case_id=$1 AND scenario_run_id=$2
         ORDER BY sequence_number`,
        [caseId, body.scenario_run_id],
      );
      if (existingRun.rowCount) {
        if (existingRun.rowCount !== scenarioWorkflow.length
          || existingRun.rows.some((event, index) =>
            event.sequence_number !== index + 1
            || event.event_type !== scenarioWorkflow[index][0])) {
          throw new HttpError(409, 'Incomplete synthetic run exists; use a new scenario run ID');
        }
        return existingRun.rows;
      }
      const existingCaseEvents = await client.query(
        'SELECT 1 FROM insurance_brokerage_sandbox_events WHERE case_id=$1 LIMIT 1',
        [caseId],
      );
      if (existingCaseEvents.rowCount) {
        throw new HttpError(409, 'Complete demo cannot be added after individual sandbox events; create a new case');
      }

      const created = [];
      for (let index = 0; index < scenarioWorkflow.length; index++) {
        const [eventType, eventData] = scenarioWorkflow[index];
        created.push(await appendScenarioEvent(
          client,
          caseId,
          body.scenario_run_id,
          index + 1,
          req.user!.id,
          eventType,
          eventData,
        ));
      }
      return created;
    });
    res.status(201).json({
      mode: 'sandbox',
      production_activities_enabled: false,
      events,
    });
  }));

  router.post('/production-activation', h(async (req, res) => {
    await requireSandboxStaff(req, withUser);
    res.status(423).json({
      enabled: false,
      error: 'Production Insurance brokerage actions are locked. Licence, insurer, owner approval, controls, and witnessed UAT evidence must be independently verified before a separately approved production implementation.',
    });
  }));

  return router;
}
