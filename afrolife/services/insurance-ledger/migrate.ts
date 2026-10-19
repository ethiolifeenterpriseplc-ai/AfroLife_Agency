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
  ['insurance-ledger-v3-accounting-outbox', '032_accounting_outbox.sql'],
  ['insurance-brokerage-v1-foundation', '033_brokerage_foundation.sql'],
  ['insurance-brokerage-v2-client-intake', '034_brokerage_client_intake.sql'],
  ['insurance-brokerage-v3-quotes-advice', '035_brokerage_quotes_advice.sql'],
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
    const migrationUrl = [
      '032_accounting_outbox.sql',
      '033_brokerage_foundation.sql',
      '034_brokerage_client_intake.sql',
      '035_brokerage_quotes_advice.sql',
    ].includes(filename)
      ? new URL(`../../../services/insurance-ledger/${filename}`, import.meta.url)
      : new URL(`../../../migrations/${filename}`, import.meta.url);
    const source = await readFile(migrationUrl, 'utf8');
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
