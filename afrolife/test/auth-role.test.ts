import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isPlatformAdminRole } from '../src/auth-types.js';

test('Global Admin and Super Admin share platform-administration classification', () => {
  assert.equal(isPlatformAdminRole('global_admin'), true);
  assert.equal(isPlatformAdminRole('super_admin'), true);
  assert.equal(isPlatformAdminRole('finance'), false);
});

test('Global Admin role migration preserves separate promotion and operational roles', async () => {
  const migration = await readFile(new URL('../migrations/027_global_admin_role.sql', import.meta.url), 'utf8');
  assert.match(migration, /'global_admin','super_admin'/);
  assert.match(migration, /CREATE TABLE global_admin_role_change_requests/);
  assert.match(migration, /approved_by <> requested_by/);
  assert.match(migration, /approved_by <> target_user_id/);
});

test('Global Admin promotion table is accessible to the restricted runtime under admin-only RLS', async () => {
  const migration = await readFile(new URL('../migrations/035_global_admin_runtime_access.sql', import.meta.url), 'utf8');
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(app_role\(\) = 'super_admin'\)/);
  assert.match(migration, /WITH CHECK \(app_role\(\) = 'super_admin'\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE global_admin_role_change_requests TO "\{\{role\}\}"/);
});
