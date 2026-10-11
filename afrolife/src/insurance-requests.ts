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
      `SELECT id, product_interest, message, status, response_note, responded_at, created_at
       FROM insurance_interest_requests
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user!.id],
    )).rows);
    res.json(rows);
  }));

  router.post('/', h(async (req, res) => {
    const body = z.object({
      product_interest: z.enum(['life', 'household', 'property']),
      message: z.string().trim().min(10).max(500),
      consent: z.literal(true),
    }).strict().parse(req.body);
    const row = await withUser(req.user!, async (client) => {
      const result = await client.query(
        `INSERT INTO insurance_interest_requests (user_id, product_interest, message)
         VALUES ($1,$2,$3)
         RETURNING id, product_interest, message, status, created_at`,
        [req.user!.id, body.product_interest, body.message],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES ($1,'insurance_interest_requested','insurance_interest_request',$2,$3)`,
        [req.user!.id, result.rows[0].id, JSON.stringify({ product_interest: body.product_interest })],
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

  return router;
}
