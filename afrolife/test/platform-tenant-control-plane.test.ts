import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adminRouter } from '../src/admin.js';

const routes = adminRouter.stack.flatMap((layer) => (layer.route
  ? [{ path: layer.route.path, methods: layer.route.methods, handlers: layer.route.stack.map((entry) => entry.handle.name) }]
  : []));

test('platform control-plane endpoints exist and are guarded by the exact Global Admin role', () => {
  const paths = [
    '/platform/services',
    '/platform/services/:serviceKey',
    '/platform/service-packages',
    '/platform/service-packages/:packageId',
    '/platform/tenants',
    '/platform/tenants/:tenantId',
    '/platform/catalog-products',
    '/platform/catalog-products/:productId',
  ];
  for (const path of paths) {
    const route = routes.find((entry) => entry.path === path);
    assert.ok(route, `missing control-plane route ${path}`);
    assert.equal(route.handlers[0], 'requireGlobalAdmin', `${path} must reject tenant-scoped administrators`);
  }
});

test('tenant control-plane migration stores deployment references, never database credentials', async () => {
  const migration = await readFile(
    new URL('../migrations/070_platform_tenant_control_plane.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE platform_tenants/);
  assert.match(migration, /deployment_reference text/);
  assert.match(migration, /deployment_verification_reference text/);
  assert.doesNotMatch(migration, /database_url|connection_string|password text|secret text/i);
  assert.match(migration, /CHECK \(status <> 'active' OR deployment_status = 'verified'\)/);
  assert.match(migration, /CREATE TABLE platform_tenant_events/);
  assert.match(migration, /CREATE TABLE platform_catalog_product_events/);
  assert.match(migration, /platform_tenant_events_immutable/);
  assert.match(migration, /platform_catalog_product_events_immutable/);
  assert.match(migration, /current_setting\('app\.role', true\) = 'global_admin'/);
});

test('global catalog explicitly excludes regulated financial-product definitions', async () => {
  const migration = await readFile(
    new URL('../migrations/070_platform_tenant_control_plane.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /category IN \('catalog','marketplace','service_addon'\)/);
  assert.doesNotMatch(migration, /category IN \([^)]*(insurance|credit|loan|interest_rate|premium)/i);
});
