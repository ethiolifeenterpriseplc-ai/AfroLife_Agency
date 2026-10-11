import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
