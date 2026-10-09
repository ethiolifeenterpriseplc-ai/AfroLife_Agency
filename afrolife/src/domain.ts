import { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthUser, HttpError } from './core.js';
import { notify } from './notify.js';

type Rules = Record<string, number>;

export async function loadRules(c: PoolClient): Promise<Rules> {
  const r = await c.query('SELECT key, value FROM config_rules');
  return Object.fromEntries(r.rows.map((x) => [x.key, Number(x.value)]));
}

/** Fee amounts are stored separately on the contract, never as one combined percentage. */
/** A missing rule would turn into NaN and be written into contracts and the ledger, so fail loudly instead. */
export function needRules(k: Rules, keys: string[]) {
  const missing = keys.filter((x) => !Number.isFinite(k[x]));
  if (missing.length) throw new Error('config_rules is missing: ' + missing.join(', '));
}

export function feeSnapshot(track: 'A' | 'B', base: number, k: Rules) {
  needRules(k, track === 'A' ? ['A_onboarding_pct', 'A_guarantee_pct', 'A_monthly_pct'] : ['B_employer_pct', 'B_other_pct']);
  const p = (pct: number) => Math.round(base * pct) / 100; // rounded to cents
  return track === 'A'
    ? { onboarding_amt: p(k.A_onboarding_pct), guarantee_amt: p(k.A_guarantee_pct), monthly_mgmt_amt: p(k.A_monthly_pct), employer_fee_amt: 0, other_fee_amt: 0 }
    : { onboarding_amt: 0, guarantee_amt: 0, monthly_mgmt_amt: 0, employer_fee_amt: p(k.B_employer_pct), other_fee_amt: p(k.B_other_pct) };
}

export async function audit(c: PoolClient, actor: string, action: string, entity: string, id: string, oldV?: unknown, newV?: unknown) {
  await c.query(
    'INSERT INTO audit_logs (actor_id, action, entity, entity_id, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)',
    [actor, action, entity, id, oldV ? JSON.stringify(oldV) : null, newV ? JSON.stringify(newV) : null],
  );
}

/** Zero lines are skipped (the schema requires exactly one of debit/credit > 0). The DB checks the transaction balances at commit. */
export async function post(c: PoolClient, refType: string, refId: string, rows: [account: string, debit: number, credit: number][]) {
  const txn = randomUUID();
  for (const [account, debit, credit] of rows) {
    if (debit === 0 && credit === 0) continue;
    await c.query(
      'INSERT INTO ledger_entries (txn_id, account, debit, credit, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [txn, account, debit, credit, refType, refId],
    );
  }
}

export function initialAmount(k: any): number {
  return Number(k.onboarding_amt) + Number(k.guarantee_amt) + Number(k.monthly_mgmt_amt) + Number(k.employer_fee_amt) + Number(k.other_fee_amt);
}

/** Pure commission rule: guarantee is excluded from eligible revenue unless configured otherwise. */
export function commissionFor(k: any, rl: Rules) {
  needRules(rl, ['first_contract_commission_pct']);
  const guar = Number(k.guarantee_amt);
  const initial = initialAmount(k);
  const eligible = initial - (rl.guarantee_commissionable ? 0 : guar);
  const rate = rl.first_contract_commission_pct;
  return { initial, guar, eligible, rate, amount: Math.round(eligible * rate) / 100 };
}

const PaymentIn = z.object({ channel: z.string().min(2), reference: z.string().min(3), amount: z.number().positive() });

const AGENTS = ['super_admin', 'master_agent', 'field_agent'];
const CONTRACT_SIGNERS = ['super_admin', 'corporate_business_manager'];
export const TRANSITIONS: Record<string, { from: string; to: string; roles: string[] }> = {
  submit:         { from: 'draft',             to: 'compliance_review', roles: AGENTS },
  verify_kyc:     { from: 'compliance_review', to: 'approval_pending',  roles: ['compliance'] },
  approve:        { from: 'approval_pending',  to: 'signature_pending', roles: ['super_admin'] },
  sign:           { from: 'signature_pending', to: 'payment_pending',   roles: CONTRACT_SIGNERS },
  record_payment: { from: 'payment_pending',   to: 'payment_received',  roles: ['finance'] },
  reconcile:      { from: 'payment_received',  to: 'active',            roles: ['finance', 'finance_manager'] },
};

export async function transition(c: PoolClient, user: AuthUser, contractId: string, action: string, body: unknown = {}) {
  if (action === 'cancel' || action === 'reject') {
    const b = z.object({ reason: z.string().trim().min(10).max(1000) }).parse(body);
    if (action === 'reject' && user.role !== 'compliance') throw new HttpError(403, 'Only Compliance can reject a contract during KYC review');
    if (action === 'cancel' && !['super_admin', 'master_agent', 'field_agent'].includes(user.role)) throw new HttpError(403, 'Your role cannot cancel this contract');
    const contract = (await c.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contractId])).rows[0];
    if (!contract) throw new HttpError(404, 'Contract not found');
    const cancellable = ['draft', 'compliance_review', 'approval_pending', 'signature_pending', 'payment_pending'];
    if (!cancellable.includes(contract.state) || (action === 'reject' && contract.state !== 'compliance_review')) {
      throw new HttpError(409, 'This contract can no longer be cancelled or rejected; use the dispute and refund workflow for collected payments');
    }
    const payments = await c.query('SELECT 1 FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.contract_id = $1 LIMIT 1', [contract.id]);
    if (payments.rowCount) throw new HttpError(409, 'A contract with a recorded payment must be handled through dispute and refund review');
    await c.query("UPDATE invoices SET status = 'void' WHERE contract_id = $1 AND status = 'pending'", [contract.id]);
    const next = (await c.query("UPDATE contracts SET state = 'cancelled' WHERE id = $1 RETURNING *", [contract.id])).rows[0];
    await c.query(
      `UPDATE leads SET status = CASE WHEN EXISTS (
         SELECT 1 FROM contracts WHERE lead_id = $1 AND id <> $2 AND state <> 'cancelled'
       ) THEN 'converted' ELSE 'qualified' END WHERE id = $1`,
      [contract.lead_id, contract.id],
    );
    await audit(c, user.id, action === 'reject' ? 'contract_rejected' : 'contract_cancelled', 'contract', contract.id, { state: contract.state }, { state: 'cancelled', reason: b.reason });
    await notify(c, contract.source_agent_id, 'contract_' + action, { contract_no: contract.contract_no, reason: b.reason });
    return next;
  }
  const t = TRANSITIONS[action];
  if (!t) throw new HttpError(400, 'Unknown action');
  if (!t.roles.includes(user.role)) throw new HttpError(403, 'Your role cannot do this step');

  const r = await c.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
  const k = r.rows[0];
  if (!k) throw new HttpError(404, 'Contract not found');
  if (k.state !== t.from) throw new HttpError(409, `Contract is ${k.state}; "${action}" needs ${t.from}`);

  if (action === 'sign') {
    const document = (await c.query(
      `SELECT d.id FROM contract_documents d
       WHERE d.contract_id = $1 AND d.document_stage = 'company_countersigned' AND d.uploaded_by = $2
         AND EXISTS (SELECT 1 FROM contract_documents p WHERE p.contract_id = d.contract_id AND p.document_stage = 'party_signed')
       ORDER BY d.created_at DESC LIMIT 1`,
      [k.id, user.id],
    )).rows[0];
    if (!document) throw new HttpError(409, 'Upload the company-countersigned file after the agent submits the party-signed contract.');
    await c.query(
      'INSERT INTO contract_signatures (contract_id, document_id, signed_by, signer_role) VALUES ($1,$2,$3,$4)',
      [k.id, document.id, user.id, user.role],
    );
    const rules = await loadRules(c);
    await c.query(
      `INSERT INTO invoices (contract_id, payer_name, amount, due_on)
       VALUES ($1, (SELECT name FROM leads WHERE id = $2), $3, current_date + $4::int)`,
      [k.id, k.lead_id, initialAmount(k), rules.invoice_due_days ?? 7],
    );
  }
  if (action === 'record_payment') {
    const p = PaymentIn.parse(body);
    const inv = (await c.query("SELECT * FROM invoices WHERE contract_id = $1 AND status = 'pending' FOR UPDATE", [k.id])).rows[0];
    if (!inv) throw new HttpError(409, 'No pending invoice for this contract');
    if (Math.round(p.amount * 100) !== Math.round(Number(inv.amount) * 100)) {
      throw new HttpError(422, `Payment must equal the invoice amount (${inv.amount})`);
    }
    await c.query('INSERT INTO payments (invoice_id, amount, channel, reference, recorded_by) VALUES ($1,$2,$3,$4,$5)', [inv.id, p.amount, p.channel, p.reference, user.id]);
    await c.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [inv.id]);
  }
  if (action === 'reconcile') {
    const pay = (await c.query('SELECT p.id, p.recorded_by FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.contract_id = $1', [k.id])).rows[0];
    if (!pay) throw new HttpError(409, 'No payment on record to reconcile');
    if (pay.recorded_by === user.id) throw new HttpError(403, 'A different finance user must reconcile this payment');
    await c.query('UPDATE payments SET reconciled = true WHERE id = $1', [pay.id]);
  }

  const sets: Record<string, unknown> = { state: t.to };
  if (action === 'verify_kyc') sets.kyc_ok = true;
  if (action === 'approve') sets.approved_by = user.id;
  if (action === 'reconcile') sets.paid_reconciled = true;

  const cols = Object.keys(sets);
  await c.query(
    `UPDATE contracts SET ${cols.map((x, i) => `${x} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [contractId, ...cols.map((x) => sets[x])],
  );
  await audit(c, user.id, action, 'contract', contractId, { state: k.state }, { state: t.to });
  await notify(c, k.source_agent_id, 'contract_' + action, { contract_no: k.contract_no });
  const next = { ...k, ...sets };
  if (action === 'reconcile') await onActivated(c, user, next);
  return next;
}

/** Posts revenue to the ledger, then creates a first-contract commission event if eligible. */
async function onActivated(c: PoolClient, user: AuthUser, k: any) {
  const rl = await loadRules(c);
  const { initial, guar, eligible, rate, amount } = commissionFor(k, rl);
  await post(c, 'contract', k.id, [['Cash', initial, 0], ['Service Revenue', 0, initial - guar], ['Guarantee Liability', 0, guar]]);

  if (k.is_renewal) return; // renewals earn no first-contract commission
  const prior = await c.query("SELECT 1 FROM commission_events WHERE lead_id = $1 AND rule = 'first_contract' AND status <> 'reversed'", [k.lead_id]);
  if (prior.rowCount) return;

  const ins = await c.query(
    `INSERT INTO commission_events (agent_id, lead_id, contract_id, rate_pct, eligible_revenue, amount, qualified_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [k.source_agent_id, k.lead_id, k.id, rate, eligible, amount, user.id],
  );
  const id = ins.rows[0].id;
  await post(c, 'commission', id, [['Commission Expense', amount, 0], ['Commission Payable', 0, amount]]);
  await audit(c, user.id, 'commission_qualified', 'commission', id, null, { amount, eligible, rate });
}
