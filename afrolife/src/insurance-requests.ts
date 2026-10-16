import { Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import type { AuthUser } from './auth-types.js';
import { HttpError } from './http-error.js';
import type { PoolClient } from 'pg';

type WithUser = <T>(user: AuthUser, fn: (client: PoolClient) => Promise<T>) => Promise<T>;

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

const insuranceStaffRoles = ['insurance_admin', 'finance_manager', 'compliance'];

async function requireInsuranceRequestStaff(req: Request, withUser: WithUser) {
  if (['global_admin', 'super_admin'].includes(req.user!.role)) return;
  const allowed = await withUser(req.user!, async (client) => Boolean((await client.query(
    'SELECT insurance_ledger_has_role($1::text[]) AS allowed',
    [['insurance_admin', 'finance_manager', 'compliance', 'auditor']],
  )).rows[0]?.allowed));
  if (!allowed) throw new HttpError(403, 'Assigned Insurance request-review access is required');
}

export function createInsuranceRequestsRouter(withUser: WithUser) {
  const router = Router();

  router.get('/me', h(async (req, res) => {
    const rows = await withUser(req.user!, async (client) => (await client.query(
      `SELECT request.id, request.product_interest, request.message, request.status,
              request.response_note, request.responded_at, request.created_at,
              referral.id AS agent_referral_id, referral.status AS agent_referral_status,
              assigned_agent.legal_name AS assigned_agent_name,
              (SELECT json_agg(jsonb_build_object(
                'event_type', event.event_type,
                'from_status', event.from_status,
                'to_status', event.to_status,
                'created_at', event.created_at
              ) ORDER BY event.id)
               FROM insurance_agent_referral_events event
               WHERE event.referral_id = referral.id) AS agent_referral_events
       FROM insurance_interest_requests request
       LEFT JOIN insurance_agent_referrals referral ON referral.request_id = request.id
       LEFT JOIN users assigned_agent ON assigned_agent.id = referral.assigned_agent_id
       WHERE request.user_id=$1 ORDER BY request.created_at DESC LIMIT 100`,
      [req.user!.id],
    )).rows);
    res.json(rows);
  }));

  router.post('/', h(async (req, res) => {
    const body = z.object({
      product_interest: z.enum(['life', 'household', 'property']),
      message: z.string().trim().min(10).max(500),
      consent: z.literal(true),
      agent_referral_consent: z.boolean().optional().default(false),
    }).strict().parse(req.body);
    const row = await withUser(req.user!, async (client) => {
      const result = await client.query(
        `INSERT INTO insurance_interest_requests
           (user_id, product_interest, message, agent_referral_consented_at)
         VALUES ($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END)
         RETURNING id, product_interest, message, status, created_at`,
        [req.user!.id, body.product_interest, body.message, body.agent_referral_consent],
      );
      if (body.agent_referral_consent) {
        await client.query(
          `INSERT INTO insurance_agent_referrals (request_id, user_id, product_interest, customer_consented_at)
           SELECT id, user_id, product_interest, agent_referral_consented_at
           FROM insurance_interest_requests WHERE id=$1 AND user_id=$2`,
          [result.rows[0].id, req.user!.id],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES ($1,'insurance_interest_requested','insurance_interest_request',$2,$3)`,
        [req.user!.id, result.rows[0].id, JSON.stringify({
          product_interest: body.product_interest,
          agent_referral_consent: body.agent_referral_consent,
        })],
      );
      return result.rows[0];
    });
    res.status(201).json(row);
  }));

  router.get('/', h(async (req, res) => {
    await requireInsuranceRequestStaff(req, withUser);
    const { rows, canRespond } = await withUser(req.user!, async (client) => {
      const canManage = ['global_admin', 'super_admin'].includes(req.user!.role)
        || Boolean((await client.query(
          `SELECT insurance_ledger_has_role($1::text[]) AS allowed`,
          [['insurance_admin', 'finance_manager', 'compliance']],
        )).rows[0]?.allowed);
      const requests = (await client.query(
        `SELECT request.id, request.product_interest, request.message, request.status,
                request.response_note, request.created_at, request.responded_at,
                user_record.legal_name, user_record.phone
         FROM insurance_interest_requests request
         JOIN users user_record ON user_record.id=request.user_id
         ORDER BY request.created_at DESC LIMIT 200`,
      )).rows;
      return { rows: requests, canRespond: canManage };
    });
    res.json(rows.map((row) => ({ ...row, can_respond: canRespond })));
  }));

  router.post('/:requestId/decision', h(async (req, res) => {
    await requireInsuranceRequestStaff(req, withUser);
    const body = z.object({
      status: z.enum(['responded', 'closed']),
      response_note: z.string().trim().min(10).max(1000),
    }).strict().parse(req.body);
    const result = await withUser(req.user!, async (client) => {
      const updated = await client.query(
        `UPDATE insurance_interest_requests
         SET status=$2, response_note=$3, responded_by=$4, responded_at=now()
         WHERE id=$1 AND status='pending'
         RETURNING id, product_interest, status, response_note, responded_at`,
        [req.params.requestId, body.status, body.response_note, req.user!.id],
      );
      if (!updated.rowCount) throw new HttpError(404, 'Pending Insurance information request not found');
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES ($1,'insurance_interest_responded','insurance_interest_request',$2,$3)`,
        [req.user!.id, updated.rows[0].id, JSON.stringify({ status: body.status })],
      );
      return updated.rows[0];
    });
    res.json(result);
  }));

  router.get('/agent-referrals/me', h(async (req, res) => {
    const isAgent = ['master_agent', 'field_agent'].includes(req.user!.role);
    if (!isAgent) await requireInsuranceRequestStaff(req, withUser);
    const rows = await withUser(req.user!, async (client) => (await client.query(
      `SELECT referral.id, referral.request_id, referral.assigned_agent_id,
              referral.status, referral.created_at, referral.updated_at,
              referral.product_interest, customer.legal_name, customer.phone,
              assigned_agent.legal_name AS assigned_agent_name,
              referral.assigned_agent_id = $1 AS can_update,
              (SELECT json_agg(jsonb_build_object(
                'event_type', event.event_type,
                'from_status', event.from_status,
                'to_status', event.to_status,
                'created_at', event.created_at
              ) ORDER BY event.id)
               FROM insurance_agent_referral_events event
               WHERE event.referral_id = referral.id) AS events
       FROM insurance_agent_referrals referral
       JOIN users customer ON customer.id = referral.user_id
       LEFT JOIN users assigned_agent ON assigned_agent.id = referral.assigned_agent_id
       WHERE $2::boolean OR referral.assigned_agent_id IS NOT NULL
          OR referral.status = 'unassigned'
       ORDER BY referral.created_at DESC LIMIT 200`,
      [
        req.user!.id,
        ['global_admin', 'super_admin'].includes(req.user!.role),
      ],
    )).rows);
    res.json(rows);
  }));

  router.get('/agent-referrals/agents', h(async (req, res) => {
    await requireInsuranceRequestStaff(req, withUser);
    const rows = await withUser(req.user!, async (client) => (await client.query(
      `SELECT agent.id, user_record.legal_name, user_record.role, user_record.phone,
              agent.agent_type, agent.parent_id, agent.territory_id
       FROM agents agent
       JOIN users user_record ON user_record.id = agent.id
       WHERE user_record.active AND user_record.role IN ('master_agent','field_agent')
       ORDER BY user_record.legal_name`,
    )).rows);
    res.json(rows);
  }));

  router.post('/agent-referrals/:referralId/assign', h(async (req, res) => {
    await requireInsuranceRequestStaff(req, withUser);
    const body = z.object({
      agent_id: z.string().uuid(),
      reason: z.enum(['customer_requested', 'workload_balance', 'staff_review']),
    }).strict().parse(req.body);
    const result = await withUser(req.user!, async (client) => {
      const updated = await client.query(
        `UPDATE insurance_agent_referrals
         SET assigned_agent_id=$2, status='assigned', assigned_by=$3,
             assigned_at=now(), assignment_reason=$4, updated_by=$3, updated_at=now()
         WHERE id=$1
         RETURNING id, assigned_agent_id, status, assigned_at, assignment_reason`,
        [req.params.referralId, body.agent_id, req.user!.id, body.reason],
      );
      if (!updated.rowCount) throw new HttpError(404, 'Insurance agent referral not found');
      return updated.rows[0];
    });
    res.json(result);
  }));

  router.post('/agent-referrals/:referralId/status', h(async (req, res) => {
    if (!['master_agent', 'field_agent'].includes(req.user!.role)) {
      throw new HttpError(403, 'Only an assigned Agent can update a referral');
    }
    const body = z.object({
      status: z.enum(['contact_attempted', 'referred_to_insurance_team', 'customer_declined']),
    }).strict().parse(req.body);
    const result = await withUser(req.user!, async (client) => {
      const updated = await client.query(
        `UPDATE insurance_agent_referrals
         SET status=$2, updated_by=$3, updated_at=now()
         WHERE id=$1 AND assigned_agent_id=$3 AND status IN ('assigned','contact_attempted')
         RETURNING id, status, updated_at`,
        [req.params.referralId, body.status, req.user!.id],
      );
      if (!updated.rowCount) throw new HttpError(404, 'Assigned Insurance referral not found or no longer active');
      return updated.rows[0];
    });
    res.json(result);
  }));

  router.post('/agent-referrals/:referralId/withdraw', h(async (req, res) => {
    const result = await withUser(req.user!, async (client) => {
      const updated = await client.query(
        `UPDATE insurance_agent_referrals
         SET status='customer_withdrew', updated_by=$2, updated_at=now()
         WHERE id=$1 AND user_id=$2 AND status <> 'customer_withdrew'
         RETURNING id, status, updated_at`,
        [req.params.referralId, req.user!.id],
      );
      if (!updated.rowCount) throw new HttpError(404, 'Active Insurance Agent referral not found');
      return updated.rows[0];
    });
    res.json(result);
  }));

  return router;
}
