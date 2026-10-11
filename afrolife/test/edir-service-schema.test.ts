import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../services/afrolife-edir/001_schema.sql', import.meta.url), 'utf8');
const staffMigration = await readFile(new URL('../services/afrolife-edir/002_staff_and_lifecycle.sql', import.meta.url), 'utf8');
const financeMigration = await readFile(new URL('../services/afrolife-edir/003_financial_core.sql', import.meta.url), 'utf8');
const hierarchyMigration = await readFile(new URL('../services/afrolife-edir/004_hierarchical_edirs.sql', import.meta.url), 'utf8');
const creditMigration = await readFile(new URL('../services/afrolife-edir/005_credit_workflow.sql', import.meta.url), 'utf8');
const loanMigration = await readFile(new URL('../services/afrolife-edir/006_loan_servicing.sql', import.meta.url), 'utf8');
const productMigration = await readFile(new URL('../services/afrolife-edir/007_versioned_loan_products.sql', import.meta.url), 'utf8');
const complaintMigration = await readFile(new URL('../services/afrolife-edir/008_customer_complaints.sql', import.meta.url), 'utf8');
const riskMigration = await readFile(new URL('../services/afrolife-edir/009_member_risk_controls.sql', import.meta.url), 'utf8');
const limitMigration = await readFile(new URL('../services/afrolife-edir/010_daily_disbursement_limits.sql', import.meta.url), 'utf8');
const consentMigration = await readFile(new URL('../services/afrolife-edir/011_hashed_loan_consent.sql', import.meta.url), 'utf8');
const kycMigration = await readFile(new URL('../services/afrolife-edir/012_member_kyc_review.sql', import.meta.url), 'utf8');
const documentMigration = await readFile(new URL('../services/afrolife-edir/013_loan_documents.sql', import.meta.url), 'utf8');
const writeoffMigration = await readFile(new URL('../services/afrolife-edir/014_loan_writeoffs.sql', import.meta.url), 'utf8');
const rlsSafeKycMigration = await readFile(new URL('../services/afrolife-edir/015_rls_safe_kyc_guards.sql', import.meta.url), 'utf8');
const atomicWriteoffMigration = await readFile(new URL('../services/afrolife-edir/016_atomic_writeoff_posting.sql', import.meta.url), 'utf8');
const staleLoanStatusMigration = await readFile(new URL('../services/afrolife-edir/017_remove_stale_loan_status_check.sql', import.meta.url), 'utf8');
const staleInstallmentMigration = await readFile(new URL('../services/afrolife-edir/018_remove_stale_installment_check.sql', import.meta.url), 'utf8');
const creditRouter = await readFile(new URL('../services/afrolife-edir/credit-router.ts', import.meta.url), 'utf8');
const complaintIntakeRoute = creditRouter.split("edirCreditRouter.post('/complaints'")[1]?.split("edirCreditRouter.post('/complaints/:complaintId/decision'")[0] ?? '';
const creditApplicationRoute = creditRouter.split("edirCreditRouter.post('/applications'")[1]?.split("edirCreditRouter.post('/members/:memberId/kyc-review'")[0] ?? '';
const loanDocumentUploadRoute = creditRouter.split("edirCreditRouter.post('/documents/:documentType'")[1]?.split("edirCreditRouter.get('/documents/me'")[0] ?? '';
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
  assert.match(migrationRunner, /afrolife-edir-v7-versioned-loan-products/);
  assert.match(migrationRunner, /afrolife-edir-v8-customer-complaints/);
  assert.match(migrationRunner, /afrolife-edir-v9-member-risk-controls/);
  assert.match(migrationRunner, /afrolife-edir-v10-daily-disbursement-limits/);
  assert.match(migrationRunner, /afrolife-edir-v11-hashed-loan-consent/);
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

test('Edir customer complaints support private member submission and tracked staff resolution', () => {
  assert.match(complaintMigration, /CREATE TABLE edir_customer_complaints/);
  assert.match(complaintMigration, /edir_customer_complaint_read/);
  assert.match(complaintMigration, /edir_customer_complaint_create/);
  assert.match(complaintMigration, /edir_customer_complaint_manage/);
  assert.match(creditRouter, /post\('\/complaints'/);
  assert.match(creditRouter, /post\('\/complaints\/:complaintId\/decision'/);
  assert.match(creditRouter, /A resolution summary is required to close a complaint/);
  assert.doesNotMatch(complaintIntakeRoute, /SELECT id FROM edir_memberships WHERE user_id=\$1 AND status='active' FOR UPDATE/);
  assert.match(creditApplicationRoute, /pg_advisory_xact_lock/);
  assert.doesNotMatch(creditApplicationRoute, /FROM edir_memberships WHERE user_id=\$1 FOR UPDATE/);
  assert.match(creditApplicationRoute, /parseEdirMoney\(body\.monthly_expenses, true\)/);
  assert.match(creditApplicationRoute, /parseEdirMoney\(body\.monthly_debt, true\)/);
  assert.doesNotMatch(loanDocumentUploadRoute, /edir_memberships WHERE user_id=\$1 AND status='active' FOR UPDATE/);
  assert.match(creditRouter, /resolved_by=CASE WHEN \$2 IN \('resolved','rejected'\) THEN \$6::uuid ELSE null END/);
});

test('Edir risk holds require independent review and block member credit actions', () => {
  assert.match(riskMigration, /edir_guard_member_risk_flag/);
  assert.match(riskMigration, /Edir risk hold release requires an independent actor and reason/);
  assert.match(riskMigration, /edir_member_has_active_risk_hold/);
  assert.match(creditRouter, /An active Edir risk hold prevents new credit applications/);
  assert.match(creditRouter, /An active Edir risk hold prevents loan disbursement/);
});

test('Edir daily disbursement cap is versioned, independently approved and enforced at posting',()=>{
  assert.match(limitMigration,/CREATE TABLE edir_disbursement_limit_versions/);
  assert.match(limitMigration,/Edir limit decision requires an independent reviewer and reason/);
  assert.match(limitMigration,/edir_disbursement_limit_one_active_idx/);
  assert.match(creditRouter,/edir_disbursement_limit_versions WHERE organization_id=\$1 AND status='active'/);
  assert.match(creditRouter,/approved Edir daily disbursement limit would be exceeded/);
});

test('Edir member consent records a cryptographic hash of exact offer and product snapshot',()=>{
  assert.match(consentMigration,/agreement_hash text/);
  assert.match(consentMigration,/terms_snapshot jsonb/);
  assert.match(creditRouter,/agreementHash=createHash\('sha256'\)/);
  assert.match(creditRouter,/acceptanceText=.*agreementHash/);
  assert.match(creditRouter,/terms_snapshot:acceptance.terms_snapshot/);
});

test('Edir product versions require independent review and applications snapshot the chosen product', () => {
  assert.match(productMigration, /CREATE TABLE edir_loan_product_versions/);
  assert.match(productMigration, /Edir loan product decision requires an independent reviewer/);
  assert.match(productMigration, /edir_loan_application_product_fk/);
  assert.match(productMigration, /edir_loan_product_tenant_scope/);
  assert.match(creditRouter, /post\('\/products'/);
  assert.match(creditRouter, /post\('\/products\/:versionId\/decision'/);
  assert.match(creditRouter, /product_version_id,product_terms,eligibility_context/);
  assert.match(creditRouter, /The product author cannot review their own version/);
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

test('Edir reporting covers aging, trial balance, and servicing reconciliation', () => {
  assert.match(creditRouter, /get\('\/reports\/portfolio'/);
  assert.match(creditRouter, /get\('\/reports\/trial-balance'/);
  assert.match(creditRouter, /get\('\/reports\/disbursement-reconciliation'/);
  assert.match(creditRouter, /UNION ALL[\s\S]*edir_loan_journal_lines/);
  assert.match(creditRouter, /missing_posted_journals/);
  assert.match(creditRouter, /edir-trial-balance-.*\.csv/);
  assert.match(creditRouter, /toCsv\(rows,/);
});

test('Edir application intake enforces product cooldowns after rejection and settlement', () => {
  assert.match(creditRouter, /cooldownRemainingDays\(recent\.rejected_at, terms\.rejection_cooldown_days\)/);
  assert.match(creditRouter, /cooldownRemainingDays\(recent\.settled_at, terms\.settlement_cooldown_days\)/);
});

test('Edir full-principal write-off requires independent review and posts to loss expense', () => {
  assert.match(migrationRunner, /afrolife-edir-v14-loan-writeoffs/);
  assert.match(writeoffMigration, /ON CONFLICT\(organization_id,code\) DO NOTHING/);
  assert.match(writeoffMigration, /CREATE TABLE edir_loan_writeoffs/);
  assert.match(writeoffMigration, /operation_type IN \('disbursement','repayment','writeoff'\)/);
  assert.match(writeoffMigration, /full current principal balance and independent authorized actors/);
  assert.match(writeoffMigration, /write-off must debit the loan loss expense ledger/);
  assert.match(writeoffMigration, /SET status='waived'/);
  assert.match(creditRouter, /post\('\/loans\/:loanId\/writeoffs'/);
  assert.match(creditRouter, /The write-off must cover the full current Edir principal balance/);
  assert.match(creditRouter, /mapping\.loss_ledger_id/);
});

test('Edir loan application, acceptance and disbursement require independently reviewed KYC',()=>{
  assert.match(migrationRunner,/afrolife-edir-v12-member-kyc-review/);
  assert.match(kycMigration,/Edir KYC review requires an independent authorized reviewer and reason/);
  assert.match(kycMigration,/edir_loan_acceptance_kyc_guard/);
  assert.match(kycMigration,/edir_loan_operation_disbursement_kyc_guard/);
  assert.match(creditRouter,/Edir member KYC must be independently verified before applying for credit/);
  assert.match(creditRouter,/Edir member KYC must remain verified before accepting the loan offer/);
  assert.match(creditRouter,/members\/:memberId\/kyc-review/);
});

test('Edir KYC guard reads honor member and staff SELECT policies without row-lock visibility',()=>{
  assert.match(migrationRunner,/afrolife-edir-v15-rls-safe-kyc-guards/);
  assert.match(rlsSafeKycMigration,/CREATE OR REPLACE FUNCTION edir_require_verified_member_kyc_for_acceptance/);
  assert.match(rlsSafeKycMigration,/CREATE OR REPLACE FUNCTION edir_require_verified_member_kyc_for_disbursement/);
  assert.doesNotMatch(rlsSafeKycMigration,/FROM edir_memberships[\s\S]{0,120}FOR UPDATE/);
});

test('Edir write-off changes loan state only after its journal is posted',()=>{
  assert.match(migrationRunner,/afrolife-edir-v16-atomic-writeoff-posting/);
  assert.match(atomicWriteoffMigration,/AFTER UPDATE OF status ON edir_loan_journals/);
  assert.match(atomicWriteoffMigration,/UPDATE edir_loans SET status='written_off'/);
  assert.match(atomicWriteoffMigration,/status='posted'/);
});

test('Edir removes only the observed duplicate legacy status constraint',()=>{
  assert.match(migrationRunner,/afrolife-edir-v17-remove-stale-loan-status-check/);
  assert.match(staleLoanStatusMigration,/conname='edir_loans_check1'/);
  assert.match(staleLoanStatusMigration,/Unexpected edir_loans_check1 definition; refusing to remove it/);
});

test('Edir removes only the observed duplicate pre-waiver installment constraint',()=>{
  assert.match(migrationRunner,/afrolife-edir-v18-remove-stale-installment-check/);
  assert.match(staleInstallmentMigration,/conname='edir_loan_installments_check1'/);
  assert.match(staleInstallmentMigration,/Unexpected edir_loan_installments_check1 definition; refusing to remove it/);
});

test('Edir identity documents require independent review and a verified national ID before KYC approval',()=>{
  assert.match(migrationRunner,/afrolife-edir-v13-loan-documents/);
  assert.match(documentMigration,/CREATE TABLE edir_loan_documents/);
  assert.match(documentMigration,/size_bytes BETWEEN 1 AND 10485760/);
  assert.match(documentMigration,/edir_loan_document_guard/);
  assert.match(documentMigration,/edir_membership_national_id_kyc_guard/);
  assert.match(creditRouter,/post\('\/documents\/:documentType'/);
  assert.match(creditRouter,/documents\/\:documentId\/review/);
});
