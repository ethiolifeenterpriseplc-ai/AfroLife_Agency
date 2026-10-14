import express, { Router, Request, Response, RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withUser, requireActivity, requireAnyActivity, requireRole, HttpError, isPlatformAdminRole } from './core.js';
import { audit, post } from './domain.js';
import { sniff } from './files.js';
import { notify } from './notify.js';
import { rentSchedule, endDate } from './rent.js';
import { refundLimit } from './refunds.js';
import { loadRules } from './domain.js';
import { getFile, putFile } from './storage.js';
import { Phone } from './validators.js';
import { legacyImmediateLeasesEnabled } from './runtime-config.js';

export const ops = Router();
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const AGENT = ['master_agent', 'field_agent'];

ops.get('/owner/statements', requireRole('property_owner'), h(async (req, res) => {
  const statements = await withUser(req.user!, async (client) => (await client.query(
    `SELECT l.id AS lease_id,p.id AS property_id,p.address,u.unit_no,l.start_date,l.end_date,l.status,
       l.rent::text AS monthly_rent,l.deposit::text AS agreed_deposit,
       COALESCE((SELECT sum(c.amount) FROM rent_charges c WHERE c.lease_id=l.id AND c.status<>'waived'),0)::text AS rent_charged,
       COALESCE((SELECT sum(t.amount) FROM rent_transactions t WHERE t.lease_id=l.id AND t.kind='rent' AND t.status='reconciled'),0)::text AS rent_reconciled,
       COALESCE((SELECT sum(t.amount) FROM rent_transactions t WHERE t.lease_id=l.id AND t.kind='rent' AND t.status='pending'),0)::text AS rent_pending_reconciliation,
       COALESCE((SELECT sum(t.amount) FROM rent_transactions t WHERE t.lease_id=l.id AND t.kind='deposit' AND t.status='reconciled'),0)::text AS deposit_reconciled,
       COALESCE((SELECT sum(t.amount) FROM rent_transactions t WHERE t.lease_id=l.id AND t.kind='deposit_refund' AND t.status='reconciled'),0)::text AS deposit_refunded,
       (SELECT max(t.reconciled_at) FROM rent_transactions t WHERE t.lease_id=l.id AND t.status='reconciled') AS last_reconciled_at
     FROM leases l JOIN property_units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE p.owner_user_id=$1 ORDER BY l.created_at DESC LIMIT 500`,
    [req.user!.id],
  )).rows);
  res.json({ statements, note: 'Shows recorded lease charges and reconciled receipts. This is not a payout, remittance, or trust-account statement.' });
}));

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
  if (b.refund_amount > 0 && !isPlatformAdminRole(req.user!.role)) throw new HttpError(403, 'Only a platform administrator can approve a refund');
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
ops.post('/tenants', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  const b = z.object({ name: z.string().min(2), phone: Phone, national_id: z.string().min(5).optional() }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const r = await c.query('INSERT INTO tenants (name, phone, national_id, source_agent_id) VALUES ($1,$2,$3,$4) RETURNING *', [b.name, b.phone, b.national_id ?? null, req.user!.id]);
    await audit(c, req.user!.id, 'tenant_created', 'tenant', r.rows[0].id, null, { name: b.name });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

ops.get('/tenants', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, name, phone, source_agent_id, created_at FROM tenants ORDER BY created_at DESC LIMIT 200',
  )).rows));
}));

// ================= Leases and rent =================
const LeaseIn = z.object({
  unit_id: z.string().uuid(), tenant_id: z.string().uuid(), rent: z.number().positive(), deposit: z.number().nonnegative().default(0),
  start_date: z.string().date(), months: z.number().int().min(1).max(120), due_day: z.number().int().min(1).max(28).optional(),
});

const LifecycleReason = z.string().trim().min(10).max(1000);

const LeaseNoticeIn = z.object({
  idempotency_key: z.string().uuid(),
  notice_type: z.enum(['tenant_to_owner', 'owner_to_tenant', 'mutual_agreement', 'other']),
  received_on: z.string().date(),
  proposed_effective_on: z.string().date(),
  summary: z.string().trim().min(10).max(1000),
});

ops.post('/leases/:id/notices', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  const body = LeaseNoticeIn.parse(req.body);
  if (body.proposed_effective_on < body.received_on) {
    throw new HttpError(422, 'The proposed effective date cannot be before the recorded receipt date');
  }
  if (body.received_on > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(422, 'The recorded receipt date cannot be in the future');
  }
  const result = await withUser(req.user!, async (c) => {
    const lease = (await c.query(
      `SELECT l.id,l.status,l.source_agent_id,p.owner_user_id
       FROM leases l
       JOIN property_units u ON u.id=l.unit_id
       JOIN properties p ON p.id=u.property_id
       WHERE l.id=$1 FOR UPDATE OF l`,
      [req.params.id],
    )).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'active') throw new HttpError(409, 'Notice records can only be added to an active lease');

    const inserted = await c.query(
      `INSERT INTO lease_notices
         (lease_id,idempotency_key,notice_type,received_on,proposed_effective_on,summary,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (lease_id,idempotency_key) DO NOTHING
       RETURNING *`,
      [lease.id, body.idempotency_key, body.notice_type, body.received_on,
        body.proposed_effective_on, body.summary, req.user!.id],
    );
    if (!inserted.rowCount) {
      const existing = (await c.query(
        'SELECT * FROM lease_notices WHERE lease_id=$1 AND idempotency_key=$2',
        [lease.id, body.idempotency_key],
      )).rows[0];
      if (!existing || existing.recorded_by !== req.user!.id
        || existing.notice_type !== body.notice_type
        || existing.received_on !== body.received_on
        || existing.proposed_effective_on !== body.proposed_effective_on
        || existing.summary !== body.summary) {
        throw new HttpError(409, 'This idempotency key was already used for a different notice');
      }
      return { notice: existing, created: false };
    }

    const notice = inserted.rows[0];
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason,metadata)
       VALUES ($1,'active','active','notice_recorded',$2,'Operational notice record added',
         jsonb_build_object('notice_id',$3::uuid,'notice_type',$4::text,'proposed_effective_on',$5::date))`,
      [lease.id, req.user!.id, notice.id, body.notice_type, body.proposed_effective_on],
    );
    await audit(c, req.user!.id, 'lease_notice_recorded', 'lease', lease.id, null, {
      notice_id: notice.id, notice_type: body.notice_type,
      received_on: body.received_on, proposed_effective_on: body.proposed_effective_on,
    });
    const recipients = new Set<string>([lease.source_agent_id]);
    if (lease.owner_user_id) recipients.add(lease.owner_user_id);
    for (const id of recipients) {
      if (id === req.user!.id) continue;
      await notify(c, id, 'lease_notice_recorded', {
        lease_id: lease.id, notice_id: notice.id, notice_type: body.notice_type,
        proposed_effective_on: body.proposed_effective_on,
      });
    }
    return { notice, created: true };
  });
  res.status(result.created ? 201 : 200).json({
    ...result,
    legal_effect: 'record_only',
    notice_disclaimer: 'This records an operational notice only. It does not verify service, establish legal validity, change lease status, or terminate the lease.',
  });
}));

ops.get('/leases/:id/notices', requireAnyActivity(
  'property.tenancy.manage', 'property.tenancy.approve', 'property.tenancy.execute',
), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT id,lease_id,notice_type,received_on,proposed_effective_on,summary,recorded_by,created_at
     FROM lease_notices WHERE lease_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id],
  )).rows));
}));

ops.post('/leases/workflow', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  const b = LeaseIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const rules = await loadRules(c);
    const minMonths = rules.lease_min_term_months ?? 24;
    const maxMonths = rules.lease_max_months ?? 24;
    if (b.months < minMonths) throw new HttpError(422, `Lease term cannot be less than ${minMonths} months.`);
    if (b.months > maxMonths) throw new HttpError(422, `Lease term cannot exceed ${maxMonths} months.`);
    const dueDay = b.due_day ?? rules.lease_default_due_day ?? 5;
    const unit = (await c.query(
      `SELECT u.id, u.occupancy, p.source_agent_id, p.id AS property_id
       FROM property_units u JOIN properties p ON p.id=u.property_id
       WHERE u.id=$1 FOR UPDATE OF u`,
      [b.unit_id],
    )).rows[0];
    if (!unit) throw new HttpError(404, 'Unit not found');
    if (unit.occupancy !== 'vacant') throw new HttpError(409, 'This unit is not vacant');
    if (!(await c.query('SELECT 1 FROM tenants WHERE id=$1', [b.tenant_id])).rowCount) {
      throw new HttpError(404, 'Tenant not found');
    }
    const lease = (await c.query(
      `INSERT INTO leases
         (unit_id,tenant_id,rent,deposit,start_date,end_date,source_agent_id,status,created_by,term_months,due_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)
       RETURNING *`,
      [b.unit_id, b.tenant_id, b.rent, b.deposit, b.start_date, endDate(b.start_date, b.months),
        unit.source_agent_id, req.user!.id, b.months, dueDay],
    )).rows[0];
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason,metadata)
       VALUES ($1,NULL,'draft','draft_created',$2,'Lease draft created',
         jsonb_build_object('workflow_version',1))`,
      [lease.id, req.user!.id],
    );
    await audit(c, req.user!.id, 'lease_workflow_draft_created', 'lease', lease.id, null,
      { unit_id: b.unit_id, tenant_id: b.tenant_id, months: b.months });
    return lease;
  });
  res.status(201).json(row);
}));

ops.post('/leases/:id/submit-for-approval', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  const { reason } = z.object({ reason: LifecycleReason }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const lease = (await c.query('SELECT * FROM leases WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'draft') throw new HttpError(409, 'Only a draft lease can be submitted for approval');
    if (lease.created_by !== req.user!.id && !isPlatformAdminRole(req.user!.role)) {
      throw new HttpError(403, 'Only the draft creator or a platform administrator may submit this lease');
    }
    const updated = (await c.query(
      "UPDATE leases SET status='pending_approval' WHERE id=$1 RETURNING *",
      [lease.id],
    )).rows[0];
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason)
       VALUES ($1,'draft','pending_approval','submitted_for_approval',$2,$3)`,
      [lease.id, req.user!.id, reason],
    );
    await audit(c, req.user!.id, 'lease_submitted_for_approval', 'lease', lease.id, { status: lease.status }, { reason });
    return updated;
  }));
}));

ops.post('/leases/:id/approve', requireActivity('property.tenancy.approve'), h(async (req, res) => {
  const { reason } = z.object({ reason: LifecycleReason }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const lease = (await c.query('SELECT * FROM leases WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'pending_approval') throw new HttpError(409, 'Lease is not awaiting approval');
    if (lease.created_by === req.user!.id) throw new HttpError(403, 'The lease creator cannot approve their own lease');
    const updated = (await c.query(
      `UPDATE leases SET status='pending_signature', approved_by=$2, approved_at=now()
       WHERE id=$1 RETURNING *`,
      [lease.id, req.user!.id],
    )).rows[0];
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason)
       VALUES ($1,'pending_approval','pending_signature','lease_approved',$2,$3)`,
      [lease.id, req.user!.id, reason],
    );
    await audit(c, req.user!.id, 'lease_approved', 'lease', lease.id, { status: lease.status }, { reason });
    return updated;
  }));
}));

ops.post('/leases/:id/signature-documents', requireActivity('property.tenancy.manage'),
  express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
    const { party, signer_name: signerName } = z.object({
      party: z.enum(['tenant', 'owner']),
      signer_name: z.string().trim().min(2).max(200),
    }).parse(req.query);
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, 'No file received');
    const mime = sniff(buffer);
    if (!mime) throw new HttpError(415, 'Only PDF, JPEG or PNG files are accepted');
    const document = await withUser(req.user!, async (c) => {
      const lease = (await c.query('SELECT id,status FROM leases WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!lease) throw new HttpError(404, 'Lease not found');
      if (lease.status !== 'pending_signature') throw new HttpError(409, 'Lease is not awaiting signature evidence');
      const storageKey = randomUUID();
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const row = (await c.query(
        `INSERT INTO lease_documents
           (lease_id,party,signer_name,storage_key,sha256,mime,size_bytes,uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,lease_id,party,signer_name,sha256,mime,size_bytes,uploaded_by,created_at`,
        [lease.id, party, signerName, storageKey, sha256, mime, buffer.length, req.user!.id],
      )).rows[0];
      await putFile(storageKey, buffer);
      await audit(c, req.user!.id, 'lease_signature_evidence_uploaded', 'lease', lease.id, null,
        { document_id: row.id, party, sha256, mime, size_bytes: buffer.length });
      return row;
    });
    res.status(201).json({ ...document, signature_evidence_only: true });
  }));

ops.get('/lease-signature-documents/:id/file', h(async (req, res) => {
  const document = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id,storage_key,mime FROM lease_documents WHERE id=$1',
    [req.params.id],
  )).rows[0]);
  if (!document) throw new HttpError(404, 'Lease signature evidence not found');
  const file = await getFile(document.storage_key);
  res.set({
    'Content-Type': document.mime,
    'Content-Disposition': 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }).send(file);
}));

ops.post('/leases/:id/execute', requireActivity('property.tenancy.execute'), h(async (req, res) => {
  const b = z.object({
    reason: LifecycleReason,
    handover_date: z.string().date(),
    move_in_inspection_completed: z.literal(true),
  }).parse(req.body);
  const result = await withUser(req.user!, async (c) => {
    const lease = (await c.query('SELECT * FROM leases WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!lease) throw new HttpError(404, 'Lease not found');
    if (lease.status !== 'pending_signature') throw new HttpError(409, 'Lease is not ready for execution');
    if (lease.created_by === req.user!.id || lease.approved_by === req.user!.id) {
      throw new HttpError(403, 'Lease execution must be performed by someone other than its creator and approver');
    }
    if (b.handover_date < lease.start_date || b.handover_date > lease.end_date) {
      throw new HttpError(422, 'Handover date must fall within the lease term');
    }
    const unit = (await c.query('SELECT id,occupancy FROM property_units WHERE id=$1 FOR UPDATE', [lease.unit_id])).rows[0];
    if (!unit) throw new HttpError(404, 'Unit not found');
    if (unit.occupancy !== 'vacant') throw new HttpError(409, 'The unit is no longer vacant');
    const overlap = await c.query(
      `SELECT id FROM leases
       WHERE unit_id=$1 AND id<>$2 AND status IN ('active','executed')
         AND start_date <= $3 AND end_date >= $4
       FOR UPDATE`,
      [lease.unit_id, lease.id, lease.end_date, lease.start_date],
    );
    if (overlap.rowCount) throw new HttpError(409, 'Another active lease overlaps this lease term');
    const documents = (await c.query(
      `SELECT id,party,signer_name,sha256,mime,size_bytes,uploaded_by
       FROM lease_documents WHERE lease_id=$1 ORDER BY party`,
      [lease.id],
    )).rows;
    if (!documents.some((doc) => doc.party === 'tenant') || !documents.some((doc) => doc.party === 'owner')) {
      throw new HttpError(409, 'Tenant and owner signature evidence are both required');
    }
    const details = (await c.query(
      `SELECT p.id AS property_id,p.address,u.unit_no,t.name AS tenant_name
       FROM property_units u JOIN properties p ON p.id=u.property_id
       JOIN tenants t ON t.id=$2 WHERE u.id=$1`,
      [lease.unit_id, lease.tenant_id],
    )).rows[0];
    if (!details) throw new HttpError(409, 'Lease property or tenant details are no longer available');
    const snapshot = {
      workflow_version: 1,
      lease_id: lease.id,
      property_id: details.property_id,
      property_address: details.address,
      unit_id: lease.unit_id,
      unit_no: details.unit_no,
      tenant_id: lease.tenant_id,
      tenant_name: details.tenant_name,
      rent: String(lease.rent),
      deposit: String(lease.deposit),
      start_date: lease.start_date,
      end_date: lease.end_date,
      term_months: lease.term_months,
      due_day: lease.due_day,
      approved_by: lease.approved_by,
      approved_at: lease.approved_at,
      handover_date: b.handover_date,
      move_in_inspection_completed: true,
      signature_evidence: documents.map((doc) => ({
        id: doc.id, party: doc.party, signer_name: doc.signer_name, sha256: doc.sha256,
        mime: doc.mime, size_bytes: doc.size_bytes, uploaded_by: doc.uploaded_by,
      })),
    };
    const version = (await c.query(
      `INSERT INTO lease_versions
         (lease_id,version,snapshot,snapshot_sha256,signature_document_ids,created_by)
       VALUES ($1,1,$2::jsonb,encode(digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex'),$3::uuid[],$4)
       RETURNING id,version,snapshot_sha256`,
      [lease.id, JSON.stringify(snapshot), documents.map((doc) => doc.id), req.user!.id],
    )).rows[0];
    const updated = (await c.query(
      `UPDATE leases
       SET status='active',executed_by=$2,executed_at=now(),execution_hash=$3,
           possession_handover_on=$4,move_in_inspection_completed=true
       WHERE id=$1 RETURNING *`,
      [lease.id, req.user!.id, version.snapshot_sha256, b.handover_date],
    )).rows[0];
    for (const charge of rentSchedule(lease.start_date, lease.term_months, Number(lease.rent), lease.due_day)) {
      await c.query(
        'INSERT INTO rent_charges (lease_id,period,due_on,amount) VALUES ($1,$2,$3,$4)',
        [lease.id, charge.period, charge.due_on, charge.amount],
      );
    }
    await c.query("UPDATE property_units SET occupancy='occupied' WHERE id=$1", [lease.unit_id]);
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason,metadata)
       VALUES ($1,'pending_signature','active','lease_executed',$2,$3,
         jsonb_build_object('lease_version_id',$4::uuid,'snapshot_sha256',$5::text,'handover_date',$6::date))`,
      [lease.id, req.user!.id, b.reason, version.id, version.snapshot_sha256, b.handover_date],
    );
    await audit(c, req.user!.id, 'lease_executed', 'lease', lease.id, { status: lease.status }, {
      reason: b.reason, version: version.version, snapshot_sha256: version.snapshot_sha256,
    });
    return { lease: updated, version: { id: version.id, version: version.version, snapshot_sha256: version.snapshot_sha256 } };
  });
  res.json({ ...result, signature_evidence_only: true });
}));

ops.post('/leases', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  if (!legacyImmediateLeasesEnabled(process.env)) {
    throw new HttpError(409, 'Immediate lease activation is disabled. Create a lease draft and complete the approval, signature-evidence, and handover workflow.');
  }
  const row = await withUser(req.user!, async (c) => {
    const b = LeaseIn.parse(req.body);
    const rules = await loadRules(c);
    const minMonths = rules.lease_min_term_months ?? 24;
    const maxMonths = rules.lease_max_months ?? 24;
    if (b.months < minMonths) throw new HttpError(422, `Lease term cannot be less than ${minMonths} months.`);
    if (b.months > maxMonths) throw new HttpError(422, `Lease term cannot exceed ${maxMonths} months.`);
    const dueDay = b.due_day ?? rules.lease_default_due_day ?? 5;
    const u = (await c.query(
      `SELECT u.id,u.occupancy,u.unit_no,p.id AS property_id,p.address,p.source_agent_id
       FROM property_units u JOIN properties p ON p.id=u.property_id
       WHERE u.id=$1 FOR UPDATE OF u`,
      [b.unit_id],
    )).rows[0]; // RLS: must be your unit. The row lock stops two agents leasing the same vacant unit at once.
    if (!u) throw new HttpError(404, 'Unit not found');
    if (u.occupancy !== 'vacant') throw new HttpError(409, 'This unit is not vacant');
    const tenant = (await c.query('SELECT id,name FROM tenants WHERE id=$1', [b.tenant_id])).rows[0];
    if (!tenant) throw new HttpError(404, 'Tenant not found');
    const lease = (await c.query(
      `INSERT INTO leases
         (unit_id,tenant_id,rent,deposit,start_date,end_date,source_agent_id,created_by,term_months,due_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.unit_id, b.tenant_id, b.rent, b.deposit, b.start_date, endDate(b.start_date, b.months),
        u.source_agent_id, req.user!.id, b.months, dueDay],
    )).rows[0];
    const legacySnapshot = {
      workflow_version: 1,
      legacy_immediate_active_path: true,
      signature_evidence_available: false,
      lease_id: lease.id,
      property_id: u.property_id,
      property_address: u.address,
      unit_id: b.unit_id,
      unit_no: u.unit_no,
      tenant_id: b.tenant_id,
      tenant_name: tenant.name,
      rent: String(lease.rent),
      deposit: String(lease.deposit),
      start_date: lease.start_date,
      end_date: lease.end_date,
      term_months: b.months,
      due_day: dueDay,
    };
    await c.query(
      `INSERT INTO lease_versions
         (lease_id,version,snapshot,snapshot_sha256,signature_document_ids,created_by)
       VALUES ($1,1,$2::jsonb,encode(digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex'),'{}'::uuid[],$3)`,
      [lease.id, JSON.stringify(legacySnapshot), req.user!.id],
    );
    await c.query(
      `INSERT INTO lease_lifecycle_events (lease_id,from_status,to_status,action,actor_id,reason,metadata)
       VALUES ($1,NULL,'active','legacy_active_lease_created',$2,
         'Legacy immediate-active lease path retained',
         jsonb_build_object('signature_evidence_available',false))`,
      [lease.id, req.user!.id],
    );
    for (const s of rentSchedule(b.start_date, b.months, b.rent, dueDay)) {
      await c.query('INSERT INTO rent_charges (lease_id, period, due_on, amount) VALUES ($1,$2,$3,$4)', [lease.id, s.period, s.due_on, s.amount]);
    }
    await c.query("UPDATE property_units SET occupancy = 'occupied' WHERE id = $1", [b.unit_id]);
    await audit(c, req.user!.id, 'lease_created', 'lease', lease.id, null, { unit: b.unit_id, months: b.months, rent: b.rent });
    return lease;
  });
  res.status(201).json(row);
}));

ops.get('/leases', requireAnyActivity('property.tenancy.manage', 'rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void', 'rent.deposit.refund_request'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT l.*, t.name AS tenant_name, u.unit_no, p.address,
       (SELECT count(*)::int FROM rent_charges r WHERE r.lease_id = l.id AND r.status = 'due' AND r.due_on < current_date) AS overdue_count,
       EXISTS (SELECT 1 FROM lease_documents d WHERE d.lease_id=l.id AND d.party='tenant') AS tenant_signature_evidence,
       EXISTS (SELECT 1 FROM lease_documents d WHERE d.lease_id=l.id AND d.party='owner') AS owner_signature_evidence,
       latest_notice.notice_type,latest_notice.received_on AS notice_received_on,
       latest_notice.proposed_effective_on
     FROM leases l JOIN property_units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN tenants t ON t.id = l.tenant_id
     LEFT JOIN LATERAL (
       SELECT n.notice_type,n.received_on,n.proposed_effective_on
       FROM lease_notices n WHERE n.lease_id=l.id ORDER BY n.created_at DESC LIMIT 1
     ) latest_notice ON true
     ORDER BY l.created_at DESC LIMIT 200`)).rows));
}));

ops.get('/leases/:id/charges', requireAnyActivity('property.tenancy.manage', 'rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    "SELECT id, period, due_on, amount, paid_at, payment_ref, CASE WHEN status = 'due' AND due_on < current_date THEN 'overdue' ELSE status END AS status FROM rent_charges WHERE lease_id = $1 ORDER BY period", [req.params.id])).rows));
}));

ops.get('/leases/:id/payments', requireAnyActivity('property.tenancy.manage', 'rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void', 'rent.deposit.refund_request'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, kind, amount, channel, reference, reason, status, recorded_by, reconciled_by, created_at, reconciled_at FROM rent_transactions WHERE lease_id = $1 ORDER BY created_at DESC',
    [req.params.id],
  )).rows));
}));

ops.post('/leases/:id/end', requireActivity('property.tenancy.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const l = (await c.query("UPDATE leases SET status = 'ended' WHERE id = $1 AND status = 'active' RETURNING *", [req.params.id])).rows[0];
    if (!l) throw new HttpError(404, 'Active lease not found');
    await c.query("UPDATE rent_charges SET status = 'waived' WHERE lease_id = $1 AND status = 'due' AND period > current_date", [l.id]); // future months only
    await c.query("UPDATE property_units SET occupancy = 'vacant' WHERE id = $1", [l.unit_id]);
    await audit(c, req.user!.id, 'lease_ended', 'lease', l.id);
    return l;
  }));
}));

// ----------------- Service identity inventory -----------------
ops.post('/service-identities', requireRole(...AGENT, 'super_admin', 'security'), h(async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(3).max(200),
    purpose: z.string().trim().min(3).max(1000),
    environment: z.enum(['production','staging','development','sandbox']).default('staging'),
    owner_user_id: z.string().uuid().optional(),
    expiry_date: z.string().optional(),
  }).parse(req.body);
  res.status(201).json(await withUser(req.user!, async (c) => {
    const row = (await c.query(
      `INSERT INTO service_identities (name,purpose,environment,owner_user_id,expiry_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.name, b.purpose, b.environment, b.owner_user_id ?? null, b.expiry_date ?? null, req.user!.id],
    )).rows[0];
    await audit(c, req.user!.id, 'service_identity_created', 'service_identity', row.id, null, { name: b.name, environment: b.environment });
    return row;
  }));
}));

ops.get('/service-identities', requireRole(...AGENT, 'super_admin', 'security'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query('SELECT id,name,purpose,environment,owner_user_id,expiry_date,status,created_by,created_at FROM service_identities ORDER BY created_at DESC LIMIT 500')).rows));
}));

// ----------------- Owner rent statement and reconciliation export -----------------
ops.get('/owners/:id/rent-statement', requireRole(...AGENT, 'property_owner', 'finance', 'finance_manager', 'super_admin'), h(async (req, res) => {
  const ownerId = req.params.id;
  const asCsv = String(req.query.format ?? '').toLowerCase() === 'csv';
  const rows = await withUser(req.user!, async (c) => (await c.query(
    `SELECT p.id AS property_id, p.address, u.unit_no, l.id AS lease_id,
      COALESCE(SUM(rc.amount),0) AS total_charges,
      COALESCE(SUM(CASE WHEN rt.status='reconciled' AND rt.kind='rent' THEN rt.amount ELSE 0 END),0) AS reconciled_rent,
      COALESCE(SUM(CASE WHEN rt.status='pending' AND rt.kind='rent' THEN rt.amount ELSE 0 END),0) AS pending_rent,
      COALESCE(SUM(CASE WHEN rt.status='reconciled' AND rt.kind='deposit' THEN rt.amount ELSE 0 END),0) AS deposit_reconciled,
      COALESCE(SUM(CASE WHEN rt.status='pending' AND rt.kind='deposit' THEN rt.amount ELSE 0 END),0) AS deposit_pending
     FROM properties p
     JOIN property_units u ON u.property_id = p.id
     JOIN leases l ON l.unit_id = u.id
     LEFT JOIN rent_charges rc ON rc.lease_id = l.id
     LEFT JOIN rent_transactions rt ON rt.lease_id = l.id
     WHERE p.owner_user_id = $1
     GROUP BY p.id, u.unit_no, l.id, p.address
     ORDER BY p.address, u.unit_no
    `, [ownerId])).rows);
  if (asCsv) {
    const header = ['property_id','address','unit_no','lease_id','total_charges','reconciled_rent','pending_rent','deposit_reconciled','deposit_pending'];
    const csv = [header.join(',')].concat(rows.map((r: any) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="owner-${ownerId}-rent-statement.csv"`);
    return res.send(csv);
  }
  res.json(rows);
}));

// ----------------- Release approvals (record owner sign-off) -----------------
ops.post('/releases/:id/approve', requireRole('super_admin','global_admin'), h(async (req, res) => {
  const b = z.object({
    approver_role: z.string().min(2).max(100),
    approver_name: z.string().min(2).max(200),
    approver_email: z.string().email().optional(),
    decision: z.enum(['approve','reject']),
    notes: z.string().max(4000).optional(),
  }).parse(req.body);
  res.status(201).json(await withUser(req.user!, async (c) => {
    const row = (await c.query(
      `INSERT INTO release_approvals (release_candidate, approver_role, approver_name, approver_email, decision, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, b.approver_role, b.approver_name, b.approver_email ?? null, b.decision, b.notes ?? null],
    )).rows[0];
    await audit(c, req.user!.id, 'release_approval_recorded', 'release_approval', row.id, null, { release_candidate: req.params.id, decision: b.decision });
    return row;
  }));
}));

ops.post('/charges/:id/pay', requireActivity('rent.payments.submit'), h(async (req, res) => {
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

ops.post('/leases/:id/deposit/pay', requireActivity('rent.payments.submit'), h(async (req, res) => {
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

ops.post('/leases/:id/deposit/refund', requireActivity('rent.deposit.refund_request'), h(async (req, res) => {
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

ops.post('/rent-transactions/:id/reconcile', requireActivity('rent.transactions.reconcile'), h(async (req, res) => {
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

ops.post('/rent-transactions/:id/void', requireActivity('rent.transactions.void'), h(async (req, res) => {
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

ops.get('/rent-transactions/pending', requireAnyActivity('rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void'), h(async (req, res) => {
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
