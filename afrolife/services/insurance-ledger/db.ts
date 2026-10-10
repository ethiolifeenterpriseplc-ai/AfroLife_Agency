import pg from 'pg';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../src/auth-types.js';

const connectionString = process.env.INSURANCE_DATABASE_URL;
if (!connectionString) throw new Error('INSURANCE_DATABASE_URL must be configured for the insurance-ledger service');

export const pool = new pg.Pool({ connectionString });

export async function withUser<T>(user: AuthUser, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true), set_config('app.edir_id',$3,true)",
      [user.id, user.role, user.edir_id ?? '00000000-0000-4000-8000-000000000002'],
    );
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assertServiceDatabaseSafety(): Promise<void> {
  const role = (await pool.query(
    `SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  )).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error('The insurance service runtime role must not be a superuser or have BYPASSRLS');
  }
  const ownedTable = (await pool.query(
    `SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND c.relrowsecurity AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
     LIMIT 1`,
  )).rows[0];
  if (ownedTable) {
    throw new Error(`The insurance service runtime role owns the RLS-protected table ${ownedTable.relname}`);
  }
}
