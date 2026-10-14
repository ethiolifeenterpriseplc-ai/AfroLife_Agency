import express, { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withUser, requireActivity, requireRole, HttpError, isPlatformAdminRole } from '../../src/core.js';
import { sniff, sniffListingMedia } from '../../src/files.js';
import { getFile, putFile } from '../../src/storage.js';
import { notify } from '../../src/notify.js';
import { audit, loadRules } from '../../src/domain.js';
import { matchingTuningFromRules, scoreMatch, weightsFromRules } from '../../src/matching.js';
import { Phone } from '../../src/validators.js';
import { h, AGENT, num, requireListingPlan } from '../../src/supply-common.js';

export const router = Router();
// ================= Worker management =================
const WorkerIn = z.object({
  name: z.string().min(2), phone: Phone, national_id: z.string().min(5).optional(),
  sector: z.string().min(2), skills: z.array(z.string()).default([]), languages: z.array(z.string()).default([]),
  experience_years: z.number().int().min(0).default(0), rate_expected: z.number().nonnegative(),
  availability: z.enum(['immediate', 'within_2_weeks', 'later', 'unavailable']).default('immediate'),
  territory_id: z.number().int(),
});

router.post('/workers', requireActivity('workforce.workers.register'), h(async (req, res) => {
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
router.get('/workers', requireActivity('workforce.workers.view'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT id, name, phone, sector, skills, languages, experience_years, rate_expected,
            availability, verification, territory_id, source_agent_id, created_at
     FROM workers ORDER BY created_at DESC LIMIT 200`,
  )).rows));
}));

// ---- Documents: uploading is not verification ----
const UploadQ = z.object({ doc_type: z.enum(['national_id', 'police_clearance', 'reference', 'certificate']), expires_on: z.string().date().optional() });

/** Raw file body (PDF/JPEG/PNG, max 10 MB). The type is checked from the file's own bytes, not the client's claim. */
router.post('/workers/:id/documents/upload', requireActivity('workforce.documents.upload'), express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
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
router.get('/documents/:id/file', requireActivity('workforce.documents.view'), h(async (req, res) => {
  const d = await withUser(req.user!, async (c) => {
    const r = (await c.query('SELECT id, worker_id, storage_key, mime FROM documents WHERE id = $1', [req.params.id])).rows[0];
    if (!r) throw new HttpError(404, 'Document not found');
    const privileged = ['compliance', 'super_admin', 'global_admin'].includes(req.user!.role);
    if (!privileged && !(await c.query('SELECT 1 FROM workers WHERE id = $1', [r.worker_id])).rowCount) throw new HttpError(404, 'Document not found');
    await audit(c, req.user!.id, 'document_downloaded', 'document', r.id);
    return r;
  });
  const buf = await getFile(d.storage_key);
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(buf);
}));

router.get('/workers/:id/documents', requireActivity('workforce.documents.view'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM workers WHERE id = $1', [req.params.id])).rowCount) throw new HttpError(404, 'Worker not found');
    return (await c.query('SELECT id, doc_type, status, issued_on, expires_on, reviewed_at, review_note FROM documents WHERE worker_id = $1 ORDER BY id', [req.params.id])).rows;
  }));
}));

router.post('/documents/:id/review', requireActivity('workforce.documents.review'), h(async (req, res) => {
  const { decision, note } = z.object({
    decision: z.enum(['verified', 'rejected']),
    note: z.string().trim().min(10).max(1000).optional(),
  }).strict().parse(req.body);
  if (decision === 'rejected' && !note) throw new HttpError(422, 'Give the worker a reason and tell them what needs to change (at least 10 characters).');
  res.json(await withUser(req.user!, async (c) => {
    const document = (await c.query('SELECT id, doc_type, status, uploaded_by, review_note FROM documents WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!document) throw new HttpError(404, 'Document not found');
    if (document.uploaded_by === req.user!.id) throw new HttpError(403, 'A different compliance officer must review this document');
    if (!['uploaded', 'under_review'].includes(document.status)) throw new HttpError(409, 'Document has already been reviewed');
    const r = await c.query("UPDATE documents SET status = $2, reviewer_id = $3, reviewed_at = now(), review_note = $4 WHERE id = $1 RETURNING id, doc_type, status, review_note", [req.params.id, decision, req.user!.id, decision === 'rejected' ? note : null]);
    await audit(c, req.user!.id, 'document_' + decision, 'document', r.rows[0].id, { status: document.status }, { status: decision });
    return r.rows[0];
  }));
}));

router.post('/workers/:id/verify', requireActivity('workforce.workers.verify'), h(async (req, res) => {
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
