import '../src/env.js';

// Integration tests use TEST_DATABASE_URL (a disposable elevated test role) for fixtures
// and DATABASE_URL for the API's restricted runtime role. Start the API with `npm run dev`.
// Run: npm run test:integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api/v1';
const SECRET = process.env.JWT_SECRET!;
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL must explicitly point to a disposable integration-test database');
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\/+/, ''));
if (!/^(?:test[_-]|afrolife[_-]test(?:[_-]|$))/i.test(testDatabaseName)) {
  throw new Error('TEST_DATABASE_URL must target a database named test_* or afrolife_test*; refusing to modify a normal application database');
}
const db = new pg.Pool({ connectionString: testDatabaseUrl });
const run = randomInt(0, 10_000_000).toString().padStart(7, '0');
const uniquePhone = () => `+2519${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
const PW = 'Passw0rd!test';
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('kyc-test-image')]);

type U = { id: string; role: string; phone: string; token: string };

test('health endpoint confirms the database connection', async () => {
  const response = await fetch((process.env.API_URL ?? 'http://localhost:3000') + '/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: 'connected' });
});

async function mkUser(role: string, n: number): Promise<U> {
  const phone = `+2519${run}${n}`;
  const r = await db.query(
    "INSERT INTO users (legal_name, phone, role, kyc_status, active, password_hash) VALUES ($1,$2,$3,'verified',true,$4) RETURNING id",
    [`${role}-${n}`, phone, role, bcrypt.hashSync(PW, 4)],
  );
  const id = r.rows[0].id as string;
  const sessionId = randomUUID();
  await db.query('INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,now()+interval \'8 hours\')', [sessionId, id]);
  return { id, role, phone, token: jwt.sign({ sub: id, role, sid: sessionId }, SECRET, { expiresIn: '8h' }) };
}

async function call(u: Pick<U, 'token'>, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + u.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function callFile(u: Pick<U, 'token'>, path: string, file: Buffer, contentType = 'image/png') {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + u.token, 'content-type': contentType },
    body: file,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

// ---- Setup: one user per role; two field agents under one master ----
const tid = (await db.query("INSERT INTO territories (level, name) VALUES ('city', $1) RETURNING id", ['Test ' + run])).rows[0].id;
const admin = await mkUser('super_admin', 1);
const globalAdmin = await mkUser('global_admin', 10);
const compliance = await mkUser('compliance', 2);
const fin1 = await mkUser('finance', 3);
const fin2 = await mkUser('finance_manager', 4);
const learningManager = await mkUser('corporate_business_manager', 11);
const learningCustomer = await mkUser('customer', 12);
const master = await mkUser('master_agent', 5);
const fa = await mkUser('field_agent', 6);
const fb = await mkUser('field_agent', 7);
await db.query("INSERT INTO agents (id, agent_type, parent_id, territory_id) VALUES ($1,'master',NULL,$2)", [master.id, tid]);
for (const f of [fa, fb]) await db.query("INSERT INTO agents (id, agent_type, parent_id, territory_id) VALUES ($1,'field',$2,$3)", [f.id, master.id, tid]);

async function newContract(agent: U, track: 'A' | 'B', suffix: number) {
  const lead = await call(agent, 'POST', '/leads', { lead_type: 'household', name: 'Test Customer ' + suffix, phone: `+2517${run}${suffix}` });
  assert.equal(lead.status, 201);
  const c = await call(agent, 'POST', `/leads/${lead.body.id}/contracts`, { track, base_value: 100000 });
  assert.equal(c.status, 201);
  return { lead: lead.body, contract: c.body };
}

async function drive(agent: U, contractId: string, amount: number) {
  const t = (u: U, action: string, body?: object) => call(u, 'POST', `/contracts/${contractId}/transition`, { action, ...body });
  assert.equal((await t(agent, 'submit')).status, 200);
  assert.equal((await t(compliance, 'verify_kyc')).status, 200);
  assert.equal((await t(admin, 'approve')).status, 200);
  const partySigned = await callFile(agent, `/contracts/${contractId}/documents?stage=party_signed`, PNG);
  assert.equal(partySigned.status, 201, JSON.stringify(partySigned.body));
  const companySigned = await callFile(admin, `/contracts/${contractId}/documents?stage=company_countersigned`, PNG);
  assert.equal(companySigned.status, 201, JSON.stringify(companySigned.body));
  assert.equal((await t(admin, 'sign')).status, 200);
  assert.equal((await t(fin1, 'record_payment', { channel: 'telebirr', reference: randomUUID(), amount })).status, 200);
  return (await t(fin2, 'reconcile')).body;
}

let A: Awaited<ReturnType<typeof newContract>>;

test('role access and learning content work through the restricted API runtime', async () => {
  const roleAccess = await call(admin, 'GET', '/role-access');
  assert.equal(roleAccess.status, 200);
  assert.equal(roleAccess.body.roles.find((role: any) => role.key === 'super_admin').editable, false);
  assert.equal((await call(globalAdmin, 'GET', '/role-access')).status, 403);
  const accessHistoryUser = await mkUser('customer', 92);
  assert.equal((await call(admin, 'POST', `/users/${accessHistoryUser.id}/deactivate`, {
    reason: 'Synthetic UAT account deactivation for access history verification',
  })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const inactiveAt = new Date(Date.now() - 10).toISOString();
  assert.equal((await call(admin, 'POST', `/users/${accessHistoryUser.id}/activate`, {
    reason: 'Synthetic UAT account reactivation after access history verification',
  })).status, 200);
  const accessHistory = await call(admin, 'GET', `/users/${accessHistoryUser.id}/access-history`);
  assert.equal(accessHistory.status, 200);
  assert.equal(accessHistory.body.history[0].current_active, true);
  assert.equal(accessHistory.body.history[0].actor_id, admin.id);
  assert.ok(accessHistory.body.history.some((event: any) =>
    event.current_active === false
    && event.actor_id === admin.id
    && event.reason === 'Synthetic UAT account deactivation for access history verification'));
  const historicalState = await call(admin, 'GET',
    `/users/${accessHistoryUser.id}/access-history?at=${encodeURIComponent(inactiveAt)}`);
  assert.equal(historicalState.status, 200);
  assert.equal(historicalState.body.state_at_time.active, false);
  assert.equal((await call(accessHistoryUser, 'GET', `/users/${accessHistoryUser.id}/access-history`)).status, 403);
  assert.equal((await call(admin, 'GET', '/role-access/history?limit=1')).status, 200);
  assert.equal((await call(admin, 'PATCH', '/role-access', {
    changes: [{ role: 'super_admin', activity: 'learning.content.view', enabled: false }],
  })).status, 422);

  const denied = await call(admin, 'PATCH', '/role-access', {
    changes: [{ role: 'customer', activity: 'learning.content.view', enabled: false }],
  });
  assert.equal(denied.status, 200);
  assert.equal((await call(learningCustomer, 'GET', '/learning/content')).status, 403);
  assert.equal((await call(fin1, 'POST', '/learning/content', {
    title: 'Unauthorized UAT content',
    summary: 'Finance role cannot publish learning materials',
    category: 'general_support',
    content_type: 'article',
    audience_roles: ['customer'],
    body: 'This content must not be created.',
    status: 'published',
  })).status, 403);

  const restored = await call(admin, 'PATCH', '/role-access', {
    changes: [{ role: 'customer', activity: 'learning.content.view', enabled: true }],
  });
  assert.equal(restored.status, 200);
  const content = await call(learningManager, 'POST', '/learning/content', {
    title: 'UAT Tenant Guide',
    summary: 'Synthetic customer-targeted training content',
    category: 'tenant_support',
    content_type: 'video',
    audience_roles: ['customer'],
    video_url: 'https://example.invalid/uat-guide',
    body: 'Synthetic training content for disposable UAT only.',
    status: 'published',
  });
  assert.equal(content.status, 201);
  const audience = await call(learningCustomer, 'GET', '/learning/content');
  assert.equal(audience.status, 200);
  assert.ok(audience.body.some((item: any) => item.id === content.body.id));

  const updated = await call(learningManager, 'PATCH', `/learning/content/${content.body.id}`, {
    title: 'Updated UAT Tenant Guide',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, 'Updated UAT Tenant Guide');
  assert.equal((await call(learningManager, 'DELETE', `/learning/content/${content.body.id}`)).status, 200);
  const noLongerPublished = await call(learningCustomer, 'GET', '/learning/content');
  assert.ok(!noLongerPublished.body.some((item: any) => item.id === content.body.id));

  const audit = await db.query(
    'SELECT action FROM learning_content_audit WHERE content_id=$1 ORDER BY id',
    [content.body.id],
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ['published', 'updated', 'archived']);
});

test('login returns a token for an active user', async () => {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: admin.phone, password: PW }) });
  assert.equal(r.status, 200);
  const result = await r.json() as { token: string };
  const claims = jwt.decode(result.token) as { sid?: string } | null;
  assert.ok(claims?.sid);
  assert.ok((await db.query('SELECT 1 FROM auth_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [claims.sid, admin.id])).rowCount);
});

test('authenticated requests reject a session that exceeded its inactivity window', async () => {
  const idle = await mkUser('customer', 90);
  await db.query(
    `UPDATE auth_sessions SET last_activity_at=now()-interval '9 hours',expires_at=now()+interval '1 hour'
     WHERE user_id=$1`,
    [idle.id],
  );
  assert.equal((await call(idle, 'GET', '/auth/me')).status, 401);
});

test('logout revokes the current server-side session', async () => {
  const user = await mkUser('customer', 91);
  await db.query("UPDATE auth_sessions SET last_activity_at=now()-interval '2 minutes' WHERE user_id=$1", [user.id]);
  assert.equal((await call(user, 'GET', '/auth/session')).status, 204);
  assert.ok((await db.query(
    "SELECT 1 FROM auth_sessions WHERE user_id=$1 AND last_activity_at>now()-interval '1 minute'",
    [user.id],
  )).rowCount);
  assert.equal((await call(user, 'POST', '/auth/logout')).status, 204);
  assert.equal((await call(user, 'GET', '/auth/me')).status, 401);
});

test('privacy case events record safe before/after metadata for incident updates', async () => {
  const created = await call(compliance, 'POST', '/privacy/incidents', {
    incident_type: 'other',
    severity: 'low',
    summary: 'Synthetic privacy event test',
    details: 'Synthetic details for the privacy event integration test',
    affected_data: 'Synthetic records',
    affected_people_estimate: 1,
  });
  assert.equal(created.status, 201);
  const update = await call(compliance, 'PATCH', `/privacy/incidents/${created.body.id}`, {
    status: 'contained',
    assigned_to: compliance.id,
    containment_actions: 'Synthetic containment details for the privacy event test',
  });
  assert.equal(update.status, 200);
  const events = await call(compliance, 'GET', `/privacy/cases/privacy_incident/${created.body.id}/events`);
  assert.equal(events.status, 200);
  const event = events.body.find((item: any) => item.action === 'updated');
  assert.equal(event.details.before.status, 'open');
  assert.equal(event.details.after.status, 'contained');
  assert.equal(event.details.containment_changed, true);
  assert.doesNotMatch(JSON.stringify(event.details), /Synthetic containment details/);
});

test('public sign-up creates a pending account that cannot sign in before approval', async () => {
  const phone = uniquePhone();
  const response = await fetch(API + '/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      legal_name: 'Pending Customer',
      phone,
      email: '',
      password: 'FreshSignupPass!2026',
      password_confirmation: 'FreshSignupPass!2026',
      account_type: 'customer',
    }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as any).status, 'pending_approval');
  const stored = (await db.query(
    `SELECT u.role, u.active, u.kyc_status, s.account_type, s.status
     FROM users u JOIN user_signups s ON s.user_id = u.id WHERE u.phone = $1`,
    [phone],
  )).rows[0];
  assert.equal(stored.role, 'customer');
  assert.equal(stored.active, false);
  assert.equal(stored.kyc_status, 'uploaded');
  assert.equal(stored.account_type, 'customer');
  assert.equal(stored.status, 'pending');
  const login = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: 'FreshSignupPass!2026' }),
  });
  assert.equal(login.status, 401);
});

test('worker sign-up uploads private KYC documents and requires separate compliance review', async () => {
  const phone = uniquePhone();
  const response = await fetch(API + '/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      legal_name: 'KYC Worker',
      phone,
      password: 'KycWorkerPass!2026',
      password_confirmation: 'KycWorkerPass!2026',
      account_type: 'worker',
      worker_document_consent: true,
      date_of_birth: '1990-01-01',
    }),
  });
  assert.equal(response.status, 201);
  const signup = await response.json() as any;
  const user = (await db.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0];
  assert.ok(user);
  assert.equal((await fetch(API + '/auth/signup/documents?doc_type=national_id', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: PNG,
  })).status, 401);

  for (const doc_type of ['national_id', 'police_clearance']) {
    const uploaded = await fetch(`${API}/auth/signup/documents?doc_type=${doc_type}`, {
      method: 'POST',
      headers: { authorization: `Signup ${signup.upload_token}`, 'content-type': 'image/png' },
      body: PNG,
    });
    assert.equal(uploaded.status, 201, `${doc_type}: ${await uploaded.text()}`);
  }
  const tokenStatus = await fetch(API + '/auth/signup/documents', {
    headers: { authorization: `Signup ${signup.upload_token}` },
  });
  assert.equal(tokenStatus.status, 200);
  const initialStatus = await tokenStatus.json() as any;
  assert.deepEqual(initialStatus.required.sort(), ['national_id', 'police_clearance']);
  const identityDocumentStatus = initialStatus.documents.find((doc: any) => doc.doc_type === 'national_id');
  assert.equal(identityDocumentStatus.status, 'uploaded');
  const identityDocument = (await db.query(
    "SELECT id FROM user_documents WHERE user_id = $1 AND doc_type = 'national_id'",
    [user.id],
  )).rows[0];
  assert.ok(identityDocument);
  assert.equal((await call(compliance, 'POST', `/users/${user.id}/documents/${identityDocument.id}/review`, {
    decision: 'rejected',
  })).status, 422);
  const rejectionNote = 'The identity image is blurred; upload a clearer copy.';
  const rejected = await call(compliance, 'POST', `/users/${user.id}/documents/${identityDocument.id}/review`, {
    decision: 'rejected', note: rejectionNote,
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.review_note, rejectionNote);
  const rejectedStatus = await fetch(API + '/auth/signup/documents', {
    headers: { authorization: `Signup ${signup.upload_token}` },
  });
  assert.equal(rejectedStatus.status, 200);
  const rejectedDocuments = await rejectedStatus.json() as any;
  assert.equal(rejectedDocuments.documents.find((doc: any) => doc.doc_type === 'national_id').review_note, rejectionNote);
  const replacement = await fetch(`${API}/auth/signup/documents?doc_type=national_id`, {
    method: 'POST',
    headers: { authorization: `Signup ${signup.upload_token}`, 'content-type': 'image/png' },
    body: PNG,
  });
  assert.equal(replacement.status, 201);
  assert.equal((await replacement.json() as any).id, identityDocument.id);
  const replacedDocuments = await call(compliance, 'GET', `/users/${user.id}/documents`);
  assert.equal(replacedDocuments.status, 200);
  const replacedIdentity = replacedDocuments.body.find((doc: any) => doc.doc_type === 'national_id');
  assert.equal(replacedIdentity.id, identityDocument.id);
  assert.equal(replacedIdentity.status, 'uploaded');
  assert.equal(replacedIdentity.review_note, null);
  assert.equal((await call(compliance, 'POST', `/users/${user.id}/kyc`, { decision: 'verified' })).status, 409);
  const documents = await call(compliance, 'GET', `/users/${user.id}/documents`);
  assert.equal(documents.status, 200);
  assert.deepEqual(documents.body.map((doc: any) => doc.doc_type).sort(), ['national_id', 'police_clearance']);
  for (const document of documents.body) {
    assert.equal((await call(compliance, 'POST', `/users/${user.id}/documents/${document.id}/review`, { decision: 'verified' })).status, 200);
    const downloaded = await fetch(`${API}/users/${user.id}/documents/${document.id}/file`, {
      headers: { authorization: 'Bearer ' + compliance.token },
    });

    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), PNG);
  }
  assert.equal((await call(compliance, 'POST', `/users/${user.id}/kyc`, { decision: 'verified' })).status, 200);
  assert.equal((await call(admin, 'POST', `/users/${user.id}/activate`)).status, 200);
});

test('property-owner sign-up completes national-ID review and remains an owner role', async () => {
  const phone = uniquePhone();
  const response = await fetch(API + '/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      legal_name: 'Property Owner',
      phone,
      password: 'PropertyOwnerPass!2026',
      password_confirmation: 'PropertyOwnerPass!2026',
      account_type: 'property_owner',
      requested_plan: 'free',
    }),
  });
  assert.equal(response.status, 201);
  const signup = await response.json() as any;
  const owner = (await db.query(
    `SELECT u.id, u.role, u.active, s.account_type, s.status
     FROM users u JOIN user_signups s ON s.user_id = u.id WHERE u.phone = $1`,
    [phone],
  )).rows[0];
  assert.equal(owner.role, 'property_owner');
  assert.equal(owner.active, false);
  assert.equal(owner.account_type, 'property_owner');
  assert.equal(owner.status, 'pending');

  const uploaded = await fetch(`${API}/auth/signup/documents?doc_type=national_id`, {
    method: 'POST',
    headers: { authorization: `Signup ${signup.upload_token}`, 'content-type': 'image/png' },
    body: PNG,
  });
  assert.equal(uploaded.status, 201);
  const documents = await call(compliance, 'GET', `/users/${owner.id}/documents`);
  assert.equal(documents.status, 200);
  assert.equal(documents.body.length, 1);
  assert.equal((await call(compliance, 'POST', `/users/${owner.id}/documents/${documents.body[0].id}/review`, { decision: 'verified' })).status, 200);
  assert.equal((await call(compliance, 'POST', `/users/${owner.id}/kyc`, { decision: 'verified' })).status, 200);
  assert.equal((await call(admin, 'POST', `/users/${owner.id}/activate`)).status, 200);
});

test('Gate 3: lead is attributed to its agent; duplicate phone is rejected', async () => {
  A = await newContract(fa, 'A', 1);
  assert.equal(A.lead.source_agent_id, fa.id);
  assert.ok(new Date(A.lead.protected_until).getTime() > Date.now() + 89 * 86400000);
  const dup = await call(fb, 'POST', '/leads', { lead_type: 'household', name: 'Copy', phone: A.lead.phone });
  assert.equal(dup.status, 409);
});

test('Global Admin can formally reassign an unconverted lead with an immutable attribution trail', async () => {
  const created = await call(fa, 'POST', '/leads', {
    lead_type: 'business', name: 'Reassignment test', phone: uniquePhone(),
  });
  assert.equal(created.status, 201);
  const before = await call(fa, 'GET', `/leads/${created.body.id}/attribution-history`);
  assert.equal(before.status, 200);
  assert.equal(before.body.length, 1);
  assert.equal(before.body[0].event_type, 'created');

  const moved = await call(globalAdmin, 'POST', `/admin/leads/${created.body.id}/reassign`, {
    target_agent_id: fb.id, reason: 'Territory coverage requires an accountable reassignment',
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.source_agent_id, fb.id);
  assert.ok(new Date(moved.body.protected_until).getTime() > Date.now() + 89 * 86400000);
  const after = await call(fb, 'GET', `/leads/${created.body.id}/attribution-history`);
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.map((event: any) => event.event_type), ['created','reassigned']);
  assert.equal((await call(fa, 'GET', `/leads/${created.body.id}/attribution-history`)).status, 404);
  assert.equal((await call(globalAdmin, 'POST', `/admin/leads/${created.body.id}/reassign`, {
    target_agent_id: fa.id, reason: 'short',
  })).status, 400);

  const activeLead = await call(fb, 'POST', '/leads', {
    lead_type: 'household', name: 'Contracted lead', phone: uniquePhone(),
  });
  assert.equal((await call(fb, 'POST', `/leads/${activeLead.body.id}/contracts`, { track: 'A', base_value: 100000 })).status, 201);
  assert.equal((await call(globalAdmin, 'POST', `/admin/leads/${activeLead.body.id}/reassign`, {
    target_agent_id: fa.id, reason: 'Attempt to move a converted lead for test',
  })).status, 409);
});

test('Gate 8: agents cannot see each other\'s leads; master sees the downline', async () => {
  const ids = (r: any) => r.body.map((l: any) => l.id);
  assert.ok(ids(await call(fa, 'GET', '/leads')).includes(A.lead.id));
  assert.ok(!ids(await call(fb, 'GET', '/leads')).includes(A.lead.id));
  assert.ok(ids(await call(master, 'GET', '/leads')).includes(A.lead.id));
});

test('Gate 3: the same number written another way is still a duplicate', async () => {
  const alt = '0' + A.lead.phone.slice(4); // +251 7xxxxxxxx -> 07xxxxxxxx
  assert.equal((await call(fb, 'POST', '/leads', { lead_type: 'household', name: 'Copy again', phone: alt })).status, 409);
  assert.equal((await call(fb, 'POST', '/leads', { lead_type: 'household', name: 'Bad', phone: '12345' })).status, 400);
});

test('business rules are Global Admin-only, audited, validated, and applied to unsigned contracts', async () => {
  const settings = await call(globalAdmin, 'GET', '/business-rules');
  assert.equal(settings.status, 200);
  const oldRate = Number(settings.body.find((rule: any) => rule.key === 'A_onboarding_pct').value);
  assert.equal((await call(fa, 'GET', '/business-rules')).status, 403);
  assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', { values: { A_onboarding_pct: 101 } })).status, 422);
  assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', {
    values: {
      match_w_skills: 0, match_w_location: 0, match_w_availability: 0,
      match_w_experience: 0, match_w_rate: 0, match_w_language: 0,
    },
  })).status, 422);

  try {
    const updated = await call(globalAdmin, 'PATCH', '/business-rules', { values: { A_onboarding_pct: 21 } });
    assert.equal(updated.status, 200);
    const contract = (await call(fa, 'GET', '/contracts')).body.find((item: any) => item.id === A.contract.id);
    assert.equal(Number(contract.onboarding_amt), 21000);
    assert.ok((await db.query("SELECT 1 FROM audit_logs WHERE action = 'business_rules_updated' AND actor_id = $1", [globalAdmin.id])).rowCount);
  } finally {
    assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', { values: { A_onboarding_pct: oldRate } })).status, 200);
  }

  const restored = (await call(fa, 'GET', '/contracts')).body.find((item: any) => item.id === A.contract.id);
  assert.equal(Number(restored.onboarding_amt), 20000);
});

test('public signup prices follow the current business rules', async () => {
  const [optionsResponse, rulesResponse] = await Promise.all([
    fetch(API + '/auth/signup/options'),
    call(globalAdmin, 'GET', '/business-rules'),
  ]);
  assert.equal(optionsResponse.status, 200);
  assert.equal(rulesResponse.status, 200);
  const options = await optionsResponse.json() as any;
  const rule = (key: string) => Number(rulesResponse.body.find((entry: any) => entry.key === key).value);
  assert.equal(options.plans.agent_pro_monthly_etb, rule('agent_pro_monthly_etb'));
  assert.equal(options.plans.agent_enterprise_monthly_etb, rule('agent_enterprise_monthly_etb'));
});

test('rule changes update contracts awaiting signature, not signed contracts, and invoice timing', async () => {
  const settings = await call(globalAdmin, 'GET', '/business-rules');
  const value = (key: string) => Number(settings.body.find((rule: any) => rule.key === key).value);
  const oldRate = value('A_onboarding_pct');
  const oldDueDays = value('invoice_due_days');
  const created = await newContract(fa, 'A', 3);
  const transition = (user: U, action: string) =>
    call(user, 'POST', `/contracts/${created.contract.id}/transition`, { action });

  try {
    assert.equal((await transition(fa, 'submit')).status, 200);
    assert.equal((await transition(compliance, 'verify_kyc')).status, 200);
    assert.equal((await transition(admin, 'approve')).status, 200);
    const awaitingSignature = await call(globalAdmin, 'PATCH', '/business-rules', {
      values: { A_onboarding_pct: 22, invoice_due_days: 3 },
    });
    assert.equal(awaitingSignature.status, 200);
    const unsigned = (await call(fa, 'GET', '/contracts')).body.find((item: any) => item.id === created.contract.id);
    assert.equal(unsigned.state, 'signature_pending');
    assert.equal(Number(unsigned.onboarding_amt), 22000);

    assert.equal((await callFile(admin, `/contracts/${created.contract.id}/documents?stage=company_countersigned`, PNG)).status, 409);
    assert.equal((await callFile(admin, `/contracts/${created.contract.id}/documents?stage=party_signed`, PNG)).status, 403);
    assert.equal((await callFile(fa, `/contracts/${created.contract.id}/documents?stage=party_signed`, PNG)).status, 201);
    assert.equal((await callFile(fa, `/contracts/${created.contract.id}/documents?stage=company_countersigned`, PNG)).status, 403);
    assert.equal((await callFile(admin, `/contracts/${created.contract.id}/documents?stage=company_countersigned`, PNG)).status, 201);
    assert.equal((await transition(admin, 'sign')).status, 200);
    const invoice = (await db.query(
      'SELECT (due_on - current_date)::int AS days_until_due FROM invoices WHERE contract_id = $1',
      [created.contract.id],
    )).rows[0];
    assert.equal(invoice.days_until_due, 3);

    assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', {
      values: { A_onboarding_pct: 23 },
    })).status, 200);
    const signed = (await call(fa, 'GET', '/contracts')).body.find((item: any) => item.id === created.contract.id);
    assert.equal(signed.state, 'payment_pending');
    assert.equal(Number(signed.onboarding_amt), 22000);
  } finally {
    assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', {
      values: { A_onboarding_pct: oldRate, invoice_due_days: oldDueDays },
    })).status, 200);
  }
});

test('login: the first typo after a lock has expired does not lock the account again', async () => {
  const u = await mkUser('finance', 8);
  await db.query("UPDATE users SET failed_logins = 5, locked_until = now() - interval '1 minute' WHERE id = $1", [u.id]);
  const login = (password: string) => fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: u.phone, password }) });
  assert.equal((await login('wrong-password')).status, 401);
  assert.equal((await login(PW)).status, 200); // used to be 429: the counter stayed at 5
});

test('login: a phone written with a leading 0 finds the same account', async () => {
  const u = await mkUser('finance', 9);
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '0' + u.phone.slice(4), password: PW }) });
  assert.equal(r.status, 200);
});

test('Track A fees are stored as separate amounts', () => {
  assert.equal(Number(A.contract.onboarding_amt), 20000);
  assert.equal(Number(A.contract.guarantee_amt), 2000);
  assert.equal(Number(A.contract.monthly_mgmt_amt), 5000);
});

test('Gate 5: steps are role-gated and cannot be skipped', async () => {
  const id = A.contract.id;
  assert.equal((await call(fa, 'POST', `/contracts/${id}/transition`, { action: 'approve' })).status, 403);
  assert.equal((await call(fin2, 'POST', `/contracts/${id}/transition`, { action: 'reconcile' })).status, 409);
});

test('Gate 6: payment must match the invoice; reconciler must differ from the recorder', async () => {
  const id = A.contract.id;
  const t = (u: U, action: string, body?: object) => call(u, 'POST', `/contracts/${id}/transition`, { action, ...body });
  await t(fa, 'submit'); await t(compliance, 'verify_kyc'); await t(admin, 'approve');
  assert.equal((await callFile(fa, `/contracts/${id}/documents?stage=party_signed`, PNG)).status, 201);
  assert.equal((await callFile(admin, `/contracts/${id}/documents?stage=company_countersigned`, PNG)).status, 201);
  await t(admin, 'sign');
  assert.equal((await t(fin1, 'record_payment', { channel: 'telebirr', reference: randomUUID(), amount: 26999 })).status, 422);
  assert.equal((await t(fin1, 'record_payment', { channel: 'telebirr', reference: randomUUID(), amount: 27000 })).status, 200);
  assert.equal((await t(fin1, 'reconcile')).status, 403);
  const done = await t(fin2, 'reconcile');
  assert.equal(done.status, 200);
  assert.equal(done.body.state, 'active');
});

let comm: any;
test('Gate 7: first contract creates a 50% commission excluding the guarantee', async () => {
  comm = (await call(admin, 'GET', '/commissions')).body.find((k: any) => k.contract_id === A.contract.id);
  assert.ok(comm);
  assert.equal(Number(comm.eligible_revenue), 25000);
  assert.equal(Number(comm.amount), 12500);
  assert.equal(comm.status, 'qualified');
});

test('Gate 7: four-eyes approval, then only Super Admin can pay', async () => {
  assert.equal((await call(fin2, 'POST', `/commissions/${comm.id}/approve`)).status, 403); // fin2 qualified it
  assert.equal((await call(fin1, 'POST', `/commissions/${comm.id}/approve`)).status, 200);
  assert.equal((await call(fin1, 'POST', `/commissions/${comm.id}/pay`, { reference: 'PAY-001' })).status, 403);
  const paid = await call(admin, 'POST', `/commissions/${comm.id}/pay`, { reference: 'PAY-001' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.status, 'paid');
  assert.equal((await call(admin, 'POST', `/commissions/${comm.id}/pay`, { reference: 'PAY-002' })).status, 409);
});

test('Gate 6: every ledger transaction balances and entries cannot be changed', async () => {
  const bad = await db.query('SELECT txn_id FROM ledger_entries GROUP BY txn_id HAVING sum(debit) <> sum(credit)');
  assert.equal(bad.rowCount, 0);
  await assert.rejects(db.query('UPDATE ledger_entries SET debit = debit + 1 WHERE id = (SELECT min(id) FROM ledger_entries)'), /append-only/);
});

test('Gate 7: a lead cannot be converted twice, and a renewal earns no commission', async () => {
  assert.equal((await call(fa, 'POST', `/leads/${A.lead.id}/contracts`, { track: 'A', base_value: 1000 })).status, 409);
  const ren = await call(admin, 'POST', `/contracts/${A.contract.id}/renew`);
  assert.equal(ren.status, 201);
  assert.equal(ren.body.is_renewal, true);
  const done = await drive(fa, ren.body.id, 27000);
  assert.equal(done.state, 'active');
  const forLead = (await call(admin, 'GET', '/commissions')).body.filter((k: any) => k.lead_id === A.lead.id);
  assert.equal(forLead.length, 1);
});

test('Track B: 10% + 10% agency revenue, commission is 50% of it', async () => {
  const B = await newContract(fb, 'B', 2);
  assert.equal(Number(B.contract.employer_fee_amt), 10000);
  assert.equal(Number(B.contract.other_fee_amt), 10000);
  await drive(fb, B.contract.id, 20000);
  const k = (await call(admin, 'GET', '/commissions')).body.find((x: any) => x.contract_id === B.contract.id);
  assert.equal(Number(k.amount), 10000);
});

test('lease defaults and maximum duration follow business rules', async () => {
  const settings = await call(globalAdmin, 'GET', '/business-rules');
  const oldDueDay = Number(settings.body.find((rule: any) => rule.key === 'lease_default_due_day').value);
  const oldMinMonths = Number(settings.body.find((rule: any) => rule.key === 'lease_min_term_months').value);
  const oldMaxMonths = Number(settings.body.find((rule: any) => rule.key === 'lease_max_months').value);
  try {
    assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', {
      values: { lease_default_due_day: 12, lease_min_term_months: 1, lease_max_months: 2 },
    })).status, 200);
    const property = await call(fa, 'POST', '/properties', {
      address: `Rule test property ${run}`,
      ptype: 'apartment_building',
      territory_id: tid,
      units: [{ unit_no: `R${run}`, rent: 15000 }],
    });
    assert.equal(property.status, 201);
    const unit = (await db.query('SELECT id FROM property_units WHERE property_id = $1', [property.body.id])).rows[0];
    const tenant = await call(fa, 'POST', '/tenants', {
      name: 'Rule Test Tenant',
      phone: `+2517${run}0`,
    });
    assert.equal(tenant.status, 201);
    const lease = {
      unit_id: unit.id,
      tenant_id: tenant.body.id,
      rent: 15000,
      start_date: '2030-01-01',
      months: 3,
    };
    assert.equal((await call(fa, 'POST', '/leases', lease)).status, 422);
    const created = await call(fa, 'POST', '/leases', { ...lease, months: 2 });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'active');
    const leaseEvidence = await db.query(
      'SELECT snapshot FROM lease_versions WHERE lease_id=$1 AND version=1',
      [created.body.id],
    );
    assert.equal(leaseEvidence.rows[0].snapshot.legacy_immediate_active_path, true);
    assert.equal(leaseEvidence.rows[0].snapshot.signature_evidence_available, false);
    const charges = await db.query(
      'SELECT due_on::text FROM rent_charges WHERE lease_id = $1 ORDER BY period',
      [created.body.id],
    );
    assert.deepEqual(charges.rows.map((charge) => charge.due_on), ['2030-01-12', '2030-02-12']);
  } finally {
    assert.equal((await call(globalAdmin, 'PATCH', '/business-rules', {
      values: { lease_default_due_day: oldDueDay, lease_min_term_months: oldMinMonths, lease_max_months: oldMaxMonths },
    })).status, 200);
  }
});

test('opt-in lease lifecycle requires independent approval, signature evidence, and handover before activation', async () => {
  const property = await call(fa, 'POST', '/properties', {
    address: `Workflow test property ${run}`,
    ptype: 'apartment_building',
    territory_id: tid,
    units: [{ unit_no: `W${run}`, rent: 12000 }],
  });
  assert.equal(property.status, 201);
  const unit = (await db.query('SELECT id FROM property_units WHERE property_id=$1', [property.body.id])).rows[0];
  const tenant = await call(fa, 'POST', '/tenants', {
    name: 'Workflow Test Tenant',
    phone: `+2517${run}1`,
  });
  assert.equal(tenant.status, 201);
  const lease = await call(fa, 'POST', '/leases/workflow', {
    unit_id: unit.id,
    tenant_id: tenant.body.id,
    rent: 12000,
    deposit: 24000,
    start_date: '2031-01-01',
    months: 24,
  });
  assert.equal(lease.status, 201, JSON.stringify(lease.body));
  assert.equal(lease.body.status, 'draft');
  assert.equal((await db.query('SELECT occupancy FROM property_units WHERE id=$1', [unit.id])).rows[0].occupancy, 'vacant');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM rent_charges WHERE lease_id=$1', [lease.body.id])).rows[0].count, 0);

  const reason = 'Terms reviewed for workflow UAT.';
  assert.equal((await call(fa, 'POST', `/leases/${lease.body.id}/submit-for-approval`, { reason })).status, 200);
  assert.equal((await call(fa, 'POST', `/leases/${lease.body.id}/approve`, { reason })).status, 403);
  const approved = await call(compliance, 'POST', `/leases/${lease.body.id}/approve`, { reason });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.status, 'pending_signature');

  const handover = { reason, handover_date: '2031-01-01', move_in_inspection_completed: true };
  assert.equal((await call(learningManager, 'POST', `/leases/${lease.body.id}/execute`, handover)).status, 409);
  for (const party of ['tenant', 'owner']) {
    const uploaded = await callFile(
      fa,
      `/leases/${lease.body.id}/signature-documents?party=${party}&signer_name=${encodeURIComponent(party === 'tenant' ? tenant.body.name : 'Workflow Property Owner')}`,
      PNG,
    );
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.signature_evidence_only, true);
  }
  assert.equal((await call(compliance, 'POST', `/leases/${lease.body.id}/execute`, handover)).status, 403);
  const executed = await call(learningManager, 'POST', `/leases/${lease.body.id}/execute`, handover);
  assert.equal(executed.status, 200, JSON.stringify(executed.body));
  assert.equal(executed.body.lease.status, 'active');
  assert.match(executed.body.lease.execution_hash, /^[0-9a-f]{64}$/);
  assert.equal(executed.body.signature_evidence_only, true);
  assert.equal((await db.query('SELECT occupancy FROM property_units WHERE id=$1', [unit.id])).rows[0].occupancy, 'occupied');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM rent_charges WHERE lease_id=$1', [lease.body.id])).rows[0].count, 24);
  const notice = {
    idempotency_key: randomUUID(),
    notice_type: 'tenant_to_owner',
    received_on: new Date().toISOString().slice(0, 10),
    proposed_effective_on: '2032-01-01',
    summary: 'Tenant reported an intended move-out date for review.',
  };
  assert.equal((await call(compliance, 'POST', `/leases/${lease.body.id}/notices`, notice)).status, 403);
  const recordedNotice = await call(fa, 'POST', `/leases/${lease.body.id}/notices`, notice);
  assert.equal(recordedNotice.status, 201, JSON.stringify(recordedNotice.body));
  assert.equal(recordedNotice.body.legal_effect, 'record_only');
  assert.match(recordedNotice.body.notice_disclaimer, /does not verify service/);
  assert.equal((await call(fa, 'POST', `/leases/${lease.body.id}/notices`, notice)).status, 200);
  assert.equal((await call(fa, 'POST', `/leases/${lease.body.id}/notices`, {
    ...notice, summary: 'Changed content reusing the original request key.',
  })).status, 409);
  const notices = await call(fa, 'GET', `/leases/${lease.body.id}/notices`);
  assert.equal(notices.status, 200);
  assert.equal(notices.body.length, 1);
  const leaseSummary = await call(fa, 'GET', '/leases');
  const leaseSummaryRow = leaseSummary.body.find((row: any) => row.id === lease.body.id);
  assert.equal(leaseSummaryRow.notice_type, 'tenant_to_owner');
  assert.equal(leaseSummaryRow.proposed_effective_on, '2032-01-01');
  assert.equal((await db.query('SELECT status FROM leases WHERE id=$1', [lease.body.id])).rows[0].status, 'active');
  await assert.rejects(
    db.query('UPDATE lease_notices SET summary=$2 WHERE id=$1', [recordedNotice.body.notice.id, 'Tampered notice summary']),
    /Lease notice records are append-only/,
  );
  await assert.rejects(
    db.query('UPDATE leases SET rent=rent+1 WHERE id=$1', [lease.body.id]),
    /Versioned lease terms are immutable/,
  );
});

test.after(() => db.end());
