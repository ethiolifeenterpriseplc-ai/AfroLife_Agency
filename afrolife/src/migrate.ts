import './env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set MIGRATION_DATABASE_URL or DATABASE_URL');
const appConnectionString = process.env.DATABASE_URL;
const appRole = appConnectionString ? decodeURIComponent(new URL(appConnectionString).username) : '';
if (appRole && !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(appRole)) {
  throw new Error('DATABASE_URL must use a simple PostgreSQL role name before migrations can grant runtime access.');
}
const pool = new pg.Pool({ connectionString });
const folder = join(import.meta.dirname, '..', 'migrations');

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const name of (await readdir(folder)).filter((x) => x.endsWith('.sql')).sort()) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    let sql = await readFile(join(folder, name), 'utf8');
    if (sql.includes('"{{role}}"')) {
      if (!appRole) throw new Error(`${name} requires DATABASE_URL so migration grants can target the application role.`);
      sql = sql.replaceAll('"{{role}}"', `"${appRole}"`);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
