import '../../src/env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const migrationUrl = process.env.GLOBAL_BI_MIGRATION_DATABASE_URL;
const queryUrl = process.env.GLOBAL_BI_DATABASE_URL;
const ingestUrl = process.env.GLOBAL_BI_INGEST_DATABASE_URL;
if (!migrationUrl || !queryUrl || !ingestUrl) {
  throw new Error('Set GLOBAL_BI_MIGRATION_DATABASE_URL, GLOBAL_BI_DATABASE_URL and GLOBAL_BI_INGEST_DATABASE_URL');
}
const roleName = (value: string, key: string) => {
  const name = decodeURIComponent(new URL(value).username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)) {
    throw new Error(`${key} must use a simple PostgreSQL role name`);
  }
  return name;
};
const replacements = {
  '{{query_role}}': roleName(queryUrl, 'GLOBAL_BI_DATABASE_URL'),
  '{{ingest_role}}': roleName(ingestUrl, 'GLOBAL_BI_INGEST_DATABASE_URL'),
};
const pool = new pg.Pool({ connectionString: migrationUrl });
const folder = join(import.meta.dirname, 'migrations');

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const name of (await readdir(folder)).filter((file) => file.endsWith('.sql')).sort()) {
    if ((await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
    let sql = await readFile(join(folder, name), 'utf8');
    for (const [placeholder, role] of Object.entries(replacements)) {
      sql = sql.replaceAll(`"${placeholder}"`, `"${role}"`);
    }
    if (sql.includes('{{query_role}}') || sql.includes('{{ingest_role}}')) {
      throw new Error(`${name} contains an unresolved database role placeholder`);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied Global BI migration ${name}`);
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
