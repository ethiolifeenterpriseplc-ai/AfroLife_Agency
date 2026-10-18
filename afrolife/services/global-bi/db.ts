import pg from 'pg';
import type { PoolClient } from 'pg';
import type { AuthUser } from '../../src/auth-types.js';

const connectionString = process.env.GLOBAL_BI_DATABASE_URL;
if (!connectionString) throw new Error('GLOBAL_BI_DATABASE_URL must target the separate Global BI analytics database');

function databaseTarget(value: string) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

if (process.env.DATABASE_URL && databaseTarget(connectionString) === databaseTarget(process.env.DATABASE_URL)) {
  throw new Error('GLOBAL_BI_DATABASE_URL must not point to the operational database');
}

export const pool = new pg.Pool({ connectionString, application_name: 'afrolife-global-bi-readonly' });

export async function withUser<T>(user: AuthUser, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true)", [user.id, user.role]);
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

export async function assertReadOnlyDatabaseSafety(): Promise<void> {
  const client = await pool.connect();
  try {
    const role = (await client.query(
      `SELECT r.rolsuper, r.rolbypassrls,
              has_table_privilege(current_user,'public.global_bi_aggregates','SELECT') AS can_read,
              has_table_privilege(current_user,'public.global_bi_aggregates','INSERT') AS can_insert,
              has_table_privilege(current_user,'public.global_bi_aggregates','UPDATE') AS can_update,
              has_table_privilege(current_user,'public.global_bi_aggregates','DELETE') AS can_delete
       FROM pg_roles r WHERE r.rolname=current_user`,
    )).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || !role.can_read
      || role.can_insert || role.can_update || role.can_delete) {
      throw new Error('Global BI runtime role must be read-only, non-owner, and must not have BYPASSRLS');
    }
    const owned = (await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p')
         AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
       LIMIT 1`,
    )).rows[0];
    if (owned) throw new Error(`Global BI runtime role owns table ${owned.relname}`);
  } finally {
    client.release();
  }
}
