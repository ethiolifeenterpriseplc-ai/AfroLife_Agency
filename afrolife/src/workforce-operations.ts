import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError, invalidateUser, requireActivity, requireRole, withUser } from './core.js';
import { audit } from './domain.js';
import { toCsv } from './csv.js';
import { hasRoleActivityAccess } from './role-activities.js';
import {
  exceedsWorkforcePayrollBatchLimit,
  WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS,
  WORKFORCE_PAYROLL_EXPORT_MAX_ROWS,
} from './workforce-payroll-batch.js';

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export const workforceOperations = Router();

const ShiftTimeFields = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
}).strict();

const validShiftTimes = (value: { starts_at: string; ends_at: string }) =>
  Date.parse(value.ends_at) > Date.parse(value.starts_at);

function requireWorkforceActivity(req: Request, activity: string) {
  if (!hasRoleActivityAccess(req.user!.role, activity, req.user!.rolePermissions)) {
    throw new HttpError(403, 'Your role is not enabled for this workforce activity');
  }
}

async function loadActivePolicy(client: PoolClient, startsAt: string | Date) {
  const rows = (await client.query(
    `SELECT id,policy_version,warning_daily_minutes,warning_weekly_minutes
     FROM workforce_policy_versions
     WHERE status='approved'
       AND effective_from <= ($1::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date
       AND (effective_to IS NULL OR effective_to >= ($1::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date)`,
    [startsAt],
  )).rows;
  if (rows.length > 1) {
    throw new HttpError(409, 'Multiple approved workforce policies cover this shift date; resolve the overlapping policy coverage before approving or calculating time');
  }
  return rows[0] ?? null;
}

function minutesBetween(start: string | Date, end: string | Date) {
  const minutes = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new HttpError(422, 'Approved clock times must produce a positive duration');
  return minutes;
}

function addisAbabaPeriods(start: string | Date, end: string | Date, weekly: boolean) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const periods: Array<{ start: Date; end: Date }> = [];
  const localStart = new Date(startMs + 3 * 60 * 60 * 1000);
  let cursorMs = Date.UTC(localStart.getUTCFullYear(), localStart.getUTCMonth(), localStart.getUTCDate());
  if (weekly) {
    const weekday = new Date(cursorMs).getUTCDay();
    cursorMs -= ((weekday + 6) % 7) * 24 * 60 * 60 * 1000;
  }
  while (cursorMs - 3 * 60 * 60 * 1000 < endMs) {
    const duration = (weekly ? 7 : 1) * 24 * 60 * 60 * 1000;
    const rangeStart = cursorMs - 3 * 60 * 60 * 1000;
    periods.push({ start: new Date(rangeStart), end: new Date(rangeStart + duration) });
    cursorMs += duration;
  }
  return periods;
}

function overlapMinutes(start: string | Date, end: string | Date, rangeStart: Date, rangeEnd: Date) {
  const overlap = Math.min(new Date(end).getTime(), rangeEnd.getTime())
    - Math.max(new Date(start).getTime(), rangeStart.getTime());
  return overlap > 0 ? Math.floor(overlap / 60_000) : 0;
}

function payrollEncryptionConfig() {
  const keyText = process.env.WORKFORCE_PAYROLL_EXPORT_KEY?.trim() ?? '';
  const keyId = process.env.WORKFORCE_PAYROLL_EXPORT_KEY_ID?.trim() ?? '';
  if (!/^[0-9a-f]{64}$/i.test(keyText) || !keyId) {
    throw new HttpError(503, 'Encrypted payroll export is unavailable until WORKFORCE_PAYROLL_EXPORT_KEY and WORKFORCE_PAYROLL_EXPORT_KEY_ID are configured');
  }
  return { key: Buffer.from(keyText, 'hex'), keyId };
}

function encryptPayrollExport(csv: string, key: Buffer, keyId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(csv, 'utf8'), cipher.final()]);
  const controlHash = createHash('sha256').update(csv, 'utf8').digest('hex');
  return {
    controlHash,
    payload: {
      version: 1,
      algorithm: 'AES-256-GCM',
      key_id: keyId,
      iv: iv.toString('base64'),
      auth_tag: cipher.getAuthTag().toString('base64'),
      control_hash: controlHash,
      ciphertext: encrypted.toString('base64'),
    },
  };
}

workforceOperations.get('/workforce/engagements', requireActivity('workforce.shifts.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT e.id,e.worker_type,e.billing_unit,e.starts_on,e.ends_on,w.name AS worker_name,
        l.name AS employer_client,e.status
     FROM staffing_engagements e JOIN workers w ON w.id=e.worker_id
     LEFT JOIN leads l ON l.id=e.client_lead_id
     WHERE e.status='active' AND w.employment_status='active'
       AND e.worker_type IS NOT NULL
     ORDER BY e.starts_on DESC,e.created_at DESC LIMIT 500`,
  )).rows));
}));

workforceOperations.get('/workforce/shifts', requireActivity('workforce.shifts.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT s.id,s.engagement_id,s.starts_at,s.ends_at,s.status,s.worker_response,
        e.worker_type,e.billing_unit,w.id AS worker_id,w.name AS worker_name,l.name AS employer_client,
        t.id AS time_entry_id,t.status AS time_status,t.clock_in_at,t.clock_out_at,t.exception_reason
     FROM workforce_shifts s
     JOIN staffing_engagements e ON e.id=s.engagement_id
     JOIN workers w ON w.id=e.worker_id
     LEFT JOIN leads l ON l.id=e.client_lead_id
     LEFT JOIN workforce_time_entries t ON t.shift_id=s.id
     ORDER BY s.starts_at DESC LIMIT 500`,
  )).rows));
}));

workforceOperations.get('/workforce/shifts/mine', requireRole('worker'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT s.id,s.starts_at,s.ends_at,s.status,s.worker_response,s.worker_response_reason,
        e.worker_type,e.billing_unit,e.worker_rate::text,l.name AS employer_client,
        t.id AS time_entry_id,t.status AS time_status,t.clock_in_at,t.clock_out_at,
        t.exception_reason,t.approved_minutes,t.payable_minutes,
        c.status AS latest_correction_status,c.reason AS latest_correction_reason
     FROM workforce_shifts s
     JOIN staffing_engagements e ON e.id=s.engagement_id
     JOIN workers w ON w.id=e.worker_id JOIN users u ON u.id=$1 AND w.phone=u.phone
     LEFT JOIN leads l ON l.id=e.client_lead_id
     LEFT JOIN workforce_time_entries t ON t.shift_id=s.id
     LEFT JOIN LATERAL (
       SELECT status,reason FROM workforce_time_corrections
       WHERE shift_id=s.id ORDER BY requested_at DESC LIMIT 1
     ) c ON true
     ORDER BY s.starts_at DESC LIMIT 200`,
    [req.user!.id],
  )).rows));
}));

workforceOperations.post('/workforce/shifts', requireActivity('workforce.shifts.manage'), h(async (req, res) => {
  const body = z.object({ engagement_id: z.string().uuid(), ...ShiftTimeFields.shape }).strict()
    .refine(validShiftTimes, {
      message: 'Shift end must be after its start',
    }).parse(req.body);
  const shift = await withUser(req.user!, async (client) => {
    const engagement = (await client.query(
      `SELECT e.id,e.worker_id,e.status,e.worker_type,e.starts_on,e.ends_on,w.employment_status,e.source_agent_id
       FROM staffing_engagements e JOIN workers w ON w.id=e.worker_id
       WHERE e.id=$1 FOR UPDATE OF e,w`,
      [body.engagement_id],
    )).rows[0];
    if (!engagement) throw new HttpError(404, 'Active staffing engagement not found');
    if (engagement.status !== 'active' || engagement.employment_status !== 'active') {
      throw new HttpError(409, 'A shift can only be assigned to an active worker engagement');
    }
    if (!engagement.worker_type) throw new HttpError(409, 'Worker classification must be recorded before scheduling a shift');
    const withinDates = await client.query(
      `SELECT ($1::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date >= $3::date
          AND ($2::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date <= coalesce($4::date,'9999-12-31'::date) AS valid`,
      [body.starts_at, body.ends_at, engagement.starts_on, engagement.ends_on],
    );
    if (!withinDates.rows[0].valid) throw new HttpError(422, 'Shift must fall within the engagement dates');
    const overlap = await client.query(
      `SELECT 1 FROM workforce_shifts s
       JOIN staffing_engagements e ON e.id=s.engagement_id
       WHERE e.worker_id=$1 AND s.status='scheduled' AND s.starts_at < $3 AND s.ends_at > $2
       LIMIT 1`,
      [engagement.worker_id, body.starts_at, body.ends_at],
    );
    if (overlap.rowCount) throw new HttpError(409, 'The worker already has an overlapping scheduled shift');
    const row = (await client.query(
      `INSERT INTO workforce_shifts(engagement_id,starts_at,ends_at,created_by)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [engagement.id, body.starts_at, body.ends_at, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_shift_created', 'workforce_shift', row.id, null, {
      engagement_id: engagement.id, starts_at: body.starts_at, ends_at: body.ends_at, worker_type: engagement.worker_type,
    });
    return row;
  });
  res.status(201).json(shift);
}));

workforceOperations.post('/workforce/shifts/:id/response', requireRole('worker'), h(async (req, res) => {
  const body = z.object({
    response: z.enum(['accepted','declined']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const shift = (await client.query(
      `SELECT s.*,e.status AS engagement_status,w.phone,w.employment_status
       FROM workforce_shifts s JOIN staffing_engagements e ON e.id=s.engagement_id
       JOIN workers w ON w.id=e.worker_id WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id],
    )).rows[0];
    if (!shift || shift.phone !== req.user!.phone) throw new HttpError(404, 'Shift not found');
    if (shift.status !== 'scheduled' || shift.worker_response !== 'pending') throw new HttpError(409, 'This shift is no longer awaiting your response');
    if (shift.employment_status !== 'active' || shift.engagement_status !== 'active') {
      throw new HttpError(403, 'An inactive or terminated worker cannot accept a shift');
    }
    const updated = (await client.query(
      `UPDATE workforce_shifts
       SET worker_response=$2,worker_response_reason=$3,worker_responded_by=$4,worker_responded_at=now()
       WHERE id=$1 RETURNING id,status,worker_response,worker_response_reason,worker_responded_at`,
      [shift.id, body.response, body.reason, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, `workforce_shift_${body.response}`, 'workforce_shift', shift.id,
      { worker_response: 'pending' }, { worker_response: body.response, reason: body.reason });
    return updated;
  });
  res.json(row);
}));

workforceOperations.post('/workforce/shifts/:id/cancel', requireActivity('workforce.shifts.manage'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const shift = (await client.query(
      `SELECT s.*,e.source_agent_id FROM workforce_shifts s
       JOIN staffing_engagements e ON e.id=s.engagement_id WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id],
    )).rows[0];
    if (!shift) throw new HttpError(404, 'Shift not found');
    if (shift.status !== 'scheduled') throw new HttpError(409, 'Only a scheduled shift can be cancelled');
    const event = await client.query('SELECT 1 FROM workforce_clock_events WHERE shift_id=$1 LIMIT 1', [shift.id]);
    if (event.rowCount) throw new HttpError(409, 'A shift with recorded clock events cannot be cancelled; review its attendance instead');
    const updated = (await client.query(
      `UPDATE workforce_shifts SET status='cancelled' WHERE id=$1 RETURNING id,status`,
      [shift.id],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_shift_cancelled', 'workforce_shift', shift.id,
      { status: shift.status }, { status: 'cancelled', reason });
    return updated;
  });
  res.json(row);
}));

workforceOperations.post('/workforce/shifts/:id/clock-events', requireRole('worker'), h(async (req, res) => {
  const body = z.object({
    event_type: z.enum(['clock_in','clock_out']),
    client_event_id: z.string().uuid(),
    occurred_at: z.string().datetime({ offset: true }),
    source: z.enum(['online','offline']),
  }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const shift = (await client.query(
      `SELECT s.*,e.status AS engagement_status,w.id AS worker_id,w.phone,w.employment_status
       FROM workforce_shifts s JOIN staffing_engagements e ON e.id=s.engagement_id
       JOIN workers w ON w.id=e.worker_id WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id],
    )).rows[0];
    if (!shift || shift.phone !== req.user!.phone) throw new HttpError(404, 'Shift not found');
    const priorIdempotent = (await client.query(
      `SELECT * FROM workforce_clock_events WHERE recorded_by=$1 AND client_event_id=$2`,
      [req.user!.id, body.client_event_id],
    )).rows[0];
    if (priorIdempotent) {
      if (priorIdempotent.shift_id !== shift.id || priorIdempotent.event_type !== body.event_type
        || new Date(priorIdempotent.occurred_at).getTime() !== Date.parse(body.occurred_at)) {
        throw new HttpError(409, 'This offline event identifier was already used for a different clock event');
      }
      return { event: priorIdempotent, duplicate: true };
    }
    if (shift.status !== 'scheduled' || shift.worker_response !== 'accepted' || shift.engagement_status !== 'active') {
      throw new HttpError(409, 'Only accepted shifts in an active engagement can be clocked');
    }
    if (shift.employment_status !== 'active') throw new HttpError(403, 'Terminated workers cannot record shift time');
    const existingEvent = (await client.query(
      'SELECT id FROM workforce_clock_events WHERE shift_id=$1 AND event_type=$2',
      [shift.id, body.event_type],
    )).rows[0];
    if (existingEvent) throw new HttpError(409, `A ${body.event_type.replace('_',' ')} has already been recorded for this shift`);
    if (body.event_type === 'clock_out') {
      const clockIn = await client.query(
        `SELECT id FROM workforce_clock_events WHERE shift_id=$1 AND event_type='clock_in'`,
        [shift.id],
      );
      if (!clockIn.rowCount) throw new HttpError(409, 'Clock in before clocking out; offline events must sync in order');
    }
    const event = (await client.query(
      `INSERT INTO workforce_clock_events(shift_id,event_type,client_event_id,occurred_at,recorded_by,source)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [shift.id, body.event_type, body.client_event_id, body.occurred_at, req.user!.id, body.source],
    )).rows[0];
    const eventAt = new Date(body.occurred_at);
    const scheduledStart = new Date(shift.starts_at);
    const scheduledEnd = new Date(shift.ends_at);
    let exception = eventAt < scheduledStart || eventAt > scheduledEnd
      ? 'Clock time falls outside the scheduled shift; review is required.'
      : null;
    const entry = (await client.query(
      'SELECT * FROM workforce_time_entries WHERE shift_id=$1 FOR UPDATE',
      [shift.id],
    )).rows[0];
    if (body.event_type === 'clock_in') {
      if (entry?.clock_in_at) throw new HttpError(409, 'A clock in has already been recorded for this shift');
      if (!entry) {
        await client.query(
          `INSERT INTO workforce_time_entries(shift_id,clock_in_at,status,exception_reason)
           VALUES($1,$2,$3,$4)`,
          [shift.id, body.occurred_at, exception ? 'needs_review' : 'recorded', exception],
        );
      } else {
        await client.query(
          `UPDATE workforce_time_entries SET clock_in_at=$2,status=$3,exception_reason=$4,updated_at=now()
           WHERE id=$1`,
          [entry.id, body.occurred_at, exception ? 'needs_review' : 'recorded', exception],
        );
      }
    } else {
      if (entry?.clock_out_at) throw new HttpError(409, 'A clock out has already been recorded for this shift');
      if (entry?.clock_in_at && eventAt <= new Date(entry.clock_in_at)) {
        exception = 'Clock out is not after clock in; request a correction for review.';
      }
      const reason = [entry?.exception_reason, exception].filter(Boolean).join(' ');
      await client.query(
        `UPDATE workforce_time_entries
         SET clock_out_at=$2,status=$3,exception_reason=$4,updated_at=now() WHERE shift_id=$1`,
        [shift.id, body.occurred_at, reason ? 'needs_review' : 'recorded', reason || null],
      );
    }
    await audit(client, req.user!.id, `workforce_${body.event_type}`, 'workforce_clock_event', event.id, null, {
      shift_id: shift.id, occurred_at: body.occurred_at, source: body.source, exception,
    });
    return { event, duplicate: false, status: exception ? 'needs_review' : 'recorded', exception_reason: exception };
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

workforceOperations.get('/workforce/time-review-queue', requireActivity('workforce.time.review'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT s.id AS shift_id,s.starts_at,s.ends_at,s.status AS shift_status,
        e.id AS engagement_id,e.worker_type,e.billing_unit,w.name AS worker_name,l.name AS employer_client,
        t.id AS time_entry_id,t.clock_in_at,t.clock_out_at,t.status AS time_status,t.exception_reason,
        c.id AS correction_id,c.proposed_clock_in_at,c.proposed_clock_out_at,c.reason AS correction_reason,
        c.status AS correction_status,c.requested_by,c.reviewed_by
     FROM workforce_shifts s
     JOIN staffing_engagements e ON e.id=s.engagement_id JOIN workers w ON w.id=e.worker_id
     LEFT JOIN leads l ON l.id=e.client_lead_id
     LEFT JOIN workforce_time_entries t ON t.shift_id=s.id
     LEFT JOIN LATERAL (
       SELECT * FROM workforce_time_corrections x
       WHERE x.shift_id=s.id ORDER BY x.requested_at DESC LIMIT 1
     ) c ON true
     WHERE (s.ends_at < now() AND (t.id IS NULL OR t.clock_in_at IS NULL OR t.clock_out_at IS NULL OR t.status='needs_review'))
       OR c.status='pending'
     ORDER BY s.ends_at LIMIT 500`,
  )).rows));
}));

workforceOperations.post('/workforce/shifts/:id/corrections', requireRole(
  'worker','master_agent','field_agent','corporate_business_manager','finance_manager','super_admin','global_admin',
), h(async (req, res) => {
  const body = z.object({
    proposed_clock_in_at: z.string().datetime({ offset: true }).nullable().optional(),
    proposed_clock_out_at: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(10).max(1000),
  }).strict().refine((value) => value.proposed_clock_in_at || value.proposed_clock_out_at, {
    message: 'Provide at least one corrected clock time',
  }).parse(req.body);
  const isWorker = req.user!.role === 'worker';
  if (!isWorker) requireWorkforceActivity(req, 'workforce.time.review');
  const correction = await withUser(req.user!, async (client) => {
    const shift = (await client.query(
      `SELECT s.*,e.status AS engagement_status,e.source_agent_id,w.phone,w.employment_status
       FROM workforce_shifts s JOIN staffing_engagements e ON e.id=s.engagement_id
       JOIN workers w ON w.id=e.worker_id WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id],
    )).rows[0];
    if (!shift || (isWorker && shift.phone !== req.user!.phone)) throw new HttpError(404, 'Shift not found');
    if (!isWorker && !shift.source_agent_id) throw new HttpError(404, 'Shift not found');
    if (isWorker && (shift.worker_response !== 'accepted' || shift.employment_status !== 'active')) {
      throw new HttpError(403, 'Only an active worker assigned to the shift can request a correction');
    }
    if (shift.status === 'cancelled') throw new HttpError(409, 'A cancelled shift cannot receive time corrections');
    const entry = (await client.query('SELECT status FROM workforce_time_entries WHERE shift_id=$1', [shift.id])).rows[0];
    if (entry?.status === 'exported') throw new HttpError(409, 'This time was already exported; contact Finance to preserve the export audit trail');
    const pendingCorrection = await client.query(
      `SELECT 1 FROM workforce_time_corrections WHERE shift_id=$1 AND status='pending' LIMIT 1`,
      [shift.id],
    );
    if (pendingCorrection.rowCount) throw new HttpError(409, 'A time correction for this shift is already awaiting review');
    const row = (await client.query(
      `INSERT INTO workforce_time_corrections(shift_id,proposed_clock_in_at,proposed_clock_out_at,reason,requested_by)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [shift.id, body.proposed_clock_in_at ?? null, body.proposed_clock_out_at ?? null, body.reason, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_time_correction_requested', 'workforce_time_correction', row.id, null, {
      shift_id: shift.id, proposed_clock_in_at: row.proposed_clock_in_at,
      proposed_clock_out_at: row.proposed_clock_out_at, reason: body.reason,
    });
    return row;
  });
  res.status(201).json(correction);
}));

workforceOperations.post('/workforce/corrections/:id/decision', requireActivity('workforce.time.review'), h(async (req, res) => {
  const body = z.object({
    decision: z.enum(['approve','reject']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const correction = (await client.query(
      `SELECT c.*,s.status AS shift_status,t.status AS time_status
       FROM workforce_time_corrections c JOIN workforce_shifts s ON s.id=c.shift_id
       LEFT JOIN workforce_time_entries t ON t.shift_id=s.id
       WHERE c.id=$1 FOR UPDATE OF c,s`,
      [req.params.id],
    )).rows[0];
    if (!correction) throw new HttpError(404, 'Time correction not found');
    if (correction.status !== 'pending') throw new HttpError(409, 'Time correction has already been reviewed');
    if (correction.requested_by === req.user!.id) throw new HttpError(403, 'The correction maker cannot review their own request');
    if (correction.time_status === 'exported') throw new HttpError(409, 'Exported attendance cannot be changed');
    const updated = (await client.query(
      `UPDATE workforce_time_corrections SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now()
       WHERE id=$1 RETURNING *`,
      [correction.id, body.decision === 'approve' ? 'approved' : 'rejected', req.user!.id, body.reason],
    )).rows[0];
    if (body.decision === 'approve' && correction.time_status && ['approved','payable'].includes(correction.time_status)) {
      await client.query(
        `UPDATE workforce_time_entries
         SET status='needs_review',approved_clock_in_at=NULL,approved_clock_out_at=NULL,
             approved_minutes=NULL,payable_minutes=NULL,policy_version_id=NULL,policy_warnings='{}',
             approved_by=NULL,approved_at=NULL,approval_reason=NULL,
             exception_reason='An approved time correction requires a fresh attendance approval.',updated_at=now()
         WHERE shift_id=$1`,
        [correction.shift_id],
      );
    }
    await audit(client, req.user!.id, `workforce_time_correction_${body.decision}`,
      'workforce_time_correction', correction.id, { status: 'pending' },
      { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(row);
}));

workforceOperations.post('/workforce/shifts/:id/approve-time', requireActivity('workforce.time.review'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const shift = (await client.query(
      `SELECT s.*,e.worker_type,e.source_agent_id FROM workforce_shifts s
       JOIN staffing_engagements e ON e.id=s.engagement_id WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id],
    )).rows[0];
    if (!shift) throw new HttpError(404, 'Shift not found');
    if (shift.status !== 'scheduled') throw new HttpError(409, 'Only a scheduled shift can be approved');
    if (new Date(shift.ends_at).getTime() > Date.now()) throw new HttpError(409, 'A shift cannot be approved before its scheduled end');
    const correction = (await client.query(
      `SELECT * FROM workforce_time_corrections WHERE shift_id=$1
       ORDER BY requested_at DESC LIMIT 1`,
      [shift.id],
    )).rows[0];
    if (correction?.status === 'pending') throw new HttpError(409, 'Review the pending time correction before approving attendance');
    if (correction?.status === 'approved' && correction.requested_by === req.user!.id) {
      throw new HttpError(403, 'The correction reviewer cannot approve the corrected attendance');
    }
    const entry = (await client.query('SELECT * FROM workforce_time_entries WHERE shift_id=$1 FOR UPDATE', [shift.id])).rows[0];
    const approvedIn = correction?.status === 'approved' && correction.proposed_clock_in_at
      ? correction.proposed_clock_in_at : entry?.clock_in_at;
    const approvedOut = correction?.status === 'approved' && correction.proposed_clock_out_at
      ? correction.proposed_clock_out_at : entry?.clock_out_at;
    if (!approvedIn || !approvedOut) {
      throw new HttpError(409, 'Both clock times are required; request and approve a correction for any missing event');
    }
    if (entry?.status === 'exported') throw new HttpError(409, 'Exported attendance cannot be changed');
    const approvedMinutes = minutesBetween(approvedIn, approvedOut);
    const policy = await loadActivePolicy(client, shift.starts_at);
    let warningReason = entry?.exception_reason ?? null;
    if (!policy) warningReason = [warningReason, 'No approved effective-dated workforce policy is available; payable-time calculation remains pending.'].filter(Boolean).join(' ');
    const updated = entry
      ? (await client.query(
        `UPDATE workforce_time_entries SET
           status=$2,exception_reason=$3,approved_clock_in_at=$4,approved_clock_out_at=$5,
           approved_minutes=$6,payable_minutes=$7,policy_version_id=$8,policy_warnings=$9,
           approved_by=$10,approved_at=now(),approval_reason=$11,updated_at=now()
         WHERE id=$1 RETURNING *`,
        [entry.id, policy ? 'payable' : 'approved', warningReason, approvedIn, approvedOut,
          approvedMinutes, policy ? approvedMinutes : null, policy?.id ?? null, [], req.user!.id, reason],
      )).rows[0]
      : (await client.query(
        `INSERT INTO workforce_time_entries(shift_id,status,exception_reason,approved_clock_in_at,approved_clock_out_at,
           approved_minutes,payable_minutes,policy_version_id,approved_by,approved_at,approval_reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10) RETURNING *`,
        [shift.id, policy ? 'payable' : 'approved', warningReason, approvedIn, approvedOut,
          approvedMinutes, policy ? approvedMinutes : null, policy?.id ?? null, req.user!.id, reason],
      )).rows[0];
    await client.query(`UPDATE workforce_shifts SET status='completed' WHERE id=$1`, [shift.id]);
    await audit(client, req.user!.id, 'workforce_time_approved', 'workforce_time_entry', updated.id,
      { status: entry?.status ?? 'missing' }, {
        status: updated.status, approved_minutes: approvedMinutes,
        policy_version: policy?.policy_version ?? null, warning_reason: warningReason, reason,
      });
    return updated;
  });
  res.json(row);
}));

workforceOperations.get('/workforce/leave/mine', requireRole('worker'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT id,engagement_id,request_type,starts_on,ends_on,reason,status,review_reason,reviewed_at,created_at
     FROM workforce_leave_requests WHERE user_id=$1 ORDER BY starts_on DESC,created_at DESC LIMIT 100`,
    [req.user!.id],
  )).rows));
}));

workforceOperations.post('/workforce/leave', requireRole('worker'), h(async (req, res) => {
  const body = z.object({
    engagement_id: z.string().uuid(),
    starts_on: z.string().date(),
    ends_on: z.string().date(),
    reason: z.string().trim().min(10).max(2000),
  }).strict().refine((value) => value.ends_on >= value.starts_on, {
    message: 'End date must be on or after start date',
  }).parse(req.body);
  const request = await withUser(req.user!, async (client) => {
    const engagement = (await client.query(
      `SELECT e.id,e.status,e.worker_type,e.starts_on,e.ends_on,w.phone,w.employment_status
       FROM staffing_engagements e JOIN workers w ON w.id=e.worker_id
       WHERE e.id=$1 FOR UPDATE OF e`,
      [body.engagement_id],
    )).rows[0];
    if (!engagement || engagement.phone !== req.user!.phone) throw new HttpError(404, 'Active engagement not found');
    if (engagement.status !== 'active' || engagement.employment_status !== 'active') {
      throw new HttpError(409, 'Time-away requests require an active worker engagement');
    }
    if (body.starts_on < String(engagement.starts_on).slice(0,10)
      || (engagement.ends_on && body.ends_on > String(engagement.ends_on).slice(0,10))) {
      throw new HttpError(422, 'Time-away dates must fall within the engagement dates');
    }
    const requestType = ['full_time_employee','part_time_employee'].includes(engagement.worker_type)
      ? 'leave' : 'availability';
    const duplicate = await client.query(
      `SELECT 1 FROM workforce_leave_requests
       WHERE engagement_id=$1 AND status IN ('submitted','approved')
         AND starts_on <= $3 AND ends_on >= $2 LIMIT 1`,
      [engagement.id, body.starts_on, body.ends_on],
    );
    if (duplicate.rowCount) throw new HttpError(409, 'An overlapping leave or availability request already exists');
    const row = (await client.query(
      `INSERT INTO workforce_leave_requests(engagement_id,user_id,request_type,starts_on,ends_on,reason)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [engagement.id, req.user!.id, requestType, body.starts_on, body.ends_on, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_time_away_requested', 'workforce_leave_request', row.id, null, {
      request_type: requestType, starts_on: body.starts_on, ends_on: body.ends_on,
    });
    return row;
  });
  res.status(201).json(request);
}));

workforceOperations.post('/workforce/leave/:id/withdraw', requireRole('worker'), h(async (req, res) => {
  const row = await withUser(req.user!, async (client) => {
    const request = (await client.query(
      'SELECT id,status FROM workforce_leave_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [req.params.id, req.user!.id],
    )).rows[0];
    if (!request) throw new HttpError(404, 'Time-away request not found');
    if (request.status !== 'submitted') throw new HttpError(409, 'Only a submitted request can be withdrawn');
    const updated = (await client.query(
      `UPDATE workforce_leave_requests SET status='withdrawn',updated_at=now() WHERE id=$1 RETURNING *`,
      [request.id],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_time_away_withdrawn', 'workforce_leave_request', request.id,
      { status: request.status }, { status: 'withdrawn' });
    return updated;
  });
  res.json(row);
}));

workforceOperations.get('/workforce/leave/queue', requireActivity('workforce.leave.review'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT r.*,w.name AS worker_name,e.worker_type,l.name AS employer_client
     FROM workforce_leave_requests r
     JOIN staffing_engagements e ON e.id=r.engagement_id JOIN workers w ON w.id=e.worker_id
     LEFT JOIN leads l ON l.id=e.client_lead_id
     WHERE r.status='submitted' ORDER BY r.starts_on,r.created_at LIMIT 300`,
  )).rows));
}));

workforceOperations.post('/workforce/leave/:id/decision', requireActivity('workforce.leave.review'), h(async (req, res) => {
  const body = z.object({
    decision: z.enum(['approve','reject']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const request = (await client.query(
      'SELECT * FROM workforce_leave_requests WHERE id=$1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!request) throw new HttpError(404, 'Time-away request not found');
    if (request.status !== 'submitted') throw new HttpError(409, 'Time-away request is no longer pending');
    if (request.user_id === req.user!.id) throw new HttpError(403, 'A request maker cannot approve their own time-away request');
    const updated = (await client.query(
      `UPDATE workforce_leave_requests SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now(),updated_at=now()
       WHERE id=$1 RETURNING *`,
      [request.id, body.decision === 'approve' ? 'approved' : 'rejected', req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, `workforce_time_away_${body.decision}`, 'workforce_leave_request',
      request.id, { status: request.status }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(row);
}));

workforceOperations.get('/workforce/policies', requireActivity('workforce.policy.manage'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT id,policy_version,jurisdiction,citation,effective_from,effective_to,warning_daily_minutes,
        warning_weekly_minutes,status,test_evidence,created_by,approved_by,approval_evidence,approved_at,created_at
     FROM workforce_policy_versions ORDER BY effective_from DESC,created_at DESC LIMIT 100`,
  )).rows));
}));

workforceOperations.post('/workforce/policies', requireActivity('workforce.policy.manage'), h(async (req, res) => {
  const body = z.object({
    policy_version: z.string().trim().min(1).max(80),
    jurisdiction: z.string().trim().min(2).max(80),
    citation: z.string().trim().min(10).max(2000),
    effective_from: z.string().date(),
    effective_to: z.string().date().optional(),
    warning_daily_minutes: z.number().int().positive(),
    warning_weekly_minutes: z.number().int().positive(),
    test_evidence: z.string().trim().min(10).max(4000),
  }).strict().refine((value) => !value.effective_to || value.effective_to >= value.effective_from, {
    message: 'Effective-to must be on or after effective-from',
  }).parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const policy = (await client.query(
      `INSERT INTO workforce_policy_versions(policy_version,jurisdiction,citation,effective_from,effective_to,
          warning_daily_minutes,warning_weekly_minutes,test_evidence,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [body.policy_version, body.jurisdiction, body.citation, body.effective_from, body.effective_to ?? null,
        body.warning_daily_minutes, body.warning_weekly_minutes, body.test_evidence, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_policy_drafted', 'workforce_policy_version', policy.id, null, {
      policy_version: policy.policy_version, jurisdiction: policy.jurisdiction,
      effective_from: policy.effective_from, effective_to: policy.effective_to,
    });
    return policy;
  });
  res.status(201).json(row);
}));

workforceOperations.post('/workforce/policies/:id/approve', requireRole('compliance'), requireActivity('workforce.policy.manage'), h(async (req, res) => {
  const { evidence } = z.object({ evidence: z.string().trim().min(10).max(2000) }).strict().parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const policy = (await client.query(
      'SELECT * FROM workforce_policy_versions WHERE id=$1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!policy) throw new HttpError(404, 'Workforce policy version not found');
    if (policy.status !== 'draft') throw new HttpError(409, 'Only a draft policy can be approved');
    if (policy.created_by === req.user!.id) throw new HttpError(403, 'The policy maker cannot approve their own policy');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', [policy.jurisdiction]);
    const overlap = await client.query(
      `SELECT 1 FROM workforce_policy_versions
       WHERE status='approved' AND jurisdiction=$1
         AND effective_from <= coalesce($3::date,'9999-12-31'::date)
         AND coalesce(effective_to,'9999-12-31'::date) >= $2::date LIMIT 1`,
      [policy.jurisdiction, policy.effective_from, policy.effective_to],
    );
    if (overlap.rowCount) throw new HttpError(409, 'An approved policy already covers part of this effective period');
    const approved = (await client.query(
      `UPDATE workforce_policy_versions
       SET status='approved',approved_by=$2,approval_evidence=$3,approved_at=now()
       WHERE id=$1 RETURNING *`,
      [policy.id, req.user!.id, evidence],
    )).rows[0];
    await audit(client, req.user!.id, 'workforce_policy_approved', 'workforce_policy_version', policy.id,
      { status: 'draft' }, { status: 'approved', evidence });
    return approved;
  });
  res.json(row);
}));

workforceOperations.post('/workforce/payable-time/calculate', requireActivity('workforce.payroll.export'), h(async (req, res) => {
  const body = z.object({ period_start: z.string().date(), period_end: z.string().date() })
    .strict().refine((value) => value.period_end >= value.period_start, {
      message: 'Period end must be on or after period start',
    }).parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const entries = (await client.query(
      `SELECT t.id,t.shift_id,t.approved_clock_in_at,t.approved_clock_out_at,s.starts_at,
          e.worker_id,e.worker_type,w.name AS worker_name
       FROM workforce_time_entries t JOIN workforce_shifts s ON s.id=t.shift_id
       JOIN staffing_engagements e ON e.id=s.engagement_id JOIN workers w ON w.id=e.worker_id
       WHERE t.status='approved'
         AND (s.starts_at AT TIME ZONE 'Africa/Addis_Ababa')::date BETWEEN $1::date AND $2::date
       ORDER BY s.starts_at LIMIT ${WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS + 1}`,
      [body.period_start, body.period_end],
    )).rows;
    if (exceedsWorkforcePayrollBatchLimit(entries.length, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS)) {
      throw new HttpError(409, `This period has more than ${WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS} approved attendance rows; split the period before calculating payable time`);
    }
    if (!entries.length) throw new HttpError(409, 'No newly approved attendance is available for this period');
    const calculated = [];
    for (const entry of entries) {
      const policy = await loadActivePolicy(client, entry.starts_at);
      if (!policy) throw new HttpError(409, 'An approved effective-dated workforce policy is required for every shift in the period');
      const minutes = minutesBetween(entry.approved_clock_in_at, entry.approved_clock_out_at);
      const dailyPeriods = addisAbabaPeriods(entry.approved_clock_in_at, entry.approved_clock_out_at, false);
      const weeklyPeriods = addisAbabaPeriods(entry.approved_clock_in_at, entry.approved_clock_out_at, true);
      const ranges = [...dailyPeriods, ...weeklyPeriods];
      const minimumRange = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
      const maximumRange = new Date(Math.max(...ranges.map((range) => range.end.getTime())));
      const previousEntries = (await client.query(
        `SELECT t.approved_clock_in_at,t.approved_clock_out_at
         FROM workforce_time_entries t JOIN workforce_shifts s ON s.id=t.shift_id
         JOIN staffing_engagements e ON e.id=s.engagement_id
         WHERE e.worker_id=$1 AND t.status IN ('approved','payable','exported') AND t.id<>$2
           AND t.approved_clock_in_at < $3 AND t.approved_clock_out_at > $4`,
        [entry.worker_id, entry.id, maximumRange.toISOString(), minimumRange.toISOString()],
      )).rows;
      const warnings = [];
      if (dailyPeriods.some((period) => previousEntries.reduce(
        (total, prior) => total + overlapMinutes(prior.approved_clock_in_at, prior.approved_clock_out_at, period.start, period.end),
        0,
      ) + overlapMinutes(entry.approved_clock_in_at, entry.approved_clock_out_at, period.start, period.end) > policy.warning_daily_minutes)) {
        warnings.push('daily_threshold_warning');
      }
      if (weeklyPeriods.some((period) => previousEntries.reduce(
        (total, prior) => total + overlapMinutes(prior.approved_clock_in_at, prior.approved_clock_out_at, period.start, period.end),
        0,
      ) + overlapMinutes(entry.approved_clock_in_at, entry.approved_clock_out_at, period.start, period.end) > policy.warning_weekly_minutes)) {
        warnings.push('weekly_threshold_warning');
      }
      const updated = (await client.query(
        `UPDATE workforce_time_entries SET status='payable',payable_minutes=$2,policy_version_id=$3,
            policy_warnings=$4,updated_at=now() WHERE id=$1 RETURNING id,payable_minutes,policy_version_id,policy_warnings`,
        [entry.id, minutes, policy.id, warnings],
      )).rows[0];
      calculated.push({
        ...updated,
        worker_name: entry.worker_name,
        worker_type: entry.worker_type,
        shift_start: entry.starts_at,
      });
    }
    await audit(client, req.user!.id, 'workforce_payable_time_calculated', 'workforce_time_period',
      `${body.period_start}:${body.period_end}`, null, { count: calculated.length, period_start: body.period_start, period_end: body.period_end });
    return { period_start: body.period_start, period_end: body.period_end, calculated };
  });
  res.json(result);
}));

workforceOperations.post('/workforce/payroll-exports', requireActivity('workforce.payroll.export'), h(async (req, res) => {
  const body = z.object({
    period_start: z.string().date(),
    period_end: z.string().date(),
    mapping_version: z.string().trim().min(1).max(80),
  }).strict().refine((value) => value.period_end >= value.period_start, {
    message: 'Period end must be on or after period start',
  }).parse(req.body);
  const { key, keyId } = payrollEncryptionConfig();
  const exportRecord = await withUser(req.user!, async (client) => {
    const rows = (await client.query(
      `SELECT t.id AS time_entry_id,s.id AS shift_id,s.starts_at,s.ends_at,e.worker_type,e.billing_unit,
          e.worker_rate::text,w.id AS worker_id,w.name AS worker_name,t.payable_minutes,
          p.id AS policy_version_id,p.policy_version
       FROM workforce_time_entries t JOIN workforce_shifts s ON s.id=t.shift_id
       JOIN staffing_engagements e ON e.id=s.engagement_id JOIN workers w ON w.id=e.worker_id
       JOIN workforce_policy_versions p ON p.id=t.policy_version_id
       WHERE t.status='payable'
         AND (s.starts_at AT TIME ZONE 'Africa/Addis_Ababa')::date BETWEEN $1::date AND $2::date
         AND p.status='approved'
       ORDER BY s.starts_at LIMIT ${WORKFORCE_PAYROLL_EXPORT_MAX_ROWS + 1}`,
      [body.period_start, body.period_end],
    )).rows;
    if (exceedsWorkforcePayrollBatchLimit(rows.length, WORKFORCE_PAYROLL_EXPORT_MAX_ROWS)) {
      throw new HttpError(409, `This period has more than ${WORKFORCE_PAYROLL_EXPORT_MAX_ROWS} payable attendance rows; split the period before exporting payroll`);
    }
    if (!rows.length) throw new HttpError(409, 'No payable, approved time rows are available for this period');
    if (new Set(rows.map((row) => row.policy_version_id)).size !== 1) {
      throw new HttpError(409, 'This export period spans multiple workforce policy versions; create separate exports per policy version');
    }
    const columns = [
      'worker_id','worker_name','worker_type','billing_unit','contract_rate','payable_minutes','payable_hours',
      'shift_start','shift_end','policy_version',
    ] as const;
    const csvRows = rows.map((row) => ({
      worker_id: row.worker_id,
      worker_name: row.worker_name,
      worker_type: row.worker_type,
      billing_unit: row.billing_unit,
      contract_rate: row.worker_rate,
      payable_minutes: Number(row.payable_minutes),
      payable_hours: (Number(row.payable_minutes) / 60).toFixed(2),
      shift_start: new Date(row.starts_at).toISOString(),
      shift_end: new Date(row.ends_at).toISOString(),
      policy_version: row.policy_version,
    }));
    const csv = toCsv(csvRows, columns);
    const encrypted = encryptPayrollExport(csv, key, keyId);
    const totalMinutes = rows.reduce((total, row) => total + Number(row.payable_minutes), 0);
    const record = (await client.query(
      `INSERT INTO workforce_payroll_exports(period_start,period_end,policy_version_id,mapping_version,row_count,
          total_payable_minutes,control_hash,encryption_key_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,period_start,period_end,status,row_count,
          total_payable_minutes,control_hash,encryption_key_id,created_at`,
      [body.period_start, body.period_end, rows[0].policy_version_id, body.mapping_version, rows.length,
        totalMinutes, encrypted.controlHash, keyId, req.user!.id],
    )).rows[0];
    await client.query(
      `INSERT INTO workforce_payroll_export_payloads(export_id,encrypted_payload) VALUES($1,$2)`,
      [record.id, encrypted.payload],
    );
    for (const row of rows) {
      await client.query(
        'INSERT INTO workforce_payroll_export_items(export_id,time_entry_id) VALUES($1,$2)',
        [record.id, row.time_entry_id],
      );
      await client.query(
        `UPDATE workforce_time_entries SET status='exported',updated_at=now() WHERE id=$1 AND status='payable'`,
        [row.time_entry_id],
      );
    }
    await audit(client, req.user!.id, 'workforce_payroll_export_generated', 'workforce_payroll_export', record.id,
      null, { row_count: rows.length, total_payable_minutes: totalMinutes, mapping_version: body.mapping_version, control_hash: encrypted.controlHash });
    return record;
  });
  res.status(201).json(exportRecord);
}));

workforceOperations.get('/workforce/payroll-exports', requireActivity('workforce.payroll.export'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT id,period_start,period_end,status,row_count,total_payable_minutes,control_hash,
        mapping_version,encryption_key_id,created_by,created_at,handoff_reason,handoff_reference,handed_off_by,handed_off_at
     FROM workforce_payroll_exports ORDER BY created_at DESC LIMIT 200`,
  )).rows));
}));

workforceOperations.get('/workforce/payroll-exports/mine', requireRole('worker'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    `SELECT DISTINCT x.id,x.period_start,x.period_end,x.status,x.mapping_version,x.created_at,x.handoff_reason,x.handoff_reference,x.handed_off_at
     FROM workforce_payroll_exports x JOIN workforce_payroll_export_items i ON i.export_id=x.id
     JOIN workforce_time_entries t ON t.id=i.time_entry_id
     JOIN workforce_shifts s ON s.id=t.shift_id
     JOIN staffing_engagements e ON e.id=s.engagement_id JOIN workers w ON w.id=e.worker_id
     WHERE w.phone=$1 ORDER BY x.created_at DESC LIMIT 100`,
    [req.user!.phone],
  )).rows));
}));

workforceOperations.get('/workforce/payroll-exports/:id/file', requireActivity('workforce.payroll.export'), h(async (req, res) => {
  const payload = await withUser(req.user!, async (client) => {
    const record = (await client.query(
      `SELECT x.id,p.encrypted_payload,x.control_hash
       FROM workforce_payroll_exports x
       JOIN workforce_payroll_export_payloads p ON p.export_id=x.id
       WHERE x.id=$1`,
      [req.params.id],
    )).rows[0];
    if (!record) throw new HttpError(404, 'Payroll export not found');
    await audit(client, req.user!.id, 'workforce_payroll_export_downloaded', 'workforce_payroll_export',
      record.id, null, { control_hash: record.control_hash });
    return record;
  });
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="workforce-payroll-${payload.id}.enc.json"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(JSON.stringify(payload.encrypted_payload));
}));

workforceOperations.post('/workforce/payroll-exports/:id/handoff', requireActivity('workforce.payroll.export'), h(async (req, res) => {
  const body = z.object({
    result: z.enum(['handed_off','handoff_failed']),
    reason: z.string().trim().min(10).max(1000),
    reference: z.string().trim().min(3).max(160).optional(),
  }).strict().parse(req.body);
  if (body.result === 'handed_off' && !body.reference) throw new HttpError(422, 'Record the external payroll handoff reference');
  const row = await withUser(req.user!, async (client) => {
    const record = (await client.query(
      'SELECT * FROM workforce_payroll_exports WHERE id=$1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!record) throw new HttpError(404, 'Payroll export not found');
    if (record.status === 'handed_off') throw new HttpError(409, 'This export is already marked as handed to the external payroll provider');
    const updated = (await client.query(
      `UPDATE workforce_payroll_exports SET status=$2,handoff_reason=$3,handoff_reference=$4,
          handed_off_by=$5,handed_off_at=now() WHERE id=$1
       RETURNING id,status,handoff_reason,handoff_reference,handed_off_by,handed_off_at`,
      [record.id, body.result, body.reason, body.reference ?? null, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, `workforce_payroll_${body.result}`, 'workforce_payroll_export',
      record.id, { status: record.status }, { status: updated.status, reason: body.reason, reference: body.reference ?? null });
    return updated;
  });
  res.json(row);
}));

workforceOperations.post('/workforce/workers/:id/offboard', requireActivity('workforce.workers.offboard'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const worker = (await client.query(
      'SELECT id,phone,employment_status FROM workers WHERE id=$1',
      [req.params.id],
    )).rows[0];
    if (!worker) throw new HttpError(404, 'Worker not found');
    if (worker.employment_status === 'terminated') throw new HttpError(409, 'Worker is already terminated');
    const userId = (await client.query('SELECT app_offboard_worker($1,$2) AS user_id', [worker.id, reason])).rows[0].user_id as string | null;
    await audit(client, req.user!.id, 'workforce_worker_offboarded', 'worker', worker.id,
      { employment_status: worker.employment_status }, { employment_status: 'terminated', reason });
    return { id: worker.id, employment_status: 'terminated', user_id: userId };
  });
  if (result.user_id) invalidateUser(result.user_id);
  res.json({ id: result.id, employment_status: result.employment_status });
}));
