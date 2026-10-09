import '../../src/env.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const migrationUrl = process.env.INSURANCE_MIGRATION_DATABASE_URL;
const runtimeRole = process.env.INSURANCE_RUNTIME_DB_ROLE;
if (!migrationUrl) throw new Error('INSURANCE_MIGRATION_DATABASE_URL must be configured for service migrations');
if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
  throw new Error('INSURANCE_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
}

const original = await readFile(new URL('../../../migrations/026_insurance_ledger.sql', import.meta.url), 'utf8');
const migration = original.replaceAll(' REFERENCES users(id)', '');
if (migration === original || /REFERENCES\s+users\s*\(/i.test(migration)) {
  throw new Error('Insurance ledger migration could not be isolated from the central users table');
}
const helpers = `
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), '')
$$;
`;
const grants = [
  'GRANT SELECT, INSERT ON TABLE insurance_ledger_accounts TO "{{role}}"',
  'GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_journals TO "{{role}}"',
  'GRANT SELECT, INSERT ON TABLE insurance_ledger_lines TO "{{role}}"',
  'GRANT SELECT, INSERT ON TABLE insurance_ledger_audit TO "{{role}}"',
  'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_lines_id_seq TO "{{role}}"',
  'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_audit_id_seq TO "{{role}}"',
].map((grant) => grant.replaceAll('{{role}}', runtimeRole)).join(';\n');

const client = new pg.Client({ connectionString: migrationUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `CREATE TABLE IF NOT EXISTS insurance_service_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const applied = await client.query(
    'SELECT 1 FROM insurance_service_migrations WHERE version = $1',
    ['insurance-ledger-v1'],
  );
  if (applied.rowCount) {
    await client.query('COMMIT');
    console.log('Insurance ledger service schema is already installed');
    process.exitCode = 0;
  } else {
  await client.query(`${helpers}\n${migration}\n${grants}`);
  await client.query(
    'INSERT INTO insurance_service_migrations (version) VALUES ($1)',
    ['insurance-ledger-v1'],
  );
  await client.query('COMMIT');
  console.log('Insurance ledger service schema installed');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
