import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { adminRouter } from '../src/admin.js';
import {
  allowedMiniApps,
  hasMiniAppAccess,
  requireMiniAppAccess,
} from '../src/mini-app-access.js';
import type { AuthUser } from '../src/auth-types.js';

const user = (
  role: string,
  mode: 'role_default' | 'custom' = 'role_default',
  grants: AuthUser['miniAppGrants'] = [],
): AuthUser => ({
  id: '00000000-0000-4000-8000-000000000001',
  role,
  miniAppAccessMode: mode,
  miniAppGrants: grants,
});

test('custom mini-app grants narrow but never elevate role access', () => {
  assert.equal(hasMiniAppAccess(user('finance'), 'accounting'), true);
  assert.equal(hasMiniAppAccess(user('customer', 'custom', ['accounting']), 'accounting'), false);
  assert.equal(hasMiniAppAccess(user('finance', 'custom', []), 'accounting'), false);
  assert.equal(hasMiniAppAccess(user('finance', 'custom', ['global-bi']), 'global-bi'), true);
  assert.equal(hasMiniAppAccess(user('worker', 'custom', ['global-bi']), 'global-bi'), false);
});

test('allowed mini-apps intersect role ceiling, deployment modules and user grants', () => {
  assert.deepEqual(
    allowedMiniApps(user('field_agent', 'custom', ['workers', 'requests', 'global-bi']), [
      'workers', 'requests', 'global-bi', 'accounting',
    ]),
    ['workers', 'requests'],
  );
});

test('API middleware denies direct access when a custom assignment excludes the app', () => {
  const req = { user: user('finance', 'custom', []) } as Request;
  const res = {} as Response;
  let denied: unknown;
  requireMiniAppAccess('accounting')(req, res, (error?: unknown) => { denied = error; });
  assert.equal((denied as { status?: number }).status, 403);
});

test('mini-app access administration is exposed only through platform-admin handlers', () => {
  const routes = adminRouter.stack.flatMap((layer) => layer.route ? [{
    path: layer.route.path,
    methods: layer.route.methods,
  }] : []);
  assert.ok(routes.some((route) => route.path === '/users/:id/mini-app-access' && route.methods.get));
  assert.ok(routes.some((route) => route.path === '/users/:id/mini-app-access' && route.methods.put));
  const accessHandlers = routes.filter((route) => route.path === '/users/:id/mini-app-access');
  assert.equal(accessHandlers.length, 2);
});

test('mini-app assignment storage is RLS-protected and its audit is append-only', async () => {
  const migration = await readFile(new URL('../migrations/080_user_mini_app_access.sql', import.meta.url), 'utf8');
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /user_app_access_profiles_platform_admin_write/);
  assert.match(migration, /user_app_access_grants_platform_admin_write/);
  assert.match(migration, /prevent_user_app_access_audit_mutation/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE user_app_access_audit/);
});
