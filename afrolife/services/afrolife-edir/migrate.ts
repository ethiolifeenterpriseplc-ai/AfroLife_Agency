import '../../src/env.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  ['afrolife-edir-v7-versioned-loan-products', '007_versioned_loan_products.sql'],
  ['afrolife-edir-v8-customer-complaints', '008_customer_complaints.sql'],
  ['afrolife-edir-v9-member-risk-controls', '009_member_risk_controls.sql'],
  ['afrolife-edir-v10-daily-disbursement-limits', '010_daily_disbursement_limits.sql'],
  ['afrolife-edir-v11-hashed-loan-consent', '011_hashed_loan_consent.sql'],
  ['afrolife-edir-v12-member-kyc-review', '012_member_kyc_review.sql'],
  ['afrolife-edir-v13-loan-documents', '013_loan_documents.sql'],
  ['afrolife-edir-v14-loan-writeoffs', '014_loan_writeoffs.sql'],
  ['afrolife-edir-v15-rls-safe-kyc-guards', '015_rls_safe_kyc_guards.sql'],
  ['afrolife-edir-v16-atomic-writeoff-posting', '016_atomic_writeoff_posting.sql'],
  ['afrolife-edir-v17-remove-stale-loan-status-check', '017_remove_stale_loan_status_check.sql'],
  ['afrolife-edir-v18-remove-stale-installment-check', '018_remove_stale_installment_check.sql'],
  ['afrolife-edir-v19-platform-disbursement-limits', '019_platform_disbursement_limits.sql'],
  ['afrolife-edir-v20-platform-disbursement-cap-guard', '020_platform_disbursement_cap_guard.sql'],
  ['afrolife-edir-v21-organization-ledger-bootstrap', '021_organization_ledger_bootstrap.sql'],
  ['afrolife-edir-v22-member-credit-control-lock', '022_member_credit_control_lock.sql'],
  ['afrolife-edir-v23-member-credit-control-posting-roles', '023_member_credit_control_posting_roles.sql'],
  ['afrolife-edir-v24-accounting-outbox', '024_accounting_outbox.sql'],
  ['afrolife-edir-v25-accounting-outbox-staff-scope', '025_accounting_outbox_access.sql'],
  ['afrolife-edir-v26-registration-documents', '026_registration_documents.sql'],
  ['afrolife-edir-v27-active-member-financial-approval', '027_active_member_financial_approval.sql'],
  ['afrolife-edir-v28-rls-safe-active-member-approval', '028_rls_safe_active_member_approval.sql'],
  ['afrolife-edir-v29-restrict-active-member-guard', '029_restrict_active_member_guard.sql'],
].map(async ([version, filename]) => ({
  version,
  source: await readFile(join(process.cwd(), 'services', 'afrolife-edir', filename), 'utf8'),
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
