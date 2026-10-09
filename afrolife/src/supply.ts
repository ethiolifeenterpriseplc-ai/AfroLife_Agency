import express, { Router, Request, Response, RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withUser, requireRole, HttpError } from './core.js';
import { sniff, sniffListingMedia } from './files.js';
import { getFile, putFile } from './storage.js';
import { notify } from './notify.js';
import { audit, loadRules } from './domain.js';
import { matchingTuningFromRules } from './matching.js';
import { scoreMatch, weightsFromRules } from './matching.js';
import { Phone } from './validators.js';

export const supply = Router();
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const AGENT = ['master_agent', 'field_agent'];
const num = (x: unknown) => (x == null ? null : Number(x));
const requireListingPlan: RequestHandler = (req, _res, next) => {
  if (req.user?.role === 'super_admin' || req.user?.role === 'customer') return next();
  if (req.user?.role === 'corporate_business_manager' || req.user?.role === 'property_owner') return next();
  if (AGENT.includes(req.user!.role)) return next();
  pool.query(
    `SELECT 1 FROM user_signups
     WHERE user_id = $1 AND status = 'approved' AND payment_status = 'paid'
       AND requested_plan IN ('pro','enterprise')`,
    [req.user!.id],
  ).then((result) => {
    if (!result.rowCount) return next(new HttpError(403, 'Property listing tools need an activated Pro or Enterprise plan.'));
    next();
  }, next);
};

// ================= Workers =================
const WorkerIn = z.object({
  name: z.string().min(2), phone: Phone, national_id: z.string().min(5).optional(),
  sector: z.string().min(2), skills: z.array(z.string()).default([]), languages: z.array(z.string()).default([]),
  experience_years: z.number().int().min(0).default(0), rate_expected: z.number().nonnegative(),
  availability: z.enum(['immediate', 'within_2_weeks', 'later', 'unavailable']).default('immediate'),
  territory_id: z.number().int(),
});

supply.post('/workers', requireRole(...AGENT), h(async (req, res) => {
  const b = WorkerIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const r = await c.query(
      `INSERT INTO workers (name, phone, national_id, sector, skills, languages, experience_years, rate_expected, availability, territory_id, source_agent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.name, b.phone, b.national_id ?? null, b.sector, b.skills, b.languages, b.experience_years, b.rate_expected, b.availability, b.territory_id, req.user!.id],
    );
    await audit(c, req.user!.id, 'worker_created', 'worker', r.rows[0].id, null, { name: b.name, sector: b.sector });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

supply.get('/workers', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT id, name, phone, sector, skills, languages, experience_years, rate_expected,
            availability, verification, territory_id, source_agent_id, created_at
     FROM workers ORDER BY created_at DESC LIMIT 200`,
  )).rows));
}));

// ---- Documents: uploading is not verification ----
const UploadQ = z.object({ doc_type: z.enum(['national_id', 'police_clearance', 'reference', 'certificate']), expires_on: z.string().date().optional() });

/** Raw file body (PDF/JPEG/PNG, max 10 MB). The type is checked from the file's own bytes, not the client's claim. */
supply.post('/workers/:id/documents/upload', requireRole(...AGENT, 'compliance', 'super_admin'), express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
  const q = UploadQ.parse(req.query);
  const buf = req.body as Buffer;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'No file received');
  const mime = sniff(buf);
  if (!mime) throw new HttpError(415, 'Only PDF, JPEG or PNG files are accepted');
  const row = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM workers WHERE id = $1', [req.params.id])).rowCount) throw new HttpError(404, 'Worker not found'); // RLS: must be in your scope
    const key = randomUUID();
    const r = await c.query(
      'INSERT INTO documents (worker_id, doc_type, storage_key, sha256, expires_on, mime, size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, doc_type, status, expires_on',
      [req.params.id, q.doc_type, key, createHash('sha256').update(buf).digest('hex'), q.expires_on ?? null, mime, buf.length],
    );
    await putFile(key, buf); // if this fails the transaction rolls back: no row without a file
    await audit(c, req.user!.id, 'document_uploaded', 'document', r.rows[0].id, null, { doc_type: q.doc_type, bytes: buf.length });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

/** Downloads are limited to agents who can see the worker, compliance and super admin, and every download is audited. */
supply.get('/documents/:id/file', requireRole(...AGENT, 'compliance', 'super_admin'), h(async (req, res) => {
  const d = await withUser(req.user!, async (c) => {
    const r = (await c.query('SELECT id, worker_id, storage_key, mime FROM documents WHERE id = $1', [req.params.id])).rows[0];
    if (!r) throw new HttpError(404, 'Document not found');
    const privileged = ['compliance', 'super_admin'].includes(req.user!.role);
    if (!privileged && !(await c.query('SELECT 1 FROM workers WHERE id = $1', [r.worker_id])).rowCount) throw new HttpError(404, 'Document not found');
    await audit(c, req.user!.id, 'document_downloaded', 'document', r.id);
    return r;
  });
  const buf = await getFile(d.storage_key);
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(buf);
}));

supply.get('/workers/:id/documents', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM workers WHERE id = $1', [req.params.id])).rowCount) throw new HttpError(404, 'Worker not found');
    return (await c.query('SELECT id, doc_type, status, issued_on, expires_on, reviewed_at FROM documents WHERE worker_id = $1 ORDER BY id', [req.params.id])).rows;
  }));
}));

supply.post('/documents/:id/review', requireRole('compliance'), h(async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['verified', 'rejected']) }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const document = (await c.query('SELECT id, doc_type, status, uploaded_by FROM documents WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!document) throw new HttpError(404, 'Document not found');
    if (document.uploaded_by === req.user!.id) throw new HttpError(403, 'A different compliance officer must review this document');
    if (!['uploaded', 'under_review'].includes(document.status)) throw new HttpError(409, 'Document has already been reviewed');
    const r = await c.query("UPDATE documents SET status = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $1 RETURNING id, doc_type, status", [req.params.id, decision, req.user!.id]);
    await audit(c, req.user!.id, 'document_' + decision, 'document', r.rows[0].id);
    return r.rows[0];
  }));
}));

supply.post('/workers/:id/verify', requireRole('compliance'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const w = (await c.query('SELECT * FROM workers WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!w) throw new HttpError(404, 'Worker not found');
    const have = (await c.query("SELECT doc_type FROM documents WHERE worker_id = $1 AND status = 'verified' AND (expires_on IS NULL OR expires_on > current_date)", [w.id])).rows.map((x) => x.doc_type);
    const missing = ['national_id', 'police_clearance'].filter((x) => !have.includes(x));
    if (missing.length) throw new HttpError(409, 'Missing verified documents: ' + missing.join(', '));
    const r = await c.query("UPDATE workers SET verification = 'verified' WHERE id = $1 RETURNING *", [w.id]);
    await audit(c, req.user!.id, 'worker_verified', 'worker', w.id, { verification: w.verification }, { verification: 'verified' });
    await notify(c, w.source_agent_id, 'worker_verified', { name: w.name });
    return r.rows[0];
  }));
}));

// ================= Job requests and matching =================
const ReqIn = z.object({
  lead_id: z.string().uuid(), sector: z.string().min(2), skills_required: z.array(z.string()).default([]),
  languages_required: z.array(z.string()).default([]), min_experience: z.number().int().min(0).default(0),
  rate_offered: z.number().positive(), territory_id: z.number().int(),
});

supply.post('/requests', requireRole(...AGENT, 'super_admin'), h(async (req, res) => {
  const b = ReqIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const l = (await c.query('SELECT source_agent_id FROM leads WHERE id = $1', [b.lead_id])).rows[0];
    if (!l) throw new HttpError(404, 'Lead not found');
    const r = await c.query(
      `INSERT INTO job_requests (lead_id, sector, skills_required, languages_required, min_experience, rate_offered, territory_id, source_agent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.lead_id, b.sector, b.skills_required, b.languages_required, b.min_experience, b.rate_offered, b.territory_id, l.source_agent_id],
    );
    await audit(c, req.user!.id, 'request_created', 'job_request', r.rows[0].id, null, b);
    return r.rows[0];
  });
  res.status(201).json(row);
}));

supply.get('/requests', h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query('SELECT * FROM job_requests ORDER BY created_at DESC LIMIT 200')).rows));
}));

/** Ranked candidates across ALL agents' verified workers. Central staff only, so agents cannot poach each other's supply. */
async function rank(c: import('pg').PoolClient, requestId: string) {
  const rq = (await c.query('SELECT r.*, t.parent_id AS territory_parent_id FROM job_requests r LEFT JOIN territories t ON t.id = r.territory_id WHERE r.id = $1', [requestId])).rows[0];
  if (!rq) throw new HttpError(404, 'Request not found');
  const rules = await loadRules(c);
  const wt = weightsFromRules(rules);
  const tuning = matchingTuningFromRules(rules);
  const ws = (await c.query(
    `SELECT w.*, t.parent_id AS territory_parent_id FROM workers w LEFT JOIN territories t ON t.id = w.territory_id
     WHERE w.verification = 'verified' AND w.availability <> 'unavailable' AND lower(w.sector) = lower($1)
       AND EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'national_id' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date))
       AND EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'police_clearance' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date))
       AND ($3::numeric = 0 OR EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'reference' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date)))
       AND ($4::numeric = 0 OR EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'certificate' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date)))
       AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.worker_id = w.id AND m.request_id = $2)`,
    [rq.sector, requestId, rules.worker_requires_reference ?? 0, rules.worker_requires_certificate ?? 0],
  )).rows;
  const rM = { skills_required: rq.skills_required, languages_required: rq.languages_required, min_experience: rq.min_experience, rate_offered: Number(rq.rate_offered), territory_id: num(rq.territory_id), territory_parent_id: num(rq.territory_parent_id) };
  return ws.map((w) => ({
    worker_id: w.id, name: w.name, experience_years: w.experience_years,
    ...scoreMatch({ skills: w.skills, languages: w.languages, experience_years: w.experience_years, rate_expected: Number(w.rate_expected), availability: w.availability, territory_id: num(w.territory_id), territory_parent_id: num(w.territory_parent_id) }, rM, wt, tuning),
  })).filter((candidate) => candidate.score >= tuning.minimumScore)
    .sort((a, b) => b.score - a.score);
}

supply.get('/requests/:id/candidates', requireRole('super_admin'), h(async (req, res) => {
  res.json((await withUser(req.user!, (c) => rank(c, String(req.params.id)))).slice(0, 10));
}));

supply.post('/requests/:id/matches', requireRole('super_admin'), h(async (req, res) => {
  const { worker_id } = z.object({ worker_id: z.string().uuid() }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const cand = (await rank(c, String(req.params.id))).find((x) => x.worker_id === worker_id); // score is computed server-side
    if (!cand) throw new HttpError(409, 'Worker is not an eligible candidate (unverified, unavailable, wrong sector, or already proposed)');
    const r = await c.query('INSERT INTO matches (request_id, worker_id, score, created_by) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, worker_id, cand.score, req.user!.id]);
    await audit(c, req.user!.id, 'match_proposed', 'match', r.rows[0].id, null, { worker_id, score: cand.score });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

supply.post('/matches/:id/respond', requireRole('super_admin'), h(async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['accepted', 'declined']) }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const match = (await c.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!match || match.status !== 'proposed') throw new HttpError(409, 'Match not found or already answered');

    if (decision === 'accepted') {
      const worker = (await c.query('SELECT id, availability, verification FROM workers WHERE id = $1 FOR UPDATE', [match.worker_id])).rows[0];
      if (!worker || worker.availability === 'unavailable' || worker.verification !== 'verified') throw new HttpError(409, 'Worker is no longer eligible');
      const request = (await c.query('SELECT id, status FROM job_requests WHERE id = $1 FOR UPDATE', [match.request_id])).rows[0];
      if (!request || request.status !== 'open') throw new HttpError(409, 'Request is no longer open');
      const currentDocuments = await c.query(
        `SELECT 1 FROM documents
         WHERE worker_id = $1 AND status = 'verified' AND (expires_on IS NULL OR expires_on > current_date)
         GROUP BY worker_id
         HAVING bool_or(doc_type = 'national_id') AND bool_or(doc_type = 'police_clearance')`,
        [worker.id],
      );
      if (!currentDocuments.rowCount) throw new HttpError(409, 'Worker identity documents have expired or are no longer verified');

      await c.query("UPDATE workers SET availability = 'unavailable' WHERE id = $1", [worker.id]);
      await c.query("UPDATE job_requests SET status = 'matched' WHERE id = $1", [request.id]);
    }

    const r = await c.query("UPDATE matches SET status = $2 WHERE id = $1 AND status = 'proposed' RETURNING *", [req.params.id, decision]);
    if (!r.rowCount) throw new HttpError(409, 'Match not found or already answered');
    await audit(c, req.user!.id, 'match_' + decision, 'match', r.rows[0].id);
    return r.rows[0];
  }));
}));

supply.post('/matches/:id/release', requireRole('super_admin'), h(async (req, res) => {
  const { availability } = z.object({ availability: z.enum(['immediate', 'within_2_weeks', 'later']) }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const match = (await c.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!match || match.status !== 'accepted') throw new HttpError(409, 'Only an accepted match can be released');
    const worker = (await c.query('SELECT id, availability FROM workers WHERE id = $1 FOR UPDATE', [match.worker_id])).rows[0];
    if (!worker || worker.availability !== 'unavailable') throw new HttpError(409, 'Worker is not reserved by this match');
    const request = (await c.query('SELECT id, status FROM job_requests WHERE id = $1 FOR UPDATE', [match.request_id])).rows[0];
    if (!request || request.status !== 'matched') throw new HttpError(409, 'Request is not matched');

    await c.query('UPDATE workers SET availability = $2 WHERE id = $1', [worker.id, availability]);
    await c.query("UPDATE job_requests SET status = 'open' WHERE id = $1", [request.id]);
    await audit(c, req.user!.id, 'match_reservation_released', 'match', match.id, { availability: worker.availability }, { availability });
    return { match_id: match.id, worker_id: worker.id, availability, request_status: 'open' };
  }));
}));

// ================= Properties and units =================
const UnitIn = z.object({ unit_no: z.string().min(1), floor: z.number().int().optional(), ptype: z.string().default('apartment'), rent: z.number().nonnegative().optional() });
const PropIn = z.object({
  address: z.string().trim().min(5).max(300), description: z.string().trim().max(5000).default(''),
  ptype: z.enum(['apartment_building', 'house', 'commercial', 'land']), listing_mode: z.enum(['sale','rent','sale_or_rent']).default('rent'),
  sale_price: z.number().positive().optional(), rent_period: z.enum(['day','week','month','year']).default('month'),
  territory_id: z.number().int(), owner_lead_id: z.string().uuid().optional(), owner_user_id: z.string().uuid().optional(), units: z.array(UnitIn).default([]),
});

supply.post('/properties', requireRole(...AGENT, 'property_owner', 'super_admin', 'corporate_business_manager'), requireListingPlan, h(async (req, res) => {
  const b = PropIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const config = await loadMarketplaceConfig(c);
    const types = config.properties.property_types as {key:string;enabled:boolean}[];
    const periods = config.rentals.periods as {key:string;enabled:boolean}[];
    if (!types.some((item) => item.key === b.ptype && item.enabled)) throw new HttpError(422, 'Choose an enabled property type.');
    if (!periods.some((item) => item.key === b.rent_period && item.enabled)) throw new HttpError(422, 'Choose an enabled rental period.');
    if (!(config.system.enabled_domains as string[]).includes('properties')) throw new HttpError(403, 'Property listings are currently disabled.');
    if (b.listing_mode !== 'rent' && !b.sale_price) throw new HttpError(422, 'Enter a sale price for this property.');
    if (b.listing_mode === 'rent' && b.sale_price) throw new HttpError(422, 'Sale price is not used for rental-only listings.');
    const isAgent = AGENT.includes(req.user!.role);
    const isPropertyOwner = req.user!.role === 'property_owner';
    const isManager = ['super_admin','corporate_business_manager'].includes(req.user!.role);
    let sourceAgentId: string | null = isAgent ? req.user!.id : null;
    let ownerUserId: string | null = isPropertyOwner ? req.user!.id : null;
    if (isManager && b.owner_user_id) {
      const seller = (await c.query("SELECT id,role FROM users WHERE id=$1 AND active=true AND role IN ('master_agent','field_agent','property_owner')", [b.owner_user_id])).rows[0];
      if (!seller) throw new HttpError(422, 'Select an active agent or seller for this listing.');
      if (AGENT.includes(seller.role)) sourceAgentId = seller.id;
      else ownerUserId = seller.id;
    } else if (!isManager && b.owner_user_id) {
      throw new HttpError(403, 'Only a manager can select a seller for a listing.');
    }
    const p = (await c.query(
      `INSERT INTO properties (address, description, ptype, listing_mode, sale_price, rent_period, territory_id, owner_lead_id, source_agent_id, owner_user_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.address,b.description,b.ptype,b.listing_mode,b.sale_price ?? null,b.rent_period,b.territory_id,b.owner_lead_id ?? null,sourceAgentId,ownerUserId,req.user!.id],
    )).rows[0];
    for (const u of b.units) await c.query('INSERT INTO property_units (property_id, unit_no, floor, ptype, rent) VALUES ($1,$2,$3,$4,$5)', [p.id, u.unit_no, u.floor ?? null, u.ptype, u.rent ?? null]);
    await audit(c, req.user!.id, 'property_created', 'property', p.id, null, { address: b.address, units: b.units.length });
    return p;
  });
  res.status(201).json(row);
}));

supply.post('/properties/:id/photos/upload', requireRole(...AGENT, 'property_owner', 'super_admin', 'corporate_business_manager'), requireListingPlan, express.raw({ type: () => true, limit: '100mb' }), h(async (req, res) => {
  const caption = z.string().trim().max(300).optional().parse(req.query.caption) ?? '';
  const file = req.body as Buffer;
  if (!Buffer.isBuffer(file) || file.length === 0) throw new HttpError(400, 'Choose a property picture or video to upload.');
  const mime = sniffListingMedia(file);
  if (!mime) throw new HttpError(415, 'Only JPEG/PNG pictures and MP4/WebM videos are accepted.');
  const id = randomUUID();
  const key = randomUUID();
  const sha256 = createHash('sha256').update(file).digest('hex');
  const photo = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM properties WHERE id = $1', [req.params.id])).rowCount) {
      throw new HttpError(404, 'Property not found.');
    }
    const config = await loadMarketplaceConfig(c);
    const maxBytes = Number(mime.startsWith('image/') ? config.system.image_max_bytes : config.system.video_max_bytes);
    if (file.length > maxBytes) throw new HttpError(413, 'The media file exceeds the configured size limit.');
    const count = Number((await c.query('SELECT count(*)::int AS count FROM property_photos WHERE property_id=$1',[req.params.id])).rows[0].count);
    if (count >= Number(config.system.max_media_per_listing)) throw new HttpError(409, 'This listing has reached its configured media limit.');
    const result = await c.query(
      `INSERT INTO property_photos (id,property_id,storage_key,sha256,mime,size_bytes,caption,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, property_id, mime, size_bytes, caption, created_at`,
      [id, req.params.id, key, sha256, mime, file.length, caption, req.user!.id],
    );
    await putFile(key, file);
    await audit(c, req.user!.id, 'property_photo_uploaded', 'property_photo', id, null, { property_id: req.params.id, caption });
    return result.rows[0];
  });
  res.status(201).json(photo);
}));

supply.get('/properties/:id/photos', requireListingPlan, h(async (req, res) => {
  const photos = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM properties WHERE id = $1', [req.params.id])).rowCount) {
      throw new HttpError(404, 'Property not found.');
    }
    return (await c.query(
      'SELECT id, property_id, mime, size_bytes, caption, created_at FROM property_photos WHERE property_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    )).rows;
  });
  res.json(photos);
}));

supply.get('/properties/:id/photos/:photoId/file', requireRole(...AGENT, 'property_owner', 'customer', 'super_admin', 'corporate_business_manager'), requireListingPlan, h(async (req, res) => {
  const photo = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, storage_key, mime FROM property_photos WHERE id = $1 AND property_id = $2',
    [req.params.photoId, req.params.id],
  )).rows[0]);
  if (!photo) throw new HttpError(404, 'Property picture not found.');
  const file = await getFile(photo.storage_key);
  res.set({
    'Content-Type': photo.mime,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }).send(file);
}));

supply.post('/properties/:id/units', requireRole(...AGENT, 'property_owner', 'super_admin', 'corporate_business_manager'), requireListingPlan, h(async (req, res) => {
  const u = UnitIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM properties WHERE id = $1', [req.params.id])).rowCount) throw new HttpError(404, 'Property not found');
    return (await c.query('INSERT INTO property_units (property_id, unit_no, floor, ptype, rent) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.id, u.unit_no, u.floor ?? null, u.ptype, u.rent ?? null])).rows[0];
  });
  res.status(201).json(row);
}));

supply.get('/properties', requireRole(...AGENT, 'property_owner', 'customer', 'super_admin', 'corporate_business_manager'), requireListingPlan, h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT p.id, p.address, p.description, p.ptype, p.listing_mode, p.sale_price, p.rent_period, p.created_by, p.territory_id, p.status, p.created_at,
            COALESCE(
              json_agg(json_build_object(
                'id', u.id,
                'unit_no', u.unit_no,
                'floor', u.floor,
                'ptype', u.ptype,
                'rent', u.rent,
                'occupancy', u.occupancy
              ) ORDER BY u.unit_no) FILTER (WHERE u.id IS NOT NULL),
              '[]'
            ) AS units
     FROM properties p LEFT JOIN property_units u ON u.property_id = p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`)).rows));
}));

// ================= Areas (territories) and match listing =================
supply.get('/territories', h(async (_req, res) => {
  res.json((await pool.query('SELECT id::int, parent_id::int, level, name FROM territories ORDER BY level, name')).rows);
}));

supply.post('/territories', requireRole('super_admin'), h(async (req, res) => {
  const b = z.object({ level: z.enum(['country', 'region', 'city', 'sub_city', 'woreda', 'kebele', 'zone']), name: z.string().min(2), parent_id: z.number().int().optional() }).parse(req.body);
  const r = await pool.query('INSERT INTO territories (parent_id, level, name) VALUES ($1,$2,$3) RETURNING id::int, parent_id::int, level, name', [b.parent_id ?? null, b.level, b.name]);
  res.status(201).json(r.rows[0]);
}));

supply.get('/requests/:id/matches', requireRole('super_admin'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT m.id, m.worker_id, m.score, m.status, w.name AS worker_name FROM matches m JOIN workers w ON w.id = m.worker_id WHERE m.request_id = $1 ORDER BY m.created_at', [req.params.id])).rows));
}));

// ================= Marketplace configuration and product/service listings =================
const ConfigScope = z.enum(['system','users','products','services','properties','rentals']);
const CatalogItem = z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(2).max(80), enabled: z.boolean() }).strict();
const KycMap = z.record(z.enum(['worker','customer','agent','property_owner']), z.array(z.enum(['national_id','police_clearance'])).max(2));
const AccountTypeOption = z.object({ key: z.enum(['worker','customer','agent','property_owner']), label: z.string().trim().min(2).max(40), enabled: z.boolean() }).strict();

function validateMarketplaceConfig(scope: string, key: string, value: unknown) {
  if (scope === 'system') {
    if (key === 'enabled_domains') return z.array(z.enum(['products','services','equipment','properties'])).min(1).max(4).parse(value);
    if (key === 'moderation_required') return z.boolean().parse(value);
    if (key === 'image_max_bytes') return z.number().int().min(262144).max(20971520).parse(value);
    if (key === 'video_max_bytes') return z.number().int().min(1048576).max(104857600).parse(value);
    if (key === 'max_media_per_listing') return z.number().int().min(1).max(30).parse(value);
  }
  if (scope === 'users') {
    if (key === 'account_types') {
      const items = z.array(AccountTypeOption).min(1).max(4).parse(value);
      if (!items.some((item) => item.enabled)) throw new HttpError(422, 'At least one self-registration account type must remain enabled.');
      if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Self-registration account types must be unique.');
      return items;
    }
    if (key === 'kyc_requirements') {
      const requirements = KycMap.parse(value);
      if (Object.values(requirements).some((docs) => docs.length === 0)) throw new HttpError(422, 'Each enabled account type must keep at least one KYC document requirement.');
      if (!requirements.worker?.includes('national_id') || !requirements.worker?.includes('police_clearance')) throw new HttpError(422, 'Worker registration must keep both National ID and Police clearance requirements.');
      return requirements;
    }
  }
  if (scope === 'products' || scope === 'services') {
    if (key === 'categories') {
      const items = z.array(CatalogItem).min(1).max(100).parse(value);
      if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled category.');
      if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Category keys must be unique.');
      return items;
    }
  }
  if (scope === 'properties' && key === 'property_types') {
    const items = z.array(z.object({ key: z.enum(['apartment_building','house','commercial','land']), label: z.string().trim().min(2).max(80), enabled: z.boolean() }).strict()).min(1).max(4).parse(value);
    if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled property type.');
    if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Property types must be unique.');
    return items;
  }
  if (scope === 'rentals' && key === 'periods') {
    const items = z.array(z.object({ key: z.enum(['day','week','month','year']), label: z.string().trim().min(2).max(40), enabled: z.boolean() }).strict()).min(1).max(4).parse(value);
    if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled rental period.');
    if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Rental periods must be unique.');
    return items;
  }
  throw new HttpError(422, `Configuration key ${scope}.${key} cannot be changed here.`);
}

async function loadMarketplaceConfig(c: import('pg').PoolClient) {
  const rows = await c.query('SELECT scope, config_key, config_value FROM marketplace_configuration ORDER BY scope, config_key');
  const config: Record<string, Record<string, unknown>> = {};
  for (const row of rows.rows) (config[row.scope] ??= {})[row.config_key] = row.config_value;
  return config;
}

supply.get('/marketplace/config', h(async (req, res) => {
  res.json(await withUser(req.user!, loadMarketplaceConfig));
}));

supply.patch('/marketplace/config', requireRole('super_admin','corporate_business_manager'), h(async (req, res) => {
  const { values } = z.object({ values: z.array(z.object({ scope: ConfigScope, key: z.string().min(2).max(80), value: z.unknown() }).strict()).min(1).max(40) }).strict().parse(req.body);
  const result = await withUser(req.user!, async (c) => {
    for (const entry of values) {
      if (req.user!.role === 'corporate_business_manager' && !['products','services','properties','rentals'].includes(entry.scope)) {
        throw new HttpError(403, 'Corporate Business Managers can configure marketplace domains, not system or account-security settings.');
      }
      const nextValue = validateMarketplaceConfig(entry.scope, entry.key, entry.value);
      const current = (await c.query('SELECT config_value FROM marketplace_configuration WHERE scope=$1 AND config_key=$2 FOR UPDATE', [entry.scope, entry.key])).rows[0];
      if (!current) throw new HttpError(404, `Configuration ${entry.scope}.${entry.key} was not found.`);
      await c.query(
        `UPDATE marketplace_configuration SET config_value=$3, updated_by=$4, updated_at=now()
         WHERE scope=$1 AND config_key=$2`,
        [entry.scope, entry.key, JSON.stringify(nextValue), req.user!.id],
      );
      await audit(c, req.user!.id, 'marketplace_configuration_updated', 'marketplace_configuration', `${entry.scope}.${entry.key}`, current.config_value, nextValue);
    }
    return loadMarketplaceConfig(c);
  });
  res.json(result);
}));

supply.get('/marketplace/sellers', requireRole('super_admin','corporate_business_manager'), h(async (_req, res) => {
  const sellers = await pool.query(
    `SELECT u.id, u.legal_name, u.role, u.phone FROM users u
     WHERE u.active = true AND (u.role IN ('master_agent','field_agent','property_owner'))
     ORDER BY u.legal_name LIMIT 500`,
  );
  res.json(sellers.rows);
}));

const ListingIn = z.object({
  seller_user_id: z.string().uuid().optional(),
  domain: z.enum(['products','services','equipment']), category_key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  title: z.string().trim().min(3).max(140), description: z.string().trim().min(10).max(5000),
  transaction_mode: z.enum(['sale','rental','service']), price: z.number().positive().optional(),
  rent_period: z.enum(['day','week','month','year']).optional(),
  condition: z.enum(['new','like_new','good','fair','not_applicable']).optional(), territory_id: z.number().int().positive(),
}).strict();

supply.get('/marketplace/listings', h(async (req, res) => {
  const rows = await withUser(req.user!, async (c) => (await c.query(
    `SELECT l.id,l.seller_user_id,u.legal_name AS seller_name,l.source_agent_id,l.created_by,l.domain,l.category_key,
            l.title,l.description,l.transaction_mode,l.price,l.rent_period,l.condition,l.territory_id,l.status,l.review_note,l.created_at,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'mime',m.mime,'size_bytes',m.size_bytes,'caption',m.caption,'created_at',m.created_at) ORDER BY m.created_at)
                      FROM marketplace_media m WHERE m.listing_id=l.id),'[]'::jsonb) AS media
     FROM marketplace_listings l JOIN users u ON u.id=l.seller_user_id
     ORDER BY CASE WHEN l.status='published' THEN 0 ELSE 1 END,l.created_at DESC LIMIT 300`,
  )).rows);
  res.json(rows);
}));

supply.post('/marketplace/listings', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), h(async (req, res) => {
  const b = ListingIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const config = await loadMarketplaceConfig(c);
    if (!(config.system.enabled_domains as string[] | undefined)?.includes(b.domain)) throw new HttpError(403, `The ${b.domain} marketplace is currently disabled.`);
    const catalog = config[b.domain === 'services' ? 'services' : 'products']?.categories as {key:string;enabled:boolean}[] | undefined;
    if (!catalog?.some((item) => item.key === b.category_key && item.enabled)) throw new HttpError(422, 'Choose an enabled listing category.');
    if ((b.domain === 'services' && b.transaction_mode !== 'service') || (b.domain !== 'services' && b.transaction_mode === 'service')) throw new HttpError(422, 'Choose a transaction type that matches this listing domain.');
    if ((b.transaction_mode === 'rental') !== Boolean(b.rent_period)) throw new HttpError(422, 'Choose a rental period for rental listings only.');
    let sellerId = req.user!.id;
    let sellerRole = req.user!.role;
    if (['super_admin','corporate_business_manager'].includes(req.user!.role)) {
      if (!b.seller_user_id) throw new HttpError(422, 'Select the seller this listing represents.');
      const seller = (await c.query("SELECT id,role FROM users WHERE id=$1 AND active=true AND role IN ('master_agent','field_agent','property_owner')", [b.seller_user_id])).rows[0];
      if (!seller) throw new HttpError(422, 'Select an active agent or seller account.');
      sellerId = seller.id; sellerRole = seller.role;
    } else if (b.seller_user_id && b.seller_user_id !== req.user!.id) {
      throw new HttpError(403, 'You can create listings only for your own account.');
    }
    if (!['master_agent','field_agent','property_owner'].includes(sellerRole)) throw new HttpError(403, 'This account cannot own marketplace listings.');
    const sourceAgentId = ['master_agent','field_agent'].includes(sellerRole) ? sellerId : null;
    const status = 'draft';
    const result = await c.query(
      `INSERT INTO marketplace_listings (seller_user_id,source_agent_id,created_by,domain,category_key,title,description,transaction_mode,price,rent_period,condition,territory_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [sellerId,sourceAgentId,req.user!.id,b.domain,b.category_key,b.title,b.description,b.transaction_mode,b.price ?? null,b.rent_period ?? null,b.condition ?? null,b.territory_id,status],
    );
    await audit(c,req.user!.id,'marketplace_listing_created','marketplace_listing',result.rows[0].id,null,{domain:b.domain,category_key:b.category_key,status});
    return result.rows[0];
  });
  res.status(201).json(row);
}));

supply.post('/marketplace/listings/:id/media/upload', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), express.raw({type:()=>true,limit:'100mb'}), h(async (req,res) => {
  const caption = z.string().trim().max(300).optional().parse(req.query.caption) ?? '';
  const file = req.body as Buffer;
  if (!Buffer.isBuffer(file) || file.length===0) throw new HttpError(400,'Choose a picture or video to upload.');
  const mime = sniffListingMedia(file);
  if (!mime) throw new HttpError(415,'Only JPEG/PNG pictures and MP4/WebM videos are accepted.');
  const result = await withUser(req.user!, async (c) => {
    const listing = (await c.query('SELECT id,status FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if (!listing) throw new HttpError(404,'Listing not found.');
    if (!['draft','rejected'].includes(listing.status)) throw new HttpError(409,'Media can be changed while the listing is a draft or needs changes.');
    const config = await loadMarketplaceConfig(c);
    const limit = Number(mime.startsWith('image/') ? config.system.image_max_bytes : config.system.video_max_bytes);
    if (file.length>limit) throw new HttpError(413,`This file exceeds the configured ${mime.startsWith('image/')?'image':'video'} size limit.`);
    const count = Number((await c.query('SELECT count(*)::int AS count FROM marketplace_media WHERE listing_id=$1',[listing.id])).rows[0].count);
    if (count>=Number(config.system.max_media_per_listing)) throw new HttpError(409,'This listing has reached its configured media limit.');
    const key = randomUUID();
    const sha = createHash('sha256').update(file).digest('hex');
    const saved = (await c.query(
      `INSERT INTO marketplace_media (listing_id,storage_key,sha256,mime,size_bytes,caption,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,mime,size_bytes,caption,created_at`,
      [listing.id,key,sha,mime,file.length,caption,req.user!.id],
    )).rows[0];
    await putFile(key,file);
    await audit(c,req.user!.id,'marketplace_media_uploaded','marketplace_listing',listing.id,null,{media_id:saved.id,mime,size_bytes:file.length});
    return saved;
  });
  res.status(201).json(result);
}));

supply.get('/marketplace/media/:id/file', h(async (req,res) => {
  const media = await withUser(req.user!,async (c)=>(await c.query('SELECT storage_key,mime FROM marketplace_media WHERE id=$1',[req.params.id])).rows[0]);
  if(!media) throw new HttpError(404,'Listing media not found.');
  const file=await getFile(media.storage_key);
  res.set({'Content-Type':media.mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(file);
}));

supply.post('/marketplace/listings/:id/submit', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), h(async(req,res)=>{
  const updated=await withUser(req.user!,async(c)=>{
    const listing=(await c.query('SELECT * FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!listing) throw new HttpError(404,'Listing not found.');
    if(!['draft','rejected'].includes(listing.status)) throw new HttpError(409,`This listing is ${listing.status}.`);
    const image=(await c.query("SELECT 1 FROM marketplace_media WHERE listing_id=$1 AND mime LIKE 'image/%' LIMIT 1",[listing.id])).rowCount;
    if(!image) throw new HttpError(422,'Add at least one listing picture before posting.');
    const config=await loadMarketplaceConfig(c);
    const status=config.system.moderation_required===true?'pending_review':'published';
    const row=(await c.query('UPDATE marketplace_listings SET status=$2,updated_at=now(),review_note=NULL WHERE id=$1 RETURNING *',[listing.id,status])).rows[0];
    await audit(c,req.user!.id,'marketplace_listing_submitted','marketplace_listing',listing.id,{status:listing.status},{status});
    return row;
  });
  res.json(updated);
}));

supply.patch('/marketplace/listings/:id/review', requireRole('super_admin','corporate_business_manager'), h(async(req,res)=>{
  const b=z.object({decision:z.enum(['publish','reject']),note:z.string().trim().max(1000).optional()}).strict().parse(req.body);
  const row=await withUser(req.user!,async(c)=>{
    const listing=(await c.query('SELECT * FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!listing || listing.status!=='pending_review') throw new HttpError(409,'Listing is not awaiting review.');
    if(listing.created_by===req.user!.id) throw new HttpError(403,'A different manager must review your listing.');
    if(b.decision==='reject' && (!b.note || b.note.length<10)) throw new HttpError(422,'Provide a reason of at least 10 characters when returning a listing.');
    const status=b.decision==='publish'?'published':'rejected';
    const updated=(await c.query('UPDATE marketplace_listings SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[listing.id,status,b.note??null,req.user!.id])).rows[0];
    await audit(c,req.user!.id,'marketplace_listing_'+b.decision,'marketplace_listing',listing.id,{status:listing.status},{status,note:b.note??null});
    return updated;
  });
  res.json(row);
}));
