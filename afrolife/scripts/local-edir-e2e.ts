import '../src/env.js';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import pg from 'pg';
import { authenticateGateway } from '../services/afrolife-edir/auth.js';
import { verifyServiceAssertion } from '../src/insurance-service-gateway.js';
import { edirRouter } from '../services/afrolife-edir/router.js';
import { assertServiceDatabaseSafety, pool } from '../services/afrolife-edir/db.js';

const databaseUrl = new URL(process.env.EDIR_DATABASE_URL ?? '');
assert(['127.0.0.1','localhost','[::1]'].includes(databaseUrl.hostname), 'Edir UAT database must be local');
assert.equal(databaseUrl.port, '5433', 'Edir UAT must use the isolated local PostgreSQL port');
assert.equal(decodeURIComponent(databaseUrl.pathname.slice(1)), 'afrolife_edir_uat', 'Edir UAT must use its dedicated database');
assert.equal(decodeURIComponent(databaseUrl.username), 'afrolife_edir_uat_app', 'Edir UAT must use its restricted runtime role');
await assertServiceDatabaseSafety();

const secret = process.env.EDIR_GATEWAY_SECRET ?? '';
assert(secret.length >= 32, 'Local Edir gateway secret is missing');
const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch (error) { next(error); }
});
app.use('/api/v1/edir', authenticateGateway, edirRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const candidate = error as { status?: number; message?: string; flatten?: () => unknown };
  const status = candidate.status ?? (typeof candidate.flatten === 'function' ? 400 : 500);
  if (status >= 500) console.error('Local Edir UAT request failed:', error);
  res.status(status).json({ error: status === 500 ? 'Internal error' : candidate.message, ...(typeof candidate.flatten === 'function' ? { details: candidate.flatten() } : {}) });
});

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/v1/edir`;
const memberId = randomUUID();
const outsiderId = randomUUID();
const adminId = randomUUID();
const tenantId = '00000000-0000-4000-8000-000000000002';

type Actor = { userId: string; role: string; legalName?: string; phone?: string; email?: string | null; kycStatus?: string; organizationId: string };
function sign(actor: Actor, method: string, path: string, body: unknown) {
  const assertion = Buffer.from(JSON.stringify({ ...actor, issuedAt: Date.now() })).toString('base64url');
  const signedBody = body === undefined ? {} : body;
  const bodyHash = createHash('sha256').update(JSON.stringify(signedBody ?? null)).digest('hex');
  const signature = createHmac('sha256', secret).update(`${assertion}\n${method}\n${path}\n${bodyHash}`).digest('hex');
  assert(verifyServiceAssertion(secret, assertion, signature, method, path, signedBody), 'Locally generated UAT gateway assertion is valid');
  return { 'x-afrolife-identity': assertion, 'x-afrolife-signature': signature, ...(body === undefined ? {} : { 'content-type': 'application/json' }) };
}

async function call<T>(actor: Actor, method: string, path: string, body?: unknown, expectedStatus = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: sign(actor, method, `/api/v1/edir${path}`, body),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) as T : null;
  assert.equal(response.status, expectedStatus, `${method} ${path}: expected ${expectedStatus}, got ${response.status}: ${text}`);
  return result as T;
}

async function uploadNationalId(actor: Actor, file: Buffer, expectedStatus = 201) {
  const path = '/credit/documents/national_id';
  const headers = sign(actor, 'POST', path, file);
  headers['content-type'] = 'application/octet-stream';
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: new Uint8Array(file) });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `POST ${path}: expected ${expectedStatus}, got ${response.status}: ${text}`);
  return text ? JSON.parse(text) as { id: string; status: string; mime: string; size_bytes: number } : null;
}

const member: Actor = { userId: memberId, role: 'worker', legalName: 'Synthetic UAT Member', phone: `+251900${memberId.replaceAll('-','').slice(0,6)}`, email: null, kycStatus: 'verified', organizationId: tenantId };
const outsider: Actor = { userId: outsiderId, role: 'worker', legalName: 'Synthetic UAT Outsider', phone: `+251901${outsiderId.replaceAll('-','').slice(0,6)}`, kycStatus: 'verified', organizationId: tenantId };
const admin: Actor = { userId: adminId, role: 'super_admin', legalName: 'Synthetic UAT Edir Admin', organizationId: tenantId };
const secondReviewer: Actor = { userId: randomUUID(), role: 'compliance', legalName: 'Synthetic UAT Independent Reviewer', organizationId: tenantId };
const passed: string[] = [];

try {
  const enrollment = await call<{ id: string; status: string }>(member, 'POST', '/memberships', { accept_nonfinancial_terms: true }, 201);
  assert.equal(enrollment.status, 'pending');
  passed.push('Edir membership enrollment creates a pending request after verified KYC');

  await call(member, 'POST', `/memberships/${enrollment.id}/review`, { decision: 'active', reason: 'Synthetic self-review must be denied' }, 403);
  const ownPending = await call<{ membership: { status: string } }>(member, 'GET', '/me');
  assert.equal(ownPending.membership.status, 'pending');
  passed.push('Member cannot self-approve and the rejected attempt leaves membership pending');

  const approval = await call<{ id: string; status: string }>(admin, 'POST', `/memberships/${enrollment.id}/review`, { decision: 'active', reason: 'Independent synthetic UAT approval' });
  assert.equal(approval.status, 'active');
  const activeProfile = await call<{ membership: { id: string; status: string } }>(member, 'GET', '/me');
  assert.equal(activeProfile.membership?.id, enrollment.id);
  assert.equal(activeProfile.membership?.status, 'active');
  passed.push('Different authorized administrator activates the synthetic membership');

  const invalidDocument = Buffer.from('not a real identity document');
  await uploadNationalId(member, invalidDocument, 415);
  const minimalPdf = Buffer.from('%PDF-1.4\n% Synthetic UAT document\n%%EOF\n');
  const uploadedDocument = await uploadNationalId(member, minimalPdf);
  assert.equal(uploadedDocument?.status, 'uploaded');
  assert.equal(uploadedDocument?.mime, 'application/pdf');
  await call(member, 'POST', `/credit/members/${enrollment.id}/documents/${uploadedDocument!.id}/review`, {
    decision: 'verified', reason: 'Uploader must not approve their own synthetic document',
  }, 403);
  const verifiedDocument = await call<{ id: string; status: string; reviewed_by: string }>(secondReviewer,
    'POST', `/credit/members/${enrollment.id}/documents/${uploadedDocument!.id}/review`, {
      decision: 'verified', reason: 'Synthetic UAT document review by independent compliance actor',
    });
  assert.equal(verifiedDocument.status, 'verified');
  assert.equal(verifiedDocument.reviewed_by, secondReviewer.userId);
  await call(secondReviewer, 'POST', `/credit/members/${enrollment.id}/kyc-review`, {
    decision: 'verified', reason: 'This reviewer also reviewed the ID and must be rejected',
  }, 409);
  const verifiedKyc = await call<{ kyc_status: string; kyc_reviewed_by: string }>(admin,
    'POST', `/credit/members/${enrollment.id}/kyc-review`, {
      decision: 'verified', reason: 'Synthetic UAT KYC approved after independently verified national ID',
    });
  assert.equal(verifiedKyc.kyc_status, 'verified');
  assert.equal(verifiedKyc.kyc_reviewed_by, adminId);
  passed.push('Private national-ID upload rejects invalid content, prevents self-review, and requires an independent KYC decision');

  const complaint = await call<{ id: string; reference: string; status: string; resolution_due_at: string }>(member, 'POST', '/credit/complaints', {
    category: 'service', subject: 'Synthetic UAT complaint', description: 'Synthetic complaint used to validate Edir complaint intake and resolution.',
  }, 201);
  assert.equal(complaint.status, 'open');
  assert.match(complaint.reference, /^EDR-[A-F0-9]{12}$/);
  assert.ok(Date.parse(complaint.resolution_due_at) > Date.now());
  passed.push('Active member can create a tracked complaint with a future resolution target');

  const hiddenFromOutsider = await call<Array<{ id: string }>>(outsider, 'GET', '/credit/complaints');
  assert.equal(hiddenFromOutsider.some((row) => row.id === complaint.id), false);
  await call(outsider, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'investigating' }, 403);
  passed.push('Complaint is private to its member, and an unrelated member cannot manage it');

  await call(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'resolved' }, 422);
  const investigating = await call<{ status: string }>(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'investigating', priority: 'high' });
  assert.equal(investigating.status, 'investigating');
  const resolved = await call<{ status: string; resolution: string; resolved_by: string }>(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, {
    status: 'resolved', resolution: 'Synthetic UAT resolution; no real member complaint exists.',
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolved_by, adminId);
  const finalComplaints = await call<Array<{ id: string; status: string; resolution: string }>>(member, 'GET', '/credit/complaints');
  assert.equal(finalComplaints.find((row) => row.id === complaint.id)?.status, 'resolved');
  passed.push('Staff tracks a complaint through investigation and requires a resolution summary to close it');

  const audit = await call<Array<{ action: string; entity_id: string }>>(admin, 'GET', '/audit');
  assert(audit.some((event) => event.action === 'edir_complaint_opened' && event.entity_id === complaint.id));
  assert(audit.some((event) => event.action === 'edir_complaint_updated' && event.entity_id === complaint.id));
  passed.push('Complaint intake and resolution both create audit records');

  console.log(JSON.stringify({ result: 'PASS', environment: 'isolated local Edir UAT database', cases: passed, synthetic_ids: { member_id: memberId, outsider_id: outsiderId, admin_id: adminId, membership_id: enrollment.id, complaint_id: complaint.id }, note: 'Synthetic-only test data; no production or customer records used.' }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}
