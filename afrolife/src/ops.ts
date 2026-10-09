import { Router, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import { pool, withUser, requireRole, HttpError } from './core.js';
import { audit, post } from './domain.js';
import { notify } from './notify.js';
import { rentSchedule, endDate } from './rent.js';
import { refundLimit } from './refunds.js';
import { loadRules } from './domain.js';
import { Phone } from './validators.js';

export const ops = Router();
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const AGENT = ['master_agent', 'field_agent'];

// ================= Disputes =================
ops.post('/disputes', requireRole(...AGENT, 'super_admin', 'compliance'), h(async (req, res) => {
  const b = z.object({ contract_id: z.string().uuid(), category: z.enum(['payment', 'service', 'worker_conduct', 'fees', 'other']), description: z.string().min(10) }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT 1 FROM contracts WHERE id = $1', [b.contract_id])).rowCount) throw new HttpError(404, 'Contract not found');
    const r = await c.query('INSERT INTO disputes (contract_id, category, description, opened_by) VALUES ($1,$2,$3,$4) RETURNING *', [b.contract_id, b.category, b.description, req.user!.id]);
    await audit(c, req.user!.id, 'dispute_opened', 'dispute', r.rows[0].id, null, { category: b.category });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

ops.get('/disputes', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query('SELECT d.*, k.contract_no FROM disputes d JOIN contracts k ON k.id = d.contract_id ORDER BY d.opened_at DESC LIMIT 200')).rows));
}));

ops.post('/disputes/:id/assign', requireRole('super_admin'), h(async (req, res) => {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const r = await c.query("UPDATE disputes SET assigned_to = $2, status = 'investigating' WHERE id = $1 AND status <> 'resolved' RETURNING *", [req.params.id, user_id]);
    if (!r.rowCount) throw new HttpError(409, 'Dispute not found or already resolved');
    await audit(c, req.user!.id, 'dispute_assigned', 'dispute', String(req.params.id), null, { user_id });
    return r.rows[0];
  }));
}));

/** Resolving may include a refund. The refund is a new ledger transaction, never an edit of the original one. */
ops.post('/disputes/:id/resolve', requireRole('super_admin', 'compliance'), h(async (req, res) => {
  const b = z.object({ resolution: z.string().min(10), refund_amount: z.number().nonnegative().transform((x) => Math.round(x * 100) / 100).default(0), refund_kind: z.enum(['fee', 'guarantee']).optional() }).parse(req.body);
  if (b.refund_amount > 0 && !b.refund_kind) throw new HttpError(400, 'Say whether this refunds fees or the guarantee');
  if (b.refund_amount > 0 && req.user!.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can approve a refund');
  res.json(await withUser(req.user!, async (c) => {
    const d = (await c.query('SELECT * FROM disputes WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!d) throw new HttpError(404, 'Dispute not found');
    if (d.status === 'resolved') throw new HttpError(409, 'Already resolved');
    if (d.opened_by === req.user!.id) throw new HttpError(403, 'The person who opened a dispute cannot resolve it');
    const k = (await c.query('SELECT * FROM contracts WHERE id = $1', [d.contract_id])).rows[0];
    if (b.refund_amount > 0) {
      if (!['active', 'completed', 'closed'].includes(k.state)) throw new HttpError(422, 'Nothing was collected on this contract yet');
      // Two disputes on one contract could otherwise both pass the limit check below and refund more than was collected.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['refund:' + d.contract_id]);
      const done = Number((await c.query("SELECT coalesce(sum(refund_amount),0) AS s FROM disputes WHERE contract_id = $1 AND refund_kind = $2 AND status = 'resolved'", [d.contract_id, b.refund_kind])).rows[0].s);
      const rules = await loadRules(c);
      const capPercent = b.refund_kind === 'guarantee' ? rules.refund_guarantee_cap_pct : rules.refund_fee_cap_pct;
      const limit = refundLimit(k, b.refund_kind!, done, capPercent ?? 100);
      if (b.refund_amount > limit) throw new HttpError(422, `Refund is more than was collected. The most that can still be refunded is ETB ${limit}.`);
      await post(c, 'dispute', d.id, b.refund_kind === 'guarantee'
        ? [['Guarantee Liability', b.refund_amount, 0], ['Cash', 0, b.refund_amount]]
        : [['Refunds', b.refund_amount, 0], ['Cash', 0, b.refund_amount]]);
    }
    const r = await c.query("UPDATE disputes SET status = 'resolved', resolution = $2, refund_amount = $3, refund_kind = $4, resolved_by = $5, closed_at = now() WHERE id = $1 RETURNING *",
      [d.id, b.resolution, b.refund_amount, b.refund_amount > 0 ? b.refund_kind : null, req.user!.id]);
    await audit(c, req.user!.id, 'dispute_resolved', 'dispute', d.id, { status: d.status }, { refund: b.refund_amount, kind: b.refund_kind ?? null });
    await notify(c, k.source_agent_id, 'dispute_resolved', { contract_no: k.contract_no });
    return r.rows[0];
  }));
}));

// ================= Tenants =================
ops.post('/tenants', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const b = z.object({ name: z.string().min(2), phone: Phone, national_id: z.string().min(5).optional() }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const r = await c.query('INSERT INTO tenants (name, phone, national_id, source_agent_id) VALUES ($1,$2,$3,$4) RETURNING *', [b.name, b.phone, b.national_id ?? null, req.user!.id]);
    await audit(c, req.user!.id, 'tenant_created', 'tenant', r.rows[0].id, null, { name: b.name });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

ops.get('/tenants', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, name, phone, source_agent_id, created_at FROM tenants ORDER BY created_at DESC LIMIT 200',
  )).rows));
}));

// ================= Leases and rent =================
const LeaseIn = z.object({
  unit_id: z.string().uuid(), tenant_id: z.string().uuid(), rent: z.number().positive(), deposit: z.number().nonnegative().default(0),
  start_date: z.string().date(), months: z.number().int().min(1).max(120), due_day: z.number().int().min(1).max(28).optional(),
});

ops.post('/leases', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const row = await withUser(req.user!, async (c) => {
    const b = LeaseIn.parse(req.body);
    const rules = await loadRules(c);
    const maxMonths = rules.lease_max_months ?? 24;
    if (b.months > maxMonths) throw new HttpError(422, `Lease term cannot exceed ${maxMonths} months.`);
    const dueDay = b.due_day ?? rules.lease_default_due_day ?? 5;
    const u = (await c.query('SELECT u.id, u.occupancy, p.source_agent_id FROM property_units u JOIN properties p ON p.id = u.property_id WHERE u.id = $1 FOR UPDATE OF u', [b.unit_id])).rows[0]; // RLS: must be your unit. The row lock stops two agents leasing the same vacant unit at once.
    if (!u) throw new HttpError(404, 'Unit not found');
    if (u.occupancy !== 'vacant') throw new HttpError(409, 'This unit is not vacant');
    if (!(await c.query('SELECT 1 FROM tenants WHERE id = $1', [b.tenant_id])).rowCount) throw new HttpError(404, 'Tenant not found');
    const lease = (await c.query(
      'INSERT INTO leases (unit_id, tenant_id, rent, deposit, start_date, end_date, source_agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [b.unit_id, b.tenant_id, b.rent, b.deposit, b.start_date, endDate(b.start_date, b.months), u.source_agent_id],
    )).rows[0];
    for (const s of rentSchedule(b.start_date, b.months, b.rent, dueDay)) {
      await c.query('INSERT INTO rent_charges (lease_id, period, due_on, amount) VALUES ($1,$2,$3,$4)', [lease.id, s.period, s.due_on, s.amount]);
    }
    await c.query("UPDATE property_units SET occupancy = 'occupied' WHERE id = $1", [b.unit_id]);
    await audit(c, req.user!.id, 'lease_created', 'lease', lease.id, null, { unit: b.unit_id, months: b.months, rent: b.rent });
    return lease;
  });
  res.status(201).json(row);
}));

ops.get('/leases', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT l.*, t.name AS tenant_name, u.unit_no, p.address,
       (SELECT count(*)::int FROM rent_charges r WHERE r.lease_id = l.id AND r.status = 'due' AND r.due_on < current_date) AS overdue_count
     FROM leases l JOIN property_units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN tenants t ON t.id = l.tenant_id
     ORDER BY l.created_at DESC LIMIT 200`)).rows));
}));

ops.get('/leases/:id/charges', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    "SELECT id, period, due_on, amount, paid_at, payment_ref, CASE WHEN status = 'due' AND due_on < current_date THEN 'overdue' ELSE status END AS status FROM rent_charges WHERE lease_id = $1 ORDER BY period", [req.params.id])).rows));
}));

ops.get('/leases/:id/payments', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, kind, amount, channel, reference, reason, status, recorded_by, reconciled_by, created_at, reconciled_at FROM rent_transactions WHERE lease_id = $1 ORDER BY created_at DESC',
    [req.params.id],
  )).rows));
}));

ops.post('/leases/:id/end', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const l = (await c.query("UPDATE leases SET status = 'ended' WHERE id = $1 AND status = 'active' RETURNING *", [req.params.id])).rows[0];
    if (!l) throw new HttpError(404, 'Active lease not found');
    await c.query("UPDATE rent_charges SET status = 'waived' WHERE lease_id = $1 AND status = 'due' AND period > current_date", [l.id]); // future months only
    await c.query("UPDATE property_units SET occupancy = 'vacant' WHERE id = $1", [l.unit_id]);
    await audit(c, req.user!.id, 'lease_ended', 'lease', l.id);
    return l;
  }));
}));

ops.post('/charges/:id/pay', requireRole('finance', 'finance_manager', 'super_admin'), h(async (req, res) => {
  const { reference, channel } = z.object({ reference: z.string().trim().min(3).max(200), channel: z.string().trim().min(2).max(40).default('manual') }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const charge = (await c.query('SELECT r.*, l.id AS lease_id FROM rent_charges r JOIN leases l ON l.id = r.lease_id WHERE r.id = $1 FOR UPDATE OF r', [req.params.id])).rows[0];
    if (!charge || charge.status !== 'due') throw new HttpError(409, 'Charge not found or already settled');
    if (await c.query("SELECT 1 FROM rent_transactions WHERE rent_charge_id = $1 AND kind = 'rent' AND status <> 'void'", [charge.id]).then((x) => x.rowCount)) throw new HttpError(409, 'A payment is already awaiting reconciliation for this charge');
    if (await c.query('SELECT 1 FROM rent_transactions WHERE reference = $1', [reference]).then((x) => x.rowCount)) throw new HttpError(409, 'That payment reference has already been used');
    const r = await c.query(
      `INSERT INTO rent_transactions (lease_id, rent_charge_id, kind, amount, channel, reference, recorded_by)
       VALUES ($1,$2,'rent',$3,$4,$5,$6) RETURNING *`,
      [charge.lease_id, charge.id, charge.amount, channel, reference, req.user!.id],
    );
    await audit(c, req.user!.id, 'rent_payment_recorded', 'rent_transaction', r.rows[0].id, null, { reference, amount: charge.amount });
    return r.rows[0];
  }));
}));

ops.post('/leases/:id/deposit/pay', requireRole('finance', 'finance_manager', 'super_admin'), h(async (req, res) => {
  const b = z.object({ reference: z.string().trim().min(3).max(200), channel: z.string().trim().min(2).max(40).default('manual') }).parse(req.body);
  res.status(201).json(await withUser(req.user!, async (c) => {
    const lease = (await c.query('SELECT * FROM leases WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'active') throw new HttpError(409, 'A deposit can be collected only for an active lease');
    if (Number(lease.deposit) <= 0) throw new HttpError(409, 'This lease has no deposit due');
    if (await c.query('SELECT 1 FROM rent_transactions WHERE reference = $1', [b.reference]).then((x) => x.rowCount)) throw new HttpError(409, 'That payment reference has already been used');
    if (await c.query("SELECT 1 FROM rent_transactions WHERE lease_id = $1 AND kind = 'deposit' AND status <> 'void'", [lease.id]).then((x) => x.rowCount)) throw new HttpError(409, 'A deposit payment is already recorded for this lease');
    const payment = (await c.query(
      `INSERT INTO rent_transactions (lease_id, kind, amount, channel, reference, recorded_by)
       VALUES ($1,'deposit',$2,$3,$4,$5) RETURNING *`,
      [lease.id, lease.deposit, b.channel, b.reference, req.user!.id],
    )).rows[0];
    await audit(c, req.user!.id, 'deposit_payment_recorded', 'rent_transaction', payment.id, null, { amount: lease.deposit, reference: b.reference });
    return payment;
  }));
}));

ops.post('/leases/:id/deposit/refund', requireRole('finance', 'finance_manager', 'super_admin'), h(async (req, res) => {
  const b = z.object({ amount: z.number().positive().transform((x) => Math.round(x * 100) / 100).pipe(z.number().positive()), reference: z.string().trim().min(3).max(200), channel: z.string().trim().min(2).max(40).default('manual'), reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  res.status(201).json(await withUser(req.user!, async (c) => {
    const lease = (await c.query('SELECT * FROM leases WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'ended') throw new HttpError(409, 'A deposit can be returned only after the lease ends');
    if (await c.query('SELECT 1 FROM rent_transactions WHERE reference = $1', [b.reference]).then((x) => x.rowCount)) throw new HttpError(409, 'That payment reference has already been used');
    const deposit = (await c.query("SELECT * FROM rent_transactions WHERE lease_id = $1 AND kind = 'deposit' AND status = 'reconciled' FOR UPDATE", [lease.id])).rows[0];
    if (!deposit) throw new HttpError(409, 'The deposit must be collected and reconciled before it can be returned');
    const reserved = Number((await c.query("SELECT coalesce(sum(amount),0) AS amount FROM rent_transactions WHERE lease_id = $1 AND kind = 'deposit_refund' AND status <> 'void'", [lease.id])).rows[0].amount);
    const available = Math.round((Number(deposit.amount) - reserved) * 100) / 100;
    if (b.amount > available) throw new HttpError(422, `Refund exceeds the remaining deposit balance of ETB ${available}.`);
    const refund = (await c.query(
      `INSERT INTO rent_transactions (lease_id, kind, amount, channel, reference, reason, recorded_by)
       VALUES ($1,'deposit_refund',$2,$3,$4,$5,$6) RETURNING *`,
      [lease.id, b.amount, b.channel, b.reference, b.reason, req.user!.id],
    )).rows[0];
    await audit(c, req.user!.id, 'deposit_refund_recorded', 'rent_transaction', refund.id, null, { amount: b.amount, reference: b.reference, reason: b.reason });
    return refund;
  }));
}));

ops.post('/rent-transactions/:id/reconcile', requireRole('finance_manager', 'super_admin'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const link = (await c.query('SELECT lease_id FROM rent_transactions WHERE id = $1', [req.params.id])).rows[0];
    if (!link) throw new HttpError(404, 'Rent transaction not found');
    const lease = (await c.query('SELECT * FROM leases WHERE id = $1 FOR UPDATE', [link.lease_id])).rows[0];
    const transaction = (await c.query('SELECT * FROM rent_transactions WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!transaction) throw new HttpError(404, 'Rent transaction not found');
    if (transaction.status !== 'pending') throw new HttpError(409, 'Rent transaction is already reconciled');
    if (transaction.recorded_by === req.user!.id) throw new HttpError(403, 'A different finance officer must reconcile this transaction');
    let entry: [string, number, number][];
    if (transaction.kind === 'rent') {
      const charge = (await c.query('SELECT * FROM rent_charges WHERE id = $1 AND lease_id = $2 FOR UPDATE', [transaction.rent_charge_id, lease.id])).rows[0];
      if (!charge || charge.status !== 'due' || Math.round(Number(charge.amount) * 100) !== Math.round(Number(transaction.amount) * 100)) throw new HttpError(409, 'The rent charge is no longer payable');
      await c.query("UPDATE rent_charges SET status = 'paid', paid_at = now(), payment_ref = $2, recorded_by = $3 WHERE id = $1", [charge.id, transaction.reference, transaction.recorded_by]);
      entry = [['Cash', Number(transaction.amount), 0], ['Rental Revenue', 0, Number(transaction.amount)]];
    } else if (transaction.kind === 'deposit') {
      entry = [['Cash', Number(transaction.amount), 0], ['Tenant Deposit Liability', 0, Number(transaction.amount)]];
    } else {
      if (lease.status !== 'ended') throw new HttpError(409, 'The lease must remain ended while its deposit is returned');
      const deposit = (await c.query("SELECT amount FROM rent_transactions WHERE lease_id = $1 AND kind = 'deposit' AND status = 'reconciled' FOR UPDATE", [lease.id])).rows[0];
      if (!deposit) throw new HttpError(409, 'No collected deposit is available');
      const reserved = Number((await c.query("SELECT coalesce(sum(amount),0) AS amount FROM rent_transactions WHERE lease_id = $1 AND kind = 'deposit_refund' AND status <> 'void'", [lease.id])).rows[0].amount);
      if (reserved > Number(deposit.amount)) throw new HttpError(409, 'Deposit refunds exceed the collected deposit');
      entry = [['Tenant Deposit Liability', Number(transaction.amount), 0], ['Cash', 0, Number(transaction.amount)]];
    }
    await post(c, 'rent_transaction', transaction.id, entry);
    const reconciled = (await c.query("UPDATE rent_transactions SET status = 'reconciled', reconciled_by = $2, reconciled_at = now() WHERE id = $1 AND status = 'pending' RETURNING *", [transaction.id, req.user!.id])).rows[0];
    await audit(c, req.user!.id, 'rent_transaction_reconciled', 'rent_transaction', transaction.id, { status: transaction.status }, { status: 'reconciled', kind: transaction.kind, amount: transaction.amount });
    return reconciled;
  }));
}));

ops.post('/rent-transactions/:id/void', requireRole('finance_manager', 'super_admin'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const transaction = (await c.query('SELECT * FROM rent_transactions WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!transaction) throw new HttpError(404, 'Rent transaction not found');
    if (transaction.status !== 'pending') throw new HttpError(409, 'Only a pending receipt can be voided');
    if (transaction.recorded_by === req.user!.id) throw new HttpError(403, 'A different finance officer must void this receipt');
    const result = (await c.query(
      "UPDATE rent_transactions SET status = 'void', voided_by = $2, voided_at = now(), void_reason = $3 WHERE id = $1 AND status = 'pending' RETURNING *",
      [transaction.id, req.user!.id, reason],
    )).rows[0];
    await audit(c, req.user!.id, 'rent_transaction_voided', 'rent_transaction', transaction.id, { status: 'pending' }, { status: 'void', reason });
    return result;
  }));
}));

ops.get('/rent-transactions/pending', requireRole('finance_manager', 'super_admin'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    "SELECT id, lease_id, rent_charge_id, kind, amount, channel, reference, reason, recorded_by, created_at FROM rent_transactions WHERE status = 'pending' ORDER BY created_at LIMIT 200",
  )).rows));
}));

// ================= Maintenance =================
ops.post('/maintenance', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const b = z.object({ property_id: z.string().uuid(), unit_id: z.string().uuid().optional(), description: z.string().min(5), priority: z.enum(['low', 'normal', 'urgent']).default('normal') }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const p = (await c.query('SELECT source_agent_id FROM properties WHERE id = $1', [b.property_id])).rows[0];
    if (!p) throw new HttpError(404, 'Property not found');
    if (b.unit_id && !(await c.query('SELECT 1 FROM property_units WHERE id = $1 AND property_id = $2', [b.unit_id, b.property_id])).rowCount) throw new HttpError(422, 'That unit does not belong to this property');
    const r = await c.query('INSERT INTO maintenance_requests (property_id, unit_id, description, priority, source_agent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.property_id, b.unit_id ?? null, b.description, b.priority, p.source_agent_id]);
    await audit(c, req.user!.id, 'maintenance_opened', 'maintenance', r.rows[0].id, null, { priority: b.priority });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

ops.get('/maintenance', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT m.*, p.address FROM maintenance_requests m JOIN properties p ON p.id = m.property_id ORDER BY (m.status IN (\'done\',\'cancelled\')), m.priority = \'urgent\' DESC, m.created_at DESC LIMIT 200')).rows));
}));

const NEXT_MAINT: Record<string, string[]> = { open: ['assigned', 'cancelled'], assigned: ['in_progress', 'cancelled'], in_progress: ['done', 'cancelled'] };
ops.post('/maintenance/:id/update', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const b = z.object({ status: z.enum(['assigned', 'in_progress', 'done', 'cancelled']), assigned_to: z.string().min(2).optional(), cost: z.number().nonnegative().optional() }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const m = (await c.query('SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!m) throw new HttpError(404, 'Request not found');
    if (!NEXT_MAINT[m.status]?.includes(b.status)) throw new HttpError(409, `A ${m.status.replace('_', ' ')} request cannot move to ${b.status.replace('_', ' ')}`);
    if (b.status === 'assigned' && !(b.assigned_to ?? m.assigned_to)) throw new HttpError(422, 'Say who it is assigned to');
    const r = await c.query('UPDATE maintenance_requests SET status = $2, assigned_to = COALESCE($3, assigned_to), cost = COALESCE($4, cost) WHERE id = $1 RETURNING *', [m.id, b.status, b.assigned_to ?? null, b.cost ?? null]);
    await audit(c, req.user!.id, 'maintenance_' + b.status, 'maintenance', m.id, { status: m.status }, { status: b.status, cost: b.cost ?? null });
    return r.rows[0];
  }));
}));

// ================= Notifications (each person sees only their own) =================
ops.get('/notifications', h(async (req, res) => {
  res.json((await pool.query("SELECT id, template, payload, status, created_at FROM notifications WHERE user_id = $1 AND channel = 'inapp' ORDER BY id DESC LIMIT 50", [req.user!.id])).rows);
}));

ops.post('/notifications/read', h(async (req, res) => {
  await pool.query("UPDATE notifications SET status = 'read' WHERE user_id = $1 AND channel = 'inapp' AND status = 'sent'", [req.user!.id]);
  res.json({ ok: true });
}));
