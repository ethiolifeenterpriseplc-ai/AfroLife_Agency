import '../../src/env.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { buildEdirServiceMigration } from './schema.js';

const migrationUrl = process.env.EDIR_MIGRATION_DATABASE_URL;
const runtimeRole = process.env.EDIR_RUNTIME_DB_ROLE;
if (!migrationUrl) throw new Error('EDIR_MIGRATION_DATABASE_URL must be configured for Edir service migrations');
if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
  throw new Error('EDIR_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
}

const migrations = await Promise.all([
  ['afrolife-edir-v1', '001_schema.sql'],
  ['afrolife-edir-v2-staff-lifecycle', '002_staff_and_lifecycle.sql'],
  ['afrolife-edir-v3-financial-core', '003_financial_core.sql'],
  ['afrolife-edir-v4-hierarchical-edirs', '004_hierarchical_edirs.sql'],
  ['afrolife-edir-v5-credit-workflow', '005_credit_workflow.sql'],
  ['afrolife-edir-v6-loan-servicing', '006_loan_servicing.sql'],
].map(async ([version, filename]) => ({
  version,
  source: await readFile(new URL(`../../../services/afrolife-edir/${filename}`, import.meta.url), 'utf8'),
})));
const client = new pg.Client({ connectionString: migrationUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `CREATE TABLE IF NOT EXISTS edir_service_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  for (const migration of migrations) {
    const applied = await client.query(
      'SELECT 1 FROM edir_service_migrations WHERE version=$1',
      [migration.version],
    );
    if (applied.rowCount) continue;
    await client.query(buildEdirServiceMigration(migration.source, runtimeRole));
    await client.query(
      'INSERT INTO edir_service_migrations (version) VALUES ($1)',
      [migration.version],
    );
    console.log(`AfroLife Edir migration ${migration.version} applied`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
