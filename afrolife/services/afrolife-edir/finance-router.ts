import { createHash } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../src/auth-types.js';
import { HttpError } from '../../src/http-error.js';
import { withUser } from './db.js';
import { edirCashPostings, formatEdirMoney, parseEdirMoney } from './money.js';

const platformAdmin = (user: AuthUser) => user.role === 'global_admin' || user.role === 'super_admin';
const makerRoles = ['edir_admin', 'finance_manager', 'treasurer'];
const readerRoles = [...makerRoles, 'credit_officer', 'credit_manager', 'compliance', 'auditor'];

async function hasStaffRole(user: AuthUser, roles: string[], client?: PoolClient) {
  if (platformAdmin(user)) return true;
  const check = async (db: PoolClient) => Boolean((await db.query(
    `SELECT 1 FROM edir_staff
     WHERE user_id=$1 AND active AND role = ANY($2::text[])`,
    [user.id, roles],
  )).rowCount);
  return client ? check(client) : withUser(user, check);
}

function requireStaffRole(roles: string[], message: string): RequestHandler {
  return (req, _res, next) => {
    hasStaffRole(req.user!, roles).then(
      (allowed) => next(allowed ? undefined : new HttpError(403, message)),
      next,
    );
  };
}

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

async function audit(
  client: PoolClient,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown = null,
  newValue: unknown = null,
) {
  await client.query(
    `INSERT INTO edir_audit_logs (actor_id, action, entity, entity_id, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, entity, entityId, oldValue === null ? null : JSON.stringify(oldValue),
      newValue === null ? null : JSON.stringify(newValue)],
  );
}

const moneyText = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const positiveMoneyText = moneyText.refine((value) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) > 0n;
});

async function transactionRow(client: PoolClient, id: string) {
  return (await client.query(
    `SELECT t.id, t.member_account_id, t.direction, t.amount::text, t.status,
            t.created_by, t.reviewed_by, t.reviewed_at, t.review_reason, t.created_at,
            t.reverses_transaction_id, t.reversal_reason,
            j.id AS journal_id
     FROM edir_financial_transactions t
     LEFT JOIN edir_financial_journals j ON j.transaction_id=t.id
     WHERE t.id=$1`,
    [id],
  )).rows[0];
}

export const edirFinanceRouter = Router();

edirFinanceRouter.get('/me', h(async (req, res) => {
  const result = await withUser(req.user!, async (client) => {
    const membership = (await client.query(
      `SELECT id, member_number, status FROM edir_memberships WHERE user_id=$1`,
      [req.user!.id],
    )).rows[0] ?? null;
    if (!membership || membership.status !== 'active') return { membership, accounts: [], transactions: [] };
    const accounts = (await client.query(
      `SELECT ma.id, p.product_code, p.name AS product_name, p.product_type, p.withdrawals_allowed, ma.status, ma.opened_at,
              edir_loan_account_balance(ma.id)::text AS balance,p.minimum_balance::text
       FROM edir_member_accounts ma
       JOIN edir_financial_products p ON p.id=ma.product_id
       WHERE ma.member_id=$1
       ORDER BY ma.opened_at DESC`,
      [membership.id],
    )).rows;
    const transactions = (await client.query(
      `SELECT t.id, t.direction, t.amount::text, t.status, t.created_at, t.reviewed_at, t.review_reason,
              t.reverses_transaction_id, t.reversal_reason, j.id AS journal_id
       FROM edir_financial_transactions t
       JOIN edir_member_accounts ma ON ma.id=t.member_account_id
       LEFT JOIN edir_financial_journals j ON j.transaction_id=t.id
       WHERE ma.member_id=$1 ORDER BY t.created_at DESC LIMIT 100`,
      [membership.id],
    )).rows;
    return { membership, accounts, transactions };
  });
  res.json(result);
}));

edirFinanceRouter.get('/products', h(async (req, res) => {
  const products = await withUser(req.user!, async (client) => (await client.query(
    `SELECT p.id, p.product_code, p.name, p.product_type, p.minimum_balance::text, p.withdrawals_allowed,
            p.status, p.created_by, p.reviewed_by, p.reviewed_at, p.review_reason, p.created_at
     FROM edir_financial_products p ORDER BY p.created_at DESC`,
  )).rows);
  res.json(products);
}));

edirFinanceRouter.post('/products', requireStaffRole(makerRoles, 'Edir financial product setup access is required'), h(async (req, res) => {
  const body = z.object({
    product_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
    name: z.string().trim().min(2).max(100),
    product_type: z.enum(['savings', 'share', 'contribution']),
    minimum_balance: moneyText,
    withdrawals_allowed: z.boolean(),
  }).strict().refine(
    (value) => value.product_type !== 'contribution' || !value.withdrawals_allowed,
    'Contribution accounts cannot be withdrawn without a separate approved benefit policy',
  ).parse(req.body);
  const minimumBalance = formatEdirMoney(parseEdirMoney(body.minimum_balance, true));
  const product = await withUser(req.user!, async (client) => {
    const ledgerCode = body.product_type === 'savings' ? '2100'
      : body.product_type === 'contribution' ? '2200' : '3100';
    const ledgerAccount = (await client.query(
      'SELECT id FROM edir_ledger_accounts WHERE code=$1 AND active',
      [ledgerCode],
    )).rows[0];
    if (!ledgerAccount) throw new HttpError(503, 'Required Edir ledger account is unavailable');
    const created = (await client.query(
      `INSERT INTO edir_financial_products
       (product_code, name, product_type, ledger_account_id, minimum_balance, withdrawals_allowed, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, product_code, name, product_type, minimum_balance::text, withdrawals_allowed, status, created_by, created_at`,
      [body.product_code, body.name, body.product_type, ledgerAccount.id, minimumBalance, body.withdrawals_allowed, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_financial_product_created', 'edir_financial_product', created.id, null, created);
    return created;
  });
  res.status(201).json(product);
}));

edirFinanceRouter.post('/products/:id/decision', requireStaffRole(makerRoles, 'Edir financial product approval access is required'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    decision: z.enum(['active', 'rejected']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const product = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, product_code, status, created_by FROM edir_financial_products WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir financial product was not found');
    if (current.created_by === req.user!.id) throw new HttpError(403, 'A different financial administrator must review this product');
    if (current.status !== 'pending') throw new HttpError(409, 'This financial product has already been reviewed');
    const updated = (await client.query(
      `UPDATE edir_financial_products SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4
       WHERE id=$1 RETURNING id, product_code, name, product_type, status, reviewed_by, reviewed_at, review_reason`,
      [id, body.decision, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, `edir_financial_product_${body.decision}`, 'edir_financial_product', id,
      { status: current.status }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(product);
}));

edirFinanceRouter.post('/products/:id/lifecycle', requireStaffRole(makerRoles, 'Edir financial product lifecycle access is required'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    status: z.enum(['active', 'paused']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const product = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, product_code, status, created_by FROM edir_financial_products WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir financial product was not found');
    if (current.created_by === req.user!.id) throw new HttpError(403, 'A different financial administrator must change this product lifecycle');
    if (!((current.status === 'active' && body.status === 'paused')
      || (current.status === 'paused' && body.status === 'active'))) {
      throw new HttpError(409, 'This Edir financial product lifecycle transition is not allowed');
    }
    const updated = (await client.query(
      `UPDATE edir_financial_products SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4
       WHERE id=$1 RETURNING id, product_code, name, status, reviewed_by, reviewed_at, review_reason`,
      [id, body.status, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_financial_product_lifecycle_changed', 'edir_financial_product', id,
      { status: current.status }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(product);
}));

edirFinanceRouter.get('/accounts', requireStaffRole(readerRoles, 'Edir financial registry access is required'), h(async (_req, res) => {
  const accounts = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT ma.id, m.id AS member_id, m.member_number, m.full_name, p.product_code, p.name AS product_name,
            p.product_type, p.withdrawals_allowed, ma.status, ma.opened_at,
            coalesce(sum(CASE WHEN j.status='posted' THEN l.credit-l.debit ELSE 0 END),0)::text AS balance,
            p.minimum_balance::text
     FROM edir_member_accounts ma
     JOIN edir_memberships m ON m.id=ma.member_id
     JOIN edir_financial_products p ON p.id=ma.product_id
     LEFT JOIN edir_financial_journal_lines l ON l.member_account_id=ma.id
     LEFT JOIN edir_financial_journals j ON j.id=l.journal_id AND j.status='posted'
     GROUP BY ma.id, m.id, p.id ORDER BY ma.opened_at DESC`,
  )).rows);
  res.json(accounts);
}));

edirFinanceRouter.post('/accounts', h(async (req, res) => {
  const body = z.object({ product_id: z.string().uuid() }).strict().parse(req.body);
  const account = await withUser(req.user!, async (client) => {
    const membership = (await client.query(
      "SELECT id FROM edir_memberships WHERE user_id=$1 AND status='active'",
      [req.user!.id],
    )).rows[0];
    if (!membership) throw new HttpError(403, 'An active AfroLife Edir membership is required to open a financial account');
    const product = (await client.query(
      "SELECT id FROM edir_financial_products WHERE id=$1 AND status='active'",
      [body.product_id],
    )).rows[0];
    if (!product) throw new HttpError(404, 'An active Edir financial product was not found');
    const created = (await client.query(
      `INSERT INTO edir_member_accounts (member_id, product_id, opened_by)
       VALUES ($1,$2,$3)
       RETURNING id, member_id, product_id, status, opened_at`,
      [membership.id, product.id, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_financial_account_opened', 'edir_member_account', created.id, null, created);
    return created;
  });
  res.status(201).json(account);
}));

edirFinanceRouter.post('/transactions', h(async (req, res) => {
  const body = z.object({
    member_account_id: z.string().uuid(),
    direction: z.enum(['deposit', 'withdrawal', 'contribution']),
    amount: positiveMoneyText,
    idempotency_key: z.string().uuid(),
  }).strict().parse(req.body);
  const amountCents = parseEdirMoney(body.amount);
  const amount = formatEdirMoney(amountCents);
  const payloadHash = createHash('sha256').update(
    `${body.member_account_id}\n${body.direction}\n${amountCents}`,
  ).digest('hex');
  const result = await withUser(req.user!, async (client) => {
    const operator = await hasStaffRole(req.user!, makerRoles, client);
    if (!operator && body.direction !== 'withdrawal') {
      throw new HttpError(403, 'Only authorized Edir financial staff can record a deposit or contribution');
    }
    const existing = (await client.query(
      `SELECT id, payload_hash FROM edir_financial_transactions
       WHERE created_by=$1 AND idempotency_key=$2`,
      [req.user!.id, body.idempotency_key],
    )).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency key was already used for a different Edir request');
      return { transaction: await transactionRow(client, existing.id), created: false };
    }
    const account = (await client.query(
      `SELECT ma.id, ma.status AS account_status, p.product_type, p.status AS product_status, p.withdrawals_allowed,
              m.status AS member_status
       FROM edir_member_accounts ma
       JOIN edir_financial_products p ON p.id=ma.product_id
       JOIN edir_memberships m ON m.id=ma.member_id
       WHERE ma.id=$1`,
      [body.member_account_id],
    )).rows[0];
    if (!account) throw new HttpError(404, 'Edir financial account was not found');
    if (account.account_status !== 'active' || account.product_status !== 'active' || account.member_status !== 'active') {
      throw new HttpError(409, 'An active Edir member account and product are required');
    }
    if ((body.direction === 'contribution' && account.product_type !== 'contribution')
      || (body.direction !== 'contribution' && !['savings', 'share'].includes(account.product_type))) {
      throw new HttpError(422, 'This financial transaction does not match the account product');
    }
    if (body.direction === 'withdrawal' && !account.withdrawals_allowed) {
      throw new HttpError(403, 'Withdrawals are not enabled for this Edir product');
    }
    const created = (await client.query(
      `INSERT INTO edir_financial_transactions
       (member_account_id, direction, amount, idempotency_key, payload_hash, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (created_by,idempotency_key) DO NOTHING
       RETURNING id`,
      [body.member_account_id, body.direction, amount, body.idempotency_key, payloadHash, req.user!.id],
    )).rows[0];
    const transactionId = created?.id ?? (await client.query(
      `SELECT id, payload_hash FROM edir_financial_transactions
       WHERE created_by=$1 AND idempotency_key=$2`,
      [req.user!.id, body.idempotency_key],
    )).rows[0]?.id;
    if (!transactionId) throw new HttpError(409, 'The Edir request could not be recorded; retry with a new idempotency key');
    const persisted = (await client.query(
      'SELECT id, payload_hash FROM edir_financial_transactions WHERE id=$1',
      [transactionId],
    )).rows[0];
    if (persisted.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency key was already used for a different Edir request');
    if (!created) return { transaction: await transactionRow(client, transactionId), created: false };
    const transaction = await transactionRow(client, transactionId);
    await audit(client, req.user!.id, 'edir_financial_transaction_requested', 'edir_financial_transaction', transactionId,
      null, { direction: body.direction, amount, member_account_id: body.member_account_id });
    return { transaction, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.transaction);
}));

edirFinanceRouter.get('/transactions', requireStaffRole(readerRoles, 'Edir financial registry access is required'), h(async (_req, res) => {
  const transactions = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT t.id, t.member_account_id, m.member_number, m.full_name, p.product_code, p.name AS product_name,
            t.direction, t.amount::text, t.status, t.created_by, t.reviewed_by, t.reviewed_at,
            t.review_reason, t.created_at, t.reverses_transaction_id, t.reversal_reason,
            EXISTS (SELECT 1 FROM edir_financial_transactions r
                    WHERE r.reverses_transaction_id=t.id AND r.status='approved') AS reversed,
            j.id AS journal_id
     FROM edir_financial_transactions t
     JOIN edir_member_accounts ma ON ma.id=t.member_account_id
     JOIN edir_memberships m ON m.id=ma.member_id
     JOIN edir_financial_products p ON p.id=ma.product_id
     LEFT JOIN edir_financial_journals j ON j.transaction_id=t.id
     ORDER BY t.created_at DESC`,
  )).rows);
  res.json(transactions);
}));

edirFinanceRouter.post('/transactions/:id/reversal', requireStaffRole(makerRoles, 'Edir financial reversal access is required'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    reason: z.string().trim().min(10).max(1000),
    idempotency_key: z.string().uuid(),
  }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const source = (await client.query(
      `SELECT t.id, t.member_account_id, t.direction, t.amount::text, t.status,
              t.created_by, t.reviewed_by, j.id AS journal_id,
              EXISTS (SELECT 1 FROM edir_financial_transactions r
                      WHERE r.reverses_transaction_id=t.id AND r.status='approved') AS reversed
       FROM edir_financial_transactions t
       JOIN edir_financial_journals j ON j.transaction_id=t.id AND j.status='posted'
       WHERE t.id=$1 FOR UPDATE OF t`,
      [id],
    )).rows[0];
    if (!source) throw new HttpError(404, 'Posted Edir financial transaction was not found');
    if (source.status !== 'approved' || !['deposit', 'withdrawal'].includes(source.direction)) {
      throw new HttpError(409, 'Only posted deposits or withdrawals can be reversed');
    }
    if ([source.created_by, source.reviewed_by].includes(req.user!.id)) {
      throw new HttpError(403, 'A different Edir financial administrator must request the reversal');
    }
    const payloadHash = createHash('sha256').update(
      `${id}\n${source.member_account_id}\n${source.amount}\n${body.reason.trim()}`,
    ).digest('hex');
    const existing = (await client.query(
      `SELECT id, payload_hash FROM edir_financial_transactions
       WHERE created_by=$1 AND idempotency_key=$2`,
      [req.user!.id, body.idempotency_key],
    )).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency key was already used for a different Edir request');
      return { transaction: await transactionRow(client, existing.id), created: false };
    }
    if (source.reversed) throw new HttpError(409, 'This Edir transaction has already been reversed');
    const inserted = (await client.query(
      `INSERT INTO edir_financial_transactions
       (member_account_id, direction, amount, reverses_transaction_id, reversal_reason,
        idempotency_key, payload_hash, created_by)
       VALUES ($1,'reversal',$2,$3,$4,$5,$6,$7)
       ON CONFLICT (created_by,idempotency_key) DO NOTHING
       RETURNING id`,
      [source.member_account_id, source.amount, id, body.reason.trim(), body.idempotency_key, payloadHash, req.user!.id],
    )).rows[0];
    const reversalId = inserted?.id ?? (await client.query(
      'SELECT id, payload_hash FROM edir_financial_transactions WHERE created_by=$1 AND idempotency_key=$2',
      [req.user!.id, body.idempotency_key],
    )).rows[0]?.id;
    if (!reversalId) throw new HttpError(409, 'The Edir reversal could not be recorded; retry with a new idempotency key');
    const persisted = (await client.query(
      'SELECT payload_hash FROM edir_financial_transactions WHERE id=$1',
      [reversalId],
    )).rows[0];
    if (persisted.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency key was already used for a different Edir request');
    if (!inserted) return { transaction: await transactionRow(client, reversalId), created: false };
    const transaction = await transactionRow(client, reversalId);
    await audit(client, req.user!.id, 'edir_financial_reversal_requested', 'edir_financial_transaction', reversalId,
      null, { reverses_transaction_id: id, amount: source.amount, reason: body.reason.trim() });
    return { transaction, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.transaction);
}));

edirFinanceRouter.post('/transactions/:id/decision', requireStaffRole(makerRoles, 'Edir financial approval access is required'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const transaction = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, member_account_id, direction, amount::text, status, created_by, reverses_transaction_id FROM edir_financial_transactions WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir financial transaction was not found');
    if (current.created_by === req.user!.id) throw new HttpError(403, 'A different financial administrator must review this transaction');
    if (current.status !== 'pending') throw new HttpError(409, 'This Edir financial transaction has already been reviewed');
    const updated = (await client.query(
      `UPDATE edir_financial_transactions SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4
       WHERE id=$1 RETURNING id, member_account_id, direction, amount::text, status, reviewed_by, reviewed_at, review_reason`,
      [id, body.decision, req.user!.id, body.reason],
    )).rows[0];
    let journalId: string | null = null;
    if (body.decision === 'approved') {
      const mapping = (await client.query(
        `SELECT p.ledger_account_id AS member_ledger_account_id, cash.id AS cash_ledger_account_id
         FROM edir_member_accounts ma
         JOIN edir_financial_products p ON p.id=ma.product_id
         JOIN edir_ledger_accounts cash ON cash.code='1000' AND cash.active
         WHERE ma.id=$1`,
        [updated.member_account_id],
      )).rows[0];
      if (!mapping) throw new HttpError(503, 'Required Edir ledger mappings are unavailable');
      let postingDirection = updated.direction;
      if (updated.direction === 'reversal') {
        const original = (await client.query(
          'SELECT direction FROM edir_financial_transactions WHERE id=$1',
          [updated.reverses_transaction_id],
        )).rows[0];
        if (!original) throw new HttpError(409, 'The original Edir transaction is unavailable');
        postingDirection = original.direction === 'deposit' ? 'withdrawal' : 'deposit';
      }
      journalId = (await client.query(
        `INSERT INTO edir_financial_journals (transaction_id, amount)
         VALUES ($1,$2) RETURNING id`,
        [id, updated.amount],
      )).rows[0].id;
      for (const line of edirCashPostings(postingDirection, updated.amount)) {
        await client.query(
          `INSERT INTO edir_financial_journal_lines
           (journal_id, ledger_account_id, member_account_id, debit, credit)
           VALUES ($1,$2,$3,$4,$5)`,
          [journalId,
            line.account === 'cash' ? mapping.cash_ledger_account_id : mapping.member_ledger_account_id,
            line.account === 'member' ? updated.member_account_id : null,
            line.debit, line.credit],
        );
      }
      await client.query(
        `UPDATE edir_financial_journals SET status='posted', posted_by=$2, posted_at=now() WHERE id=$1`,
        [journalId, req.user!.id],
      );
    }
    await audit(client, req.user!.id, `edir_financial_transaction_${body.decision}`, 'edir_financial_transaction', id,
      { status: current.status }, { status: updated.status, reason: body.reason, journal_id: journalId });
    return { ...updated, journal_id: journalId };
  });
  res.json(transaction);
}));
