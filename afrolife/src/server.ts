import './env.js';
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { z } from 'zod';
import { Phone } from './validators.js';
import { pool, withUser, authenticate, requireRole, HttpError, JWT_SECRET, assertRuntimeDatabaseSafety } from './core.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { createApiRateLimiter } from './rate-limit-store.js';
import { audit, feeSnapshot, loadRules, post, transition } from './domain.js';
import { supply } from './supply.js';
import { mfiRouter } from './mfi.js';
import { createInsuranceLedgerRouter } from './insurance-ledger.js';
import { createInsuranceServiceGateway, createPublicServiceGateway, createServiceGateway } from './insurance-service-gateway.js';
import { loginRouter, adminRouter } from './admin.js';
import { ops } from './ops.js';
import { privacy } from './privacy.js';
import { notify } from './notify.js';
import { paymentWebhook } from './webhooks.js';
import { dispatchOnce } from './dispatch.js';
import { sniff } from './files.js';
import { getFile, putFile } from './storage.js';

const app = express();
const runtimeConfig = loadRuntimeConfig(process.env);
const corsOrigins = new Set((process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean));
// Behind a load balancer / reverse proxy every request looks like the same IP unless this is set, which makes the login rate limit hit everyone at once.
// TRUST_PROXY=1 (number of proxy hops) or a subnet list; leave unset when the API is exposed directly.
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
// In development over http://localhost, the default "upgrade-insecure-requests" rule breaks asset loading in some browsers.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: {
  'connect-src': ["'self'", ...corsOrigins],
  ...(process.env.NODE_ENV === 'production' ? {} : { 'upgrade-insecure-requests': null }),
} } }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && corsOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-AfroLife-Edir-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && !corsOrigins.has(origin) ? 403 : 204);
  next();
});
if (!process.env.PAYMENT_WEBHOOK_SECRET) console.warn('PAYMENT_WEBHOOK_SECRET is not set: /webhooks/payments is disabled');
if (process.env.PAYMENT_WEBHOOK_SECRET) app.post('/webhooks/payments', express.raw({ type: 'application/json', limit: '100kb' }), paymentWebhook(process.env.PAYMENT_WEBHOOK_SECRET));
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', (_req, res, next) => {
  pool.query('SELECT 1').then(
    () => res.json({ ok: true, database: 'connected' }),
    next,
  );
}); // used by uptime monitors to check API and database readiness
// Resolve assets from source during development or from the project root after compilation.
const staticDirs = ['../../public', '../public', '../../web']
  .map((dir) => fileURLToPath(new URL(dir, import.meta.url)))
  .filter((dir) => existsSync(dir));
if (!staticDirs.length) throw new Error('Web assets were not found; expected a public/ or web/ directory');
for (const dir of staticDirs) app.use(express.static(dir));

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const STAFF = ['global_admin', 'super_admin', 'compliance', 'finance', 'finance_manager'];
const AGENT = ['master_agent', 'field_agent'];
const api = express.Router();

// ---- Auth (login with lockout and optional 2FA lives in admin.ts) ----
api.post('/auth/login', createApiRateLimiter('login', Number(process.env.LOGIN_RATE_LIMIT ?? 20)));
api.post('/auth/signup', createApiRateLimiter('signup', 5));
api.use(loginRouter);
api.post('/edir/public/registration-applications', createApiRateLimiter('edir-registration', 5));
api.post('/edir/public/registration-applications', process.env.EDIR_SERVICE_URL
  ? createPublicServiceGateway({
    baseUrl: process.env.EDIR_SERVICE_URL,
    secret: process.env.EDIR_GATEWAY_SECRET ?? '',
    servicePath: '/api/v1/edir',
    serviceName: 'AfroLife Edir registration',
  })
  : (_req, res) => res.status(503).json({ error: 'AfroLife Edir service is not configured' }));

api.use(authenticate);
api.use((req, _res, next) => {
  const organizationId = req.get('x-afrolife-edir-id');
  if (organizationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return next(new HttpError(400, 'Invalid Edir organization context'));
  }
  req.user!.edir_id = organizationId ?? '00000000-0000-4000-8000-000000000002';
  next();
});
// A token issued before a required security step (new password, 2FA setup) can only reach that step.
api.use((req, _res, next) => {
  const r = req.user!.rst;
  if (!r) return next();
  const ok = req.path === '/auth/me' || req.path === '/auth/session'
    || (r === 'password' ? req.path === '/auth/change-password' : req.path.startsWith('/auth/mfa'));
  next(ok ? undefined : new HttpError(403, 'Complete the required security step first'));
});
api.use((req, _res, next) => {
  if (req.user!.role !== 'global_admin') return next();
  withUser(req.user!, async (client) => {
    await audit(client, req.user!.id, 'global_admin_api_access', 'api_route',
      `${req.method} ${req.path}`, null, { user_agent: req.get('user-agent') ?? null });
  }).then(() => next(), next);
});
api.get('/features', (_req, res) => res.json({
  mfiPilotEnabled: runtimeConfig.mfiPilotEnabled,
  edirEnabled: Boolean(process.env.EDIR_SERVICE_URL),
}));
api.use(adminRouter);
api.use(privacy);
api.use(ops);
api.use(supply);
api.use('/edir', process.env.EDIR_SERVICE_URL
  ? createServiceGateway({
    baseUrl: process.env.EDIR_SERVICE_URL,
    secret: process.env.EDIR_GATEWAY_SECRET ?? '',
    servicePath: '/api/v1/edir',
    serviceName: 'AfroLife Edir service',
  })
  : (_req, res) => res.status(503).json({ error: 'AfroLife Edir service is not configured' }));
api.use('/insurance/ledger', process.env.INSURANCE_SERVICE_URL
  ? createInsuranceServiceGateway({
    baseUrl: process.env.INSURANCE_SERVICE_URL,
    secret: process.env.INSURANCE_GATEWAY_SECRET ?? '',
  })
  : createInsuranceLedgerRouter(withUser));
if (runtimeConfig.mfiPilotEnabled) {
  if (runtimeConfig.isProduction) console.warn('SACCO/MFI pilot is enabled; do not use for public deposits or regulated lending');
  api.use('/mfi', mfiRouter);
}

// ---- Leads (row-level security limits what each agent can see) ----
api.post('/leads', requireRole(...AGENT), h(async (req, res) => {
  const b = z.object({ lead_type: z.enum(['household', 'business', 'worker', 'property']), name: z.string().min(2), phone: Phone }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const r = await c.query('INSERT INTO leads (lead_type, name, phone, source_agent_id) VALUES ($1,$2,$3,$4) RETURNING *', [b.lead_type, b.name, b.phone, req.user!.id]);
    await audit(c, req.user!.id, 'lead_created', 'lead', r.rows[0].id, null, b);
    return r.rows[0];
  });
  res.status(201).json(row);
}));

api.get('/leads', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200')).rows));
}));

// ---- Contracts ----
api.post('/leads/:id/contracts', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const b = z.object({ track: z.enum(['A', 'B']), base_value: z.number().positive() }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const l = (await c.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!l) throw new HttpError(404, 'Lead not found');
    if (!['new', 'qualified'].includes(l.status)) throw new HttpError(409, `Lead is already ${l.status}`);
    const f = feeSnapshot(b.track, b.base_value, await loadRules(c));
    const r = await c.query(
      `INSERT INTO contracts (contract_no, lead_id, source_agent_id, track, base_value, onboarding_amt, guarantee_amt, monthly_mgmt_amt, employer_fee_amt, other_fee_amt)
       VALUES ('C-' || lpad(nextval('contract_seq')::text, 6, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [l.id, l.source_agent_id, b.track, b.base_value, f.onboarding_amt, f.guarantee_amt, f.monthly_mgmt_amt, f.employer_fee_amt, f.other_fee_amt],
    );
    await c.query("UPDATE leads SET status = 'converted' WHERE id = $1", [l.id]);
    await audit(c, req.user!.id, 'contract_created', 'contract', r.rows[0].id, null, { ...b, ...f });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

api.get('/contracts', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT k.*,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'document_stage',d.document_stage,'mime',d.mime,'size_bytes',d.size_bytes,'uploaded_by',d.uploaded_by,'uploader_role',u.role,'created_at',d.created_at) ORDER BY d.created_at DESC)
                 FROM contract_documents d JOIN users u ON u.id = d.uploaded_by WHERE d.contract_id = k.id), '[]'::jsonb) AS documents,
       (SELECT jsonb_build_object('signed_by',s.signed_by,'signer_name',u.legal_name,'signer_role',s.signer_role,'signed_at',s.signed_at)
        FROM contract_signatures s JOIN users u ON u.id = s.signed_by WHERE s.contract_id = k.id) AS signature
     FROM contracts k ORDER BY k.created_at DESC LIMIT 200`,
  )).rows));
}));

// Agent supplied contract files stay in private storage and are available only within the contract's RLS scope.
api.post('/contracts/:id/documents', requireRole(...AGENT, 'super_admin', 'corporate_business_manager'), express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
  const { stage } = z.object({ stage: z.enum(['party_signed', 'company_countersigned']) }).parse(req.query);
  const agentUploader = AGENT.includes(req.user!.role);
  if ((stage === 'party_signed' && !agentUploader) || (stage === 'company_countersigned' && !['global_admin', 'super_admin', 'corporate_business_manager'].includes(req.user!.role))) {
    throw new HttpError(403, 'Your role cannot upload this contract document stage');
  }
  const buf = req.body as Buffer;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'No file received');
  const mime = sniff(buf);
  if (!mime) throw new HttpError(415, 'Only PDF, JPEG or PNG files are accepted');
  const row = await withUser(req.user!, async (c) => {
    const contract = (await c.query('SELECT id, state FROM contracts WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!contract) throw new HttpError(404, 'Contract not found');
    if (contract.state !== 'signature_pending') throw new HttpError(409, 'Contract documents can be uploaded while awaiting signature');
    if (stage === 'company_countersigned') {
      const partySigned = await c.query(
        "SELECT 1 FROM contract_documents WHERE contract_id=$1 AND document_stage='party_signed' LIMIT 1",
        [contract.id],
      );
      if (!partySigned.rowCount) throw new HttpError(409, 'The agent must upload the party-signed contract first');
    }
    const key = randomUUID();
    const result = await c.query(
      `INSERT INTO contract_documents (contract_id, document_stage, storage_key, sha256, mime, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, document_stage, mime, size_bytes, created_at`,
      [contract.id, stage, key, createHash('sha256').update(buf).digest('hex'), mime, buf.length, req.user!.id],
    );
    await putFile(key, buf);
    await audit(c, req.user!.id, 'contract_document_uploaded', 'contract', contract.id, null, { document_id: result.rows[0].id, mime, size_bytes: buf.length });
    return result.rows[0];
  });
  res.status(201).json(row);
}));

api.get('/contract-documents/:id/file', h(async (req, res) => {
  const document = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, contract_id, storage_key, mime FROM contract_documents WHERE id = $1', [req.params.id],
  )).rows[0]);
  if (!document) throw new HttpError(404, 'Contract document not found');
  const file = await getFile(document.storage_key);
  res.set({ 'Content-Type': document.mime, 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(file);
}));

api.post('/contracts/:id/transition', h(async (req, res) => {
  const { action } = z.object({ action: z.string() }).parse(req.body);
  res.json(await withUser(req.user!, (c) => transition(c, req.user!, String(req.params.id), action, req.body)));
}));

api.post('/contracts/:id/renew', requireRole('super_admin'), h(async (req, res) => {
  const row = await withUser(req.user!, async (c) => {
    const o = (await c.query("SELECT * FROM contracts WHERE id = $1 AND state = 'active'", [req.params.id])).rows[0];
    if (!o) throw new HttpError(404, 'Active contract not found');
    const r = await c.query(
      `INSERT INTO contracts (contract_no, lead_id, source_agent_id, track, is_renewal, base_value, onboarding_amt, guarantee_amt, monthly_mgmt_amt, employer_fee_amt, other_fee_amt)
       VALUES ('C-' || lpad(nextval('contract_seq')::text, 6, '0'), $1,$2,$3,true,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [o.lead_id, o.source_agent_id, o.track, o.base_value, o.onboarding_amt, o.guarantee_amt, o.monthly_mgmt_amt, o.employer_fee_amt, o.other_fee_amt],
    );
    await audit(c, req.user!.id, 'renewal_created', 'contract', r.rows[0].id, null, { from: o.id });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

// ---- Invoices (staff only) ----
api.get('/invoices', requireRole(...STAFF), h(async (_req, res) => {
  res.json(await withUser(_req.user!, async (c) => (await c.query('SELECT * FROM invoices ORDER BY due_on DESC LIMIT 200')).rows));
}));

// ---- Commissions (finance approves; super admin pays; nothing is edited in place) ----
api.get('/commissions', h(async (req, res) => {
  const all = STAFF.includes(req.user!.role);
  res.json(await withUser(req.user!, async (c) => (await c.query(
    all ? `SELECT e.*, u.legal_name AS agent_name, k.contract_no
           FROM commission_events e JOIN users u ON u.id=e.agent_id JOIN contracts k ON k.id=e.contract_id
           ORDER BY e.created_at DESC LIMIT 200`
        : `SELECT e.*, u.legal_name AS agent_name, k.contract_no
           FROM commission_events e JOIN users u ON u.id=e.agent_id JOIN contracts k ON k.id=e.contract_id
           WHERE e.agent_id = $1 OR e.agent_id IN (SELECT id FROM agents WHERE parent_id = $1)
           ORDER BY e.created_at DESC LIMIT 200`,
    all ? [] : [req.user!.id],
  )).rows));
}));

api.post('/commissions/:id/approve', requireRole('finance', 'finance_manager'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const k = (await c.query('SELECT * FROM commission_events WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!k) throw new HttpError(404, 'Commission not found');
    if (k.status !== 'qualified') throw new HttpError(409, `Commission is ${k.status}`);
    if (k.qualified_by === req.user!.id) throw new HttpError(403, 'A different user must approve (four-eyes rule)');
    const r = await c.query("UPDATE commission_events SET status='approved', approved_by=$2 WHERE id=$1 RETURNING *", [k.id, req.user!.id]);
    await audit(c, req.user!.id, 'commission_approved', 'commission', k.id);
    await notify(c, k.agent_id, 'commission_approved', { amount: k.amount });
    return r.rows[0];
  }));
}));

api.post('/commissions/:id/pay', requireRole('super_admin'), h(async (req, res) => {
  const b = z.object({ reference: z.string().trim().min(3).max(200) }).strict().parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const k = (await c.query('SELECT * FROM commission_events WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!k) throw new HttpError(404, 'Commission not found');
    if (k.status !== 'approved') throw new HttpError(409, `Commission is ${k.status}; approve it first`);
    const amt = Math.round((Number(k.amount) - Number(k.held_amount ?? 0)) * 100) / 100;
    if (amt > 0) await post(c, 'commission', k.id, [['Commission Payable', amt, 0], ['Cash', 0, amt]]);
    const r = await c.query("UPDATE commission_events SET status='paid', paid_ref=$2 WHERE id=$1 RETURNING *", [k.id, amt > 0 ? b.reference : null]);
    await audit(c, req.user!.id, 'commission_paid', 'commission', k.id, null, { reference: amt > 0 ? b.reference : null, amount: amt, held_amount: k.held_amount ?? 0 });
    await notify(c, k.agent_id, 'commission_paid', { amount: amt });
    return r.rows[0];
  }));
}));

api.post('/commissions/:id/release-held', requireRole('super_admin'), h(async (req, res) => {
  const b = z.object({ reference: z.string().trim().min(3).max(200) }).strict().parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const k = (await c.query('SELECT * FROM commission_events WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!k) throw new HttpError(404, 'Commission not found');
    if (k.held_status !== 'held' || Number(k.held_amount) <= 0) throw new HttpError(409, 'This commission has no held amount to release.');
    if (k.holdback_release_on > new Date().toISOString().slice(0, 10)) throw new HttpError(409, `The held commission is available after ${k.holdback_release_on}.`);
    if (k.status === 'approved' && Number(k.amount) > Number(k.held_amount)) throw new HttpError(409, 'Pay the approved commission installment before releasing the holdback.');
    if (!['approved', 'paid'].includes(k.status)) throw new HttpError(409, `Commission is ${k.status}; approve it first.`);
    const amount = Number(k.held_amount);
    await post(c, 'commission_holdback', k.id, [['Commission Held Payable', amount, 0], ['Cash', 0, amount]]);
    const result = await c.query("UPDATE commission_events SET held_status='released', held_paid_ref=$2, status='paid' WHERE id=$1 RETURNING *", [k.id, b.reference]);
    await audit(c, req.user!.id, 'commission_holdback_released', 'commission', k.id, { held_status: k.held_status, amount }, { held_status: 'released', reference: b.reference });
    await notify(c, k.agent_id, 'commission_paid', { amount });
    return result.rows[0];
  }));
}));

app.use('/api/v1', api);

// ---- Errors: translate validation and database rule violations into clear responses ----
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
  if (err?.code === '22P02') return res.status(400).json({ error: 'Invalid id or value' }); // e.g. a malformed UUID in the URL
  if (err?.code === '23505') return res.status(409).json({ error: 'Duplicate record (e.g. phone already used, or commission already exists)' });
  if (err?.code === 'P0001' || err?.code === '23514') return res.status(422).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

// Outbox: deliver queued WhatsApp/SMS/email through a signed webhook (e.g. a Make.com scenario) when configured.
let dispatching = false; // a slow run must not overlap the next tick
if (process.env.NOTIFY_WEBHOOK_URL && process.env.NOTIFY_WEBHOOK_SECRET) {
  setInterval(async () => {
    if (dispatching) return;
    dispatching = true;
    try { await dispatchOnce(pool, process.env.NOTIFY_WEBHOOK_URL!, process.env.NOTIFY_WEBHOOK_SECRET!); }
    catch (e: any) { console.error('dispatch failed', e.message); }
    finally { dispatching = false; }
  }, 30_000).unref();
}

const onListening = () => console.log('API listening');
const port = Number(process.env.PORT ?? 3000);
if (runtimeConfig.isProduction) await assertRuntimeDatabaseSafety();
const server = process.env.HOST
  ? app.listen(port, process.env.HOST, onListening)
  : app.listen(port, onListening);

// Let in-flight requests (and their transactions) finish when the platform restarts the container.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => server.close(() => pool.end().finally(() => process.exit(0))));
}
