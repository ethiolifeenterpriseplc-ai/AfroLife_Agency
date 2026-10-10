import { Request, Response, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { withUser, requireRole, HttpError } from './core.js';
import { privacyIncidentChangeDetails, privacyRequestChangeDetails } from './privacy-audit.js';

export const privacy = Router();
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };
const privacyStaff = ['global_admin','super_admin','compliance'];
const requestBody = z.object({
  request_type: z.enum(['access','correction','deletion','portability','restriction','objection','other']),
  details: z.string().trim().min(10).max(4000),
}).strict();

privacy.get('/privacy/requests', h(async (req, res) => {
  const rows = await withUser(req.user!, async (client) => (await client.query(
    `SELECT id,requester_id,request_type,details,status,assigned_to,response,received_at,updated_at,completed_at
     FROM personal_data_requests ORDER BY received_at DESC LIMIT 200`,
  )).rows);
  res.json(rows);
}));

privacy.post('/privacy/requests', h(async (req, res) => {
  const body = requestBody.parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const request = (await client.query(
      `INSERT INTO personal_data_requests (requester_id,request_type,details)
       VALUES ($1,$2,$3) RETURNING id,requester_id,request_type,status,received_at`,
      [req.user!.id,body.request_type,body.details],
    )).rows[0];
    await client.query(
      `INSERT INTO privacy_case_events (actor_id,case_type,case_id,action,details)
       VALUES ($1,'personal_data_request',$2,'submitted',$3)`,
      [req.user!.id,request.id,JSON.stringify({ request_type: body.request_type })],
    );
    return request;
  });
  res.status(201).json(row);
}));

privacy.patch('/privacy/requests/:id', requireRole(...privacyStaff), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    status: z.enum(['in_review','awaiting_requester','completed','declined']),
    assigned_to: z.string().uuid().nullable().optional(),
    response: z.string().trim().max(4000).nullable().optional(),
  }).strict().parse(req.body);
  if (['completed','declined'].includes(body.status) && !body.response?.trim()) {
    throw new HttpError(422,'A response is required to complete or decline a request');
  }
  const row = await withUser(req.user!, async (client) => {
    if (body.assigned_to && !(await client.query("SELECT 1 FROM users WHERE id=$1 AND active=true AND role IN ('global_admin','super_admin','compliance')",[body.assigned_to])).rowCount) {
      throw new HttpError(422,'Assigned user must be active Compliance or Super Admin staff');
    }
    const previous = (await client.query(
      'SELECT status,assigned_to,response FROM personal_data_requests WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!previous) throw new HttpError(404,'Personal data request not found');
    const updated = (await client.query(
      `UPDATE personal_data_requests SET status=$2,
       assigned_to=COALESCE($3,assigned_to), response=COALESCE($4,response),
       completed_at=CASE WHEN $2 IN ('completed','declined') THEN now() ELSE NULL END, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id,body.status,body.assigned_to ?? null,body.response ?? null],
    )).rows[0];
    await client.query(
      `INSERT INTO privacy_case_events (actor_id,case_type,case_id,action,details)
       VALUES ($1,'personal_data_request',$2,'updated',$3)`,
      [req.user!.id,id,JSON.stringify(privacyRequestChangeDetails(previous, updated))],
    );
    return updated;
  });
  res.json(row);
}));

const incidentBody = z.object({
  incident_type: z.enum(['unauthorized_access','loss','disclosure','alteration','unavailability','other']),
  severity: z.enum(['low','medium','high','critical']),
  summary: z.string().trim().min(10).max(500),
  details: z.string().trim().min(10).max(8000),
  affected_data: z.string().trim().min(2).max(1000),
  affected_people_estimate: z.number().int().nonnegative().nullable().optional(),
  occurred_at: z.string().datetime().nullable().optional(),
  containment_actions: z.string().trim().max(4000).nullable().optional(),
}).strict();

privacy.get('/privacy/incidents', requireRole(...privacyStaff), h(async (req, res) => {
  const rows = await withUser(req.user!, async (client) => (await client.query(
    'SELECT * FROM privacy_incidents ORDER BY discovered_at DESC LIMIT 300',
  )).rows);
  res.json(rows);
}));

privacy.post('/privacy/incidents', requireRole('super_admin','compliance','finance','finance_manager'), h(async (req, res) => {
  const body = incidentBody.parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const incident = (await client.query(
      `INSERT INTO privacy_incidents
       (reported_by,incident_type,severity,summary,details,affected_data,affected_people_estimate,occurred_at,containment_actions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user!.id,body.incident_type,body.severity,body.summary,body.details,body.affected_data,
        body.affected_people_estimate ?? null,body.occurred_at ?? null,body.containment_actions ?? null],
    )).rows[0];
    await client.query(
      `INSERT INTO privacy_case_events (actor_id,case_type,case_id,action,details)
       VALUES ($1,'privacy_incident',$2,'reported',$3)`,
      [req.user!.id,incident.id,JSON.stringify({ severity: body.severity, incident_type: body.incident_type })],
    );
    return incident;
  });
  res.status(201).json(row);
}));

privacy.patch('/privacy/incidents/:id', requireRole(...privacyStaff), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    status: z.enum(['investigating','contained','review','closed']),
    assigned_to: z.string().uuid().nullable().optional(),
    containment_actions: z.string().trim().max(4000).nullable().optional(),
    outcome: z.string().trim().min(10).max(8000).nullable().optional(),
  }).strict().parse(req.body);
  if (body.status === 'closed' && !body.outcome?.trim()) throw new HttpError(422,'An outcome is required to close an incident');
  const row = await withUser(req.user!, async (client) => {
    if (body.assigned_to && !(await client.query("SELECT 1 FROM users WHERE id=$1 AND active=true AND role IN ('global_admin','super_admin','compliance')",[body.assigned_to])).rowCount) {
      throw new HttpError(422,'Assigned user must be active Compliance or Super Admin staff');
    }
    const previous = (await client.query(
      'SELECT status,assigned_to,containment_actions,outcome FROM privacy_incidents WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!previous) throw new HttpError(404,'Privacy incident not found');
    const incident = (await client.query(
      `UPDATE privacy_incidents SET status=$2,assigned_to=COALESCE($3,assigned_to),
       containment_actions=COALESCE($4,containment_actions),outcome=COALESCE($5,outcome),
       closed_at=CASE WHEN $2='closed' THEN now() ELSE NULL END,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id,body.status,body.assigned_to ?? null,body.containment_actions ?? null,body.outcome ?? null],
    )).rows[0];
    await client.query(
      `INSERT INTO privacy_case_events (actor_id,case_type,case_id,action,details)
       VALUES ($1,'privacy_incident',$2,'updated',$3)`,
      [req.user!.id,incident.id,JSON.stringify(privacyIncidentChangeDetails(previous, incident))],
    );
    return incident;
  });
  res.json(row);
}));

privacy.get('/privacy/cases/:caseType/:id/events', h(async (req, res) => {
  const caseType = z.enum(['personal_data_request','privacy_incident']).parse(req.params.caseType);
  const id = z.string().uuid().parse(req.params.id);
  const rows = await withUser(req.user!, async (client) => (await client.query(
    'SELECT id,actor_id,case_type,case_id,action,details,created_at FROM privacy_case_events WHERE case_type=$1 AND case_id=$2 ORDER BY created_at',
    [caseType,id],
  )).rows);
  res.json(rows);
}));
