import { createHash } from 'node:crypto';
import { Request, Response, RequestHandler, Router } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from './auth-types.js';
import { HttpError } from './http-error.js';
import { InsuranceJournalLineInput, validateInsuranceJournalLines } from './insurance-ledger-validation.js';

type WithUser = <T>(user: AuthUser, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
export function createInsuranceLedgerRouter(withUser: WithUser) {
  const insuranceLedgerRouter = Router();

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };
const ledgerRoles = ['global_admin', 'super_admin', 'finance', 'finance_manager', 'compliance'];
const postingRoles = ['global_admin', 'super_admin', 'finance_manager'];
const accountType = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
const decimalAmount = z.string().regex(/^\d{1,14}(?:\.\d{1,2})?$/);

const accountBody = z.object({
  account_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,24}$/),
  name: z.string().trim().min(2).max(120),
  account_type: accountType,
});

const linesBody = z.array(z.object({
  account_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,24}$/),
  debit: decimalAmount,
  credit: decimalAmount,
}).strict()).min(2).max(50);

const journalBody = z.object({
  idempotency_key: z.string().uuid(),
  source_reference: z.string().trim().min(1).max(160),
  description: z.string().trim().min(10).max(1000),
  lines: linesBody,
}).strict();

function hash(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function audit(client: PoolClient, actorId: string, action: string, entity: string, entityId: string, details: unknown) {
  await client.query(
    `INSERT INTO insurance_ledger_audit (actor_id, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, entity, entityId, JSON.stringify(details)],
  );
}

async function requireRole(req: Request, allowed: string[]) {
  const globalRole = ['global_admin','super_admin'].includes(req.user!.role);
  if (globalRole && allowed.some((role) => ['global_admin','super_admin'].includes(role))) return;
  const localRoles = allowed.filter((role) => !['global_admin','super_admin'].includes(role));
  // Insurance access is granted by an organization-scoped assignment. The
  // user's platform role only determines whether a route is eligible to ask
  // for that assignment; it does not itself grant local ledger access.
  if (!localRoles.length) throw new HttpError(403, 'Your role cannot access the insurance ledger');
  const matching = [...new Set([...localRoles, 'insurance_admin'])];
  const permitted = await withUser(req.user!, async (client) => Boolean((await client.query(
    'SELECT insurance_ledger_has_role($1::text[]) AS allowed', [matching],
  )).rows[0]?.allowed));
  if (!permitted) throw new HttpError(403, 'Insurance ledger staff access is required for this Edir');
}

async function requireInsuranceMaster(req: Request) {
  if (['global_admin','super_admin'].includes(req.user!.role)) return;
  const permitted = await withUser(req.user!, async (client) => Boolean((await client.query(
    'SELECT insurance_ledger_is_master() AS allowed',
  )).rows[0]?.allowed));
  if (!permitted || req.user!.edir_id !== '00000000-0000-4000-8000-000000000001') {
    throw new HttpError(403, 'Insurance umbrella administration access is required');
  }
}

insuranceLedgerRouter.get('/organizations', h(async (req, res) => {
  const rows = await withUser(req.user!, async (client) => (await client.query(
    'SELECT id,parent_organization_id,organization_type,display_name,legal_name,status,created_at FROM insurance_ledger_organizations ORDER BY display_name',
  )).rows);
  res.json(rows);
}));

insuranceLedgerRouter.post('/organizations', h(async (req, res) => {
  await requireInsuranceMaster(req);
  const body = z.object({ id: z.string().uuid(), display_name: z.string().trim().min(2).max(160), legal_name: z.string().trim().min(2).max(200) }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => (await client.query(
    `INSERT INTO insurance_ledger_organizations (id,parent_organization_id,organization_type,display_name,legal_name,status)
     VALUES ($1,'00000000-0000-4000-8000-000000000001','independent_master',$2,$3,'active')
     ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name
     RETURNING id,display_name,legal_name,status`,
    [body.id,body.display_name,body.legal_name],
  )).rows[0]);
  res.status(201).json(row);
}));

insuranceLedgerRouter.get('/master/summary', h(async (req, res) => {
  await requireInsuranceMaster(req);
  res.json(await withUser(req.user!, async (client) => (await client.query(
    'SELECT * FROM insurance_ledger_consolidated_summary()',
  )).rows));
}));

insuranceLedgerRouter.get('/master/access', h(async (req, res) => {
  const allowed = ['global_admin','super_admin'].includes(req.user!.role)
    || await withUser({ ...req.user!, edir_id: '00000000-0000-4000-8000-000000000001' }, async (client) => Boolean((await client.query(
      'SELECT insurance_ledger_is_master() AS allowed',
    )).rows[0]?.allowed));
  res.json({ allowed });
}));

insuranceLedgerRouter.post('/organizations/:organizationId/staff', h(async (req, res) => {
  await requireInsuranceMaster(req);
  const organizationId = z.string().uuid().parse(req.params.organizationId);
  const body = z.object({ user_id: z.string().uuid(), role: z.enum(['insurance_admin','finance','finance_manager','compliance','auditor']) }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => (await client.query(
    `INSERT INTO insurance_ledger_staff (user_id,organization_id,role,assigned_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,active=true,assigned_by=EXCLUDED.assigned_by,created_at=now()
     RETURNING user_id,organization_id,role,active,created_at`,
    [body.user_id,organizationId,body.role,req.user!.id],
  )).rows[0]);
  res.status(201).json(row);
}));

insuranceLedgerRouter.post('/master/staff', h(async (req, res) => {
  if (!['global_admin','super_admin'].includes(req.user!.role)) throw new HttpError(403, 'Platform administrator access is required');
  const body = z.object({ user_id: z.string().uuid(), role: z.literal('insurance_master_admin') }).strict().parse(req.body);
  const row = await withUser({ ...req.user!, edir_id: '00000000-0000-4000-8000-000000000001' }, async (client) => (await client.query(
    `INSERT INTO insurance_ledger_staff (user_id,organization_id,role,assigned_by)
     VALUES ($1,'00000000-0000-4000-8000-000000000001',$2,$3)
     ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,active=true,assigned_by=EXCLUDED.assigned_by,created_at=now()
     RETURNING user_id,organization_id,role,active,created_at`, [body.user_id,body.role,req.user!.id],
  )).rows[0]);
  res.status(201).json(row);
}));

insuranceLedgerRouter.get('/accounts', h(async (req, res) => {
  await requireRole(req, ledgerRoles);
  const rows = await withUser(req.user!, async (client) => (await client.query(
    `SELECT a.id, a.account_code, a.name, a.account_type, a.created_at,
       COALESCE(sum(CASE WHEN j.status = 'posted' THEN l.debit - l.credit ELSE 0 END), 0)::numeric(16,2) AS balance
     FROM insurance_ledger_accounts a
     LEFT JOIN insurance_ledger_lines l ON l.account_id = a.id
     LEFT JOIN insurance_ledger_journals j ON j.id = l.journal_id AND j.status = 'posted'
     GROUP BY a.id ORDER BY a.account_code`,
  )).rows);
  res.json(rows);
}));

insuranceLedgerRouter.post('/accounts', h(async (req, res) => {
  await requireRole(req, ['global_admin', 'super_admin','insurance_admin']);
  const body = accountBody.parse(req.body);
  const account = await withUser(req.user!, async (client) => {
    const row = (await client.query(
      `INSERT INTO insurance_ledger_accounts (account_code, name, account_type, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id, account_code, name, account_type, created_at`,
      [body.account_code, body.name, body.account_type, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'insurance_ledger_account_created', 'insurance_ledger_account', row.id, body);
    return row;
  });
  res.status(201).json(account);
}));

insuranceLedgerRouter.get('/journals', h(async (req, res) => {
  await requireRole(req, ledgerRoles);
  const status = req.query.status === undefined ? null
    : z.enum(['draft', 'pending_approval', 'posted', 'rejected']).parse(req.query.status);
  const rows = await withUser(req.user!, async (client) => (await client.query(
    `SELECT j.*,
       COALESCE(jsonb_agg(jsonb_build_object(
         'account_code', a.account_code, 'account_name', a.name,
         'debit', l.debit::text, 'credit', l.credit::text
       ) ORDER BY l.line_no) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
     FROM insurance_ledger_journals j
     LEFT JOIN insurance_ledger_lines l ON l.journal_id = j.id
     LEFT JOIN insurance_ledger_accounts a ON a.id = l.account_id
     WHERE ($1::text IS NULL OR j.status = $1)
     GROUP BY j.id ORDER BY j.created_at DESC LIMIT 200`,
    [status],
  )).rows);
  res.json(rows);
}));

async function createPendingJournal(
  req: Request,
  input: {
    idempotency_key: string;
    source_reference: string;
    description: string;
    lines: InsuranceJournalLineInput[];
    transaction_type: 'manual' | 'reversal';
    reversal_of?: string;
    reversal_reason?: string;
  },
) {
  let normalizedLines: ReturnType<typeof validateInsuranceJournalLines>;
  try {
    normalizedLines = validateInsuranceJournalLines(input.lines);
  } catch (error) {
    if (error instanceof TypeError) throw new HttpError(400, error.message);
    throw error;
  }
  const payload = {
    transaction_type: input.transaction_type,
    reversal_of: input.reversal_of ?? null,
    reversal_reason: input.reversal_reason ?? null,
    source_reference: input.source_reference,
    description: input.description,
    amount: normalizedLines.amount,
    lines: normalizedLines.lines,
  };
  const payloadHash = hash(payload);
  return withUser(req.user!, async (client) => {
    const existing = (await client.query(
      'SELECT * FROM insurance_ledger_journals WHERE idempotency_key = $1',
      [input.idempotency_key],
    )).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'This idempotency key was already used for a different insurance journal');
      return { ...existing, replayed: true };
    }

    const accountCodes = normalizedLines.lines.map((line) => line.account_code);
    const accounts = await client.query(
      'SELECT id, account_code FROM insurance_ledger_accounts WHERE account_code = ANY($1::text[])',
      [accountCodes],
    );
    if (accounts.rowCount !== accountCodes.length) throw new HttpError(400, 'Every insurance journal line must reference an existing account');
    const accountIds = new Map(accounts.rows.map((account) => [account.account_code, account.id]));

    const journal = (await client.query(
      `INSERT INTO insurance_ledger_journals
         (idempotency_key, payload_hash, transaction_type, source_reference, description, amount, reversal_of, reversal_reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING RETURNING *`,
      [input.idempotency_key, payloadHash, input.transaction_type, input.source_reference,
        input.description, normalizedLines.amount, input.reversal_of ?? null, input.reversal_reason ?? null, req.user!.id],
    )).rows[0];
    if (!journal) {
      const replay = (await client.query(
        'SELECT * FROM insurance_ledger_journals WHERE idempotency_key = $1',
        [input.idempotency_key],
      )).rows[0];
      if (replay?.payload_hash === payloadHash) return { ...replay, replayed: true };
      if (input.reversal_of) throw new HttpError(409, 'A reversal request already exists for this insurance journal');
      throw new HttpError(409, 'This idempotency key is already in use');
    }
    for (const [index, line] of normalizedLines.lines.entries()) {
      await client.query(
        `INSERT INTO insurance_ledger_lines (journal_id, line_no, account_id, debit, credit)
         VALUES ($1,$2,$3,$4,$5)`,
        [journal.id, index + 1, accountIds.get(line.account_code), line.debit, line.credit],
      );
    }
    const pending = (await client.query(
      `UPDATE insurance_ledger_journals SET status = 'pending_approval'
       WHERE id = $1 RETURNING *`,
      [journal.id],
    )).rows[0];
    await audit(client, req.user!.id, 'insurance_ledger_journal_submitted', 'insurance_ledger_journal', journal.id, payload);
    if (input.reversal_reason) {
      await audit(client, req.user!.id, 'insurance_ledger_reversal_submitted', 'insurance_ledger_journal',
        journal.id, { reversal_of: input.reversal_of, reason: input.reversal_reason });
    }
    return { ...pending, replayed: false };
  });
}

insuranceLedgerRouter.post('/journals', h(async (req, res) => {
  await requireRole(req, postingRoles);
  const body = journalBody.parse(req.body);
  const journal = await createPendingJournal(req, { ...body, transaction_type: 'manual' });
  res.status(journal.replayed ? 200 : 201).json(journal);
}));

insuranceLedgerRouter.post('/journals/:journalId/decision', h(async (req, res) => {
  await requireRole(req, postingRoles);
  const body = z.object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const journal = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT * FROM insurance_ledger_journals WHERE id = $1 FOR UPDATE',
      [req.params.journalId],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Insurance journal not found');
    if (current.status !== 'pending_approval') throw new HttpError(409, 'Insurance journal is not awaiting approval');
    if (current.created_by === req.user!.id) throw new HttpError(409, 'The journal maker cannot approve or reject their own entry');
    const posted = body.decision === 'approve';
    const result = (await client.query(
      `UPDATE insurance_ledger_journals
       SET status = $2, approved_by = $3, approval_reason = $4, approved_at = now(),
           posted_at = CASE WHEN $2 = 'posted' THEN now() ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [current.id, posted ? 'posted' : 'rejected', req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, posted ? 'insurance_ledger_journal_posted' : 'insurance_ledger_journal_rejected',
      'insurance_ledger_journal', current.id, { old_status: current.status, new_status: result.status, reason: body.reason });
    return result;
  });
  res.json(journal);
}));

insuranceLedgerRouter.post('/journals/:journalId/reversal', h(async (req, res) => {
  await requireRole(req, postingRoles);
  const body = z.object({
    idempotency_key: z.string().uuid(),
    source_reference: z.string().trim().min(1).max(160),
    description: z.string().trim().min(10).max(1000),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const source = await withUser(req.user!, async (client) => {
    const journal = (await client.query(
      `SELECT j.*, jsonb_agg(jsonb_build_object(
          'account_code', a.account_code, 'debit', l.credit::text, 'credit', l.debit::text
        )
        ORDER BY l.line_no) AS lines
       FROM insurance_ledger_journals j
       JOIN insurance_ledger_lines l ON l.journal_id = j.id
       JOIN insurance_ledger_accounts a ON a.id = l.account_id
       WHERE j.id = $1 AND j.status = 'posted' AND j.transaction_type = 'manual'
       GROUP BY j.id`,
      [req.params.journalId],
    )).rows[0];
    if (!journal) throw new HttpError(404, 'Posted manual insurance journal not found');
    return journal;
  });
  const created = await createPendingJournal(req, {
    idempotency_key: body.idempotency_key,
    source_reference: body.source_reference,
    description: body.description,
    lines: source.lines,
    transaction_type: 'reversal',
    reversal_of: source.id,
    reversal_reason: body.reason,
  });
  res.status(created.replayed ? 200 : 201).json(created);
}));

  return insuranceLedgerRouter;
}
