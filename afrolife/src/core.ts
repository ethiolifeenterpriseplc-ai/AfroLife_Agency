import pg from 'pg';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { isPlatformAdminRole, type AuthUser } from './auth-types.js';
import { HttpError } from './http-error.js';
import { sessionIdleTimeoutMinutes } from './runtime-config.js';
export { HttpError } from './http-error.js';

export { isPlatformAdminRole } from './auth-types.js';
export type { AuthUser } from './auth-types.js';

pg.types.setTypeParser(1082, (v: string) => v); // keep DATE columns as 'YYYY-MM-DD' text (no timezone shifts)
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set (32+ chars)');

export async function assertRuntimeDatabaseSafety() {
  const role = (await pool.query(
    `SELECT r.rolsuper, r.rolbypassrls
     FROM pg_roles r WHERE r.rolname=current_user`,
  )).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error('The production database runtime role must not be a superuser or have BYPASSRLS');
  }
  const ownedRlsTable = (await pool.query(
    `SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
     LIMIT 1`,
  )).rows[0];
  if (ownedRlsTable) {
    throw new Error(`The production database runtime role owns the RLS-protected table ${ownedRlsTable.relname}`);
  }
}

/** Runs fn in one transaction with the caller's identity set for row-level security. */
export async function withUser<T>(u: AuthUser, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true), set_config('app.edir_id',$3,true)",
      [u.id, u.role, u.edir_id ?? '00000000-0000-4000-8000-000000000002']);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function withService<T>(service: 'payment_webhook', fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.service',$1,true)", [service]);
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}

// A signed token alone would stay valid for 8h after an account is deactivated or its role changes.
// So each request also checks the account's current state, cached briefly to keep this to ~1 query per user per few seconds.
const STATE_TTL_MS = Number(process.env.AUTH_CACHE_MS ?? 15_000);
const stateCache = new Map<string, {
  at: number;
  active: boolean;
  role: string;
  legal_name?: string;
  phone?: string;
  email?: string | null;
  kyc_status?: string;
}>();
const SESSION_IDLE_TIMEOUT_MINUTES = sessionIdleTimeoutMinutes(process.env);

export function invalidateUser(id: string) { stateCache.delete(id); }

async function currentState(id: string) {
  const hit = stateCache.get(id);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit;
  const r = (await pool.query(
    'SELECT active, role, legal_name, phone, email, kyc_status FROM users WHERE id = $1',
    [id],
  )).rows[0];
  const row = {
    at: Date.now(),
    active: r?.active === true,
    role: r?.role as string,
    legal_name: r?.legal_name as string | undefined,
    phone: r?.phone as string | undefined,
    email: r?.email as string | null | undefined,
    kyc_status: r?.kyc_status as string | undefined,
  };
  if (stateCache.size > 5000) stateCache.clear();
  stateCache.set(id, row);
  return row;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Missing token'));
  let p: { sub: string; sid: string; rst?: string };
  try {
    p = jwt.verify(h.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; sid: string; rst?: string };
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
  if (!p.sid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.sid)) {
    return next(new HttpError(401, 'Session is invalid; sign in again'));
  }
  pool.query(
    `UPDATE auth_sessions SET last_activity_at=now()
     WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()
       AND last_activity_at>now()-make_interval(mins=>$3)
     RETURNING id`,
    [p.sid, p.sub, SESSION_IDLE_TIMEOUT_MINUTES],
  ).then((session) => {
    if (!session.rowCount) throw new HttpError(401, 'Session expired or is no longer active');
    return currentState(p.sub);
  }).then(
    (s) => {
      if (!s.active) return next(new HttpError(401, 'Account is inactive'));
      req.user = {
        id: p.sub,
        role: s.role,
        sessionId: p.sid,
        rst: p.rst,
        legal_name: s.legal_name,
        phone: s.phone,
        email: s.email,
        kyc_status: s.kyc_status,
      }; // Identity fields and role come from the database, not the token.
      next();
    },
    next,
  );
}

export const requireRole = (...roles: string[]) => (req: Request, _res: Response, next: NextFunction) =>
  (roles.includes(req.user!.role)
    || (req.user!.role === 'global_admin' && roles.includes('super_admin')))
    ? next()
    : next(new HttpError(403, 'Your role cannot do this'));
