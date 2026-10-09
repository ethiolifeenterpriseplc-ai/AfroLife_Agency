import pg from 'pg';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthUser { id: string; role: string; rst?: string }
declare global { namespace Express { interface Request { user?: AuthUser } } }

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

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
    await c.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true)", [u.id, u.role]);
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
const stateCache = new Map<string, { at: number; active: boolean; role: string }>();

export function invalidateUser(id: string) { stateCache.delete(id); }

async function currentState(id: string) {
  const hit = stateCache.get(id);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit;
  const r = (await pool.query('SELECT active, role FROM users WHERE id = $1', [id])).rows[0];
  const row = { at: Date.now(), active: r?.active === true, role: r?.role as string };
  if (stateCache.size > 5000) stateCache.clear();
  stateCache.set(id, row);
  return row;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Missing token'));
  let p: { sub: string; rst?: string };
  try {
    p = jwt.verify(h.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; rst?: string };
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
  currentState(p.sub).then(
    (s) => {
      if (!s.active) return next(new HttpError(401, 'Account is inactive'));
      req.user = { id: p.sub, role: s.role, rst: p.rst }; // role comes from the database, not the token
      next();
    },
    next,
  );
}

export const requireRole = (...roles: string[]) => (req: Request, _res: Response, next: NextFunction) =>
  roles.includes(req.user!.role) ? next() : next(new HttpError(403, 'Your role cannot do this'));
