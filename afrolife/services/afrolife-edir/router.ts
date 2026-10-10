import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../src/auth-types.js';
import { HttpError } from '../../src/http-error.js';
import { withUser } from './db.js';
import { edirFinanceRouter } from './finance-router.js';
import { edirCreditRouter } from './credit-router.js';

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };
const platformAdmin = (user: AuthUser) => user.role === 'global_admin' || user.role === 'super_admin';

async function hasEdirStaffRole(user: AuthUser, roles: string[], client?: PoolClient) {
  if (platformAdmin(user)) return true;
  const hasRole = async (db: PoolClient) => Boolean((await db.query(
    `SELECT 1 FROM edir_staff
     WHERE user_id=$1 AND active AND role = ANY($2::text[])`,
    [user.id, roles],
  )).rowCount);
  return client ? hasRole(client) : withUser(user, hasRole);
}

const requireEdirManager: RequestHandler = (req, _res, next) =>
  hasEdirStaffRole(req.user!, ['edir_admin']).then(
    (allowed) => next(allowed ? undefined : new HttpError(403, 'Edir administrator access is required')),
    next,
  );

const requireEdirAuditor: RequestHandler = (req, _res, next) =>
  hasEdirStaffRole(req.user!, ['edir_admin', 'compliance', 'auditor', 'finance_manager', 'treasurer', 'credit_manager']).then(
    (allowed) => next(allowed ? undefined : new HttpError(403, 'Edir audit access is required')),
    next,
  );

const requireEdirRegistryReader: RequestHandler = (req, _res, next) =>
  hasEdirStaffRole(req.user!, ['edir_admin', 'member_support', 'compliance', 'auditor', 'finance_manager', 'treasurer', 'credit_officer', 'credit_manager']).then(
    (allowed) => next(allowed ? undefined : new HttpError(403, 'Edir registry access is required')),
    next,
  );

const requireEdirMaster: RequestHandler = (req, _res, next) =>
  withUser(req.user!, async (client) => Boolean((await client.query('SELECT edir_is_master_operator() AS allowed')).rows[0]?.allowed))
    .then((allowed) => {
      if (!allowed) return next(new HttpError(403, 'Umbrella Master Edir access is required'));
      if (req.user!.edir_id !== '00000000-0000-4000-8000-000000000001') {
        return next(new HttpError(409, 'Select the umbrella AfroLife Master Edir before global management'));
      }
      next();
    }, next);

const requireEdirManagerOrMaster: RequestHandler = (req, _res, next) =>
  hasEdirStaffRole(req.user!, ['edir_admin','edir_master_admin']).then(
    (allowed) => next(allowed ? undefined : new HttpError(403, 'Edir administrator access is required')),
    next,
  );

export const edirRouter = Router();

edirRouter.post('/public/registration-applications', h(async (req, res) => {
  if (req.user!.role !== 'public' || req.user!.id !== '00000000-0000-4000-8000-000000000000') {
    throw new HttpError(403, 'Public Edir registration gateway is required');
  }
  const body = z.object({
    display_name: z.string().trim().min(2).max(160),
    legal_name: z.string().trim().min(2).max(200),
    registration_reference: z.string().trim().min(2).max(100).optional(),
    governance_reference: z.string().trim().min(2).max(500).optional(),
    contact_name: z.string().trim().min(2).max(160),
    contact_phone: z.string().trim().min(7).max(32),
    contact_email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
    accept_review_terms: z.literal(true),
  }).strict().parse(req.body);
  const application = await withUser(req.user!, async (client) => (await client.query(
    `INSERT INTO edir_registration_applications
      (display_name, legal_name, registration_reference, governance_reference,
       contact_name, contact_phone, contact_email, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, display_name, status, created_at`,
    [body.display_name, body.legal_name, body.registration_reference ?? null,
      body.governance_reference ?? null, body.contact_name, body.contact_phone,
      body.contact_email || null, req.user!.id],
  )).rows[0]);
  res.status(201).json(application);
}));

edirRouter.get('/registration-applications', requireEdirMaster, h(async (req, res) => {
  const applications = await withUser(req.user!, async (client) => (await client.query(
    `SELECT id, display_name, legal_name, registration_reference, governance_reference,
            contact_name, contact_phone, contact_email, status, reviewed_by, reviewed_at,
            review_reason, organization_id, created_at
     FROM edir_registration_applications ORDER BY created_at DESC LIMIT 500`,
  )).rows);
  res.json(applications);
}));

edirRouter.post('/registration-applications/:id/decision', requireEdirMaster, h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({ decision: z.enum(['accepted','rejected']), reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const application = (await client.query(
      "SELECT * FROM edir_registration_applications WHERE id=$1 AND status='pending' FOR UPDATE", [id],
    )).rows[0];
    if (!application) throw new HttpError(404, 'Pending Edir registration application was not found');
    let organizationId: string | null = null;
    if (body.decision === 'accepted') {
      const organization = (await client.query(
        `INSERT INTO edir_organizations
          (id, parent_organization_id, organization_type, display_name, legal_name, registration_reference,
           governance_reference, onboarding_status, created_by)
         VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','independent_master',$1,$2,$3,$4,'active',$5)
         RETURNING id`,
        [application.display_name, application.legal_name, application.registration_reference,
          application.governance_reference, req.user!.id],
      )).rows[0];
      organizationId = organization.id;
    }
    const updated = (await client.query(
      `UPDATE edir_registration_applications
       SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4, organization_id=$5
       WHERE id=$1 RETURNING id, display_name, status, organization_id, reviewed_at`,
      [id, body.decision, req.user!.id, body.reason, organizationId],
    )).rows[0];
    await audit(client, req.user!.id, `edir_registration_${body.decision}`, 'edir_registration_application', id,
      { status: application.status }, { status: updated.status, organization_id: organizationId, reason: body.reason });
    return updated;
  });
  res.json(result);
}));

edirRouter.get('/organizations', h(async (req, res) => {
  const organizations = await withUser(req.user!, async (client) => (await client.query(
    `SELECT id, parent_organization_id, organization_type, display_name, legal_name,
            registration_reference, onboarding_status, governance_reference, created_at
     FROM edir_organizations
     WHERE organization_type <> 'umbrella_master' OR edir_is_master_operator()
     ORDER BY organization_type, display_name`,
  )).rows);
  res.json(organizations);
}));

edirRouter.get('/master/summary', requireEdirMaster, h(async (req, res) => {
  res.json(await withUser(req.user!, async (client) => (await client.query(
    'SELECT * FROM edir_consolidated_summary()',
  )).rows));
}));

edirRouter.post('/organizations', requireEdirMaster, h(async (req, res) => {
  const body = z.object({
    display_name: z.string().trim().min(2).max(160),
    legal_name: z.string().trim().min(2).max(200),
    registration_reference: z.string().trim().min(2).max(100).optional(),
    governance_reference: z.string().trim().min(2).max(500).optional(),
  }).strict().parse(req.body);
  const organization = await withUser(req.user!, async (client) => {
    const row = (await client.query(
      `INSERT INTO edir_organizations
        (id, parent_organization_id, organization_type, display_name, legal_name,
         registration_reference, governance_reference, onboarding_status, created_by)
       VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','independent_master',$1,$2,$3,$4,'pending',$5)
       RETURNING id, parent_organization_id, organization_type, display_name, legal_name,
                 registration_reference, governance_reference, onboarding_status, created_at`,
      [body.display_name, body.legal_name, body.registration_reference ?? null, body.governance_reference ?? null, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_organization_onboarded', 'edir_organization', row.id, null,
      { organization_type: row.organization_type, onboarding_status: row.onboarding_status });
    return row;
  });
  res.status(201).json(organization);
}));

edirRouter.post('/organizations/:id/decision', requireEdirMaster, h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({ decision: z.enum(['active','rejected','suspended']), reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  const organization = await withUser(req.user!, async (client) => {
    const result = await client.query(
      `UPDATE edir_organizations SET onboarding_status=$2
       WHERE id=$1 AND organization_type IN ('member_edir','independent_master') AND onboarding_status IN ('pending','review','active')
       RETURNING id, display_name, onboarding_status`, [id, body.decision],
    );
    if (!result.rowCount) throw new HttpError(404, 'Onboarding Edir was not found');
    await audit(client, req.user!.id, 'edir_organization_decided', 'edir_organization', id,
      null, { decision: body.decision, reason: body.reason });
    return result.rows[0];
  });
  res.json(organization);
}));

edirRouter.post('/organizations/:id/staff', requireEdirMaster, h(async (req, res) => {
  const organizationId = z.string().uuid().parse(req.params.id);
  const body = z.object({ user_id: z.string().uuid(), role: z.enum([
    'edir_admin','member_support','compliance','auditor','finance_manager','treasurer','credit_officer','credit_manager',
  ]) }).strict().parse(req.body);
  const assigned = await withUser(req.user!, async (client) => {
    const organization = await client.query(
      "SELECT 1 FROM edir_organizations WHERE id=$1 AND organization_type IN ('member_edir','independent_master') AND onboarding_status='active'",
      [organizationId],
    );
    if (!organization.rowCount) throw new HttpError(409, 'Activate the Edir organization before assigning its staff');
    const result = (await client.query(
      `INSERT INTO edir_staff (user_id, organization_id, role, assigned_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, active=true, assigned_by=EXCLUDED.assigned_by, created_at=now()
       RETURNING user_id, organization_id, role, active, assigned_by, created_at`,
      [body.user_id, organizationId, body.role, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_organization_staff_assigned', 'edir_staff', `${organizationId}:${body.user_id}`, null,
      { role: body.role });
    return result;
  });
  res.status(201).json(assigned);
}));

async function audit(
  client: PoolClient,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown = null,
  newValue: unknown = null,
) {
  await client.query(
    `INSERT INTO edir_audit_logs (actor_id, action, entity, entity_id, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, entity, entityId, oldValue === null ? null : JSON.stringify(oldValue),
      newValue === null ? null : JSON.stringify(newValue)],
  );
}

const Enrollment = z.object({
  accept_nonfinancial_terms: z.literal(true),
}).strict();

edirRouter.get('/me', h(async (req, res) => {
  const result = await withUser(req.user!, async (client) => {
    const membership = (await client.query(
      `SELECT id, member_number, full_name, phone, email, status, terms_version, terms_accepted_at,
              created_at, reviewed_at, review_reason
       FROM edir_memberships WHERE user_id = $1`,
      [req.user!.id],
    )).rows[0] ?? null;
    const groups = membership?.status === 'active'
      ? (await client.query(
        `SELECT g.id, g.group_code, g.name, g.description
         FROM edir_groups g JOIN edir_group_memberships gm ON gm.group_id = g.id
         WHERE gm.member_id = $1 AND g.status = 'active' ORDER BY g.name`,
        [membership.id],
      )).rows
      : [];
    const staff = (await client.query(
      'SELECT role FROM edir_staff WHERE user_id=$1 AND active',
      [req.user!.id],
    )).rows;
    return { membership, groups, staff_roles: staff.map((item) => item.role) };
  });
  res.json(result);
}));

edirRouter.post('/memberships', h(async (req, res) => {
  Enrollment.parse(req.body);
  if (req.user!.kyc_status !== 'verified') {
    throw new HttpError(403, 'Complete KYC review before requesting Edir membership');
  }
  if (!req.user!.legal_name || !req.user!.phone) {
    throw new HttpError(401, 'Verified AfroLife profile details are required for Edir enrollment');
  }
  const membership = await withUser(req.user!, async (client) => {
    const inserted = (await client.query(
      `INSERT INTO edir_memberships (user_id, full_name, phone, email, created_by)
       VALUES ($1,$2,$3,$4,$1)
       RETURNING id, member_number, full_name, phone, email, status, terms_version, terms_accepted_at, created_at`,
      [req.user!.id, req.user!.legal_name, req.user!.phone, req.user!.email ?? null],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_membership_requested', 'edir_membership', inserted.id,
      null, { status: inserted.status, member_number: inserted.member_number, terms_version: inserted.terms_version });
    return inserted;
  });
  res.status(201).json(membership);
}));

edirRouter.get('/memberships', requireEdirRegistryReader, h(async (_req, res) => {
  const memberships = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT m.id, m.user_id, m.created_by, m.member_number, m.full_name, m.phone, m.email, m.status,
            m.terms_version, m.terms_accepted_at, m.created_at, m.reviewed_by, m.reviewed_at, m.review_reason,
            (SELECT count(*)::int FROM edir_group_memberships gm WHERE gm.member_id = m.id) AS group_count
     FROM edir_memberships m ORDER BY m.created_at DESC`,
  )).rows);
  res.json(memberships);
}));

edirRouter.post('/memberships/:id/review', requireEdirManager, h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    decision: z.enum(['active', 'rejected']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const membership = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, created_by, status FROM edir_memberships WHERE id = $1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir membership request was not found');
    if (current.created_by === req.user!.id) throw new HttpError(403, 'A different administrator must review this membership');
    if (current.status !== 'pending') throw new HttpError(409, 'This Edir membership request has already been reviewed');
    const updated = (await client.query(
      `UPDATE edir_memberships SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4
       WHERE id=$1
       RETURNING id, member_number, full_name, status, reviewed_by, reviewed_at, review_reason`,
      [id, body.decision, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, `edir_membership_${body.decision}`, 'edir_membership', id,
      { status: current.status }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(membership);
}));

edirRouter.post('/memberships/:id/lifecycle', requireEdirManager, h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    status: z.enum(['active', 'suspended', 'closed']),
    reason: z.string().trim().min(10).max(1000),
  }).strict().parse(req.body);
  const membership = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, user_id, status FROM edir_memberships WHERE id=$1 FOR UPDATE',
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir membership was not found');
    if (current.user_id === req.user!.id) throw new HttpError(403, 'You cannot change your own Edir membership lifecycle');
    if (!((current.status === 'active' && ['suspended', 'closed'].includes(body.status))
      || (current.status === 'suspended' && ['active', 'closed'].includes(body.status)))) {
      throw new HttpError(409, 'This Edir membership lifecycle transition is not allowed');
    }
    const updated = (await client.query(
      `UPDATE edir_memberships SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4
       WHERE id=$1
       RETURNING id, member_number, status, reviewed_by, reviewed_at, review_reason`,
      [id, body.status, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_membership_lifecycle_changed', 'edir_membership', id,
      { status: current.status }, { status: updated.status, reason: body.reason });
    return updated;
  });
  res.json(membership);
}));

edirRouter.get('/groups', h(async (req, res) => {
  const groups = await withUser(req.user!, async (client) => {
    const canViewCentralGroups = await hasEdirStaffRole(
      req.user!, ['edir_admin', 'member_support', 'compliance', 'auditor', 'finance_manager', 'treasurer', 'credit_officer', 'credit_manager'], client,
    );
    let memberId: string | null = null;
    if (!canViewCentralGroups) {
      const activeMembership = await client.query(
        "SELECT id FROM edir_memberships WHERE user_id=$1 AND status='active'",
        [req.user!.id],
      );
      if (!activeMembership.rowCount) throw new HttpError(403, 'An active AfroLife Edir membership is required to view groups');
      memberId = activeMembership.rows[0].id;
    }
    return (await client.query(
      `SELECT g.id, g.group_code, g.name, g.description, g.status, g.created_at,
              (SELECT count(*)::int FROM edir_group_memberships gm WHERE gm.group_id=g.id) AS member_count,
              ARRAY(SELECT gm.member_id FROM edir_group_memberships gm WHERE gm.group_id=g.id) AS member_ids
       FROM edir_groups g
       WHERE $1::uuid IS NULL OR EXISTS (
         SELECT 1 FROM edir_group_memberships gm WHERE gm.group_id=g.id AND gm.member_id=$1
       )
       ORDER BY g.status, g.name`,
      [memberId],
    )).rows;
  });
  res.json(groups);
}));

edirRouter.post('/groups', requireEdirManager, h(async (req, res) => {
  const body = z.object({
    group_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(2).max(1000),
  }).strict().parse(req.body);
  const group = await withUser(req.user!, async (client) => {
    const created = (await client.query(
      `INSERT INTO edir_groups (group_code, name, description, created_by)
       VALUES ($1,$2,$3,$4)
       RETURNING id, group_code, name, description, status, created_at`,
      [body.group_code, body.name, body.description, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_group_created', 'edir_group', created.id, null, created);
    return created;
  });
  res.status(201).json(group);
}));

edirRouter.post('/groups/:id/archive', requireEdirManager, h(async (req, res) => {
  const groupId = z.string().uuid().parse(req.params.id);
  const group = await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT id, group_code, name, status FROM edir_groups WHERE id=$1 FOR UPDATE',
      [groupId],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir group was not found');
    if (current.status === 'archived') throw new HttpError(409, 'This Edir group is already archived');
    const updated = (await client.query(
      `UPDATE edir_groups SET status='archived', archived_at=now()
       WHERE id=$1 RETURNING id, group_code, name, status, archived_at`,
      [groupId],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_group_archived', 'edir_group', groupId, current, updated);
    return updated;
  });
  res.json(group);
}));

edirRouter.post('/groups/:id/members', requireEdirManager, h(async (req, res) => {
  const groupId = z.string().uuid().parse(req.params.id);
  const { membership_id: membershipId } = z.object({ membership_id: z.string().uuid() }).strict().parse(req.body);
  const link = await withUser(req.user!, async (client) => {
    const group = (await client.query(
      "SELECT id, status FROM edir_groups WHERE id=$1 FOR UPDATE",
      [groupId],
    )).rows[0];
    if (!group) throw new HttpError(404, 'Edir group was not found');
    if (group.status !== 'active') throw new HttpError(409, 'Archived Edir groups cannot accept members');
    const member = (await client.query(
      "SELECT id, status FROM edir_memberships WHERE id=$1 FOR UPDATE",
      [membershipId],
    )).rows[0];
    if (!member) throw new HttpError(404, 'Edir member was not found');
    if (member.status !== 'active') throw new HttpError(409, 'Only approved Edir members can join a group');
    const inserted = (await client.query(
      `INSERT INTO edir_group_memberships (group_id, member_id, assigned_by)
       VALUES ($1,$2,$3) ON CONFLICT (group_id, member_id) DO NOTHING
       RETURNING id, group_id, member_id, assigned_at`,
      [groupId, membershipId, req.user!.id],
    )).rows[0];
    if (!inserted) throw new HttpError(409, 'This member is already assigned to the Edir group');
    await audit(client, req.user!.id, 'edir_group_member_assigned', 'edir_group_membership', inserted.id,
      null, { group_id: groupId, member_id: membershipId });
    return inserted;
  });
  res.status(201).json(link);
}));

edirRouter.get('/audit', requireEdirAuditor, h(async (_req, res) => {
  const events = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT id, actor_id, action, entity, entity_id, old_value, new_value, created_at
     FROM edir_audit_logs ORDER BY created_at DESC, id DESC LIMIT 500`,
  )).rows);
  res.json(events);
}));

edirRouter.get('/staff', requireEdirManagerOrMaster, h(async (_req, res) => {
  const staff = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT user_id, organization_id, role, active, assigned_by, created_at
     FROM edir_staff ORDER BY created_at DESC`,
  )).rows);
  res.json(staff);
}));

edirRouter.post('/staff', requireEdirManager, h(async (req, res) => {
  const body = z.object({
    user_id: z.string().uuid(),
    role: z.enum([
      'edir_master_admin','edir_admin', 'member_support', 'finance_manager', 'treasurer',
      'credit_officer', 'credit_manager', 'compliance', 'auditor',
    ]),
  }).strict().parse(req.body);
  const staff = await withUser(req.user!, async (client) => {
    if (body.role === 'edir_master_admin' && !platformAdmin(req.user!)) {
      throw new HttpError(403, 'Only an AfroLife platform administrator can establish the umbrella Master Edir administrator');
    }
    if (body.user_id === req.user!.id) throw new HttpError(422, 'Platform administrator Edir access is already available');
    const organizationId = body.role === 'edir_master_admin'
      ? '00000000-0000-4000-8000-000000000001'
      : req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002';
    const previous = (await client.query(
      'SELECT role, active FROM edir_staff WHERE user_id=$1 AND organization_id=$2 FOR UPDATE',
      [body.user_id, organizationId],
    )).rows[0] ?? null;
    const created = (await client.query(
      `INSERT INTO edir_staff (user_id, organization_id, role, assigned_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, active=true, assigned_by=EXCLUDED.assigned_by, created_at=now()
       RETURNING user_id, organization_id, role, active, assigned_by, created_at`,
      [body.user_id, organizationId, body.role, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_staff_assigned', 'edir_staff', body.user_id, previous, {
      role: body.role,
      active: created.active,
    });
    return created;
  });
  res.status(201).json(staff);
}));

edirRouter.delete('/staff/:userId', requireEdirManager, h(async (req, res) => {
  const userId = z.string().uuid().parse(req.params.userId);
  if (userId === req.user!.id) throw new HttpError(409, 'You cannot remove your own Edir staff assignment');
  await withUser(req.user!, async (client) => {
    const current = (await client.query(
      'SELECT role, active FROM edir_staff WHERE user_id=$1 AND organization_id=$2 FOR UPDATE',
      [userId, req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002'],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Edir staff assignment was not found');
    await client.query('UPDATE edir_staff SET active=false WHERE user_id=$1 AND organization_id=$2', [userId, req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002']);
    await audit(client, req.user!.id, 'edir_staff_deactivated', 'edir_staff', userId, current, { active: false });
  });
  res.status(204).end();
}));

edirRouter.use('/finance', edirFinanceRouter);
edirRouter.use('/credit', edirCreditRouter);
