import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/038_global_admin_insurance_access.sql', import.meta.url), 'utf8');

test('Insurance RLS policies consistently authorize platform Global Admin access', () => {
  for (const policy of [
    'insurance_org_catalog',
    'insurance_org_master_create',
    'insurance_org_master_update',
    'insurance_staff_self_read',
    'insurance_staff_manage',
    'insurance_ledger_accounts_read',
    'insurance_ledger_accounts_create',
    'insurance_ledger_journals_read',
    'insurance_ledger_journals_create',
    'insurance_ledger_journals_decide',
    'insurance_ledger_lines_read',
    'insurance_ledger_lines_create',
    'insurance_ledger_audit_read',
    'insurance_ledger_audit_create',
  ]) {
    const policySql = migration.split(`CREATE POLICY ${policy}`)[1]?.split(';')[0] ?? '';
    assert.match(policySql, /global_admin/);
  }
  assert.match(migration, /ARRAY\['insurance_ledger_accounts','insurance_ledger_journals','insurance_ledger_lines','insurance_ledger_audit'\]/);
  assert.match(migration, /organization_id=app_edir_id\(\) OR app_role\(\) IN \(''global_admin'',''super_admin''\)/);
});

test('Insurance policy approvals and journal-line ownership checks remain enforced', () => {
  assert.match(migration, /created_by=app_user_id\(\)/);
  assert.match(migration, /j\.status='draft' AND j\.created_by=app_user_id\(\)/);
});
