import { createHash, randomUUID } from 'node:crypto';
import { Router, Request, Response, RequestHandler } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AuthUser, HttpError, isPlatformAdminRole, withUser } from './core.js';
import { centsToAmount, decimalToCents, mfiAmountSchema as amountSchema, normalizeAmount } from './mfi-money.js';
import { Phone } from './validators.js';
import { creditPolicySchema, principalSchedule, scoreLoan } from './mfi-credit.js';

export const mfiRouter = Router();

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

const institutionRoles = ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'teller', 'compliance', 'auditor'] as const;
type InstitutionRole = typeof institutionRoles[number];

async function withInstitution<T>(
  user: AuthUser,
  institutionId: string,
  allowedRoles: readonly InstitutionRole[],
  fn: (client: PoolClient, role: InstitutionRole) => Promise<T>,
): Promise<T> {
  return withUser(user, async (client) => {
    await client.query("SELECT set_config('app.mfi_institution_id', $1, true)", [institutionId]);
    const institution = (await client.query(
      'SELECT id FROM mfi_institutions WHERE id=$1',
      [institutionId],
    )).rows[0];
    if (!institution) throw new HttpError(404, 'Institution not found');
    const membership = (await client.query(
      `SELECT role FROM mfi_institution_memberships
       WHERE institution_id = $1 AND user_id = $2 AND active`,
      [institutionId, user.id],
    )).rows[0];
    const platformAdmin = isPlatformAdminRole(user.role);
    if (!membership && !platformAdmin) throw new HttpError(404, 'Institution not found');
    if (!platformAdmin && !allowedRoles.includes(membership.role)) {
      throw new HttpError(403, 'Your institution role cannot do this');
    }
    if (platformAdmin) {
      await auditMfi(client, institutionId, user.id, 'mfi_platform_admin_access', 'mfi_institution', institutionId, null, {
        method: 'institution_scoped_api_access',
        path: '/mfi/institutions/:institutionId',
        access: 'platform_super_admin_override',
      });
    }
    return fn(client, platformAdmin ? 'institution_admin' : membership.role);
  });
}

const viewRoles: readonly InstitutionRole[] = institutionRoles;
const auditRoles: readonly InstitutionRole[] = ['institution_admin', 'finance_manager', 'compliance', 'auditor'];
function amountHash(payload: object) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function auditMfi(
  client: PoolClient,
  institutionId: string,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  oldValue?: unknown,
  newValue?: unknown,
) {
  await client.query(
    `INSERT INTO mfi_audit_logs (institution_id, actor_id, action, entity, entity_id, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      institutionId, actorId, action, entity, entityId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
    ],
  );
}

async function findJournalReplay(
  client: PoolClient,
  input: {
    institutionId: string; idempotencyKey: string; type: string; memberAccountId: string | null;
    loanId?: string | null; amount: string; reversalOf?: string | null; reversalReason?: string | null;
  },
) {
  const payloadHash = amountHash({
    type: input.type,
    member_account_id: input.memberAccountId,
    loan_id: input.loanId ?? null,
    amount: normalizeAmount(input.amount),
    reversal_of: input.reversalOf ?? null,
    reversal_reason: input.reversalReason ?? null,
  });
  const existing = (await client.query(
    'SELECT * FROM mfi_journals WHERE institution_id = $1 AND idempotency_key = $2',
    [input.institutionId, input.idempotencyKey],
  )).rows[0];
  if (!existing) return null;
  if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'This idempotency key was already used for a different financial request');
  if (existing.status !== 'posted') throw new Error('An incomplete MFI journal was found for an idempotency key');
  return { ...existing, replayed: true };
}

async function lockCashAccount(client: PoolClient, institutionId: string) {
  const account = (await client.query(
    `SELECT id FROM mfi_gl_accounts WHERE institution_id=$1 AND account_code='1000' FOR UPDATE`,
    [institutionId],
  )).rows[0];
  if (!account) throw new Error('Required MFI general-ledger account is missing: 1000');
}

async function cashBalance(client: PoolClient, institutionId: string) {
  return (await client.query(
    `SELECT COALESCE(sum(l.debit-l.credit),0)::numeric(16,2) AS balance
     FROM mfi_journal_lines l
     JOIN mfi_journals j ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
     JOIN mfi_gl_accounts g ON g.id=l.gl_account_id AND g.institution_id=l.institution_id
     WHERE l.institution_id=$1 AND g.account_code='1000'`,
    [institutionId],
  )).rows[0].balance as string;
}

async function allocateLoanPrincipal(client: PoolClient, institutionId: string, loanId: string, totalPaid: string) {
  await client.query(
    `WITH ordered AS (
       SELECT id, principal_due,
         COALESCE(sum(principal_due) OVER (ORDER BY installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_due
       FROM mfi_loan_installments WHERE institution_id=$1 AND loan_id=$2
     ), allocated AS (
       SELECT id, principal_due, LEAST(principal_due, GREATEST(0,$3::numeric-prior_due)) AS paid FROM ordered
     )
     UPDATE mfi_loan_installments i SET principal_paid=a.paid,
       status=CASE WHEN a.paid=0 THEN 'due' WHEN a.paid=a.principal_due THEN 'paid' ELSE 'partial' END
     FROM allocated a WHERE i.institution_id=$1 AND i.id=a.id`,
    [institutionId, loanId, totalPaid],
  );
}

async function postJournal(
  client: PoolClient,
  input: {
    institutionId: string;
    idempotencyKey: string;
    type: string;
    memberAccountId: string | null;
    loanId?: string | null;
    reversalOf?: string | null;
    reversalReason?: string | null;
    amount: string;
    actorId: string;
    lines: { code: string; memberAccountId?: string | null; debit: string; credit: string }[];
  },
) {
  const amount = normalizeAmount(input.amount);
  const replay = await findJournalReplay(client, input);
  if (replay) return replay;
  const payloadHash = amountHash({
    type: input.type,
    member_account_id: input.memberAccountId,
    loan_id: input.loanId ?? null,
    amount,
    reversal_of: input.reversalOf ?? null,
    reversal_reason: input.reversalReason ?? null,
  });

  const inserted = await client.query(
    `INSERT INTO mfi_journals
       (institution_id, idempotency_key, payload_hash, transaction_type, member_account_id, loan_id,
        reversal_of, reversal_reason, amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (institution_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.institutionId, input.idempotencyKey, payloadHash, input.type, input.memberAccountId,
      input.loanId ?? null, input.reversalOf ?? null, input.reversalReason ?? null, amount, input.actorId,
    ],
  );
  if (!inserted.rowCount) {
    const raced = (await client.query(
      'SELECT * FROM mfi_journals WHERE institution_id = $1 AND idempotency_key = $2',
      [input.institutionId, input.idempotencyKey],
    )).rows[0];
    if (!raced || raced.payload_hash !== payloadHash) throw new HttpError(409, 'This idempotency key was already used for a different financial request');
    return { ...raced, replayed: true };
  }

  const accounts = await client.query(
    `SELECT id, account_code FROM mfi_gl_accounts
     WHERE institution_id=$1 AND account_code=ANY($2::text[])
     ORDER BY account_code FOR UPDATE`,
    [input.institutionId, [...new Set(input.lines.map((line) => line.code))]],
  );
  const glAccounts = new Map(accounts.rows.map((row) => [row.account_code, row.id]));
  for (const line of input.lines) {
    const glAccountId = glAccounts.get(line.code);
    if (!glAccountId) throw new Error(`Required MFI general-ledger account is missing: ${line.code}`);
    await client.query(
      `INSERT INTO mfi_journal_lines
         (institution_id, journal_id, gl_account_id, member_account_id, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.institutionId, inserted.rows[0].id, glAccountId, line.memberAccountId ?? null, line.debit, line.credit],
    );
  }
  const posted = (await client.query(
    `UPDATE mfi_journals SET status = 'posted', posted_at = now()
     WHERE id = $1 AND institution_id = $2 RETURNING *`,
    [inserted.rows[0].id, input.institutionId],
  )).rows[0];
  await auditMfi(client, input.institutionId, input.actorId, 'mfi_journal_posted', 'mfi_journal', posted.id, null, {
    transaction_type: input.type, amount, idempotency_key: input.idempotencyKey,
  });
  return { ...posted, replayed: false };
}

mfiRouter.get('/institutions', h(async (req, res) => {
  const rows = await withUser(req.user!, async (client) => {
    const platformAdmin = isPlatformAdminRole(req.user!.role);
    const result = await client.query(
    `SELECT i.id, i.institution_code, i.name, i.currency, m.role
     FROM mfi_institutions i
     LEFT JOIN mfi_institution_memberships m
       ON m.institution_id = i.id AND m.user_id = $1 AND m.active
     WHERE $2::boolean OR m.user_id IS NOT NULL
     ORDER BY i.name`,
      [req.user!.id, platformAdmin],
    );
    if (platformAdmin) {
      for (const institution of result.rows) {
        await auditMfi(client, institution.id, req.user!.id, 'mfi_platform_admin_institution_listed', 'mfi_institution', institution.id, null, {
          access: 'platform_super_admin_override',
        });
      }
    }
    return result.rows.map((row) => ({
      ...row,
      role: platformAdmin ? 'platform_super_admin' : row.role,
    }));
  });
  res.json(rows);
}));

mfiRouter.post('/institutions', h(async (req, res) => {
  if (!isPlatformAdminRole(req.user!.role)) throw new HttpError(403, 'Only a platform administrator can register an institution');
  const body = z.object({
    institution_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/),
    name: z.string().trim().min(2).max(160),
  }).parse(req.body);
  const institution = await withUser(req.user!, async (client) => {
    const institutionId = randomUUID();
    await client.query(
      'INSERT INTO mfi_institutions (id, institution_code, name, created_by) VALUES ($1,$2,$3,$4)',
      [institutionId, body.institution_code, body.name, req.user!.id],
    );
    await client.query(
      "INSERT INTO mfi_institution_memberships (institution_id, user_id, role) VALUES ($1,$2,'institution_admin')",
      [institutionId, req.user!.id],
    );
    const created = (await client.query(
      'SELECT * FROM mfi_institutions WHERE id=$1',
      [institutionId],
    )).rows[0];
    await client.query(
      `INSERT INTO mfi_gl_accounts (institution_id, account_code, name, account_type) VALUES
        ($1,'1000','Cash on hand','asset'),
        ($1,'1300','Loan principal receivable','asset'),
        ($1,'2100','Member savings liabilities','liability'),
        ($1,'3100','Member share capital','equity')`,
      [institutionId],
    );
    await client.query(
      `INSERT INTO mfi_products (institution_id, product_code, name, product_type) VALUES
        ($1,'SAV-ORD','Ordinary savings','savings'),
        ($1,'SHR-CAP','Member share capital','share'),
        ($1,'LON-GEN','General credit - principal-only pilot','loan')`,
      [institutionId],
    );
    await auditMfi(client, institutionId, req.user!.id, 'mfi_institution_created', 'mfi_institution', institutionId, null, {
      institution_code: created.institution_code, name: created.name,
    });
    return created;
  });
  res.status(201).json(institution);
}));

mfiRouter.get('/institutions/:institutionId/credit-policy', h(async (req, res) => {
  const data = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) => ({
    active: (await client.query(
      `SELECT id, version, policy, approved_by, approved_at, effective_at
       FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='active'`, [req.params.institutionId],
    )).rows[0] ?? null,
    pending: (await client.query(
      `SELECT id, version, policy, change_reason, created_by, created_at
       FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='pending_approval'`, [req.params.institutionId],
    )).rows[0] ?? null,
  }));
  res.json(data);
}));

mfiRouter.post('/institutions/:institutionId/credit-policy', h(async (req, res) => {
  const body = z.object({ policy: creditPolicySchema, change_reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const row = await withInstitution(req.user!, req.params.institutionId, ['institution_admin'], async (client) => {
    const pending = await client.query(
      `SELECT id FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='pending_approval'`, [req.params.institutionId],
    );
    if (pending.rowCount) throw new HttpError(409, 'Review or reject the existing pending credit policy before submitting another');
    const version = Number((await client.query(
      'SELECT COALESCE(max(version),0)+1 AS version FROM mfi_credit_policy_versions WHERE institution_id=$1', [req.params.institutionId],
    )).rows[0].version);
    const created = (await client.query(
      `INSERT INTO mfi_credit_policy_versions (institution_id, version, policy, change_reason, created_by, status)
       VALUES ($1,$2,$3,$4,$5,'pending_approval') RETURNING *`,
      [req.params.institutionId, version, JSON.stringify(body.policy), body.change_reason, req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_credit_policy_submitted', 'mfi_credit_policy', created.id, null, {
      version, reason: body.change_reason,
    });
    return created;
  });
  res.status(201).json(row);
}));

mfiRouter.post('/institutions/:institutionId/credit-policy/:policyId/approve', h(async (req, res) => {
  const body = z.object({ decision: z.enum(['approve','reject']), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId, ['institution_admin'], async (client) => {
    const pending = (await client.query(
      `SELECT * FROM mfi_credit_policy_versions WHERE institution_id=$1 AND id=$2 AND status='pending_approval' FOR UPDATE`,
      [req.params.institutionId, req.params.policyId],
    )).rows[0];
    if (!pending) throw new HttpError(404, 'Pending credit policy not found');
    if (pending.created_by === req.user!.id) throw new HttpError(409, 'The policy author cannot approve their own policy');
    if (body.decision === 'reject') {
      await client.query(`UPDATE mfi_credit_policy_versions SET status='rejected' WHERE institution_id=$1 AND id=$2`, [req.params.institutionId, pending.id]);
      await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_credit_policy_rejected', 'mfi_credit_policy', pending.id, { status: pending.status }, { reason: body.reason });
      return { ...pending, status: 'rejected' };
    }
    await client.query(`UPDATE mfi_credit_policy_versions SET status='superseded' WHERE institution_id=$1 AND status='active'`, [req.params.institutionId]);
    const active = (await client.query(
      `UPDATE mfi_credit_policy_versions SET status='active', approved_by=$3, approved_at=now(), effective_at=now()
       WHERE institution_id=$1 AND id=$2 RETURNING *`, [req.params.institutionId, pending.id, req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_credit_policy_activated', 'mfi_credit_policy', active.id, null, {
      version: active.version, reason: body.reason,
    });
    return active;
  });
  res.json(result);
}));

mfiRouter.get('/institutions/:institutionId/staff', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, ['institution_admin'], async (client) =>
    (await client.query(
      `SELECT m.user_id, u.legal_name, u.phone, m.role, m.active, m.created_at
       FROM mfi_institution_memberships m JOIN users u ON u.id=m.user_id
       WHERE m.institution_id=$1 ORDER BY u.legal_name`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.post('/institutions/:institutionId/staff', h(async (req, res) => {
  const body = z.object({
    phone: Phone,
    role: z.enum(institutionRoles),
  }).parse(req.body);
  const membership = await withInstitution(req.user!, req.params.institutionId, ['institution_admin'], async (client) => {
    const staff = (await client.query(
      `SELECT id, legal_name, phone FROM users
       WHERE phone=$1 AND active AND role IN ('global_admin','super_admin','compliance','finance','finance_manager')`,
      [body.phone],
    )).rows[0];
    if (!staff) throw new HttpError(404, 'No active AfroLife finance or compliance staff account matches that phone number');
    const row = (await client.query(
      `INSERT INTO mfi_institution_memberships (institution_id, user_id, role)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.institutionId, staff.id, body.role],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_staff_provisioned', 'mfi_membership', staff.id, null, {
      legal_name: staff.legal_name, phone: staff.phone, role: body.role,
    });
    return row;
  });
  res.status(201).json(membership);
}));

mfiRouter.get('/institutions/:institutionId/overview', h(async (req, res) => {
  const data = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) => {
    const [members, accounts, loans, journals, cash] = await Promise.all([
      client.query(`SELECT status, count(*)::int AS count FROM mfi_members WHERE institution_id=$1 GROUP BY status`, [req.params.institutionId]),
      client.query(
        `SELECT a.account_type, count(*)::int AS count,
           COALESCE(sum(CASE WHEN a.account_type='loan' THEN l.debit-l.credit ELSE l.credit-l.debit END),0)::numeric(16,2) AS balance
         FROM mfi_member_accounts a
         LEFT JOIN mfi_journal_lines l ON l.institution_id=a.institution_id AND l.member_account_id=a.id
         LEFT JOIN mfi_journals j ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
         WHERE a.institution_id=$1 AND a.status='active'
         GROUP BY a.account_type`,
        [req.params.institutionId],
      ),
      client.query(`SELECT status, count(*)::int AS count FROM mfi_loans WHERE institution_id=$1 GROUP BY status`, [req.params.institutionId]),
      client.query(`SELECT count(*)::int AS count FROM mfi_journals WHERE institution_id=$1 AND status='posted'`, [req.params.institutionId]),
      client.query(
        `SELECT COALESCE(sum(l.debit-l.credit),0)::numeric(16,2) AS balance
         FROM mfi_journal_lines l JOIN mfi_journals j ON j.id=l.journal_id AND j.institution_id=l.institution_id
         JOIN mfi_gl_accounts g ON g.id=l.gl_account_id AND g.institution_id=l.institution_id
         WHERE l.institution_id=$1 AND j.status='posted' AND g.account_code='1000'`,
        [req.params.institutionId],
      ),
    ]);
    return {
      members: Object.fromEntries(members.rows.map((row) => [row.status, row.count])),
      accounts: Object.fromEntries(accounts.rows.map((row) => [row.account_type, { count: row.count, balance: row.balance }])),
      loans: Object.fromEntries(loans.rows.map((row) => [row.status, row.count])),
      posted_transactions: journals.rows[0].count,
      cash_balance: cash.rows[0].balance,
    };
  });
  res.json(data);
}));

mfiRouter.get('/institutions/:institutionId/audit', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, auditRoles, async (client) =>
    (await client.query(
      `SELECT a.id, a.actor_id, u.legal_name AS actor_name, a.action, a.entity, a.entity_id,
         a.old_value, a.new_value, a.created_at
       FROM mfi_audit_logs a JOIN users u ON u.id=a.actor_id
       WHERE a.institution_id=$1 ORDER BY a.created_at DESC LIMIT 200`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.get('/institutions/:institutionId/transactions', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) =>
    (await client.query(
      `SELECT j.id, j.transaction_type, j.amount, j.created_at, j.posted_at, j.created_by,
         j.reversal_of, j.reversal_reason,
         u.legal_name AS posted_by, j.loan_id, l.member_account_id AS loan_account_id,
         (SELECT r.id FROM mfi_journals r WHERE r.institution_id=j.institution_id AND r.reversal_of=j.id) AS reversal_id,
         jsonb_agg(jsonb_build_object(
           'account_code', g.account_code, 'account_name', g.name,
           'debit', jl.debit, 'credit', jl.credit,
           'account_number', a.account_number
         ) ORDER BY g.account_code) AS lines
       FROM mfi_journals j
       JOIN users u ON u.id=j.created_by
       JOIN mfi_journal_lines jl ON jl.institution_id=j.institution_id AND jl.journal_id=j.id
       JOIN mfi_gl_accounts g ON g.institution_id=jl.institution_id AND g.id=jl.gl_account_id
       LEFT JOIN mfi_member_accounts a ON a.institution_id=jl.institution_id AND a.id=jl.member_account_id
       LEFT JOIN mfi_loans l ON l.institution_id=j.institution_id AND l.id=j.loan_id
       WHERE j.institution_id=$1 AND j.status='posted'
       GROUP BY j.id,u.legal_name,l.member_account_id ORDER BY j.posted_at DESC LIMIT 100`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.post('/institutions/:institutionId/journals/:journalId/reverse', h(async (req, res) => {
  const body = z.object({
    idempotency_key: z.string().uuid(),
    reason: z.string().trim().min(10).max(1000),
  }).parse(req.body);
  const reversal = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'finance_manager'], async (client) => {
    const original = (await client.query(
      `SELECT * FROM mfi_journals
       WHERE institution_id=$1 AND id=$2 AND status='posted'
       FOR UPDATE`,
      [req.params.institutionId, req.params.journalId],
    )).rows[0];
    if (!original) throw new HttpError(404, 'Posted journal not found');
    if (original.transaction_type === 'reversal' || original.reversal_of) {
      throw new HttpError(409, 'A reversal event cannot itself be reversed');
    }
    const replay = await findJournalReplay(client, {
      institutionId: req.params.institutionId,
      idempotencyKey: body.idempotency_key,
      type: 'reversal',
      memberAccountId: original.member_account_id,
      loanId: original.loan_id,
      amount: String(original.amount),
      reversalOf: original.id,
      reversalReason: body.reason,
    });
    if (replay) return replay;
    if (original.created_by === req.user!.id) {
      throw new HttpError(409, 'The original transaction maker cannot approve its reversal');
    }
    const priorReversal = (await client.query(
      'SELECT id FROM mfi_journals WHERE institution_id=$1 AND reversal_of=$2',
      [req.params.institutionId, original.id],
    )).rows[0];
    if (priorReversal) throw new HttpError(409, 'This posted transaction already has a full reversal');

    const originalLines = (await client.query(
      `SELECT jl.debit, jl.credit, jl.member_account_id, g.account_code
       FROM mfi_journal_lines jl JOIN mfi_gl_accounts g
         ON g.id=jl.gl_account_id AND g.institution_id=jl.institution_id
       WHERE jl.institution_id=$1 AND jl.journal_id=$2 ORDER BY g.account_code`,
      [req.params.institutionId, original.id],
    )).rows;
    const cashChange = originalLines
      .filter((line) => line.account_code === '1000')
      .reduce((sum, line) => sum + decimalToCents(String(line.credit)) - decimalToCents(String(line.debit)), 0n);
    const subledgerId = original.member_account_id ?? originalLines.find((line) => line.member_account_id)?.member_account_id ?? null;
    let loan: Record<string, unknown> | undefined;
    if (original.loan_id) {
      loan = (await client.query(
        'SELECT * FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE',
        [req.params.institutionId, original.loan_id],
      )).rows[0];
      if (!loan) throw new Error('The original loan journal has no loan record');
      if (original.transaction_type === 'loan_disbursement' &&
          (loan.status !== 'disbursed' || decimalToCents(String(loan.principal_repaid)) !== 0n)) {
        throw new HttpError(409, 'A loan disbursement can only be reversed before any principal repayment');
      }
      if (original.transaction_type === 'loan_repayment' && !['disbursed', 'repaid'].includes(String(loan.status))) {
        throw new HttpError(409, 'This loan is not in a repayable state');
      }
    }

    // Loan operations consistently lock the loan before cash. Keeping that order here
    // avoids a cash/loan lock cycle with repayment and disbursement requests.
    await lockCashAccount(client, req.params.institutionId);
    if (cashChange < 0n && decimalToCents(await cashBalance(client, req.params.institutionId)) < -cashChange) {
      throw new HttpError(409, 'The institution has insufficient cash to reverse this transaction');
    }
    if (subledgerId) {
      const account = (await client.query(
        `SELECT a.account_type, p.minimum_balance
         FROM mfi_member_accounts a JOIN mfi_products p ON p.id=a.product_id AND p.institution_id=a.institution_id
         WHERE a.institution_id=$1 AND a.id=$2`,
        [req.params.institutionId, subledgerId],
      )).rows[0];
      if (account && account.account_type !== 'loan') {
        const balance = (await client.query(
          `SELECT COALESCE(sum(l.credit-l.debit),0)::numeric(16,2) AS value
           FROM mfi_journal_lines l JOIN mfi_journals j
             ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
           WHERE l.institution_id=$1 AND l.member_account_id=$2`,
          [req.params.institutionId, subledgerId],
        )).rows[0].value as string;
        const balanceChange = originalLines
          .filter((line) => line.member_account_id === subledgerId)
          .reduce((sum, line) => sum + decimalToCents(String(line.debit)) - decimalToCents(String(line.credit)), 0n);
        if (decimalToCents(balance) + balanceChange < decimalToCents(String(account.minimum_balance))) {
          throw new HttpError(409, 'Reversal would breach the member account minimum balance');
        }
      }
    }

    const journal = await postJournal(client, {
      institutionId: req.params.institutionId,
      idempotencyKey: body.idempotency_key,
      type: 'reversal',
      memberAccountId: original.member_account_id,
      loanId: original.loan_id,
      reversalOf: original.id,
      reversalReason: body.reason,
      amount: String(original.amount),
      actorId: req.user!.id,
      lines: originalLines.map((line) => ({
        code: line.account_code,
        memberAccountId: line.member_account_id,
        debit: String(line.credit),
        credit: String(line.debit),
      })),
    });
    if (loan && original.transaction_type === 'loan_disbursement') {
      await client.query(
        `UPDATE mfi_loans SET status='cancelled'
         WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, original.loan_id],
      );
    } else if (loan && original.transaction_type === 'loan_repayment') {
      const outstanding = (await client.query(
        `SELECT COALESCE(sum(l.debit-l.credit),0)::numeric(16,2) AS value
         FROM mfi_journal_lines l JOIN mfi_journals j
           ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
         WHERE l.institution_id=$1 AND l.member_account_id=$2`,
        [req.params.institutionId, loan.member_account_id],
      )).rows[0].value as string;
      const outstandingCents = decimalToCents(outstanding);
      const repaidCents = decimalToCents(String(loan.principal_amount)) - outstandingCents;
      const isRepaid = repaidCents === decimalToCents(String(loan.principal_amount));
      await client.query(
        `UPDATE mfi_loans SET principal_repaid=$3, status=$4 WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, original.loan_id, centsToAmount(repaidCents), isRepaid ? 'repaid' : 'disbursed'],
      );
      await allocateLoanPrincipal(client, req.params.institutionId, String(original.loan_id), centsToAmount(repaidCents));
    }
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_journal_reversed', 'mfi_journal', original.id, {
      status: 'posted',
    }, { reversal_id: journal.id, reason: body.reason });
    return journal;
  });
  res.status(reversal.replayed ? 200 : 201).json(reversal);
}));

mfiRouter.get('/institutions/:institutionId/members', h(async (req, res) => {
  const result = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client, role) => {
    const rows = (await client.query(
      `SELECT m.id, m.member_number, m.full_name, m.phone, m.email, m.status, m.created_at,
         m.created_by, m.reviewed_by, m.reviewed_at,
         count(a.id)::int AS account_count
       FROM mfi_members m
       LEFT JOIN mfi_member_accounts a ON a.institution_id=m.institution_id AND a.member_id=m.id
       WHERE m.institution_id=$1
      GROUP BY m.id ORDER BY m.created_at DESC LIMIT 200`,
      [req.params.institutionId],
    )).rows;
    // Contact details are only needed for member servicing, compliance review,
    // and audit. Tellers and other operational roles receive the minimum list data.
    const canViewContactDetails = ['institution_admin', 'loan_officer', 'compliance', 'auditor'].includes(role);
    return canViewContactDetails ? rows : rows.map(({ phone: _phone, email: _email, ...member }) => member);
  });
  res.json(result);
}));

mfiRouter.post('/institutions/:institutionId/members', h(async (req, res) => {
  const body = z.object({
    full_name: z.string().trim().min(2).max(160),
    phone: Phone,
    email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  }).parse(req.body);
  const member = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'loan_officer', 'compliance'], async (client) => {
    const memberNumber = 'M-' + (await client.query("SELECT lpad(nextval('mfi_member_seq')::text, 8, '0') AS value")).rows[0].value;
    const row = (await client.query(
      `INSERT INTO mfi_members (institution_id, member_number, full_name, phone, email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.institutionId, memberNumber, body.full_name, body.phone, body.email || null, req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_member_created', 'mfi_member', row.id, null, {
      member_number: row.member_number, full_name: row.full_name, phone: row.phone,
    });
    return row;
  });
  res.status(201).json(member);
}));

mfiRouter.post('/institutions/:institutionId/members/:memberId/review', h(async (req, res) => {
  const body = z.object({
    decision: z.enum(['activate', 'reject']),
    reason: z.string().trim().min(10).max(1000),
  }).parse(req.body);
  const member = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'compliance'], async (client) => {
    const old = (await client.query(
      'SELECT * FROM mfi_members WHERE institution_id=$1 AND id=$2 FOR UPDATE',
      [req.params.institutionId, req.params.memberId],
    )).rows[0];
    if (!old) throw new HttpError(404, 'Member not found');
    if (old.status !== 'pending') throw new HttpError(409, `Member is already ${old.status}`);
    if (old.created_by === req.user!.id) throw new HttpError(409, 'The member registrar cannot review their own submission');
    const updated = (await client.query(
      `UPDATE mfi_members SET status=$3, reviewed_by=$4, reviewed_at=now()
       WHERE institution_id=$1 AND id=$2 RETURNING *`,
      [req.params.institutionId, req.params.memberId, body.decision === 'activate' ? 'active' : 'rejected', req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_member_' + body.decision, 'mfi_member', old.id, { status: old.status }, {
      status: updated.status, reason: body.reason,
    });
    return updated;
  });
  res.json(member);
}));

mfiRouter.post('/institutions/:institutionId/members/:memberId/lifecycle', h(async (req, res) => {
  const body = z.object({ action: z.enum(['suspend','reactivate','close']), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const member = await withInstitution(req.user!, req.params.institutionId, ['institution_admin','compliance'], async (client) => {
    const prior = (await client.query(
      'SELECT * FROM mfi_members WHERE institution_id=$1 AND id=$2 FOR UPDATE', [req.params.institutionId, req.params.memberId],
    )).rows[0];
    if (!prior) throw new HttpError(404, 'Member not found');
    const targets = { suspend: 'suspended', reactivate: 'active', close: 'closed' } as const;
    const next = targets[body.action];
    const allowed = body.action === 'suspend' ? prior.status === 'active'
      : body.action === 'reactivate' ? prior.status === 'suspended' : ['active','suspended'].includes(prior.status);
    if (!allowed) throw new HttpError(409, `Cannot ${body.action} a member with status ${prior.status}`);
    if (prior.created_by === req.user!.id || prior.reviewed_by === req.user!.id) {
      throw new HttpError(409, 'A different staff member must perform this member lifecycle action');
    }
    if (body.action === 'close') {
      const exposure = (await client.query(
        `SELECT
           COALESCE((SELECT sum(CASE WHEN a.account_type='loan' THEN l.debit-l.credit ELSE l.credit-l.debit END)
             FROM mfi_member_accounts a LEFT JOIN mfi_journal_lines l ON l.institution_id=a.institution_id AND l.member_account_id=a.id
             LEFT JOIN mfi_journals j ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
             WHERE a.institution_id=$1 AND a.member_id=$2 AND a.account_type<>'loan'),0)::numeric(16,2) AS deposit_balance,
           COALESCE((SELECT sum(principal_amount-principal_repaid) FROM mfi_loans
             WHERE institution_id=$1 AND member_id=$2 AND status IN ('disbursed','repaid')),0)::numeric(16,2) AS loan_balance`,
        [req.params.institutionId, prior.id],
      )).rows[0];
      if (decimalToCents(String(exposure.deposit_balance)) !== 0n || decimalToCents(String(exposure.loan_balance)) !== 0n) {
        throw new HttpError(409, 'Settle all member savings, shares, and loan balances before closing membership');
      }
    }
    const updated = (await client.query(
      `UPDATE mfi_members SET status=$3, lifecycle_updated_by=$4, lifecycle_updated_at=now()
       WHERE institution_id=$1 AND id=$2 RETURNING *`, [req.params.institutionId, prior.id, next, req.user!.id],
    )).rows[0];
    await client.query(
      `INSERT INTO mfi_member_lifecycle_events (institution_id, member_id, prior_status, next_status, reason, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6)`, [req.params.institutionId, prior.id, prior.status, next, body.reason, req.user!.id],
    );
    await auditMfi(client, req.params.institutionId, req.user!.id, `mfi_member_${body.action}d`, 'mfi_member', prior.id,
      { status: prior.status }, { status: next, reason: body.reason });
    return updated;
  });
  res.json(member);
}));

mfiRouter.get('/institutions/:institutionId/products', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) =>
    (await client.query(
      `SELECT id, product_code, name, product_type, minimum_balance, active
       FROM mfi_products WHERE institution_id=$1 ORDER BY product_type, product_code`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.get('/institutions/:institutionId/accounts', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) =>
    (await client.query(
      `SELECT a.id, a.account_number, a.account_type, a.status, a.created_at,
         m.id AS member_id, m.member_number, m.full_name AS member_name,
         p.product_code, p.name AS product_name,
         COALESCE(sum(CASE WHEN a.account_type='loan' THEN l.debit-l.credit ELSE l.credit-l.debit END),0)::numeric(16,2) AS balance
       FROM mfi_member_accounts a
       JOIN mfi_members m ON m.id=a.member_id AND m.institution_id=a.institution_id
       JOIN mfi_products p ON p.id=a.product_id AND p.institution_id=a.institution_id
       LEFT JOIN mfi_journal_lines l ON l.member_account_id=a.id AND l.institution_id=a.institution_id
       LEFT JOIN mfi_journals j ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
       WHERE a.institution_id=$1
       GROUP BY a.id, m.id, p.id ORDER BY a.created_at DESC LIMIT 200`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.post('/institutions/:institutionId/members/:memberId/accounts', h(async (req, res) => {
  const body = z.object({ product_id: z.string().uuid() }).parse(req.body);
  const account = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'loan_officer', 'teller'], async (client) => {
    const member = (await client.query(
      'SELECT * FROM mfi_members WHERE institution_id=$1 AND id=$2 FOR SHARE',
      [req.params.institutionId, req.params.memberId],
    )).rows[0];
    if (!member) throw new HttpError(404, 'Member not found');
    if (member.status !== 'active') throw new HttpError(409, 'Only an active member can open an account');
    const product = (await client.query(
      'SELECT * FROM mfi_products WHERE institution_id=$1 AND id=$2 AND active',
      [req.params.institutionId, body.product_id],
    )).rows[0];
    if (!product || product.product_type === 'loan') throw new HttpError(400, 'Choose an active savings or share product');
    const row = (await client.query(
      `INSERT INTO mfi_member_accounts (institution_id, member_id, product_id, account_number, account_type, opened_by)
       VALUES ($1,$2,$3,'A-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),$4,$5)
       RETURNING *`,
      [req.params.institutionId, req.params.memberId, body.product_id, product.product_type, req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_member_account_opened', 'mfi_member_account', row.id, null, {
      account_number: row.account_number, account_type: row.account_type, product_code: product.product_code,
    });
    return row;
  });
  res.status(201).json(account);
}));

const transactionBody = z.object({
  idempotency_key: z.string().uuid(),
  amount: amountSchema,
});

mfiRouter.post('/institutions/:institutionId/accounts/:accountId/transactions', h(async (req, res) => {
  const body = z.object({
    ...transactionBody.shape,
    transaction_type: z.enum(['savings_deposit', 'savings_withdrawal', 'share_contribution']),
  }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'finance_manager', 'teller'], async (client) => {
    const replay = await findJournalReplay(client, {
      institutionId: req.params.institutionId, idempotencyKey: body.idempotency_key,
      type: body.transaction_type, memberAccountId: req.params.accountId, amount: body.amount,
    });
    if (replay) return replay;
    const account = (await client.query(
      `SELECT a.*, p.minimum_balance
       FROM mfi_member_accounts a JOIN mfi_products p ON p.id=a.product_id AND p.institution_id=a.institution_id
       JOIN mfi_members m ON m.id=a.member_id AND m.institution_id=a.institution_id
       WHERE a.institution_id=$1 AND a.id=$2 AND m.status='active'
       FOR UPDATE OF a`,
      [req.params.institutionId, req.params.accountId],
    )).rows[0];
    if (!account || account.status !== 'active') throw new HttpError(404, 'Active member account not found');
    const afterLockReplay = await findJournalReplay(client, {
      institutionId: req.params.institutionId, idempotencyKey: body.idempotency_key,
      type: body.transaction_type, memberAccountId: req.params.accountId, amount: body.amount,
    });
    if (afterLockReplay) return afterLockReplay;
    const typeMap = { savings_deposit: 'savings', savings_withdrawal: 'savings', share_contribution: 'share' } as const;
    if (account.account_type !== typeMap[body.transaction_type]) throw new HttpError(409, 'Transaction type does not match the member account');
    await lockCashAccount(client, req.params.institutionId);
    if (body.transaction_type === 'savings_withdrawal') {
      const balance = (await client.query(
        `SELECT COALESCE(sum(l.credit-l.debit),0)::numeric(16,2) AS value
         FROM mfi_journal_lines l JOIN mfi_journals j
           ON j.id=l.journal_id AND j.institution_id=l.institution_id AND j.status='posted'
         WHERE l.institution_id=$1 AND l.member_account_id=$2`,
        [req.params.institutionId, account.id],
      )).rows[0].value as string;
      if (decimalToCents(balance) - decimalToCents(body.amount) < decimalToCents(String(account.minimum_balance))) {
        throw new HttpError(409, 'Withdrawal would breach the product minimum balance');
      }
      if (decimalToCents(await cashBalance(client, req.params.institutionId)) < decimalToCents(body.amount)) {
        throw new HttpError(409, 'The institution has insufficient cash for this withdrawal');
      }
    }
    const deposit = body.transaction_type !== 'savings_withdrawal';
    const memberCode = account.account_type === 'share' ? '3100' : '2100';
    const entry = await postJournal(client, {
      institutionId: req.params.institutionId,
      idempotencyKey: body.idempotency_key,
      type: body.transaction_type,
      memberAccountId: account.id,
      amount: body.amount,
      actorId: req.user!.id,
      lines: deposit
        ? [{ code: '1000', debit: normalizeAmount(body.amount), credit: '0' },
          { code: memberCode, memberAccountId: account.id, debit: '0', credit: normalizeAmount(body.amount) }]
        : [{ code: memberCode, memberAccountId: account.id, debit: normalizeAmount(body.amount), credit: '0' },
          { code: '1000', debit: '0', credit: normalizeAmount(body.amount) }],
    });
    return entry;
  });
  res.status(result.replayed ? 200 : 201).json(result);
}));

mfiRouter.get('/institutions/:institutionId/loans', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client, role) =>
    (await client.query(
      `SELECT l.id,l.member_id,l.product_id,l.member_account_id,l.principal_amount,l.term_months,l.status,
         l.created_by,l.checked_by,l.decision_reason,l.disbursed_by,l.principal_repaid,l.created_at,l.reviewed_at,l.disbursed_at,
         CASE WHEN $2::boolean THEN l.purpose END AS purpose,
         l.credit_score,l.credit_scorecard_version,l.application_submitted_at,l.offer_accepted_at,
         CASE WHEN $2::boolean THEN l.monthly_income END AS monthly_income,
         CASE WHEN $2::boolean THEN l.monthly_expenses END AS monthly_expenses,
         CASE WHEN $2::boolean THEN l.monthly_debt END AS monthly_debt,
         CASE WHEN $2::boolean THEN l.credit_score_factors END AS credit_score_factors,
         l.npl_status,l.npl_classified_at,l.npl_reason,m.member_number,m.full_name AS member_name,
         COALESCE(sum(CASE WHEN jl.member_account_id=l.member_account_id AND j.status='posted' THEN jl.debit-jl.credit ELSE 0 END),0)::numeric(16,2) AS outstanding_principal,
         COALESCE((SELECT GREATEST(0,current_date-min(i.due_on))::int FROM mfi_loan_installments i
           WHERE i.institution_id=l.institution_id AND i.loan_id=l.id AND i.status<>'paid' AND i.due_on<current_date),0) AS days_past_due,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('installment_no',i.installment_no,'due_on',i.due_on,
           'principal_due',i.principal_due,'principal_paid',i.principal_paid,'status',i.status) ORDER BY i.installment_no)
           FROM mfi_loan_installments i WHERE i.institution_id=l.institution_id AND i.loan_id=l.id),'[]'::jsonb) AS schedule
       FROM mfi_loans l JOIN mfi_members m ON m.id=l.member_id AND m.institution_id=l.institution_id
       LEFT JOIN mfi_journal_lines jl ON jl.institution_id=l.institution_id AND jl.member_account_id=l.member_account_id
       LEFT JOIN mfi_journals j ON j.id=jl.journal_id AND j.institution_id=jl.institution_id
       WHERE l.institution_id=$1
       GROUP BY l.id,m.member_number,m.full_name ORDER BY l.created_at DESC LIMIT 200`,
      [req.params.institutionId, ['institution_admin','credit_manager','compliance','auditor'].includes(role)],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.get('/institutions/:institutionId/loans/:loanId/installments', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId, viewRoles, async (client) =>
    (await client.query(
      `SELECT installment_no,due_on,principal_due,principal_paid,status,
         GREATEST(0,current_date-due_on)::int AS days_past_due
       FROM mfi_loan_installments WHERE institution_id=$1 AND loan_id=$2 ORDER BY installment_no`,
      [req.params.institutionId, req.params.loanId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.get('/institutions/:institutionId/collections', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId,
    ['institution_admin','finance_manager','credit_manager','loan_officer','compliance','auditor'], async (client) =>
    (await client.query(
      `SELECT c.id, c.loan_id, c.status, c.created_by, c.assigned_to, c.opened_at, c.next_action_at,
         l.member_id, m.member_number, m.full_name AS member_name, l.principal_amount, l.principal_repaid,
         COALESCE(i.scheduled_arrears,0)::numeric(16,2) AS scheduled_arrears,
         COALESCE(i.days_past_due,0)::int AS days_past_due,
         COALESCE(e.events,'[]'::jsonb) AS events
       FROM mfi_collection_cases c JOIN mfi_loans l ON l.id=c.loan_id AND l.institution_id=c.institution_id
       JOIN mfi_members m ON m.id=l.member_id AND m.institution_id=l.institution_id
       LEFT JOIN LATERAL (
         SELECT sum(principal_due-principal_paid) FILTER (WHERE status<>'paid' AND due_on<=current_date) AS scheduled_arrears,
           GREATEST(0,current_date-min(due_on) FILTER (WHERE status<>'paid' AND due_on<current_date))::int AS days_past_due
         FROM mfi_loan_installments WHERE institution_id=l.institution_id AND loan_id=l.id
       ) i ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('event_type',event_type,'outcome',outcome,'created_at',created_at)
           ORDER BY created_at DESC) AS events FROM mfi_collection_events
         WHERE institution_id=c.institution_id AND case_id=c.id
       ) e ON true
       WHERE c.institution_id=$1 ORDER BY c.opened_at DESC LIMIT 200`,
      [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.post('/institutions/:institutionId/loans/:loanId/collections', h(async (req, res) => {
  const body = z.object({ assigned_to: z.string().uuid().optional(), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId,
    ['institution_admin','finance_manager','credit_manager','loan_officer'], async (client) => {
    const loan = (await client.query(
      `SELECT id,status FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE`, [req.params.institutionId, req.params.loanId],
    )).rows[0];
    if (!loan || loan.status !== 'disbursed') throw new HttpError(404, 'Outstanding disbursed loan not found');
    const existing = (await client.query(
      `SELECT * FROM mfi_collection_cases WHERE institution_id=$1 AND loan_id=$2 AND status IN ('open','promise_to_pay','escalated')`,
      [req.params.institutionId, loan.id],
    )).rows[0];
    if (existing) return { ...existing, replayed: true };
    if (body.assigned_to) {
      const assignee = (await client.query(
        `SELECT role FROM mfi_institution_memberships WHERE institution_id=$1 AND user_id=$2 AND active`,
        [req.params.institutionId, body.assigned_to],
      )).rows[0];
      if (!assignee || !['institution_admin','finance_manager','credit_manager','loan_officer'].includes(assignee.role)) {
        throw new HttpError(400, 'Assign the case to an active institution collection officer');
      }
    }
    const row = (await client.query(
      `INSERT INTO mfi_collection_cases (institution_id,loan_id,created_by,assigned_to)
       VALUES ($1,$2,$3,$4) RETURNING *`, [req.params.institutionId, loan.id, req.user!.id, body.assigned_to ?? req.user!.id],
    )).rows[0];
    await client.query(
      `INSERT INTO mfi_collection_events (institution_id,case_id,event_type,outcome,actor_id)
       VALUES ($1,$2,'note',$3,$4)`, [req.params.institutionId, row.id, body.reason, req.user!.id],
    );
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_collection_case_opened', 'mfi_collection_case', row.id, null, {
      loan_id: loan.id, assigned_to: row.assigned_to, reason: body.reason,
    });
    return row;
  });
  res.status(result.replayed ? 200 : 201).json(result);
}));

mfiRouter.post('/institutions/:institutionId/collections/:caseId/events', h(async (req, res) => {
  const body = z.object({
    event_type: z.enum(['contact','promise_to_pay','visit','escalation','note']),
    outcome: z.string().trim().min(2).max(1000),
    promised_amount: amountSchema.optional(),
    promised_on: z.string().date().optional(),
    next_action_at: z.string().datetime().optional(),
  }).superRefine((value, ctx) => {
    if (value.event_type === 'promise_to_pay' && (!value.promised_amount || !value.promised_on)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A promise requires an amount and date', path: ['promised_on'] });
    }
  }).parse(req.body);
  const row = await withInstitution(req.user!, req.params.institutionId,
    ['institution_admin','finance_manager','credit_manager','loan_officer'], async (client, role) => {
    const record = (await client.query(
      `SELECT * FROM mfi_collection_cases WHERE institution_id=$1 AND id=$2 AND status IN ('open','promise_to_pay','escalated') FOR UPDATE`,
      [req.params.institutionId, req.params.caseId],
    )).rows[0];
    if (!record) throw new HttpError(404, 'Open collection case not found');
    if (!['institution_admin','finance_manager','credit_manager'].includes(role) && record.assigned_to !== req.user!.id) {
      throw new HttpError(403, 'Only the assigned collection officer or a collection manager can update this case');
    }
    if (body.event_type === 'promise_to_pay') {
      const loan = (await client.query(
        `SELECT principal_amount-principal_repaid AS outstanding FROM mfi_loans WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, record.loan_id],
      )).rows[0];
      const today = (await client.query('SELECT current_date::text AS today')).rows[0].today as string;
      if (body.promised_on! < today) throw new HttpError(400, 'Promise date cannot be in the past');
      if (decimalToCents(body.promised_amount!) > decimalToCents(String(loan.outstanding))) {
        throw new HttpError(409, 'Promised principal cannot exceed the outstanding loan balance');
      }
    }
    const saved = (await client.query(
      `INSERT INTO mfi_collection_events (institution_id,case_id,event_type,outcome,promised_amount,promised_on,next_action_at,actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.institutionId, record.id, body.event_type, body.outcome,
        body.promised_amount ? normalizeAmount(body.promised_amount) : null, body.promised_on ?? null,
        body.next_action_at ?? null, req.user!.id],
    )).rows[0];
    if (body.event_type === 'promise_to_pay' || body.event_type === 'escalation') {
      await client.query(
        `UPDATE mfi_collection_cases SET status=$3,next_action_at=$4 WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, record.id, body.event_type === 'promise_to_pay' ? 'promise_to_pay' : 'escalated',
          body.next_action_at ?? (body.promised_on ? `${body.promised_on}T00:00:00Z` : null)],
      );
    }
    await auditMfi(client, req.params.institutionId, req.user!.id, `mfi_collection_${body.event_type}`, 'mfi_collection_case', record.id, null, {
      event_id: saved.id, outcome: body.outcome,
    });
    return saved;
  });
  res.status(201).json(row);
}));

mfiRouter.post('/institutions/:institutionId/collections/:caseId/close', h(async (req, res) => {
  const body = z.object({ status: z.enum(['resolved','closed']), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const row = await withInstitution(req.user!, req.params.institutionId,
    ['institution_admin','finance_manager','credit_manager'], async (client) => {
    const record = (await client.query(
      `SELECT * FROM mfi_collection_cases WHERE institution_id=$1 AND id=$2 AND status IN ('open','promise_to_pay','escalated') FOR UPDATE`,
      [req.params.institutionId, req.params.caseId],
    )).rows[0];
    if (!record) throw new HttpError(404, 'Open collection case not found');
    if (record.created_by === req.user!.id) throw new HttpError(409, 'The collection case opener cannot close their own case');
    const updated = (await client.query(
      `UPDATE mfi_collection_cases SET status=$3,closed_at=now(),closed_by=$4,close_reason=$5,next_action_at=NULL
       WHERE institution_id=$1 AND id=$2 RETURNING *`,
      [req.params.institutionId, record.id, body.status, req.user!.id, body.reason],
    )).rows[0];
    await client.query(
      `INSERT INTO mfi_collection_events (institution_id,case_id,event_type,outcome,actor_id)
       VALUES ($1,$2,'resolution',$3,$4)`, [req.params.institutionId, record.id, body.reason, req.user!.id],
    );
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_collection_case_closed', 'mfi_collection_case', record.id,
      { status: record.status }, { status: body.status, reason: body.reason });
    return updated;
  });
  res.json(row);
}));

mfiRouter.get('/institutions/:institutionId/npl-events', h(async (req, res) => {
  const rows = await withInstitution(req.user!, req.params.institutionId,
    ['institution_admin','finance_manager','credit_manager','compliance','auditor'], async (client) =>
    (await client.query(
      `SELECT e.*,m.member_number,m.full_name AS member_name,l.principal_amount,l.principal_repaid,
         l.created_by,l.checked_by,l.disbursed_by,u.legal_name AS proposer_name
       FROM mfi_npl_events e JOIN mfi_loans l ON l.institution_id=e.institution_id AND l.id=e.loan_id
       JOIN mfi_members m ON m.institution_id=l.institution_id AND m.id=l.member_id
       JOIN users u ON u.id=e.proposed_by
       WHERE e.institution_id=$1 ORDER BY e.created_at DESC LIMIT 200`, [req.params.institutionId],
    )).rows,
  );
  res.json(rows);
}));

mfiRouter.post('/institutions/:institutionId/loans/:loanId/npl-classification', h(async (req, res) => {
  const body = z.object({ status: z.enum(['performing','watch','substandard','doubtful','loss']), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const event = await withInstitution(req.user!, req.params.institutionId, ['institution_admin','credit_manager','compliance'], async (client) => {
    const loan = (await client.query(
      `SELECT * FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE`, [req.params.institutionId, req.params.loanId],
    )).rows[0];
    if (!loan || !['disbursed','repaid'].includes(loan.status)) throw new HttpError(404, 'Serviced loan not found');
    if (loan.created_by === req.user!.id || loan.checked_by === req.user!.id || loan.disbursed_by === req.user!.id) {
      throw new HttpError(409, 'The loan originator, approver, or disburser cannot classify this loan');
    }
    if (loan.npl_status === body.status) throw new HttpError(409, `Loan is already classified as ${body.status}`);
    if ((await client.query(
      `SELECT 1 FROM mfi_npl_events WHERE institution_id=$1 AND loan_id=$2 AND status='pending_approval'`,
      [req.params.institutionId, loan.id],
    )).rowCount) throw new HttpError(409, 'An NPL classification is already awaiting independent review');
    {
      const active = (await client.query(
        `SELECT policy FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='active'`, [req.params.institutionId],
      )).rows[0];
      if (!active) throw new HttpError(409, 'An active delinquency policy is required for risk classification');
      const policy = creditPolicySchema.parse(active.policy);
      const due = (await client.query(
        `SELECT GREATEST(0,current_date-min(due_on) FILTER (WHERE status<>'paid' AND due_on<current_date))::int AS days_past_due
         FROM mfi_loan_installments WHERE institution_id=$1 AND loan_id=$2`,
        [req.params.institutionId, loan.id],
      )).rows[0];
      const dpd = Number(due?.days_past_due ?? 0);
      const minimumClass = dpd >= policy.delinquency.loss_days ? 'loss'
        : dpd >= policy.delinquency.doubtful_days ? 'doubtful'
          : dpd >= policy.delinquency.substandard_days ? 'substandard'
            : dpd >= policy.delinquency.watch_days ? 'watch' : 'performing';
      const rank = ['performing','watch','substandard','doubtful','loss'];
      if (rank.indexOf(body.status) < rank.indexOf(minimumClass)) {
        throw new HttpError(409, `Days past due (${dpd}) require at least ${minimumClass} classification under active policy`);
      }
    }
    const proposal = (await client.query(
      `INSERT INTO mfi_npl_events (institution_id,loan_id,prior_status,next_status,reason,proposed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.institutionId, loan.id, loan.npl_status, body.status, body.reason, req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_loan_classification_proposed', 'mfi_npl_event', proposal.id,
      { status: loan.npl_status }, { status: body.status, reason: body.reason });
    return proposal;
  });
  res.status(201).json(event);
}));

mfiRouter.post('/institutions/:institutionId/npl-events/:eventId/decision', h(async (req, res) => {
  const body = z.object({ decision: z.enum(['approve','reject']), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId, ['institution_admin','credit_manager'], async (client) => {
    const event = (await client.query(
      `SELECT * FROM mfi_npl_events WHERE institution_id=$1 AND id=$2 AND status='pending_approval' FOR UPDATE`,
      [req.params.institutionId, req.params.eventId],
    )).rows[0];
    if (!event) throw new HttpError(404, 'Pending NPL classification not found');
    if (event.proposed_by === req.user!.id) throw new HttpError(409, 'The classification proposer cannot approve their own proposal');
    const loan = (await client.query(
      `SELECT * FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE`,
      [req.params.institutionId, event.loan_id],
    )).rows[0];
    if (!loan || loan.npl_status !== event.prior_status) throw new HttpError(409, 'Loan classification changed after this proposal; submit a new assessment');
    if (body.decision === 'approve' && [loan.created_by, loan.disbursed_by].includes(req.user!.id)) {
      throw new HttpError(409, 'The loan originator or disburser cannot approve its risk classification');
    }
    if (body.decision === 'approve') {
      {
        const active = (await client.query(
          `SELECT policy FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='active'`, [req.params.institutionId],
        )).rows[0];
        if (!active) throw new HttpError(409, 'An active delinquency policy is required');
        const policy = creditPolicySchema.parse(active.policy);
        const due = (await client.query(
          `SELECT GREATEST(0,current_date-min(due_on) FILTER (WHERE status<>'paid' AND due_on<current_date))::int AS days_past_due
           FROM mfi_loan_installments WHERE institution_id=$1 AND loan_id=$2`, [req.params.institutionId, loan.id],
        )).rows[0];
        const dpd = Number(due?.days_past_due ?? 0);
        const minimumClass = dpd >= policy.delinquency.loss_days ? 'loss' : dpd >= policy.delinquency.doubtful_days ? 'doubtful'
          : dpd >= policy.delinquency.substandard_days ? 'substandard' : dpd >= policy.delinquency.watch_days ? 'watch' : 'performing';
        const rank = ['performing','watch','substandard','doubtful','loss'];
        if (rank.indexOf(event.next_status) < rank.indexOf(minimumClass)) {
          throw new HttpError(409, `Days past due (${dpd}) require at least ${minimumClass} classification under active policy`);
        }
      }
      await client.query(
        `UPDATE mfi_loans SET npl_status=$3,npl_classified_at=now(),npl_reason=$4 WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, loan.id, event.next_status, event.reason],
      );
    }
    const updated = (await client.query(
      `UPDATE mfi_npl_events SET status=$3,approved_by=$4,decision_reason=$5,reviewed_at=now()
       WHERE institution_id=$1 AND id=$2 RETURNING *`,
      [req.params.institutionId, event.id, body.decision === 'approve' ? 'approved' : 'rejected', req.user!.id, body.reason],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, `mfi_loan_classification_${body.decision}d`, 'mfi_npl_event', event.id,
      { status: 'pending_approval' }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(result);
}));

mfiRouter.post('/institutions/:institutionId/loans', h(async (req, res) => {
  const body = z.object({
    member_id: z.string().uuid(),
    product_id: z.string().uuid(),
    principal_amount: amountSchema,
    term_months: z.number().int().min(1).max(360),
    purpose: z.string().trim().min(10).max(1000),
    monthly_income: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/).refine((value) => decimalToCents(value) > 0n),
    monthly_expenses: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/),
    monthly_debt: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/),
  }).parse(req.body);
  const loan = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'loan_officer'], async (client) => {
    const member = (await client.query(
      'SELECT id, created_at FROM mfi_members WHERE institution_id=$1 AND id=$2 AND status=\'active\'',
      [req.params.institutionId, body.member_id],
    )).rows[0];
    const product = (await client.query(
      `SELECT id FROM mfi_products WHERE institution_id=$1 AND id=$2 AND product_type='loan' AND active`,
      [req.params.institutionId, body.product_id],
    )).rows[0];
    if (!member) throw new HttpError(404, 'Active member not found');
    if (!product) throw new HttpError(400, 'Choose an active loan product');
    const activePolicyRow = (await client.query(
      `SELECT version, policy FROM mfi_credit_policy_versions WHERE institution_id=$1 AND status='active'`, [req.params.institutionId],
    )).rows[0];
    if (!activePolicyRow) throw new HttpError(409, 'An approved credit policy must be configured before accepting loan applications');
    const policy = creditPolicySchema.parse(activePolicyRow.policy);
    const savingsBalance = (await client.query(
      `SELECT COALESCE(sum(l.credit-l.debit),0)::numeric(16,2) AS balance
       FROM mfi_member_accounts a JOIN mfi_journal_lines l ON l.institution_id=a.institution_id AND l.member_account_id=a.id
       JOIN mfi_journals j ON j.institution_id=l.institution_id AND j.id=l.journal_id AND j.status='posted'
       WHERE a.institution_id=$1 AND a.member_id=$2 AND a.account_type='savings'`,
      [req.params.institutionId, body.member_id],
    )).rows[0].balance as string;
    const history = (await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='repaid')::int AS repaid
       FROM mfi_loans WHERE institution_id=$1 AND member_id=$2 AND status IN ('repaid','cancelled')`,
      [req.params.institutionId, body.member_id],
    )).rows[0];
    const membershipDays = Math.max(0, Math.floor((Date.now() - new Date(member.created_at).getTime()) / 86400000));
    const assessment = scoreLoan({ policy, requestedAmount: body.principal_amount, termMonths: body.term_months,
      monthlyIncome: body.monthly_income, monthlyExpenses: body.monthly_expenses, monthlyDebt: body.monthly_debt,
      savingsBalance, membershipDays, priorLoans: history.total, repaidLoans: history.repaid });
    const row = (await client.query(
      `INSERT INTO mfi_loans (institution_id, member_id, product_id, principal_amount, term_months, purpose,
         monthly_income, monthly_expenses, monthly_debt, credit_score, credit_scorecard_version, credit_score_factors,
         application_submitted_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13) RETURNING *`,
      [req.params.institutionId, body.member_id, body.product_id, normalizeAmount(body.principal_amount), body.term_months,
        body.purpose, normalizeAmount(body.monthly_income), normalizeAmount(body.monthly_expenses), normalizeAmount(body.monthly_debt),
        assessment.score, activePolicyRow.version, JSON.stringify(assessment.factors), req.user!.id],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_loan_requested', 'mfi_loan', row.id, null, {
      member_id: row.member_id, principal_amount: row.principal_amount, term_months: row.term_months,
      credit_score: assessment.score, scorecard_version: activePolicyRow.version, factors: assessment.factors,
    });
    return { ...row, eligible_by_scorecard: assessment.eligible };
  });
  res.status(201).json(loan);
}));

mfiRouter.post('/institutions/:institutionId/loans/:loanId/decision', h(async (req, res) => {
  const body = z.object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(10).max(1000),
  }).parse(req.body);
  const loan = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'credit_manager'], async (client) => {
    const old = (await client.query(
      'SELECT * FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE',
      [req.params.institutionId, req.params.loanId],
    )).rows[0];
    if (!old) throw new HttpError(404, 'Loan request not found');
    if (old.status !== 'pending') throw new HttpError(409, `Loan is already ${old.status}`);
    if (old.created_by === req.user!.id) throw new HttpError(409, 'The loan originator cannot approve or reject their own request');
    if (body.decision === 'approve') {
      const scorecard = (await client.query(
        `SELECT policy FROM mfi_credit_policy_versions WHERE institution_id=$1 AND version=$2`,
        [req.params.institutionId, old.credit_scorecard_version],
      )).rows[0];
      if (!scorecard) throw new HttpError(409, 'The application scorecard is unavailable; reassess the application before approval');
      const policy = creditPolicySchema.parse(scorecard.policy);
      if (Number(old.credit_score ?? 0) < policy.scorecard.minimum_score ||
          Number(old.credit_score_factors?.debt_service_pct ?? 10000) > policy.scorecard.maximum_debt_service_pct) {
        throw new HttpError(409, 'The application does not meet the approved scorecard threshold; reject it or reassess under a new application');
      }
    }
    const updated = (await client.query(
      `UPDATE mfi_loans SET status=$3, checked_by=$4, decision_reason=$5, reviewed_at=now()
       WHERE institution_id=$1 AND id=$2 RETURNING *`,
      [req.params.institutionId, req.params.loanId, body.decision === 'approve' ? 'approved' : 'rejected', req.user!.id, body.reason],
    )).rows[0];
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_loan_' + body.decision + 'd', 'mfi_loan', old.id, { status: old.status }, {
      status: updated.status, reason: body.reason,
    });
    return updated;
  });
  res.json(loan);
}));

mfiRouter.post('/institutions/:institutionId/loans/:loanId/disburse', h(async (req, res) => {
  const body = z.object({ idempotency_key: z.string().uuid() }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'finance_manager'], async (client) => {
    const loan = (await client.query(
      `SELECT l.*, p.product_code FROM mfi_loans l JOIN mfi_products p ON p.id=l.product_id AND p.institution_id=l.institution_id
       WHERE l.institution_id=$1 AND l.id=$2 FOR UPDATE OF l`,
      [req.params.institutionId, req.params.loanId],
    )).rows[0];
    if (!loan) throw new HttpError(404, 'Loan request not found');
    const replay = await findJournalReplay(client, {
      institutionId: req.params.institutionId, idempotencyKey: body.idempotency_key,
      type: 'loan_disbursement', memberAccountId: null, loanId: req.params.loanId,
      amount: String(loan.principal_amount),
    });
    if (replay) {
      const accountId = (await client.query(
        `SELECT member_account_id FROM mfi_journal_lines
         WHERE institution_id=$1 AND journal_id=$2 AND member_account_id IS NOT NULL LIMIT 1`,
        [req.params.institutionId, replay.id],
      )).rows[0]?.member_account_id;
      const account = accountId ? (await client.query(
        'SELECT * FROM mfi_member_accounts WHERE institution_id=$1 AND id=$2',
        [req.params.institutionId, accountId],
      )).rows[0] : null;
      return { loan_id: req.params.loanId, account, journal: replay };
    }
    if (loan.status !== 'approved') throw new HttpError(409, 'Only an approved loan can be disbursed');
    if (loan.created_by === req.user!.id || loan.checked_by === req.user!.id) {
      throw new HttpError(409, 'The loan originator and approver cannot disburse this loan');
    }
    await lockCashAccount(client, req.params.institutionId);
    if (decimalToCents(await cashBalance(client, req.params.institutionId)) < decimalToCents(String(loan.principal_amount))) {
      throw new HttpError(409, 'The institution has insufficient cash to disburse this loan');
    }
    const account = (await client.query(
      `INSERT INTO mfi_member_accounts (institution_id, member_id, product_id, account_number, account_type, opened_by)
       VALUES ($1,$2,$3,'L-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),'loan',$4)
       RETURNING *`,
      [req.params.institutionId, loan.member_id, loan.product_id, req.user!.id],
    )).rows[0];
    const journal = await postJournal(client, {
      institutionId: req.params.institutionId,
      idempotencyKey: body.idempotency_key,
      type: 'loan_disbursement',
      memberAccountId: null,
      loanId: loan.id,
      amount: String(loan.principal_amount),
      actorId: req.user!.id,
      lines: [
        { code: '1300', memberAccountId: account.id, debit: String(loan.principal_amount), credit: '0' },
        { code: '1000', debit: '0', credit: String(loan.principal_amount) },
      ],
    });
    await client.query(
      `UPDATE mfi_loans SET status='disbursed', member_account_id=$3, disbursed_by=$4, disbursed_at=now()
       WHERE institution_id=$1 AND id=$2`,
      [req.params.institutionId, loan.id, account.id, req.user!.id],
    );
    const firstDueOn = (await client.query("SELECT (current_date + interval '1 month')::date::text AS due_on")).rows[0].due_on as string;
    for (const installment of principalSchedule(String(loan.principal_amount), Number(loan.term_months), firstDueOn)) {
      await client.query(
        `INSERT INTO mfi_loan_installments (institution_id, loan_id, installment_no, due_on, principal_due)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.institutionId, loan.id, installment.installment_no, installment.due_on, installment.principal_due],
      );
    }
    await auditMfi(client, req.params.institutionId, req.user!.id, 'mfi_loan_disbursed', 'mfi_loan', loan.id, { status: loan.status }, {
      status: 'disbursed', account_number: account.account_number, journal_id: journal.id,
      principal_only_schedule: Number(loan.term_months), first_due_on: firstDueOn,
    });
    return { loan_id: loan.id, account, journal };
  });
  res.status(result.journal.replayed ? 200 : 201).json(result);
}));

mfiRouter.post('/institutions/:institutionId/loans/:loanId/repay', h(async (req, res) => {
  const body = z.object({ ...transactionBody.shape }).parse(req.body);
  const result = await withInstitution(req.user!, req.params.institutionId, ['institution_admin', 'finance_manager', 'teller'], async (client) => {
    const loan = (await client.query(
      `SELECT * FROM mfi_loans WHERE institution_id=$1 AND id=$2 FOR UPDATE`,
      [req.params.institutionId, req.params.loanId],
    )).rows[0];
    if (loan) {
      const replay = await findJournalReplay(client, {
        institutionId: req.params.institutionId, idempotencyKey: body.idempotency_key,
        type: 'loan_repayment', memberAccountId: null, loanId: req.params.loanId, amount: body.amount,
      });
      if (replay) return replay;
    }
    if (!loan || !['disbursed', 'repaid'].includes(loan.status) || !loan.member_account_id) {
      throw new HttpError(409, 'Only a disbursed loan can receive a repayment');
    }
    const outstanding = decimalToCents(String(loan.principal_amount)) - decimalToCents(String(loan.principal_repaid));
    if (decimalToCents(body.amount) > outstanding) throw new HttpError(409, 'Principal repayment cannot exceed the outstanding principal');
    await lockCashAccount(client, req.params.institutionId);
    const journal = await postJournal(client, {
      institutionId: req.params.institutionId,
      idempotencyKey: body.idempotency_key,
      type: 'loan_repayment',
      memberAccountId: null,
      loanId: loan.id,
      amount: body.amount,
      actorId: req.user!.id,
      lines: [
        { code: '1000', debit: normalizeAmount(body.amount), credit: '0' },
        { code: '1300', memberAccountId: loan.member_account_id, debit: '0', credit: normalizeAmount(body.amount) },
      ],
    });
    if (!journal.replayed) {
      const paid = decimalToCents(String(loan.principal_repaid)) + decimalToCents(body.amount);
      const repaid = paid === decimalToCents(String(loan.principal_amount));
      await client.query(
        `UPDATE mfi_loans SET principal_repaid=$3, status=$4 WHERE institution_id=$1 AND id=$2`,
        [req.params.institutionId, loan.id, centsToAmount(paid), repaid ? 'repaid' : 'disbursed'],
      );
      await allocateLoanPrincipal(client, req.params.institutionId, loan.id, centsToAmount(paid));
    }
    return journal;
  });
  res.status(result.replayed ? 200 : 201).json(result);
}));
