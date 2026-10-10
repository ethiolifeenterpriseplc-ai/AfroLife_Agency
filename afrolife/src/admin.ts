import { Router, Request, Response, RequestHandler } from 'express';
import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, withUser, requireRole, HttpError, JWT_SECRET, invalidateUser } from './core.js';
import { normalizePhone } from './phone.js';
import { Phone } from './validators.js';
import { audit, feeSnapshot } from './domain.js';
import { mfaKeys, openAny, seal, passwordProblem, randomPassword } from './security.js';
import { newSecret, otpauthUri, verifyTotpStep } from './totp.js';
import { BUSINESS_RULES, validateBusinessRuleUpdates } from './business-rules.js';
import { sniff } from './files.js';
import { getFile, putFile } from './storage.js';
import { createApiRateLimiter } from './rate-limit-store.js';
import { sessionIdleTimeoutMinutes } from './runtime-config.js';

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const STAFF = ['global_admin', 'super_admin', 'compliance', 'finance', 'finance_manager'];
const MFA_STAFF = [...STAFF, 'corporate_business_manager'];
const AGENT_ROLES = ['master_agent', 'field_agent'];
const PROVISIONABLE_ROLES = ['super_admin', 'corporate_business_manager', 'compliance', 'finance', 'finance_manager', 'master_agent', 'field_agent', 'customer', 'worker', 'property_owner'] as const;
const requireEnterprisePlan: RequestHandler = (req, _res, next) => {
  pool.query(
    `SELECT 1 FROM user_signups
     WHERE user_id = $1 AND status = 'approved' AND payment_status = 'paid'
       AND requested_plan = 'enterprise'`,
    [req.user!.id],
  ).then((result) => {
    if (!result.rowCount) return next(new HttpError(403, 'Team and portfolio insights need an activated Enterprise plan.'));
    next();
  }, next);
};
const MFA_KEYS = mfaKeys(JWT_SECRET); // [0] seals new secrets; all of them can open old ones
const MFA_KEY = MFA_KEYS[0];
const openSecret = (sealed: string) => openAny(sealed, MFA_KEYS);
// Compared against when the phone is unknown, so response time does not reveal which numbers have accounts.
const DUMMY_HASH = bcrypt.hashSync('no-such-user-placeholder', 12);

/** A restricted token can only reach the security step it must complete (see the guard in server.ts). */
async function issue(
  u: { id: string; role: string; must_change_password: boolean; mfa_enabled: boolean },
  replaceSessionId?: string,
) {
  const rst = u.must_change_password ? 'password' : process.env.REQUIRE_MFA_FOR_STAFF === '1' && MFA_STAFF.includes(u.role) && !u.mfa_enabled ? 'mfa' : null;
  const sessionId = randomUUID();
  await pool.query(
    `DELETE FROM auth_sessions WHERE expires_at < now() - interval '30 days'
       OR revoked_at < now() - interval '30 days'`,
  );
  await pool.query(
    `INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')`,
    [sessionId, u.id],
  );
  if (replaceSessionId) {
    await pool.query(
      'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
      [replaceSessionId, u.id],
    );
  }
  return {
    token: jwt.sign({ sub: u.id, sid: sessionId, role: u.role, ...(rst ? { rst } : {}) }, JWT_SECRET, { expiresIn: '8h' }),
    restrict: rst,
  };
}

/** Five failures lock the account for 15 minutes. Once a lock has expired the count starts again at 1 (it used to stay at 5, so a single typo re-locked the account). */
const recordFailure = (id: string) =>
  pool.query(
    `UPDATE users SET
       failed_logins = CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_logins + 1 END,
       locked_until  = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_logins + 1 END) >= 5
                            THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id = $1`, [id]);

// ================= Public: login =================
export const loginRouter = Router();
loginRouter.post('/auth/login', h(async (req, res) => {
  const b = z.object({ phone: z.string().min(8), password: z.string().min(1).max(200), code: z.string().optional() }).parse(req.body);
  // Match the canonical form, and the raw text too so accounts saved before normalisation still work.
  const phones = [...new Set([normalizePhone(b.phone), b.phone.trim()].filter(Boolean))] as string[];
  const u = (await pool.query('SELECT id, role, active, password_hash, mfa_enabled, mfa_secret, must_change_password, locked_until FROM users WHERE phone = ANY($1::text[]) ORDER BY active DESC LIMIT 1', [phones])).rows[0];
  if (u?.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  const matches = await bcrypt.compare(b.password, u?.password_hash ?? DUMMY_HASH);
  const ok = Boolean(u?.password_hash) && matches;
  if (!ok || !u.active) {
    if (u) await recordFailure(u.id);
    throw new HttpError(401, 'Invalid credentials or inactive account');
  }
  if (u.mfa_enabled) {
    if (!b.code) return res.json({ mfa_required: true });
    const step = verifyTotpStep(openSecret(u.mfa_secret), b.code);
    if (step === null) { await recordFailure(u.id); throw new HttpError(401, 'Invalid code'); }
    const consumed = await pool.query(
      'UPDATE users SET mfa_last_step = $2 WHERE id = $1 AND mfa_last_step < $2',
      [u.id, step],
    );
    if (!consumed.rowCount) { await recordFailure(u.id); throw new HttpError(401, 'Invalid code'); }
  }
  await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  res.json(await issue(u));
}));

loginRouter.get('/auth/signup/options', h(async (_req, res) => {
  const [territories, plans, accountOptions, kycOptions] = await Promise.all([
    pool.query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id, parent_id, name, level, name::text AS path
        FROM territories WHERE parent_id IS NULL
        UNION ALL
        SELECT t.id, t.parent_id, t.name, t.level, h.path || ' · ' || t.name
        FROM territories t JOIN hierarchy h ON h.id = t.parent_id
      )
      SELECT id, name, level, path
      FROM hierarchy
      WHERE level IN ('region','city','sub_city','woreda','kebele')
      ORDER BY path
    `),
    pool.query("SELECT key, value FROM config_rules WHERE key IN ('agent_pro_monthly_etb','agent_enterprise_monthly_etb')"),
    pool.query("SELECT config_value FROM marketplace_configuration WHERE scope='users' AND config_key='account_types'"),
    pool.query("SELECT config_value FROM marketplace_configuration WHERE scope='users' AND config_key='kyc_requirements'"),
  ]);
  res.json({
    territories: territories.rows,
    plans: Object.fromEntries(plans.rows.map((rule) => [rule.key, Number(rule.value)])),
    account_types: accountOptions.rows[0]?.config_value ?? [
      { key: 'worker', label: 'Worker', enabled: true }, { key: 'customer', label: 'Buyer / customer', enabled: true },
      { key: 'property_owner', label: 'Seller / property owner', enabled: true }, { key: 'agent', label: 'Agent', enabled: true },
    ],
    kyc_requirements: kycOptions.rows[0]?.config_value ?? { worker: ['national_id','police_clearance'], customer: ['national_id'], agent: ['national_id'], property_owner: ['national_id'] },
  });
}));

loginRouter.post('/auth/signup', h(async (req, res) => {
  const b = z.object({
    legal_name: z.string().trim().min(2).max(160),
    phone: Phone,
    email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
    password: z.string().min(12).max(72),
    password_confirmation: z.string(),
    account_type: z.enum(['worker', 'customer', 'agent', 'property_owner']),
    pension_match_interest: z.boolean().default(false),
    edir_member_interest: z.boolean().default(false),
    edir_life_interest: z.boolean().default(false),
    household_cover_interest: z.boolean().default(false),
    worker_document_consent: z.boolean().default(false),
    date_of_birth: z.string().date().optional(),
    agent_type: z.enum(['master', 'field']).optional(),
    territory_id: z.coerce.number().int().positive().optional(),
    parent_agent_phone: Phone.optional(),
    requested_plan: z.enum(['free', 'pro', 'enterprise']).optional(),
    option_a_enterprise_interest: z.boolean().default(false),
  }).strict().parse(req.body);
  if (b.account_type === 'worker' && !b.worker_document_consent) {
    throw new HttpError(422, 'Worker applicants must consent to identity and eligibility document review before uploading KYC documents.');
  }
  if (b.account_type !== 'worker' && b.worker_document_consent) {
    throw new HttpError(422, 'Worker document consent is only available for worker applicants.');
  }
  if (b.account_type === 'worker') {
    if (!b.date_of_birth) throw new HttpError(422, 'Worker applicants must provide their date of birth.');
    const configured = await pool.query("SELECT value FROM config_rules WHERE key = 'worker_min_age_years'");
    const minimumAge = Number(configured.rows[0]?.value ?? 18);
    const birth = new Date(`${b.date_of_birth}T00:00:00Z`);
    const today = new Date();
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    if (today.getUTCMonth() < birth.getUTCMonth()
      || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1;
    if (birth > today || age < minimumAge) {
      throw new HttpError(422, `Worker applicants must be at least ${minimumAge} years old.`);
    }
  } else if (b.date_of_birth) {
    throw new HttpError(422, 'Date of birth is only collected for worker eligibility review.');
  }
  if (b.password !== b.password_confirmation) throw new HttpError(422, 'Password confirmation does not match.');
  const passwordIssue = passwordProblem(b.password, b.phone);
  if (passwordIssue) throw new HttpError(422, passwordIssue);

  let parentAgentId: string | null = null;
  if (b.account_type === 'agent') {
    if (!b.agent_type || !b.territory_id || !b.requested_plan) {
      throw new HttpError(422, 'Choose an agent type, territory, and plan.');
    }
    const territory = await pool.query('SELECT 1 FROM territories WHERE id = $1', [b.territory_id]);
    if (!territory.rowCount) throw new HttpError(422, 'Choose a valid territory.');
    if (b.agent_type === 'field') {
      if (!b.parent_agent_phone) throw new HttpError(422, 'A field agent needs a master agent');
      const parent = await pool.query(
        `SELECT a.id, a.territory_id
         FROM agents a JOIN users u ON u.id = a.id
         WHERE u.phone = $1 AND u.role = 'master_agent' AND u.active = true
           AND a.agent_type = 'master'`,
        [b.parent_agent_phone],
      );
      if (!parent.rowCount || Number(parent.rows[0].territory_id) !== b.territory_id) {
        throw new HttpError(422, 'This field agent is not linked to an active master agent in the selected territory.');
      }
      parentAgentId = parent.rows[0].id;
    }
  } else {
    if (b.agent_type || b.territory_id || b.parent_agent_phone) {
      throw new HttpError(422, 'Agent type, territory, and parent agent are only used for agent registrations.');
    }
    if (b.account_type === 'property_owner' && !b.requested_plan) {
      throw new HttpError(422, 'Choose a service plan for the seller/property-owner account.');
    }
    if (b.account_type === 'worker' && b.requested_plan) {
      throw new HttpError(422, 'Workers may request Enterprise Option A service through the worker plan option.');
    }
    if (b.account_type === 'customer' && b.requested_plan) {
      throw new HttpError(422, 'A service plan is only used for agent, worker Enterprise, and seller registrations.');
    }
    if (b.option_a_enterprise_interest && b.account_type !== 'worker') {
      throw new HttpError(422, 'Enterprise Option A staff service is only for worker applicants.');
    }
  }
  if (b.pension_match_interest && b.account_type !== 'worker') {
    throw new HttpError(422, 'The worker pension match is available for worker applicants only.');
  }

  const accountConfig = await pool.query("SELECT config_value FROM marketplace_configuration WHERE scope='users' AND config_key='account_types'");
  const enabledTypes = accountConfig.rows[0]?.config_value as { key: string; enabled: boolean }[] | undefined;
  if (enabledTypes && !enabledTypes.some((item) => item.key === b.account_type && item.enabled)) {
    throw new HttpError(403, 'This account type is currently unavailable for self-registration.');
  }
  const role = b.account_type === 'agent'
    ? b.agent_type === 'master' ? 'master_agent' : 'field_agent'
    : b.account_type;
  const requestedPlan = ['agent', 'property_owner'].includes(b.account_type)
    ? b.requested_plan!
    : b.account_type === 'worker' && b.option_a_enterprise_interest ? 'enterprise' : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(
      `INSERT INTO users (legal_name, phone, email, role, territory_id, password_hash, must_change_password, active)
       VALUES ($1,$2,$3,$4,$5,$6,false,false)
       RETURNING id`,
      [
        b.legal_name,
        b.phone,
        b.email || null,
        role,
        b.account_type === 'agent' ? b.territory_id : null,
        await bcrypt.hash(b.password, 12),
      ],
    );
    await client.query(
      `INSERT INTO user_signups
         (user_id, account_type, requested_plan, payment_status, agent_type, territory_id, parent_agent_id,
          pension_match_interest, edir_member_interest, edir_life_interest, household_cover_interest,
          worker_document_consent_at, worker_document_consent_version, date_of_birth)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        user.rows[0].id,
        b.account_type,
        requestedPlan,
        ['agent', 'property_owner'].includes(b.account_type) && requestedPlan !== 'free' ? 'not_configured' : 'not_required',
        b.account_type === 'agent' ? b.agent_type : null,
        b.account_type === 'agent' ? b.territory_id : null,
        parentAgentId,
        b.pension_match_interest,
        b.edir_member_interest,
        b.edir_life_interest,
        b.household_cover_interest,
        b.worker_document_consent ? new Date() : null,
        b.worker_document_consent ? 'worker-document-review-v1' : null,
        b.date_of_birth ?? null,
      ],
    );
    const uploadToken = randomBytes(32).toString('base64url');
    await client.query(
      'INSERT INTO signup_upload_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval \'24 hours\')',
      [user.rows[0].id, createHash('sha256').update(uploadToken).digest('hex')],
    );
    await client.query('COMMIT');
    res.status(201).json({ status: 'pending_approval', account_type: b.account_type, upload_token: uploadToken });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

loginRouter.post('/auth/signup/documents', createApiRateLimiter('signup-documents', 10), express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
  const docType = z.enum(['national_id', 'police_clearance']).parse(req.query.doc_type);
  const token = req.get('authorization')?.match(/^Signup ([A-Za-z0-9_-]{40,})$/)?.[1];
  if (!token) throw new HttpError(401, 'A valid sign-up upload token is required.');
  const file = req.body as Buffer;
  if (!Buffer.isBuffer(file) || file.length === 0) throw new HttpError(400, 'Choose a document to upload.');
  const mime = sniff(file);
  if (!mime) throw new HttpError(415, 'Only PDF, JPEG or PNG documents are accepted.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = await pool.query(
    `SELECT u.id, u.role, s.account_type FROM signup_upload_tokens t
     JOIN users u ON u.id = t.user_id
     JOIN user_signups s ON s.user_id = u.id
     WHERE t.token_hash = $1 AND t.expires_at > now() AND s.status = 'pending'`,
    [tokenHash],
  );
  const applicant = row.rows[0];
  if (!applicant) throw new HttpError(401, 'The sign-up upload token is invalid or expired.');
  const requirementsResult = await pool.query("SELECT config_value FROM marketplace_configuration WHERE scope='users' AND config_key='kyc_requirements'");
  const requirements = requirementsResult.rows[0]?.config_value as Record<string, string[]> | undefined;
  if (requirements && !requirements[applicant.account_type]?.includes(docType)) {
    throw new HttpError(422, 'This document is not required for the selected account type.');
  }
  const id = randomUUID();
  const key = randomUUID();
  const sha256 = createHash('sha256').update(file).digest('hex');
  await withUser({ id: applicant.id, role: applicant.role }, async (c) => {
    const count = await c.query('SELECT count(*)::int AS total FROM user_documents WHERE user_id = $1', [applicant.id]);
    const existing = await c.query('SELECT id, status FROM user_documents WHERE user_id = $1 AND doc_type = $2 FOR UPDATE', [applicant.id, docType]);
    if (existing.rowCount && existing.rows[0].status !== 'uploaded') {
      throw new HttpError(409, 'This KYC document has already been reviewed and cannot be replaced.');
    }
    if (!existing.rowCount && Number(count.rows[0].total) >= 2) {
      throw new HttpError(422, 'The maximum number of sign-up identity documents has been reached.');
    }
    await putFile(key, file);
    if (existing.rowCount) {
      const old = (await c.query('DELETE FROM user_documents WHERE id = $1 RETURNING storage_key', [existing.rows[0].id])).rows[0];
      await c.query(
        `INSERT INTO user_documents (id,user_id,doc_type,storage_key,sha256,mime,size_bytes,uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$2)`,
        [id, applicant.id, docType, key, sha256, mime, file.length],
      );
      await audit(c, applicant.id, 'signup_kyc_document_replaced', 'user_document', id, { storage_key: old.storage_key }, { doc_type: docType });
    } else {
      await c.query(
        `INSERT INTO user_documents (id,user_id,doc_type,storage_key,sha256,mime,size_bytes,uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$2)`,
        [id, applicant.id, docType, key, sha256, mime, file.length],
      );
      await audit(c, applicant.id, 'signup_kyc_document_uploaded', 'user_document', id, null, { doc_type: docType });
    }
    await c.query("UPDATE users SET kyc_status = 'uploaded' WHERE id = $1", [applicant.id]);
  });
  res.status(201).json({ id, doc_type: docType, status: 'uploaded' });
}));

// ================= Signed-in: own account =================
export const adminRouter = Router();

adminRouter.get('/auth/me', h(async (req, res) => {
  const r = await pool.query(`
    SELECT u.legal_name, u.role, u.kyc_status, u.mfa_enabled, u.whatsapp_opt_in, u.must_change_password,
           COALESCE(s.requested_plan, 'free') AS service_plan,
           COALESCE(s.payment_status, 'not_configured') AS service_payment_status,
           COALESCE(s.status = 'approved', false) AS service_plan_approved,
           COALESCE(s.status = 'approved' AND s.payment_status = 'paid' AND s.requested_plan IN ('pro','enterprise'), false) AS listing_features_enabled,
           COALESCE(s.status = 'approved' AND s.payment_status = 'paid' AND s.requested_plan = 'enterprise', false) AS enterprise_features_enabled
    FROM users u LEFT JOIN user_signups s ON s.user_id = u.id
    WHERE u.id = $1
  `, [req.user!.id]);
  res.json({ ...r.rows[0], edir_id: req.user!.edir_id, session_idle_timeout_minutes: sessionIdleTimeoutMinutes(process.env) });
}));

adminRouter.get('/auth/session', (_req, res) => res.sendStatus(204));

adminRouter.post('/auth/logout', h(async (req, res) => {
  if (!req.user!.sessionId) throw new HttpError(401, 'Session is invalid; sign in again');
  await pool.query(
    'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
    [req.user!.sessionId, req.user!.id],
  );
  res.sendStatus(204);
}));

adminRouter.post('/auth/change-password', h(async (req, res) => {
  const b = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(72) }).parse(req.body); // bcrypt only reads the first 72 bytes
  const u = (await pool.query('SELECT id, role, phone, password_hash, mfa_enabled FROM users WHERE id = $1', [req.user!.id])).rows[0];
  if (!(await bcrypt.compare(b.current, u.password_hash))) throw new HttpError(401, 'Current password is incorrect');
  const bad = passwordProblem(b.next, u.phone);
  if (bad) throw new HttpError(422, bad);
  if (await bcrypt.compare(b.next, u.password_hash)) throw new HttpError(422, 'Choose a password you have not used just now.');
  await withUser(req.user!, async (c) => {
    await c.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [u.id, await bcrypt.hash(b.next, 12)]);
    await audit(c, u.id, 'password_changed', 'user', u.id);
  });
  res.json(await issue({ ...u, must_change_password: false }, req.user!.sessionId));
}));

adminRouter.post('/auth/mfa/setup', h(async (req, res) => {
  const u = (await pool.query('SELECT phone, mfa_enabled FROM users WHERE id = $1', [req.user!.id])).rows[0];
  if (u.mfa_enabled) throw new HttpError(409, 'Two-factor sign-in is already on. Turn it off first to set it up again.');
  const secret = newSecret();
  await pool.query('UPDATE users SET mfa_secret = $2, mfa_last_step = -1 WHERE id = $1', [req.user!.id, seal(secret, MFA_KEY)]);
  res.json({ secret, uri: otpauthUri(secret, u.phone) });
}));

adminRouter.post('/auth/mfa/enable', h(async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const u = (await pool.query('SELECT id, role, mfa_secret, must_change_password FROM users WHERE id = $1', [req.user!.id])).rows[0];
  if (!u.mfa_secret) throw new HttpError(409, 'Start setup first');
  const step = verifyTotpStep(openSecret(u.mfa_secret), code);
  if (step === null) throw new HttpError(422, 'That code is not right. Check the time on your phone and try again.');
  await withUser(req.user!, async (c) => {
    const enabled = await c.query(
      'UPDATE users SET mfa_enabled = true, mfa_last_step = $2 WHERE id = $1 AND mfa_enabled = false AND mfa_secret = $3',
      [u.id, step, u.mfa_secret],
    );
    if (!enabled.rowCount) throw new HttpError(409, 'Two-factor setup changed. Start setup again.');
    await audit(c, u.id, 'mfa_enabled', 'user', u.id);
  });
  res.json(await issue({ ...u, mfa_enabled: true }, req.user!.sessionId));
}));

adminRouter.post('/auth/mfa/disable', h(async (req, res) => {
  const b = z.object({ password: z.string(), code: z.string() }).parse(req.body);
  const u = (await pool.query('SELECT id, role, password_hash, mfa_secret, mfa_enabled FROM users WHERE id = $1', [req.user!.id])).rows[0];
  if (!u.mfa_enabled) throw new HttpError(409, 'Two-factor sign-in is not on');
  if (MFA_STAFF.includes(u.role) && process.env.REQUIRE_MFA_FOR_STAFF === '1') throw new HttpError(403, 'Two-factor sign-in is required for your role');
  const step = verifyTotpStep(openSecret(u.mfa_secret), b.code);
  if (!(await bcrypt.compare(b.password, u.password_hash)) || step === null) throw new HttpError(401, 'Password or code is incorrect');
  await withUser(req.user!, async (c) => {
    const disabled = await c.query(
      'UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1 AND mfa_enabled = true AND mfa_last_step < $2',
      [u.id, step],
    );
    if (!disabled.rowCount) throw new HttpError(401, 'Password or code is incorrect');
    await audit(c, u.id, 'mfa_disabled', 'user', u.id);
  });
  res.json({ ok: true });
}));

adminRouter.patch('/auth/preferences', h(async (req, res) => {
  const b = z.object({ whatsapp_opt_in: z.boolean() }).parse(req.body);
  await withUser(req.user!, async (c) => {
    await c.query('UPDATE users SET whatsapp_opt_in = $2 WHERE id = $1', [req.user!.id, b.whatsapp_opt_in]);
    await audit(c, req.user!.id, 'whatsapp_consent_' + (b.whatsapp_opt_in ? 'given' : 'withdrawn'), 'user', req.user!.id);
  });
  res.json({ whatsapp_opt_in: b.whatsapp_opt_in });
}));

// ================= Users: create, verify, activate (two different people) =================
adminRouter.get('/users', requireRole('super_admin', 'compliance'), h(async (_req, res) => {
  const users = await withUser(_req.user!, async (c) => (await c.query(
    `SELECT u.id, u.legal_name, u.phone, u.role, u.kyc_status, u.active, u.mfa_enabled, u.created_at, u.created_by,
            s.account_type AS signup_account_type, s.requested_plan, s.payment_status AS signup_payment_status,
            s.status AS signup_status, s.pension_match_interest, s.edir_member_interest,
            s.edir_life_interest, s.household_cover_interest, a.service_specialization,
            (SELECT count(*)::int FROM user_documents d WHERE d.user_id = u.id) AS kyc_document_count
     FROM users u LEFT JOIN user_signups s ON s.user_id = u.id LEFT JOIN agents a ON a.id = u.id
     ORDER BY u.created_at DESC LIMIT 300`,
  )).rows);
  res.json(users);
}));

async function lockEligibleSuperAdmins(c: import('pg').PoolClient, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)].sort();
  const rows = (await c.query(
    `SELECT id, role, active, mfa_enabled FROM users
     WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [uniqueIds],
  )).rows;
  return new Map(rows.map((user) => [user.id, user]));
}

const isEligibleSuperAdmin = (user?: { active: boolean; role: string; mfa_enabled: boolean }) =>
  user?.active === true && user.role === 'super_admin' && user.mfa_enabled === true;

adminRouter.get('/global-admin-promotions', requireRole('super_admin'), h(async (_req, res) => {
  const rows = await withUser(_req.user!, async (c) => (await c.query(
    `SELECT r.id, r.status, r.decision_reason, r.created_at, r.decided_at,
            target.id AS target_user_id, target.legal_name AS target_name, target.phone AS target_phone,
            requester.id AS requested_by, requester.legal_name AS requester_name,
            approver.id AS approved_by, approver.legal_name AS approver_name
     FROM global_admin_role_change_requests r
     JOIN users target ON target.id = r.target_user_id
     JOIN users requester ON requester.id = r.requested_by
     LEFT JOIN users approver ON approver.id = r.approved_by
     ORDER BY r.created_at DESC LIMIT 100`,
  )).rows);
  res.json(rows);
}));

adminRouter.post('/global-admin-promotions', requireRole('super_admin'), h(async (req, res) => {
  const { target_user_id } = z.object({ target_user_id: z.string().uuid() }).strict().parse(req.body);
  const request = await withUser(req.user!, async (c) => {
    if (target_user_id === req.user!.id) throw new HttpError(422, 'A different administrator must nominate the target account');
    const eligible = await lockEligibleSuperAdmins(c, [req.user!.id, target_user_id]);
    if (!isEligibleSuperAdmin(eligible.get(req.user!.id))) {
      throw new HttpError(403, 'Promotion requests require an active, MFA-enabled Super Admin');
    }
    const target = eligible.get(target_user_id);
    if (!isEligibleSuperAdmin(target)) {
      throw new HttpError(422, 'The target must be an active, MFA-enabled Super Admin');
    }
    const existing = await c.query(
      "SELECT id FROM global_admin_role_change_requests WHERE target_user_id = $1 AND status = 'pending'",
      [target_user_id],
    );
    if (existing.rowCount) throw new HttpError(409, 'A promotion request for this Super Admin is already pending');
    const inserted = (await c.query(
      `INSERT INTO global_admin_role_change_requests (requested_by, target_user_id)
       VALUES ($1,$2) RETURNING id, status, target_user_id, created_at`,
      [req.user!.id, target_user_id],
    )).rows[0];
    await audit(c, req.user!.id, 'global_admin_promotion_requested', 'user', target_user_id,
      { role: 'super_admin' }, { role: 'global_admin', request_id: inserted.id });
    return inserted;
  });
  res.status(201).json(request);
}));

async function decideGlobalAdminPromotion(req: Request, decision: 'approved' | 'rejected', reason: string) {
  const requestId = z.string().uuid().parse(req.params.id);
  const result = await withUser(req.user!, async (c) => {
    const request = (await c.query(
      'SELECT id, requested_by, target_user_id, status FROM global_admin_role_change_requests WHERE id = $1 FOR UPDATE',
      [requestId],
    )).rows[0];
    if (!request) throw new HttpError(404, 'Promotion request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'Promotion request has already been decided');
    if (request.requested_by === req.user!.id || request.target_user_id === req.user!.id) {
      throw new HttpError(403, 'The requester and target cannot decide this promotion');
    }
    const eligible = await lockEligibleSuperAdmins(c, [req.user!.id, request.requested_by, request.target_user_id]);
    if (!isEligibleSuperAdmin(eligible.get(req.user!.id))) {
      throw new HttpError(403, 'Promotion decisions require an active, MFA-enabled Super Admin');
    }
    if (!isEligibleSuperAdmin(eligible.get(request.requested_by))) {
      throw new HttpError(409, 'The requesting Super Admin is no longer eligible');
    }
    const target = eligible.get(request.target_user_id);
    if (!isEligibleSuperAdmin(target)) {
      throw new HttpError(409, 'The target no longer meets Global Admin eligibility requirements');
    }
    if (decision === 'approved') {
      await c.query("UPDATE users SET role = 'global_admin' WHERE id = $1", [target.id]);
    }
    const updated = (await c.query(
      `UPDATE global_admin_role_change_requests
       SET status = $2, approved_by = $3, decision_reason = $4, decided_at = now()
       WHERE id = $1 RETURNING id, status, target_user_id`,
      [request.id, decision, req.user!.id, reason],
    )).rows[0];
    await audit(c, req.user!.id, `global_admin_promotion_${decision}`, 'user', target.id,
      { role: target.role }, { role: decision === 'approved' ? 'global_admin' : target.role, request_id: request.id, reason });
    return updated;
  });
  if (decision === 'approved') invalidateUser(result.target_user_id);
  return result;
}

adminRouter.post('/global-admin-promotions/:id/approve', requireRole('super_admin'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  res.json(await decideGlobalAdminPromotion(req, 'approved', reason));
}));

adminRouter.post('/global-admin-promotions/:id/reject', requireRole('super_admin'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
  res.json(await decideGlobalAdminPromotion(req, 'rejected', reason));
}));

adminRouter.get('/business-rules', requireRole('global_admin'), h(async (_req, res) => {
  const result = await pool.query(
    'SELECT key, value FROM config_rules WHERE key = ANY($1::text[]) ORDER BY key',
    [BUSINESS_RULES.map((rule) => rule.key)],
  );
  const values = Object.fromEntries(result.rows.map((row) => [row.key, Number(row.value)]));
  const missing = BUSINESS_RULES.filter((rule) => !Number.isFinite(values[rule.key])).map((rule) => rule.key);
  if (missing.length) throw new Error('Business rules are missing: ' + missing.join(', '));
  res.json(BUSINESS_RULES.map((rule) => ({ ...rule, value: values[rule.key] })));
}));

adminRouter.patch('/business-rules', requireRole('global_admin'), h(async (req, res) => {
  const { values } = z.object({
    values: z.record(z.string(), z.number().finite()),
  }).strict().parse(req.body);

  const result = await withUser(req.user!, async (c) => {
    const stored = await c.query('SELECT key, value FROM config_rules FOR UPDATE');
    const current = Object.fromEntries(stored.rows.map((row) => [row.key, Number(row.value)]));
    const missing = BUSINESS_RULES.filter((rule) => !Number.isFinite(current[rule.key])).map((rule) => rule.key);
    if (missing.length) throw new Error('Business rules are missing: ' + missing.join(', '));
    const errors = validateBusinessRuleUpdates(values, current);
    if (errors.length) throw new HttpError(422, errors.join(' '));

    const oldValues = Object.fromEntries(Object.keys(values).map((key) => [key, current[key]]));
    for (const [key, value] of Object.entries(values)) {
      await c.query('UPDATE config_rules SET value = $2 WHERE key = $1', [key, value]);
    }

    const pricingKeys = new Set(['A_onboarding_pct', 'A_guarantee_pct', 'A_monthly_pct', 'B_employer_pct', 'B_other_pct']);
    let repricedContracts = 0;
    if (Object.keys(values).some((key) => pricingKeys.has(key))) {
      const contracts = await c.query(
        `SELECT id, track, base_value, onboarding_amt, guarantee_amt, monthly_mgmt_amt, employer_fee_amt, other_fee_amt
         FROM contracts WHERE state IN ('draft','compliance_review','approval_pending','signature_pending') FOR UPDATE`,
      );
      const nextRules = { ...current, ...values };
      for (const contract of contracts.rows) {
        const amounts = feeSnapshot(contract.track, Number(contract.base_value), nextRules);
        const oldAmounts = {
          onboarding_amt: Number(contract.onboarding_amt),
          guarantee_amt: Number(contract.guarantee_amt),
          monthly_mgmt_amt: Number(contract.monthly_mgmt_amt),
          employer_fee_amt: Number(contract.employer_fee_amt),
          other_fee_amt: Number(contract.other_fee_amt),
        };
        await c.query(
          `UPDATE contracts
           SET onboarding_amt=$2, guarantee_amt=$3, monthly_mgmt_amt=$4, employer_fee_amt=$5, other_fee_amt=$6
           WHERE id=$1`,
          [contract.id, amounts.onboarding_amt, amounts.guarantee_amt, amounts.monthly_mgmt_amt, amounts.employer_fee_amt, amounts.other_fee_amt],
        );
        await audit(c, req.user!.id, 'contract_repriced', 'contract', contract.id, oldAmounts, amounts);
        repricedContracts++;
      }
    }

    await audit(c, req.user!.id, 'business_rules_updated', 'business_rules', 'config_rules', oldValues, values);
    return {
      rules: BUSINESS_RULES.map((rule) => ({ ...rule, value: Number((values as Record<string, number>)[rule.key] ?? current[rule.key]) })),
      repriced_contracts: repricedContracts,
    };
  });
  res.json(result);
}));

adminRouter.post('/users', requireRole('super_admin'), h(async (req, res) => {
  const b = z.object({
    legal_name: z.string().min(2), phone: Phone, email: z.string().email().optional(),
    role: z.enum(PROVISIONABLE_ROLES), territory_id: z.number().int().optional(), parent_agent_id: z.string().uuid().optional(),
    service_specialization: z.enum(['financial_service', 'growth_partnership', 'workforce_property']).optional(),
  }).parse(req.body);
  if (AGENT_ROLES.includes(b.role) && !b.territory_id) throw new HttpError(422, 'Agents need an area');
  if (b.role === 'field_agent' && !b.parent_agent_id) throw new HttpError(422, 'A field agent needs a master agent');
  if (!AGENT_ROLES.includes(b.role) && b.service_specialization) throw new HttpError(422, 'Specialization is only available for agents');
  const temp = randomPassword();
  const user = await withUser(req.user!, async (c) => {
    const r = await c.query(
      `INSERT INTO users (legal_name, phone, email, role, territory_id, password_hash, must_change_password, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id, legal_name, phone, role, kyc_status, active`,
      [b.legal_name, b.phone, b.email ?? null, b.role, b.territory_id ?? null, await bcrypt.hash(temp, 12), req.user!.id],
    );
    if (AGENT_ROLES.includes(b.role)) {
      await c.query('INSERT INTO agents (id, agent_type, parent_id, territory_id, service_specialization) VALUES ($1,$2,$3,$4,$5)', [r.rows[0].id, b.role === 'master_agent' ? 'master' : 'field', b.role === 'field_agent' ? b.parent_agent_id : null, b.territory_id, b.service_specialization ?? null]);
    }
    await audit(c, req.user!.id, 'user_created', 'user', r.rows[0].id, null, { role: b.role });
    return r.rows[0];
  });
  res.status(201).json({ user, temp_password: temp }); // shown once; the user must change it at first sign-in
}));

// Super Agents administer the network; Master Agents can manage only their own direct field agents.
adminRouter.get('/agents/team', requireRole('super_admin', 'master_agent'), h(async (req, res) => {
  const team = await withUser(req.user!, async (c) => (await c.query(
    `SELECT u.id, u.legal_name, u.phone, u.role, u.active, u.territory_id,
            a.agent_type, a.parent_id, a.service_specialization,
            (SELECT count(*)::int FROM leads l WHERE l.source_agent_id = a.id) AS lead_count,
            (SELECT count(*)::int FROM contracts k WHERE k.source_agent_id = a.id) AS contract_count,
            (SELECT count(*)::int FROM properties p WHERE p.source_agent_id = a.id) AS property_count
     FROM agents a JOIN users u ON u.id = a.id
     WHERE ($1::boolean OR a.id = $2 OR a.parent_id = $2)
     ORDER BY a.agent_type, u.legal_name`,
    [req.user!.role === 'super_admin' || req.user!.role === 'global_admin', req.user!.id],
  )).rows);
  res.json(team);
}));

adminRouter.patch('/agents/:id/specialization', requireRole('super_admin', 'master_agent'), h(async (req, res) => {
  const { service_specialization } = z.object({
    service_specialization: z.enum(['financial_service', 'growth_partnership', 'workforce_property']).nullable(),
  }).parse(req.body);
  const result = await withUser(req.user!, async (c) => {
    const agent = (await c.query(
      `SELECT a.id, a.service_specialization, a.parent_id, u.role
       FROM agents a JOIN users u ON u.id = a.id WHERE a.id = $1 FOR UPDATE`,
      [req.params.id],
    )).rows[0];
    if (!agent) throw new HttpError(404, 'Agent not found');
    if (req.user!.role === 'master_agent' && agent.parent_id !== req.user!.id) throw new HttpError(403, 'Master Agents can update only their own field agents');
    const updated = (await c.query(
      'UPDATE agents SET service_specialization = $2 WHERE id = $1 RETURNING id, service_specialization',
      [agent.id, service_specialization],
    )).rows[0];
    await audit(c, req.user!.id, 'agent_specialization_updated', 'agent', agent.id,
      { service_specialization: agent.service_specialization }, { service_specialization });
    return updated;
  });
  res.json(result);
}));

adminRouter.post('/users/:id/kyc', requireRole('compliance'), h(async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['verified', 'rejected']) }).parse(req.body);
  if (req.params.id === req.user!.id) throw new HttpError(403, 'You cannot verify yourself');
  res.json(await withUser(req.user!, async (c) => {
    if (decision === 'verified') {
      const signup = (await c.query('SELECT account_type FROM user_signups WHERE user_id = $1', [req.params.id])).rows[0];
      if (signup) {
        const requiredTypes = signup.account_type === 'worker'
          ? ['national_id', 'police_clearance']
          : ['national_id'];
        const verified = (await c.query(
          "SELECT doc_type FROM user_documents WHERE user_id = $1 AND status = 'verified'",
          [req.params.id],
        )).rows.map((document) => document.doc_type);
        const missing = requiredTypes.filter((type) => !verified.includes(type));
        if (missing.length) throw new HttpError(409, `Required KYC documents are not verified: ${missing.join(', ')}.`);
      }
    }
    const r = await c.query("UPDATE users SET kyc_status = $2 WHERE id = $1 AND kyc_status IN ('uploaded','under_review') RETURNING id, kyc_status", [req.params.id, decision]);
    if (!r.rowCount) throw new HttpError(409, 'User not found or already reviewed');
    await c.query(
      `UPDATE user_signups
       SET status = CASE WHEN $2 = 'rejected' THEN 'rejected' ELSE status END,
           reviewed_by = $3, reviewed_at = now()
       WHERE user_id = $1`,
      [req.params.id, decision, req.user!.id],
    );
    if (decision === 'rejected') await c.query('DELETE FROM signup_upload_tokens WHERE user_id = $1', [req.params.id]);
    await audit(c, req.user!.id, 'kyc_' + decision, 'user', String(req.params.id));
    return r.rows[0];
  }));
}));

adminRouter.get('/users/:id/documents', requireRole('super_admin', 'compliance'), h(async (req, res) => {
  const documents = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, doc_type, mime, size_bytes, status, reviewer_id, reviewed_at, created_at FROM user_documents WHERE user_id = $1 ORDER BY created_at',
    [req.params.id],
  )).rows);
  res.json(documents);
}));

adminRouter.get('/users/:id/documents/:documentId/file', requireRole('super_admin', 'compliance'), h(async (req, res) => {
  const document = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, storage_key, mime FROM user_documents WHERE id = $1 AND user_id = $2',
    [req.params.documentId, req.params.id],
  )).rows[0]);
  if (!document) throw new HttpError(404, 'KYC document not found.');
  const file = await getFile(document.storage_key);
  res.set({
    'Content-Type': document.mime,
    'Content-Disposition': 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }).send(file);
}));

adminRouter.post('/users/:id/documents/:documentId/review', requireRole('compliance'), h(async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(403, 'You cannot review your own KYC documents.');
  const { decision } = z.object({ decision: z.enum(['verified', 'rejected']) }).parse(req.body);
  const document = await withUser(req.user!, async (c) => {
    const found = (await c.query(
      "SELECT id, doc_type, status, uploaded_by FROM user_documents WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [req.params.documentId, req.params.id],
    )).rows[0];
    if (!found) throw new HttpError(404, 'KYC document not found.');
    if (found.uploaded_by === req.user!.id) throw new HttpError(403, 'A different compliance officer must review this document.');
    if (found.status !== 'uploaded') throw new HttpError(409, 'This KYC document has already been reviewed.');
    const updated = (await c.query(
      'UPDATE user_documents SET status = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $1 RETURNING id, doc_type, status',
      [found.id, decision, req.user!.id],
    )).rows[0];
    await audit(c, req.user!.id, 'signup_kyc_document_' + decision, 'user_document', found.id, { status: found.status }, { status: decision });
    return updated;
  });
  res.json(document);
}));

adminRouter.post('/users/:id/activate', requireRole('super_admin'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const target = (await c.query('SELECT id, role, active, created_by FROM users WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'global_admin' && req.user!.role !== 'global_admin') {
      throw new HttpError(403, 'Only a different Global Admin can activate a Global Admin account');
    }
    if (target.created_by === req.user!.id) throw new HttpError(403, 'A different Super Admin must activate an account you created');
    if (target.active) throw new HttpError(409, 'Account is already active');
    // The database refuses activation of non-staff accounts that are not KYC-verified.
    const signup = (await c.query(
      'SELECT * FROM user_signups WHERE user_id = $1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (signup?.status === 'rejected') throw new HttpError(409, 'Rejected sign-up requests cannot be activated');
    if (signup?.account_type === 'agent') {
      await c.query(
        `INSERT INTO agents (id, agent_type, parent_id, territory_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO NOTHING`,
        [req.params.id, signup.agent_type, signup.parent_agent_id, signup.territory_id],
      );
    }
    const r = await c.query('UPDATE users SET active = true WHERE id = $1 RETURNING id, active', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    if (signup) {
      await c.query('DELETE FROM signup_upload_tokens WHERE user_id = $1', [req.params.id]);
      await c.query(
        `UPDATE user_signups
         SET status = 'approved', reviewed_by = $2, reviewed_at = now()
         WHERE user_id = $1`,
        [req.params.id, req.user!.id],
      );
    }
    await audit(c, req.user!.id, 'user_activated', 'user', String(req.params.id));
    return r.rows[0];
  }));
}));

adminRouter.post('/users/:id/deactivate', requireRole('super_admin'), h(async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(409, 'You cannot deactivate yourself');
  res.json(await withUser(req.user!, async (c) => {
    const target = (await c.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'global_admin' && req.user!.role !== 'global_admin') {
      throw new HttpError(403, 'Only a Global Admin can deactivate a Global Admin account');
    }
    const r = await c.query('UPDATE users SET active = false WHERE id = $1 RETURNING id, active', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    await audit(c, req.user!.id, 'user_deactivated', 'user', String(req.params.id));
    return r.rows[0];
  }));
  invalidateUser(String(req.params.id)); // takes effect immediately on this server, within AUTH_CACHE_MS elsewhere
}));

/** Lost phone: clears 2FA so the user can enrol again (staff with REQUIRE_MFA_FOR_STAFF are forced to on next sign-in). */
adminRouter.post('/users/:id/mfa/reset', requireRole('super_admin'), h(async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(403, 'Ask another Super Admin to reset your two-factor sign-in');
  const out = await withUser(req.user!, async (c) => {
    const target = (await c.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'global_admin' && req.user!.role !== 'global_admin') {
      throw new HttpError(403, 'Only a Global Admin can reset a Global Admin authenticator');
    }
    const r = await c.query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_last_step = -1 WHERE id = $1 RETURNING id, role', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    await audit(c, req.user!.id, 'mfa_reset', 'user', String(req.params.id));
    return { ok: true };
  });
  res.json(out);
}));

adminRouter.post('/users/:id/reset-password', requireRole('super_admin'), h(async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(403, 'Ask another Super Admin to reset your password');
  const temp = randomPassword();
  await withUser(req.user!, async (c) => {
    const target = (await c.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'global_admin' && req.user!.role !== 'global_admin') {
      throw new HttpError(403, 'Only a Global Admin can reset a Global Admin password');
    }
    const r = await c.query('UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = $1', [req.params.id, await bcrypt.hash(temp, 12)]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    await audit(c, req.user!.id, 'password_reset', 'user', String(req.params.id));
  });
  res.json({ temp_password: temp });
}));

// ================= Reports =================
adminRouter.get('/reports/summary', requireRole('super_admin', 'finance', 'finance_manager'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const q = async (sql: string) => (await c.query(sql)).rows;
    const [leads, contracts, ledger, comms, pending, disputes, maint, overdue, agents, workers] = await Promise.all([
      q('SELECT status, count(*)::int AS n FROM leads GROUP BY status'),
      q('SELECT state, track, count(*)::int AS n, coalesce(sum(base_value),0)::float AS base FROM contracts GROUP BY state, track'),
      q('SELECT account, sum(debit)::float AS d, sum(credit)::float AS c FROM ledger_entries GROUP BY account'),
      q('SELECT status, count(*)::int AS n, coalesce(sum(amount),0)::float AS amount FROM commission_events GROUP BY status'),
      q("SELECT count(*)::int AS n, coalesce(sum(amount),0)::float AS amount FROM invoices WHERE status = 'pending'"),
      q("SELECT count(*)::int AS n FROM disputes WHERE status <> 'resolved'"),
      q("SELECT count(*)::int AS n FROM maintenance_requests WHERE status IN ('open','assigned','in_progress')"),
      q("SELECT count(*)::int AS n, coalesce(sum(amount),0)::float AS amount FROM rent_charges WHERE status = 'due' AND due_on < current_date"),
      q(`SELECT a.id, u.legal_name,
           (SELECT count(*)::int FROM leads l WHERE l.source_agent_id = a.id) AS leads,
           (SELECT count(*)::int FROM leads l WHERE l.source_agent_id = a.id AND l.status = 'converted') AS converted,
           (SELECT coalesce(sum(amount),0)::float FROM commission_events k WHERE k.agent_id = a.id AND k.status <> 'reversed') AS commission
         FROM agents a JOIN users u ON u.id = a.id ORDER BY commission DESC, leads DESC LIMIT 50`),
      q("SELECT verification AS status, count(*)::int AS n FROM workers GROUP BY verification"),
    ]);
    const acc = (a: string) => { const r = ledger.find((x) => x.account === a); return { d: r?.d ?? 0, c: r?.c ?? 0 }; };
    const revenue = acc('Service Revenue').c - acc('Service Revenue').d - (acc('Refunds').d - acc('Refunds').c);
    const commissionExpense = acc('Commission Expense').d - acc('Commission Expense').c;
    return {
      leads, contracts, comms, workers, agents,
      money: {
        revenue, commission_expense: commissionExpense, net_revenue: revenue - commissionExpense,
        guarantee_held: acc('Guarantee Liability').c - acc('Guarantee Liability').d,
        commission_payable: (acc('Commission Payable').c + acc('Commission Held Payable').c) - (acc('Commission Payable').d + acc('Commission Held Payable').d),
        cash: acc('Cash').d - acc('Cash').c,
      },
      pending_invoices: pending[0], open_disputes: disputes[0].n, open_maintenance: maint[0].n, overdue_rent: overdue[0],
    };
  }));
}));

/** Paid Enterprise accounts receive their row-level scoped portfolio numbers. */
adminRouter.get('/reports/me', requireRole('master_agent', 'field_agent', 'property_owner'), requireEnterprisePlan, h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => {
    const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;
    const [leads, comms, contracts, workers, props] = await Promise.all([
      q('SELECT status, count(*)::int AS n FROM leads GROUP BY status'),
      q('SELECT status, count(*)::int AS n, coalesce(sum(amount),0)::float AS amount FROM commission_events WHERE agent_id = $1 OR agent_id IN (SELECT id FROM agents WHERE parent_id = $1) GROUP BY status', [req.user!.id]),
      q("SELECT count(*)::int AS n FROM contracts WHERE state = 'active'"),
      q('SELECT count(*)::int AS n FROM workers'),
      q('SELECT count(*)::int AS n FROM properties'),
    ]);
    return { leads, comms, active_contracts: contracts[0].n, workers: workers[0].n, properties: props[0].n };
  }));
}));
