import '../../src/env.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { buildInsuranceServiceMigration } from './schema.js';

const migrationUrl = process.env.INSURANCE_MIGRATION_DATABASE_URL;
const runtimeRole = process.env.INSURANCE_RUNTIME_DB_ROLE;
if (!migrationUrl) throw new Error('INSURANCE_MIGRATION_DATABASE_URL must be configured for service migrations');
if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
  throw new Error('INSURANCE_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
}

const migrations = [
  ['insurance-ledger-v1', '026_insurance_ledger.sql'],
  ['insurance-ledger-v2-hierarchical-edirs', '031_hierarchical_edir_insurance.sql'],
];

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
  for (const [version, filename] of migrations) {
    const applied = await client.query('SELECT 1 FROM insurance_service_migrations WHERE version=$1', [version]);
    if (applied.rowCount) continue;
    const source = await readFile(new URL(`../../../migrations/${filename}`, import.meta.url), 'utf8');
    await client.query(buildInsuranceServiceMigration(source, runtimeRole));
    await client.query(
      'INSERT INTO insurance_service_migrations (version) VALUES ($1)',
      [version],
    );
    console.log(`Insurance ledger migration ${version} applied`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
