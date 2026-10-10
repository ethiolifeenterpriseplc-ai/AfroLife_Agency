import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../services/afrolife-edir/001_schema.sql', import.meta.url), 'utf8');
const staffMigration = await readFile(new URL('../services/afrolife-edir/002_staff_and_lifecycle.sql', import.meta.url), 'utf8');
const financeMigration = await readFile(new URL('../services/afrolife-edir/003_financial_core.sql', import.meta.url), 'utf8');
const hierarchyMigration = await readFile(new URL('../services/afrolife-edir/004_hierarchical_edirs.sql', import.meta.url), 'utf8');
const creditMigration = await readFile(new URL('../services/afrolife-edir/005_credit_workflow.sql', import.meta.url), 'utf8');
const loanMigration = await readFile(new URL('../services/afrolife-edir/006_loan_servicing.sql', import.meta.url), 'utf8');
const router = await readFile(new URL('../services/afrolife-edir/router.ts', import.meta.url), 'utf8');
const migrationRunner = await readFile(new URL('../services/afrolife-edir/migrate.ts', import.meta.url), 'utf8');

test('Edir is isolated behind role-scoped RLS and an independent staff hierarchy', () => {
  assert.match(schema, /CREATE TABLE edir_staff/);
  assert.match(schema, /edir_has_staff_role\(ARRAY\['edir_admin'\]\)/);
  assert.match(schema, /edir_has_staff_role\(ARRAY\['edir_admin','compliance','auditor'\]\)/);
  assert.match(schema, /ALTER TABLE edir_memberships FORCE ROW LEVEL SECURITY/);
  assert.match(schema, /ALTER TABLE edir_staff FORCE ROW LEVEL SECURITY/);
  assert.match(schema, /CREATE POLICY edir_staff_platform_management/);
  assert.doesNotMatch(schema, /REFERENCES\s+users\s*\(/i);
});

test('Edir enrollment binds identity to the signed AfroLife profile, not request fields', () => {
  assert.match(router, /req\.user!\.legal_name/);
  assert.match(router, /req\.user!\.phone/);
  assert.match(router, /const Enrollment = z\.object\(\{\s*accept_nonfinancial_terms: z\.literal\(true\)/);
  assert.match(router, /accept_nonfinancial_terms:\s*z\.literal\(true\)/);
});

test('Edir membership identity and audit history are protected from mutation', () => {
  assert.match(staffMigration, /CREATE TRIGGER edir_membership_identity_guard/);
  assert.match(schema, /CREATE TRIGGER edir_audit_immutable/);
  assert.match(staffMigration, /Invalid Edir membership lifecycle transition/);
  assert.match(staffMigration, /CREATE POLICY edir_audit_read/);
});

test('Edir applies a forward staff migration after the original schema version', () => {
  assert.match(migrationRunner, /afrolife-edir-v1/);
  assert.match(migrationRunner, /afrolife-edir-v2-staff-lifecycle/);
  assert.match(migrationRunner, /afrolife-edir-v3-financial-core/);
  assert.match(migrationRunner, /afrolife-edir-v4-hierarchical-edirs/);
  assert.match(staffMigration, /DROP POLICY IF EXISTS edir_membership_read/);
  assert.ok(schema.indexOf('CREATE TABLE edir_memberships') < schema.indexOf('CREATE OR REPLACE FUNCTION edir_has_active_membership'));
});

test('Edir finance requires independent review and immutable balanced journals', () => {
  assert.match(financeMigration, /UNIQUE \(created_by, idempotency_key\)/);
  assert.match(financeMigration, /reviewed_by <> created_by/);
  assert.match(financeMigration, /debit_total <> credit_total/);
  assert.match(financeMigration, /Posted Edir journals are immutable/);
  assert.match(financeMigration, /FORCE ROW LEVEL SECURITY/);
  assert.match(financeMigration, /edir_financial_transactions_create/);
  assert.match(financeMigration, /current_balance - NEW\.amount < \(CASE WHEN NEW\.direction='reversal' THEN 0 ELSE minimum_balance END\)/);
  assert.match(financeMigration, /edir_single_approved_reversal_idx/);
  assert.match(financeMigration, /NEW\.created_by IN \(original_created_by, original_reviewed_by\)/);
  assert.match(financeMigration, /Edir reversal must reference an eligible unreversed transaction/);
  assert.match(financeMigration, /withdrawals_allowed <> OLD\.withdrawals_allowed/);
  assert.doesNotMatch(financeMigration, /^\s*END\n\$\$;/m);
});

test('Edir organization migration scopes every service record to one immutable tenant', () => {
  assert.match(hierarchyMigration, /CREATE TABLE edir_organizations/);
  assert.match(hierarchyMigration, /CREATE TABLE edir_registration_applications/);
  assert.match(hierarchyMigration, /'edir_memberships','edir_groups'/);
  assert.match(hierarchyMigration, /table_name \|\| '_tenant_scope'/);
  assert.match(hierarchyMigration, /CREATE POLICY %I ON %I AS RESTRICTIVE/);
  assert.match(hierarchyMigration, /FOREIGN KEY \(member_account_id, organization_id\)/);
  assert.match(hierarchyMigration, /table_name \|\| '_tenant_guard'/);
  assert.match(hierarchyMigration, /edir_consolidated_summary/);
  assert.match(hierarchyMigration, /CREATE POLICY edir_organizations_catalog/);
});

test('Edir credit workflow is versioned, tenant-scoped, and blocks self-review', () => {
  assert.match(migrationRunner, /afrolife-edir-v5-credit-workflow/);
  assert.match(migrationRunner, /afrolife-edir-v6-loan-servicing/);
  assert.match(router, /edirRouter\.use\('\/credit', edirCreditRouter\)/);
  assert.match(creditMigration, /UNIQUE \(organization_id, created_by, idempotency_key\)/);
  assert.match(creditMigration, /payload_hash text NOT NULL/);
  assert.match(creditMigration, /ALTER TABLE edir_memberships ADD COLUMN activated_at timestamptz/);
  assert.match(creditMigration, /edir_membership_activation_time_guard/);
  assert.match(creditMigration, /edir_membership_credit_read ON edir_memberships FOR SELECT/);
  assert.match(creditMigration, /edir_financial_journal_lines_credit_read/);
  assert.match(creditMigration, /NEW\.decision_by IN \(OLD\.created_by, OLD\.scored_by\)/);
  assert.match(creditMigration, /NEW\.scored_by=OLD\.created_by/);
  assert.match(creditMigration, /edir_loan_application_accept ON edir_loan_applications FOR UPDATE/);
  assert.match(creditMigration, /edir_loan_application_tenant_scope ON edir_loan_applications AS RESTRICTIVE/);
  assert.match(creditMigration, /END;\r?\n\$\$;/);
  assert.match(creditMigration, /FORCE ROW LEVEL SECURITY/);
});

test('Edir loan servicing uses member consent, tenant RLS, maker-checker, and balanced savings postings', () => {
  assert.match(loanMigration, /CREATE TABLE edir_loan_acceptances/);
  assert.match(loanMigration, /Edir loan proceeds must go to the member own active savings account/);
  assert.match(loanMigration, /CREATE TABLE edir_loan_installments/);
  assert.match(loanMigration, /Edir installment changes must originate from a posted loan journal/);
  assert.match(loanMigration, /Edir loan operation request is immutable/);
  assert.match(loanMigration, /Edir disbursement requires an accepted loan and independent authorized actors/);
  assert.match(loanMigration, /Edir savings balance is insufficient for the loan repayment/);
  assert.match(loanMigration, /edir_loan_account_balance\(NEW\.member_account_id\)/);
  assert.match(loanMigration, /line_count<>2/);
  assert.match(loanMigration, /CREATE POLICY edir_loan_journal_lines_tenant_scope ON edir_loan_journal_lines AS RESTRICTIVE/);
  assert.match(loanMigration, /GRANT SELECT,INSERT ON TABLE edir_loan_acceptances/);
});
