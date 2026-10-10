import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const insuranceGrants = readFileSync(new URL('../migrations/039_insurance_ledger_runtime_grants.sql', import.meta.url), 'utf8');
const authSessions = readFileSync(new URL('../migrations/040_auth_sessions.sql', import.meta.url), 'utf8');

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
