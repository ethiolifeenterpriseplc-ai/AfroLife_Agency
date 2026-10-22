import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessMigrationReadiness, assertMigrationChecksum, migrationChecksum } from '../src/migration-checksums.js';

const insuranceGrants = readFileSync(new URL('../migrations/039_insurance_ledger_runtime_grants.sql', import.meta.url), 'utf8');
const authSessions = readFileSync(new URL('../migrations/040_auth_sessions.sql', import.meta.url), 'utf8');
const mfiComplaints = readFileSync(new URL('../migrations/043_mfi_customer_complaints.sql', import.meta.url), 'utf8');
const mfiRiskFlags = readFileSync(new URL('../migrations/044_mfi_member_risk_controls.sql', import.meta.url), 'utf8');
const mfiDailyLimits = readFileSync(new URL('../migrations/045_mfi_daily_disbursement_limits.sql', import.meta.url), 'utf8');
const mfiKyc = readFileSync(new URL('../migrations/046_mfi_member_kyc_review.sql', import.meta.url), 'utf8');
const mfiDocuments = readFileSync(new URL('../migrations/047_mfi_loan_documents.sql', import.meta.url), 'utf8');
const mfiWriteoffs = readFileSync(new URL('../migrations/048_mfi_loan_writeoffs.sql', import.meta.url), 'utf8');
const mfiWriteoffActorControls = readFileSync(new URL('../migrations/049_mfi_writeoff_actor_controls.sql', import.meta.url), 'utf8');
const mfiRouter = readFileSync(new URL('../src/mfi.ts', import.meta.url), 'utf8');
const leadProtection = readFileSync(new URL('../migrations/052_lead_protection_and_attribution_history.sql', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
const mfiSandbox = readFileSync(new URL('../migrations/053_mfi_sandbox_simulations.sql', import.meta.url), 'utf8');
const agentScopedStaffing = readFileSync(new URL('../migrations/054_agent_scoped_staffing_matches.sql', import.meta.url), 'utf8');
const agentFinancialFacilitation = readFileSync(new URL('../migrations/055_agent_financial_facilitation.sql', import.meta.url), 'utf8');
const rentRlsRecursionFix = readFileSync(new URL('../migrations/058_rent_rls_recursion_fix.sql', import.meta.url), 'utf8');
const userAccessHistory = readFileSync(new URL('../migrations/059_user_access_history.sql', import.meta.url), 'utf8');
const leaseLifecycle = readFileSync(new URL('../migrations/060_lease_lifecycle.sql', import.meta.url), 'utf8');
const leaseNoticeRecords = readFileSync(new URL('../migrations/061_lease_notice_records.sql', import.meta.url), 'utf8');
const financeAndIdentityControls = readFileSync(new URL('../migrations/064_finance_and_identity_controls.sql', import.meta.url), 'utf8');
const ownerRentTransactionRead = readFileSync(new URL('../migrations/065_owner_rent_transaction_read.sql', import.meta.url), 'utf8');
const readinessEvidence = readFileSync(new URL('../migrations/066_readiness_evidence.sql', import.meta.url), 'utf8');
const globalAdminReleaseApprovalRole = readFileSync(new URL('../migrations/067_global_admin_release_approval_role.sql', import.meta.url), 'utf8');
const insuranceAgentReferrals = readFileSync(new URL('../migrations/068_insurance_agent_referrals.sql', import.meta.url), 'utf8');
const insuranceBrokerageSandbox = readFileSync(new URL('../migrations/069_insurance_brokerage_sandbox.sql', import.meta.url), 'utf8');
const insuranceRequests = readFileSync(new URL('../src/insurance-requests.ts', import.meta.url), 'utf8');
const insuranceBrokerageSandboxRouter = readFileSync(new URL('../src/insurance-brokerage-sandbox.ts', import.meta.url), 'utf8');
const operations = readFileSync(new URL('../src/ops.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/admin.ts', import.meta.url), 'utf8');
const coreMigrator = readFileSync(new URL('../src/migrate.ts', import.meta.url), 'utf8');
const accountingMigrator = readFileSync(new URL('../services/accounting/migrate.ts', import.meta.url), 'utf8');

test('migration runners persist and enforce immutable SQL checksums', () => {
  const checksum = migrationChecksum('SELECT 1;');
  assert.match(checksum, /^[0-9a-f]{64}$/);
  assert.doesNotThrow(() => assertMigrationChecksum('001_example.sql', checksum, checksum));
  assert.doesNotThrow(() => assertMigrationChecksum('001_legacy.sql', null, checksum));
  assert.throws(
    () => assertMigrationChecksum('001_example.sql', checksum, migrationChecksum('SELECT 2;')),
    /has changed since it was applied/,
  );
  const expected = [
    { name: '001_first.sql', checksum: migrationChecksum('SELECT 1;') },
    { name: '002_second.sql', checksum: migrationChecksum('SELECT 2;') },
  ];
  assert.deepEqual(assessMigrationReadiness(expected, expected), {
    current: true,
    applied: 2,
    expected: 2,
    checksumMismatches: 0,
    checksumsUnverified: 0,
    unexpectedMigrations: 0,
  });
  assert.deepEqual(
    assessMigrationReadiness(expected, [
      { name: '001_first.sql', checksum: migrationChecksum('SELECT 0;') },
      { name: '002_second.sql', checksum: null },
      { name: '003_unexpected.sql', checksum: migrationChecksum('SELECT 3;') },
    ]),
    {
      current: false,
      applied: 2,
      expected: 2,
      checksumMismatches: 1,
      checksumsUnverified: 1,
      unexpectedMigrations: 1,
    },
  );
  assert.match(coreMigrator, /ADD COLUMN IF NOT EXISTS checksum text/);
  assert.match(coreMigrator, /INSERT INTO schema_migrations \(name,checksum\)/);
  assert.match(coreMigrator, /pg_advisory_lock\(71924211,1\)/);
  assert.match(accountingMigrator, /ADD COLUMN IF NOT EXISTS checksum text/);
  assert.match(accountingMigrator, /INSERT INTO accounting_service_migrations\(version,checksum\)/);
  assert.match(accountingMigrator, /pg_advisory_lock\(71924211,2\)/);
  assert.match(server, /SELECT name, checksum FROM schema_migrations/);
  assert.match(server, /assessMigrationReadiness\(expectedMigrations, appliedRows\.rows\)/);
});

test('central Insurance ledger grants match service operations and identity sequences', () => {
  for (const revoke of [
    'REVOKE ALL ON TABLE insurance_ledger_accounts FROM "{{role}}"',
    'REVOKE ALL ON TABLE insurance_ledger_journals FROM "{{role}}"',
    'REVOKE ALL ON TABLE insurance_ledger_lines FROM "{{role}}"',
    'REVOKE ALL ON TABLE insurance_ledger_audit FROM "{{role}}"',
    'REVOKE ALL ON SEQUENCE insurance_ledger_lines_id_seq FROM "{{role}}"',
    'REVOKE ALL ON SEQUENCE insurance_ledger_audit_id_seq FROM "{{role}}"',
  ]) {
    assert.ok(insuranceGrants.includes(revoke), `missing least-privilege reset: ${revoke}`);
  }
  for (const grant of [
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_accounts TO "{{role}}"',
    'GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_journals TO "{{role}}"',
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_lines TO "{{role}}"',
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_audit TO "{{role}}"',
    'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_lines_id_seq TO "{{role}}"',
    'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_audit_id_seq TO "{{role}}"',
  ]) {
    assert.ok(insuranceGrants.includes(grant), `missing expected least-privilege grant: ${grant}`);
  }
  assert.doesNotMatch(insuranceGrants, /ALL PRIVILEGES|GRANT .* DELETE ON TABLE insurance_ledger_/);
});

test('auth session storage is runtime-role scoped and records idle and absolute expiry', () => {
  assert.match(authSessions, /CREATE TABLE auth_sessions/);
  assert.match(authSessions, /user_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(authSessions, /last_activity_at timestamptz NOT NULL/);
  assert.match(authSessions, /expires_at timestamptz NOT NULL/);
  assert.match(authSessions, /revoked_at timestamptz/);
  assert.match(authSessions, /REVOKE ALL ON TABLE auth_sessions FROM PUBLIC/);
  assert.match(authSessions, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth_sessions TO "\{\{role\}\}"/);
});

test('effective user access history captures role and activation changes and is append-only', () => {
  assert.match(userAccessHistory, /CREATE TABLE user_access_history/);
  assert.match(userAccessHistory, /role_after text NOT NULL/);
  assert.match(userAccessHistory, /INSERT INTO user_access_history[\s\S]*?SELECT id, role, active/);
  assert.match(userAccessHistory, /CREATE TRIGGER users_capture_initial_access/);
  assert.match(userAccessHistory, /CREATE TRIGGER users_record_access_history/);
  assert.match(userAccessHistory, /current_setting\('app\.user_id', true\)/);
  assert.match(userAccessHistory, /current_setting\('app\.access_change_reason', true\)/);
  assert.match(userAccessHistory, /SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, pg_temp/);
  assert.match(userAccessHistory, /user_access_history_owner_insert/);
  assert.match(userAccessHistory, /User access history is append-only/);
  assert.match(userAccessHistory, /GRANT SELECT ON TABLE user_access_history/);
  assert.match(userAccessHistory, /REVOKE ALL ON TABLE user_access_history FROM "\{\{role\}\}"/);
  assert.match(admin, /\/users\/:id\/access-history/);
  assert.match(admin, /\/role-access\/history/);
});

test('Insurance Agent referrals require separate customer consent and stay non-binding and hierarchy-scoped', () => {
  assert.match(insuranceAgentReferrals, /customer_consented_at timestamptz NOT NULL/);
  assert.match(insuranceAgentReferrals, /customer_withdrew/);
  assert.match(insuranceAgentReferrals, /insurance_agent_referral_customer_withdraw/);
  assert.match(insuranceAgentReferrals, /CREATE TABLE insurance_agent_referral_events/);
  assert.match(insuranceAgentReferrals, /Insurance agent referral events are append-only/);
  assert.match(insuranceAgentReferrals, /REVOKE ALL ON TABLE insurance_agent_referral_events FROM "\{\{role\}\}"/);
  assert.match(insuranceAgentReferrals, /insurance_agent_referral_read/);
  assert.match(insuranceAgentReferrals, /assigned_agent_id IS NOT NULL\s+AND app_can_access_agent\(assigned_agent_id\)/);
  assert.match(insuranceAgentReferrals, /insurance_agent_referral_staff_access\(\)/);
  assert.match(insuranceAgentReferrals, /Insurance agent referral history cannot be deleted/);
  assert.match(insuranceAgentReferrals, /Insurance referral updates are limited to the assigned Agent’s non-binding follow-up/);
  assert.match(insuranceAgentReferrals, /GRANT SELECT, INSERT, UPDATE ON insurance_agent_referrals/);
  assert.doesNotMatch(insuranceAgentReferrals, /GRANT .*DELETE ON insurance_agent_referrals/);
  assert.match(insuranceRequests, /agent_referral_consent: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(insuranceRequests, /if \(body\.agent_referral_consent\)/);
  assert.match(insuranceRequests, /referred_to_insurance_team/);
});

test('Insurance brokerage lifecycle sandbox is synthetic-only, append-only, and disabled in production', () => {
  assert.match(insuranceBrokerageSandbox, /sandbox_only boolean NOT NULL DEFAULT true CHECK \(sandbox_only\)/);
  assert.match(insuranceBrokerageSandbox, /insurance_brokerage_sandbox_event_immutable/);
  assert.match(insuranceBrokerageSandbox, /Insurance brokerage sandbox events are append-only/);
  assert.match(insuranceBrokerageSandbox, /FORCE ROW LEVEL SECURITY/);
  assert.match(insuranceBrokerageSandbox, /REVOKE ALL ON TABLE insurance_brokerage_sandbox_cases FROM "\{\{role\}\}"/);
  assert.match(insuranceBrokerageSandbox, /REVOKE ALL ON TABLE insurance_brokerage_sandbox_events FROM "\{\{role\}\}"/);
  assert.match(insuranceBrokerageSandbox, /GRANT SELECT, INSERT ON insurance_brokerage_sandbox_events/);
  assert.doesNotMatch(insuranceBrokerageSandbox, /GRANT .*UPDATE ON insurance_brokerage_sandbox_events/);
  assert.doesNotMatch(insuranceBrokerageSandbox, /GRANT .*DELETE ON insurance_brokerage_sandbox/);
  assert.match(insuranceBrokerageSandboxRouter, /environment\.NODE_ENV !== 'production'/);
  assert.match(insuranceBrokerageSandboxRouter, /environment\.INSURANCE_BROKERAGE_MODE === 'sandbox'/);
  assert.match(insuranceBrokerageSandboxRouter, /production_activities_enabled: false/);
  for (const activity of [
    'advice_review_simulated','product_comparison_simulated','quote_generated_simulated',
    'policy_issuance_simulated','policy_change_simulated','premium_receipt_simulated',
    'commission_settlement_simulated','claim_decision_simulated',
  ]) {
    assert.ok(insuranceBrokerageSandboxRouter.includes(activity), `sandbox lifecycle missing ${activity}`);
  }
  assert.doesNotMatch(insuranceBrokerageSandboxRouter, /createServiceGateway|fetch\(|paymentWebhook|INSURANCE_SERVICE_URL/);
});

test('MFI customer complaints are tenant-scoped and require documented resolution to close', () => {
  assert.match(mfiComplaints, /CREATE TABLE mfi_customer_complaints/);
  assert.match(mfiComplaints, /FOREIGN KEY \(institution_id,member_id\)/);
  assert.match(mfiComplaints, /mfi_customer_complaint_scope/);
  assert.match(mfiComplaints, /resolution_due_at timestamptz/);
  assert.match(mfiComplaints, /status IN \('resolved','rejected'\) AND resolution IS NOT NULL/);
  assert.match(mfiComplaints, /GRANT SELECT,INSERT,UPDATE ON TABLE mfi_customer_complaints/);
});

test('MFI risk holds require independent review and immutable release evidence', () => {
  assert.match(mfiRiskFlags, /CREATE TABLE mfi_member_risk_flags/);
  assert.match(mfiRiskFlags, /mfi_member_risk_scope/);
  assert.match(mfiRiskFlags, /Risk flag review requires an independent actor and reason/);
  assert.match(mfiRiskFlags, /Risk hold release requires an independent actor and reason/);
  assert.match(mfiRiskFlags, /Member risk history cannot be deleted/);
});

test('MFI daily disbursement cap is versioned and checked at serialized posting', () => {
  assert.match(mfiDailyLimits,/CREATE TABLE mfi_disbursement_limit_versions/);
  assert.match(mfiDailyLimits,/Limit decision requires an independent reviewer and reason/);
  assert.match(mfiDailyLimits,/CREATE UNIQUE INDEX mfi_disbursement_limit_one_active_idx/);
  assert.match(mfiRouter,/mfi_disbursement_limit_versions WHERE institution_id=\$1 AND status='active'/);
  assert.match(mfiRouter,/approved daily institution disbursement limit would be exceeded/);
});

test('MFI trial balance supports formula-safe CSV exports', () => {
  assert.match(mfiRouter, /reports\/trial-balance/);
  assert.match(mfiRouter, /format.*enum\(\['json','csv'\]\)/);
  assert.match(mfiRouter, /toCsv\(rows, \['account_code','account_name','account_type','debits','credits','balance'\]\)/);
});

test('lead ownership protection and reassignment are configurable, reasoned, and append-only', () => {
  assert.match(leadProtection, /lead_protection_days', 90/);
  assert.match(leadProtection, /protected_until/);
  assert.match(leadProtection, /lead_attribution_history/);
  assert.match(leadProtection, /AFTER INSERT OR UPDATE ON leads/);
  assert.match(leadProtection, /Lead attribution history is append-only/);
  assert.match(leadProtection, /leads_platform_reassignment/);
  assert.match(server, /INSERT INTO leads \(lead_type, name, phone, source_agent_id, protected_until\)/);
  assert.match(server, /\/admin\/leads\/:id\/reassign/);
  assert.match(server, /target_agent_id: z\.string\(\)\.uuid\(\), reason: z\.string\(\)\.trim\(\)\.min\(10\)/);
  assert.match(leadProtection, /lead_has_non_cancelled_contract\(uuid\)/);
  assert.match(leadProtection, /Platform administrator access is required/);
  assert.match(server, /lead_has_non_cancelled_contract\(\$1\) AS has_contract/);
  assert.match(server, /contract\.rows\[0\]\.has_contract\) throw new HttpError\(409, 'A lead with a non-cancelled contract cannot be reassigned'/);
});

test('agent staffing lifecycle access is limited to the agent hierarchy', () => {
  assert.match(agentScopedStaffing, /workers_agent_reservation_update/);
  assert.match(agentScopedStaffing, /job_requests_agent_lifecycle_update/);
  assert.match(agentScopedStaffing, /CREATE POLICY matches_scope ON matches/);
  assert.match(agentScopedStaffing, /app_role\(\) IN \('master_agent','field_agent'\)/);
  assert.match(agentScopedStaffing, /app_can_access_agent\(source_agent_id\)/);
  assert.match(agentScopedStaffing, /app_can_access_agent\(r\.source_agent_id\)/);
  assert.doesNotMatch(agentScopedStaffing, /GRANT\s+ALL|BYPASSRLS/i);
});

test('agents can only submit scoped pending rent and deposit transactions', () => {
  assert.match(agentFinancialFacilitation, /rent_transactions_read_scope/);
  assert.match(agentFinancialFacilitation, /rent_transactions_staff_write/);
  assert.match(agentFinancialFacilitation, /rent_transactions_agent_facilitation/);
  assert.match(agentFinancialFacilitation, /FOR INSERT/);
  assert.match(agentFinancialFacilitation, /recorded_by = app_user_id\(\)/);
  assert.match(agentFinancialFacilitation, /status = 'pending'/);
  assert.match(agentFinancialFacilitation, /kind = 'rent'/);
  assert.match(agentFinancialFacilitation, /kind = 'deposit'/);
  assert.match(agentFinancialFacilitation, /app_can_access_agent\(l\.source_agent_id\)/);
  assert.match(operations, /ops\.post\('\/charges\/:id\/pay', requireActivity\('rent\.payments\.submit'\)/);
  assert.match(operations, /ops\.post\('\/leases\/:id\/deposit\/pay', requireActivity\('rent\.payments\.submit'\)/);
  assert.match(operations, /ops\.post\('\/leases\/:id\/deposit\/refund', requireActivity\('rent\.deposit\.refund_request'\)/);
  assert.match(operations, /ops\.post\('\/rent-transactions\/:id\/reconcile', requireActivity\('rent\.transactions\.reconcile'\)/);
});

test('property owners can read rent transactions only for their own statements', () => {
  assert.match(ownerRentTransactionRead, /CREATE POLICY rent_transactions_owner_read ON rent_transactions/);
  assert.match(ownerRentTransactionRead, /FOR SELECT/);
  assert.match(ownerRentTransactionRead, /app_role\(\) = 'property_owner'/);
  assert.match(ownerRentTransactionRead, /p\.owner_user_id = app_user_id\(\)/);
  assert.doesNotMatch(ownerRentTransactionRead, /FOR (?:ALL|INSERT|UPDATE|DELETE)/);
});

test('lease lifecycle evidence is scoped and append-only while the legacy lease route remains intact', () => {
  assert.match(leaseLifecycle, /CREATE TABLE lease_documents/);
  assert.match(leaseLifecycle, /CREATE TABLE lease_versions/);
  assert.match(leaseLifecycle, /CREATE TABLE lease_lifecycle_events/);
  assert.match(leaseLifecycle, /Lease lifecycle evidence is append-only/);
  assert.match(leaseLifecycle, /ENABLE ROW LEVEL SECURITY/);
  assert.match(leaseLifecycle, /FORCE ROW LEVEL SECURITY/);
  assert.match(leaseLifecycle, /lease_versions_scope/);
  assert.match(leaseLifecycle, /lease_lifecycle_events_insert/);
  assert.match(leaseLifecycle, /property_units_lifecycle_execute/);
  assert.match(leaseLifecycle, /rent_charges_lifecycle_insert/);
  assert.match(leaseLifecycle, /property\.tenancy\.approve/);
  assert.match(leaseLifecycle, /property\.tenancy\.execute/);
  assert.match(leaseLifecycle, /Existing lease state captured during additive lifecycle migration/);
  assert.match(leaseLifecycle, /Versioned lease terms are immutable/);
  assert.match(operations, /ops\.post\('\/leases\/workflow', requireActivity\('property\.tenancy\.manage'\)/);
  assert.match(operations, /ops\.post\('\/leases\/:id\/approve', requireActivity\('property\.tenancy\.approve'\)/);
  assert.match(operations, /ops\.post\('\/leases\/:id\/execute', requireActivity\('property\.tenancy\.execute'\)/);
  assert.match(operations, /ops\.post\('\/leases', requireActivity\('property\.tenancy\.manage'\)/);
  assert.match(operations, /signature_evidence_only: true/);
  const signatureDownloadRoute = operations.split("ops.get('/lease-signature-documents/:id/file'")[1]
    ?.split("ops.post('/leases/:id/execute'")[0] ?? '';
  assert.match(signatureDownloadRoute, /SELECT id,lease_id,storage_key,mime FROM lease_documents/);
  assert.match(signatureDownloadRoute, /lease_signature_evidence_downloaded/);
  assert.match(signatureDownloadRoute, /document_id: row\.id/);
});

test('lease notice records are scoped, append-only, idempotent, and non-terminating', () => {
  assert.match(leaseNoticeRecords, /CREATE TABLE lease_notices/);
  assert.match(leaseNoticeRecords, /UNIQUE \(lease_id, idempotency_key\)/);
  assert.match(leaseNoticeRecords, /ENABLE ROW LEVEL SECURITY/);
  assert.match(leaseNoticeRecords, /FORCE ROW LEVEL SECURITY/);
  assert.match(leaseNoticeRecords, /Lease notice records are append-only/);
  assert.match(leaseNoticeRecords, /GRANT SELECT, INSERT ON TABLE lease_notices/);
  assert.match(operations, /ops\.post\('\/leases\/:id\/notices', requireActivity\('property\.tenancy\.manage'\)/);
  assert.match(operations, /legal_effect: 'record_only'/);
  assert.match(operations, /ON CONFLICT \(lease_id,idempotency_key\) DO NOTHING/);
  assert.match(operations, /ops\.get\('\/leases\/:id\/notices'/);
});

test('service identity lifecycle evidence and release approvals are platform-admin scoped', () => {
  assert.match(financeAndIdentityControls, /service_identity_events/);
  assert.match(financeAndIdentityControls, /Service identity events are append-only/);
  assert.match(financeAndIdentityControls, /ALTER TABLE service_identities FORCE ROW LEVEL SECURITY/);
  assert.match(financeAndIdentityControls, /app_role\(\) IN \('global_admin','super_admin'\)/);
  assert.ok(financeAndIdentityControls.includes("secret_manager_reference ~ '^(vault|aws-sm|azure-kv)://[A-Za-z0-9._/-]+$'"));
  assert.match(financeAndIdentityControls, /ALTER TABLE release_approvals FORCE ROW LEVEL SECURITY/);
  assert.match(financeAndIdentityControls, /approver_role = app_role\(\)/);
  assert.match(financeAndIdentityControls, /approver_name = \(SELECT legal_name FROM users WHERE id=app_user_id\(\)\)/);
  assert.match(operations, /ops\.post\('\/service-identities\/:id\/rotate', requireRole\('super_admin', 'global_admin'\)/);
  assert.match(operations, /ops\.post\('\/service-identities\/:id\/retire', requireRole\('super_admin', 'global_admin'\)/);
});

test('production readiness evidence is append-only and platform-admin scoped', () => {
  assert.match(readinessEvidence, /CREATE TABLE release_readiness_evidence/);
  assert.match(readinessEvidence, /ENABLE ROW LEVEL SECURITY/);
  assert.match(readinessEvidence, /FORCE ROW LEVEL SECURITY/);
  assert.match(readinessEvidence, /Release readiness evidence is append-only/);
  assert.match(readinessEvidence, /recorded_by = app_user_id\(\)/);
  assert.match(readinessEvidence, /recorded_by_role = coalesce\(nullif\(current_setting\('app\.role', true\), ''\), ''\)/);
  assert.match(readinessEvidence, /REVOKE ALL ON TABLE release_readiness_evidence FROM "\{\{role\}\}"/);
  assert.match(readinessEvidence, /GRANT SELECT, INSERT ON TABLE release_readiness_evidence TO "\{\{role\}\}"/);
  assert.match(operations, /ops\.post\('\/readiness-evidence', requireRole\('super_admin','global_admin'\)/);
  assert.match(operations, /ops\.get\('\/readiness-evidence', requireRole\('super_admin','global_admin'\)/);
});

test('global admin release approvals compare the raw authenticated role', () => {
  assert.match(globalAdminReleaseApprovalRole, /DROP POLICY release_approvals_insert/);
  assert.match(globalAdminReleaseApprovalRole, /approver_role = coalesce\(nullif\(current_setting\('app\.role', true\), ''\), ''\)/);
  assert.match(globalAdminReleaseApprovalRole, /approver_name = \(SELECT legal_name FROM users WHERE id=app_user_id\(\)\)/);
});

test('rent submission RLS relies on unique indexes instead of recursive self-queries', () => {
  assert.match(rentRlsRecursionFix, /DROP POLICY rent_transactions_agent_facilitation ON rent_transactions/);
  assert.match(rentRlsRecursionFix, /DROP POLICY rent_transactions_activity_submit ON rent_transactions/);
  assert.doesNotMatch(rentRlsRecursionFix, /FROM rent_transactions prior/);
  assert.match(rentRlsRecursionFix, /app_can_access_agent\(l\.source_agent_id\)/);
});

test('MFI sandbox runs are tenant-scoped, append-only, and cannot carry real provider effects', () => {
  assert.match(mfiSandbox, /CREATE TABLE mfi_sandbox_runs/);
  assert.match(mfiSandbox, /ENABLE ROW LEVEL SECURITY/);
  assert.match(mfiSandbox, /FORCE ROW LEVEL SECURITY/);
  assert.match(mfiSandbox, /mfi_has_access\(institution_id\)/);
  assert.match(mfiSandbox, /production_side_effects'='false'/);
  assert.match(mfiSandbox, /real_customer_data_used'='false'/);
  assert.match(mfiSandbox, /SELECT,INSERT ON TABLE mfi_sandbox_runs/);
  assert.match(mfiSandbox, /Sandbox simulation records are append-only/);
  assert.match(mfiRouter, /mfi_sandbox_simulation_run/);
});

test('MFI loan application and disbursement require independently reviewed member KYC', () => {
  assert.match(mfiKyc,/CREATE FUNCTION mfi_guard_member_kyc_review/);
  assert.match(mfiKyc,/KYC review requires an independent reviewer and documented reason/);
  assert.match(mfiKyc,/mfi_journal_disbursement_kyc_guard/);
  assert.match(mfiRouter,/Member KYC must be independently verified before applying for credit/);
  assert.match(mfiRouter,/Member KYC must be independently verified before disbursement/);
  assert.match(mfiRouter,/members\/:memberId\/kyc-review/);
});

test('MFI identity documents require independent review and a verified national ID before KYC approval', () => {
  assert.match(mfiDocuments, /CREATE TABLE mfi_loan_documents/);
  assert.match(mfiDocuments, /size_bytes BETWEEN 1 AND 10485760/);
  assert.match(mfiDocuments, /mfi_loan_document_guard/);
  assert.match(mfiDocuments, /mfi_member_national_id_kyc_guard/);
  assert.match(mfiRouter, /members\/:memberId\/documents\/:documentType/);
  assert.match(mfiRouter, /documents\/:documentId\/review/);
});

test('MFI loan write-offs require an independent authorized decision and a linked balanced loss journal', () => {
  assert.match(mfiWriteoffs, /CREATE TABLE mfi_loan_writeoffs/);
  assert.match(mfiWriteoffs, /Loan write-off journal must match a pending independently reviewed request/);
  assert.match(mfiWriteoffs, /mfi_journals_writeoff_link_check/);
  assert.match(mfiWriteoffActorControls, /mfi_user_has_role\(NEW\.institution_id,ARRAY\['institution_admin','finance_manager','compliance'\]\)/);
  assert.match(mfiWriteoffActorControls, /Loan write-off decision requires an independent authorized reviewer and reason/);
  assert.match(mfiRouter, /mfi_loan_writeoffs/);
  assert.match(mfiRouter, /loan_writeoff/);
  assert.match(mfiRouter, /post\('\/institutions\/:institutionId\/loans\/:loanId\/writeoffs'/);
  assert.match(mfiRouter, /post\('\/institutions\/:institutionId\/writeoffs\/:writeoffId\/decision'/);
});
