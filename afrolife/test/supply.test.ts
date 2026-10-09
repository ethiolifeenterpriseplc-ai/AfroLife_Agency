import '../src/env.js';

// Integration tests use TEST_DATABASE_URL for fixture setup; the API runs with the
// restricted DATABASE_URL role so the HTTP requests exercise row-level security.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api/v1';
const SECRET = process.env.JWT_SECRET!;
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL });
const run = Date.now().toString().slice(-7);
const SECTOR = 'domestic-' + run; // unique per run so candidate lists are not polluted by other data
const SHA = 'a'.repeat(64);

type U = { id: string; role: string; token: string };

async function mkUser(role: string, n: number): Promise<U> {
  const r = await db.query(
    "INSERT INTO users (legal_name, phone, role, kyc_status, active, password_hash) VALUES ($1,$2,$3,'verified',true,$4) RETURNING id",
    [`${role}-${n}`, `+2517${run}${n}`, role, bcrypt.hashSync('Passw0rd!test', 4)],
  );
  const id = r.rows[0].id as string;
  return { id, role, token: jwt.sign({ sub: id, role }, SECRET) };
}

async function call(u: U, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + u.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

// ---- Setup: two sibling areas under one parent; admin, compliance, master, two field agents ----
const parent = Number((await db.query("INSERT INTO territories (level, name) VALUES ('city', $1) RETURNING id", ['P' + run])).rows[0].id);
const areaA = Number((await db.query("INSERT INTO territories (parent_id, level, name) VALUES ($1,'sub_city',$2) RETURNING id", [parent, 'A' + run])).rows[0].id);
const admin = await mkUser('super_admin', 1);
const compliance = await mkUser('compliance', 2);
const complianceAlt = await mkUser('compliance', 8);
const master = await mkUser('master_agent', 3);
const fa = await mkUser('field_agent', 4);
const fb = await mkUser('field_agent', 5);
const finance = await mkUser('finance', 6);
const propertyOwner = await mkUser('property_owner', 9);
const otherPropertyOwner = await mkUser('property_owner', 10);
const buyer = await mkUser('customer', 11);
await db.query("INSERT INTO agents (id, agent_type, parent_id, territory_id) VALUES ($1,'master',NULL,$2)", [master.id, areaA]);
for (const f of [fa, fb]) await db.query("INSERT INTO agents (id, agent_type, parent_id, territory_id) VALUES ($1,'field',$2,$3)", [f.id, master.id, areaA]);

const workerBody = (n: number, extra: object = {}) => ({
  name: 'Worker ' + n, phone: `+2511${run}${n}`, national_id: `ID${run}${n}`, sector: SECTOR,
  skills: ['cooking', 'cleaning'], languages: ['amharic'], experience_years: 5, rate_expected: 9000, territory_id: areaA, ...extra,
});
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('test-image-' + run)]);
async function upload(agent: U, workerId: string, doc_type: string, extra: Record<string, string> = {}, body: Buffer = PNG) {
  const qs = new URLSearchParams({ doc_type, ...extra });
  const r = await fetch(`${API}/workers/${workerId}/documents/upload?${qs}`, { method: 'POST', headers: { authorization: 'Bearer ' + agent.token, 'content-type': 'application/octet-stream' }, body });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

let w1: any, w2: any, w3: any, request: any, match: any;

test('workers: created by an agent; duplicate phone or national ID is rejected', async () => {
  const r = await call(fa, 'POST', '/workers', workerBody(1));
  assert.equal(r.status, 201);
  w1 = r.body;
  assert.equal(w1.verification, 'uploaded');
  assert.equal((await call(fb, 'POST', '/workers', workerBody(2, { phone: w1.phone }))).status, 409);
  assert.equal((await call(fb, 'POST', '/workers', workerBody(3, { national_id: w1.national_id }))).status, 409);
});

test('data isolation: another agent cannot see the worker; the master can', async () => {
  const ids = (r: any) => r.body.map((w: any) => w.id);
  assert.ok(!ids(await call(fb, 'GET', '/workers')).includes(w1.id));
  const visible = await call(master, 'GET', '/workers');
  assert.ok(ids(visible).includes(w1.id));
  assert.equal(visible.body.find((w: any) => w.id === w1.id).national_id, undefined);
  assert.equal((await upload(fb, w1.id, 'national_id')).status, 404);
});

test('verification: refused without verified documents; uploading is not verification', async () => {
  const none = await call(compliance, 'POST', `/workers/${w1.id}/verify`);
  assert.equal(none.status, 409);
  assert.match(none.body.error, /national_id/);
  const d1 = await upload(fa, w1.id, 'national_id');
  const d2 = await upload(fa, w1.id, 'police_clearance');
  const d3 = await upload(compliance, w1.id, 'reference');
  assert.equal(d1.status, 201);
  assert.equal(d2.status, 201);
  assert.equal(d3.status, 201);
  assert.equal((await call(compliance, 'POST', `/workers/${w1.id}/verify`)).status, 409); // still only uploaded
  assert.equal((await call(fa, 'POST', `/documents/${d1.body.id}/review`, { decision: 'verified' })).status, 403);
  for (const d of [d1, d2]) assert.equal((await call(compliance, 'POST', `/documents/${d.body.id}/review`, { decision: 'verified' })).status, 200);
  assert.equal((await call(compliance, 'POST', `/documents/${d3.body.id}/review`, { decision: 'verified' })).status, 403);
  assert.equal((await call(complianceAlt, 'POST', `/documents/${d3.body.id}/review`, { decision: 'verified' })).status, 200);
  assert.equal((await call(compliance, 'POST', `/documents/${d1.body.id}/review`, { decision: 'rejected' })).status, 409); // already reviewed
  const ok = await call(compliance, 'POST', `/workers/${w1.id}/verify`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.verification, 'verified');
});

test('verification: an expired police clearance does not count', async () => {
  w2 = (await call(fa, 'POST', '/workers', workerBody(2))).body;
  const d1 = await upload(fa, w2.id, 'national_id');
  const d2 = await upload(fa, w2.id, 'police_clearance', { expires_on: '2020-01-01' });
  for (const d of [d1, d2]) await call(compliance, 'POST', `/documents/${d.body.id}/review`, { decision: 'verified' });
  const r = await call(compliance, 'POST', `/workers/${w2.id}/verify`);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /police_clearance/);
});

test('matching: a request is created from a lead; candidates are central-staff only', async () => {
  const lead = await call(fb, 'POST', '/leads', { lead_type: 'household', name: 'Employer ' + run, phone: `+2511${run}8` });
  assert.equal(lead.status, 201);
  const r = await call(fb, 'POST', '/requests', { lead_id: lead.body.id, sector: SECTOR, skills_required: ['cooking', 'cleaning'], languages_required: ['amharic'], min_experience: 2, rate_offered: 10000, territory_id: areaA });
  assert.equal(r.status, 201);
  request = r.body;
  assert.equal((await call(fb, 'GET', `/requests/${request.id}/candidates`)).status, 403);
});

test('matching: only verified, available workers are candidates, ranked by score', async () => {
  w3 = (await call(fa, 'POST', '/workers', workerBody(3))).body; // never verified
  const c = await call(admin, 'GET', `/requests/${request.id}/candidates`);
  assert.equal(c.status, 200);
  const ids = c.body.map((x: any) => x.worker_id);
  assert.deepEqual(ids, [w1.id]); // w2 (expired document) and w3 (unverified) are excluded
  assert.equal(c.body[0].score, 100);
});

test('matching: Super Admin can make verified certificates an additional eligibility requirement', async () => {
  const settings = await call(admin, 'GET', '/business-rules');
  const oldValue = Number(settings.body.find((rule: any) => rule.key === 'worker_requires_certificate').value);
  try {
    assert.equal((await call(admin, 'PATCH', '/business-rules', {
      values: { worker_requires_certificate: 1 },
    })).status, 200);
    const candidates = await call(admin, 'GET', `/requests/${request.id}/candidates`);
    assert.equal(candidates.status, 200);
    assert.ok(!candidates.body.some((worker: any) => worker.worker_id === w1.id));
  } finally {
    assert.equal((await call(admin, 'PATCH', '/business-rules', {
      values: { worker_requires_certificate: oldValue },
    })).status, 200);
  }
});

test('matching: unverified workers cannot be proposed; a verified one can, once', async () => {
  assert.equal((await call(admin, 'POST', `/requests/${request.id}/matches`, { worker_id: w3.id })).status, 409);
  const m = await call(admin, 'POST', `/requests/${request.id}/matches`, { worker_id: w1.id });
  assert.equal(m.status, 201);
  assert.equal(Number(m.body.score), 100);
  match = m.body;
  assert.equal((await call(admin, 'POST', `/requests/${request.id}/matches`, { worker_id: w1.id })).status, 409);
});

test('database trigger: even a direct insert cannot match an unverified worker', async () => {
  await assert.rejects(
    db.query('INSERT INTO matches (request_id, worker_id, score, created_by) VALUES ($1,$2,50,$3)', [request.id, w3.id, admin.id]),
    /not verified/,
  );
});

test('matching: accepting a match marks the request matched; it cannot be answered twice', async () => {
  assert.equal((await call(admin, 'POST', `/matches/${match.id}/respond`, { decision: 'accepted' })).status, 200);
  const reqs = await call(fb, 'GET', '/requests');
  assert.equal(reqs.body.find((x: any) => x.id === request.id).status, 'matched');
  const workers = await call(fa, 'GET', '/workers');
  assert.equal(workers.body.find((x: any) => x.id === w1.id).availability, 'unavailable');
  const nextRequest = await call(fb, 'POST', '/requests', {
    lead_id: request.lead_id, sector: SECTOR, skills_required: ['cooking'], rate_offered: 10000, territory_id: areaA,
  });
  assert.equal(nextRequest.status, 201);
  const candidates = await call(admin, 'GET', `/requests/${nextRequest.body.id}/candidates`);
  assert.ok(!candidates.body.some((x: any) => x.worker_id === w1.id));
  const released = await call(admin, 'POST', `/matches/${match.id}/release`, { availability: 'within_2_weeks' });
  assert.equal(released.status, 200);
  assert.equal(released.body.availability, 'within_2_weeks');
  const restored = await call(admin, 'GET', `/requests/${nextRequest.body.id}/candidates`);
  assert.ok(restored.body.some((x: any) => x.worker_id === w1.id));
  const reopened = await call(fb, 'GET', '/requests');
  assert.equal(reopened.body.find((x: any) => x.id === request.id).status, 'open');
  assert.equal((await call(admin, 'POST', `/matches/${match.id}/release`, { availability: 'immediate' })).status, 409);
  assert.equal((await call(admin, 'POST', `/matches/${match.id}/respond`, { decision: 'declined' })).status, 409);
});

test('documents: wrong file types are refused; downloads are access-controlled', async () => {
  assert.equal((await upload(fa, w1.id, 'reference', {}, Buffer.from('just text'))).status, 415);
  const d = await upload(fa, w1.id, 'reference');
  assert.equal(d.status, 201);
  const get = (u: U) => fetch(`${API}/documents/${d.body.id}/file`, { headers: { authorization: 'Bearer ' + u.token } });
  const ok = await get(fa);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
  assert.equal((await get(fb)).status, 404); // another agent cannot see this worker's files
  assert.equal((await get(finance)).status, 403); // finance has no business with identity documents
  assert.equal((await get(compliance)).status, 200);
  const log = await db.query("SELECT 1 FROM audit_logs WHERE action = 'document_downloaded' AND entity_id = $1", [d.body.id]);
  assert.ok((log.rowCount ?? 0) >= 2); // both downloads are audited
});

test('areas: anyone signed in can list them; only Super Admin can create them', async () => {
  assert.equal((await call(fa, 'POST', '/territories', { level: 'city', name: 'Nope' })).status, 403);
  const made = await call(admin, 'POST', '/territories', { level: 'city', name: 'Created ' + run });
  assert.equal(made.status, 201);
  assert.ok((await call(fa, 'GET', '/territories')).body.some((t: any) => t.id === made.body.id));
});

test('properties: units are stored with the property; duplicates and cross-agent access are blocked', async () => {
  const address = `Bole Road Plot ${run}`;
  const p = await call(fa, 'POST', '/properties', { address, ptype: 'apartment_building', territory_id: areaA, units: [{ unit_no: '1A', floor: 1, rent: 15000 }, { unit_no: '1B', floor: 1, rent: 16000 }] });
  assert.equal(p.status, 201);
  const uploadPhoto = (u: U, content: Buffer, contentType = 'image/png') => fetch(
    `${API}/properties/${p.body.id}/photos/upload?caption=Front+entrance`,
    { method: 'POST', headers: { authorization: 'Bearer ' + u.token, 'content-type': contentType }, body: content },
  );
  const uploaded = await uploadPhoto(fa, PNG);
  assert.equal(uploaded.status, 201);
  const photoInfo = await uploaded.json() as any;
  assert.equal(photoInfo.caption, 'Front entrance');
  assert.equal((await uploadPhoto(fa, Buffer.from('not an image'), 'text/plain')).status, 415);
  const listing = (await call(fa, 'GET', '/properties')).body.find((item: any) => item.id === p.body.id);
  assert.equal(listing.units.length, 2);
  const photos = await call(fa, 'GET', `/properties/${p.body.id}/photos`);
  assert.equal(photos.status, 200);
  assert.equal(photos.body.length, 1);
  const photo = await fetch(`${API}/properties/${p.body.id}/photos/${photoInfo.id}/file`, {
    headers: { authorization: 'Bearer ' + fa.token },
  });
  assert.equal(photo.status, 200);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PNG);
  assert.equal((await call(fb, 'GET', `/properties/${p.body.id}/photos`)).status, 404);
  assert.equal((await call(fb, 'POST', '/properties', { address: address.toUpperCase(), ptype: 'house', territory_id: areaA })).status, 409);
  assert.equal((await call(fa, 'POST', `/properties/${p.body.id}/units`, { unit_no: '1A' })).status, 409);
  assert.equal((await call(fb, 'POST', `/properties/${p.body.id}/units`, { unit_no: '2A' })).status, 404);
  const mine = (await call(fa, 'GET', '/properties')).body.find((x: any) => x.id === p.body.id);
  assert.equal(mine.units.length, 2);
  assert.ok(!(await call(fb, 'GET', '/properties')).body.some((x: any) => x.id === p.body.id));
  assert.ok((await call(master, 'GET', '/properties')).body.some((x: any) => x.id === p.body.id));
});

test('property owners manage their own listings and photos without seeing other owners or agent listings', async () => {
  const address = `Owner property ${run}`;
  const created = await call(propertyOwner, 'POST', '/properties', {
    address,
    ptype: 'house',
    territory_id: areaA,
    units: [{ unit_no: 'Owner-1', rent: 12000 }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.source_agent_id, null);
  assert.equal(created.body.owner_user_id, propertyOwner.id);

  const listing = (await call(propertyOwner, 'GET', '/properties')).body.find((item: any) => item.id === created.body.id);
  assert.equal(listing.units.length, 1);
  assert.equal((await call(propertyOwner, 'POST', `/properties/${created.body.id}/units`, { unit_no: 'Owner-2' })).status, 201);

  const uploaded = await fetch(
    `${API}/properties/${created.body.id}/photos/upload?caption=Owner+photo`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer ' + propertyOwner.token, 'content-type': 'image/png' },
      body: PNG,
    },
  );
  assert.equal(uploaded.status, 201);
  const photoInfo = await uploaded.json() as any;
  const downloaded = await fetch(`${API}/properties/${created.body.id}/photos/${photoInfo.id}/file`, {
    headers: { authorization: 'Bearer ' + propertyOwner.token },
  });
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), PNG);

  assert.equal((await call(otherPropertyOwner, 'GET', '/properties')).body.some((item: any) => item.id === created.body.id), false);
  assert.equal((await call(otherPropertyOwner, 'GET', `/properties/${created.body.id}/photos`)).status, 404);
  assert.equal((await call(otherPropertyOwner, 'POST', `/properties/${created.body.id}/units`, { unit_no: 'Other-1' })).status, 404);
  assert.equal((await call(fa, 'GET', '/properties')).body.some((item: any) => item.id === created.body.id), false);
  assert.equal((await call(fa, 'POST', `/properties/${created.body.id}/units`, { unit_no: 'Agent-1' })).status, 404);
});

test('buyers can read available listings and photos but cannot write or see internal ownership data', async () => {
  const agentListing = await call(fa, 'POST', '/properties', {
    address: `Buyer visible agent listing ${run}`,
    ptype: 'apartment_building',
    territory_id: areaA,
  });
  assert.equal(agentListing.status, 201);
  const hiddenListing = (await db.query(
    `INSERT INTO properties (address, ptype, territory_id, source_agent_id, created_by, status)
     VALUES ($1,'house',$2,$3,$4,'pending_review') RETURNING id`,
    [`Buyer hidden listing ${run}`, areaA, fa.id, fa.id],
  )).rows[0];

  const visible = await call(buyer, 'GET', '/properties');
  assert.equal(visible.status, 200);
  const ownerListing = visible.body.find((item: any) => item.address === `Owner property ${run}`);
  const agentProperty = visible.body.find((item: any) => item.id === agentListing.body.id);
  assert.ok(ownerListing);
  assert.ok(agentProperty);
  assert.equal(visible.body.some((item: any) => item.id === hiddenListing.id), false);
  assert.equal('owner_user_id' in ownerListing, false);
  assert.equal('source_agent_id' in ownerListing, false);
  assert.equal('owner_lead_id' in ownerListing, false);
  assert.equal((await call(buyer, 'POST', '/properties', {
    address: `Buyer forbidden listing ${run}`,
    ptype: 'house',
    territory_id: areaA,
  })).status, 403);
  assert.equal((await call(buyer, 'POST', `/properties/${ownerListing.id}/units`, { unit_no: 'Buyer-1' })).status, 403);
  assert.equal((await call(buyer, 'POST', `/properties/${ownerListing.id}/photos/upload`, {})).status, 403);
});

test.after(() => db.end());
