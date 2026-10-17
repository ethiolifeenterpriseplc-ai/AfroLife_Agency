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
import { staffingAccounting } from '../../src/staffing-accounting.js';

export const router = Router();
router.use(staffingAccounting);
// ================= Job requests and matching =================
const ReqIn = z.object({
  lead_id: z.string().uuid(), sector: z.string().min(2), skills_required: z.array(z.string()).default([]),
  languages_required: z.array(z.string()).default([]), min_experience: z.number().int().min(0).default(0),
  rate_offered: z.number().positive(), territory_id: z.number().int(),
});

router.post('/requests', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  const b = ReqIn.parse(req.body);
  const idempotencyKey = req.get('Idempotency-Key')
    ? z.string().uuid().parse(req.get('Idempotency-Key'))
    : null;
  const payloadHash = idempotencyKey
    ? createHash('sha256').update(JSON.stringify(b)).digest('hex')
    : null;
  const result = await withUser(req.user!, async (c) => {
    if (idempotencyKey) {
      const existing = (await c.query(
        'SELECT * FROM job_requests WHERE idempotency_user_id=$1 AND idempotency_key=$2',
        [req.user!.id, idempotencyKey],
      )).rows[0];
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency-Key was already used for a different job request');
        return { row: existing, replayed: true };
      }
    }
    const l = (await c.query('SELECT source_agent_id FROM leads WHERE id = $1', [b.lead_id])).rows[0];
    if (!l) throw new HttpError(404, 'Lead not found');
    const r = await c.query(
      `INSERT INTO job_requests (lead_id, sector, skills_required, languages_required, min_experience, rate_offered, territory_id, source_agent_id, idempotency_user_id, idempotency_key, payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (idempotency_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [b.lead_id, b.sector, b.skills_required, b.languages_required, b.min_experience, b.rate_offered, b.territory_id, l.source_agent_id, idempotencyKey ? req.user!.id : null, idempotencyKey, payloadHash],
    );
    if (r.rows[0]) {
      await audit(c, req.user!.id, 'request_created', 'job_request', r.rows[0].id, null, { ...b, idempotency_key: idempotencyKey });
      return { row: r.rows[0], replayed: false };
    }
    const existing = (await c.query(
      'SELECT * FROM job_requests WHERE idempotency_user_id=$1 AND idempotency_key=$2',
      [req.user!.id, idempotencyKey],
    )).rows[0];
    if (!existing) throw new HttpError(409, 'Job request could not be recorded; retry using the same Idempotency-Key');
    if (existing.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency-Key was already used for a different job request');
    return { row: existing, replayed: true };
  });
  res.status(result.replayed ? 200 : 201).json(result.row);
}));

router.get('/requests', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query('SELECT * FROM job_requests ORDER BY created_at DESC LIMIT 200')).rows));
}));

/** Candidate visibility follows RLS: agents see their own and direct-team workers; staff retain central visibility. */
async function rank(c: import('pg').PoolClient, requestId: string) {
  const rq = (await c.query('SELECT r.*, t.parent_id AS territory_parent_id FROM job_requests r LEFT JOIN territories t ON t.id = r.territory_id WHERE r.id = $1', [requestId])).rows[0];
  if (!rq) throw new HttpError(404, 'Request not found');
  const rules = await loadRules(c);
  const wt = weightsFromRules(rules);
  const tuning = matchingTuningFromRules(rules);
  const referenceRequired = (rules.worker_requires_reference ?? 0) !== 0;
  const certificateRequired = (rules.worker_requires_certificate ?? 0) !== 0;
  const evaluatedAt = new Date().toISOString();
  const ws = (await c.query(
    `SELECT w.*, t.parent_id AS territory_parent_id,
       EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'reference' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date)) AS current_reference,
       EXISTS (SELECT 1 FROM documents d WHERE d.worker_id = w.id AND d.doc_type = 'certificate' AND d.status = 'verified' AND (d.expires_on IS NULL OR d.expires_on > current_date)) AS current_certificate
     FROM workers w LEFT JOIN territories t ON t.id = w.territory_id
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
    evaluation: {
      policy_version: 'afrolife-worker-match/v1',
      evaluated_at: evaluatedAt,
      scoring: { weights: wt, tuning, minimum_score: tuning.minimumScore },
      eligibility: {
        worker_verified: true,
        worker_available: w.availability !== 'unavailable',
        sector_matches: true,
        current_national_id: true,
        current_police_clearance: true,
        reference_required: referenceRequired,
        current_reference: Boolean(w.current_reference),
        certificate_required: certificateRequired,
        current_certificate: Boolean(w.current_certificate),
        not_previously_proposed: true,
      },
    },
  })).filter((candidate) => candidate.score >= tuning.minimumScore)
    .sort((a, b) => b.score - a.score);
}

router.get('/requests/:id/candidates', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  res.json((await withUser(req.user!, (c) => rank(c, String(req.params.id)))).slice(0, 10));
}));

router.post('/requests/:id/matches', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  const { worker_id } = z.object({ worker_id: z.string().uuid() }).parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const request = (await c.query("SELECT id, source_agent_id FROM job_requests WHERE id = $1 AND status = 'open' FOR UPDATE", [req.params.id])).rows[0];
    if (!request) throw new HttpError(409, 'Request is no longer open');
    const cand = (await rank(c, String(req.params.id))).find((x) => x.worker_id === worker_id); // score is computed server-side
    if (!cand) throw new HttpError(409, 'Worker is not an eligible candidate (unverified, unavailable, wrong sector, or already proposed)');
    const scoreSnapshot = { ...cand.parts, _evaluation: cand.evaluation };
    const r = await c.query('INSERT INTO matches (request_id, worker_id, score, score_breakdown, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.id, worker_id, cand.score, scoreSnapshot, req.user!.id]);
    await audit(c, req.user!.id, 'match_proposed', 'match', r.rows[0].id, null, {
      worker_id,
      score: cand.score,
      policy_version: cand.evaluation.policy_version,
      evaluated_at: cand.evaluation.evaluated_at,
    });
    await notify(c, request.source_agent_id, 'staffing_match_status', {
      request_id: request.id, match_id: r.rows[0].id, status: 'proposed',
    });
    return r.rows[0];
  });
  res.status(201).json(row);
}));

router.post('/matches/:id/respond', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['accepted', 'declined']) }).parse(req.body);
  res.json(await withUser(req.user!, async (c) => {
    const match = (await c.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!match || match.status !== 'proposed') throw new HttpError(409, 'Match not found or already answered');
    let acceptanceEvaluation: Record<string, unknown> | undefined;

    if (decision === 'accepted') {
      const worker = (await c.query(`SELECT w.*, t.parent_id AS territory_parent_id
        FROM workers w LEFT JOIN territories t ON t.id = w.territory_id WHERE w.id = $1 FOR UPDATE OF w`, [match.worker_id])).rows[0];
      if (!worker || worker.availability === 'unavailable' || worker.verification !== 'verified') throw new HttpError(409, 'Worker is no longer eligible');
      const request = (await c.query(`SELECT r.*, t.parent_id AS territory_parent_id
        FROM job_requests r LEFT JOIN territories t ON t.id = r.territory_id WHERE r.id = $1 FOR UPDATE OF r`, [match.request_id])).rows[0];
      if (!request || request.status !== 'open') throw new HttpError(409, 'Request is no longer open');
      const rules = await loadRules(c);
      const referenceRequired = (rules.worker_requires_reference ?? 0) !== 0;
      const certificateRequired = (rules.worker_requires_certificate ?? 0) !== 0;
      const documents = (await c.query(
        `SELECT
           bool_or(doc_type = 'national_id') AS current_national_id,
           bool_or(doc_type = 'police_clearance') AS current_police_clearance,
           bool_or(doc_type = 'reference') AS current_reference,
           bool_or(doc_type = 'certificate') AS current_certificate
         FROM documents
         WHERE worker_id = $1 AND status = 'verified' AND (expires_on IS NULL OR expires_on > current_date)`,
        [worker.id],
      )).rows[0];
      const eligible = worker.verification === 'verified'
        && worker.availability !== 'unavailable'
        && String(worker.sector).toLowerCase() === String(request.sector).toLowerCase()
        && Boolean(documents.current_national_id)
        && Boolean(documents.current_police_clearance)
        && (!referenceRequired || Boolean(documents.current_reference))
        && (!certificateRequired || Boolean(documents.current_certificate));
      if (!eligible) throw new HttpError(409, 'Worker no longer meets current verification, availability, sector, or document requirements; refresh candidates and propose again');

      const currentTuning = matchingTuningFromRules(rules);
      const currentScore = scoreMatch(
        { skills: worker.skills, languages: worker.languages, experience_years: worker.experience_years, rate_expected: Number(worker.rate_expected), availability: worker.availability, territory_id: num(worker.territory_id), territory_parent_id: num(worker.territory_parent_id) },
        { skills_required: request.skills_required, languages_required: request.languages_required, min_experience: request.min_experience, rate_offered: Number(request.rate_offered), territory_id: num(request.territory_id), territory_parent_id: num(request.territory_parent_id) },
        weightsFromRules(rules), currentTuning,
      ).score;
      if (currentScore < currentTuning.minimumScore) throw new HttpError(409, 'Matching policy changed and this proposal is below the current minimum score; refresh candidates and propose again');
      acceptanceEvaluation = {
        current_score: currentScore,
        minimum_score: currentTuning.minimumScore,
        policy_version: 'afrolife-worker-match/v1',
        evaluated_at: new Date().toISOString(),
      };

      await c.query("UPDATE workers SET availability = 'unavailable' WHERE id = $1", [worker.id]);
      await c.query("UPDATE job_requests SET status = 'matched' WHERE id = $1", [request.id]);
      await notify(c, request.source_agent_id, 'staffing_match_status', {
        request_id: request.id, match_id: match.id, status: 'accepted',
      });
    } else {
      const request = (await c.query('SELECT id, source_agent_id FROM job_requests WHERE id = $1', [match.request_id])).rows[0];
      if (request) await notify(c, request.source_agent_id, 'staffing_match_status', {
        request_id: request.id, match_id: match.id, status: 'declined',
      });
    }

    const r = await c.query("UPDATE matches SET status = $2 WHERE id = $1 AND status = 'proposed' RETURNING *", [req.params.id, decision]);
    if (!r.rowCount) throw new HttpError(409, 'Match not found or already answered');
    await audit(c, req.user!.id, 'match_' + decision, 'match', r.rows[0].id, null, acceptanceEvaluation);
    return r.rows[0];
  }));
}));

router.post('/matches/:id/release', requireActivity('staffing.requests.manage'), h(async (req, res) => {
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
    const sourceAgent = (await c.query('SELECT source_agent_id FROM job_requests WHERE id = $1', [request.id])).rows[0]?.source_agent_id;
    await notify(c, sourceAgent, 'staffing_match_status', {
      request_id: request.id, match_id: match.id, status: 'released',
    });
    return { match_id: match.id, worker_id: worker.id, availability, request_status: 'open' };
  }));
}));


router.get('/requests/:id/matches', requireActivity('staffing.requests.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    'SELECT m.id, m.worker_id, m.score, m.score_breakdown, m.status, w.name AS worker_name FROM matches m JOIN workers w ON w.id = m.worker_id WHERE m.request_id = $1 ORDER BY m.created_at', [req.params.id])).rows));
}));
