import test from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';
import { router as workforceManagement } from '../src/workforce-management.js';
import { router as staffing } from '../src/staffing.js';
import { router as propertyManagement } from '../src/property-management.js';
import { router as marketplace } from '../src/marketplace.js';
import { router as workforceManagementService } from '../services/workforce-management/router.js';
import { router as staffingService } from '../services/staffing/router.js';
import { router as propertyManagementService } from '../services/property-management/router.js';
import { router as marketplaceService } from '../services/marketplace/router.js';

function assertRouterOwnsOnly(router: Router, prefixes: string[]) {
  const paths = router.stack.flatMap((layer) => (layer.route ? [layer.route.path] : []));
  assert.ok(paths.length > 0, 'service router should register routes');
  for (const path of paths) {
    assert.equal(typeof path, 'string');
    assert.ok(prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)), `unexpected route ${path}`);
  }
}

test('workforce management router contains only worker and document routes', () => {
  assert.equal(workforceManagement, workforceManagementService);
  assertRouterOwnsOnly(workforceManagement, ['/workers', '/documents']);
});

test('staffing router contains only request and match routes', () => {
  assert.equal(staffing, staffingService);
  assertRouterOwnsOnly(staffing, ['/requests', '/matches']);
});

test('property management and marketplace routers stay in their own domains', () => {
  assert.equal(propertyManagement, propertyManagementService);
  assert.equal(marketplace, marketplaceService);
  assertRouterOwnsOnly(propertyManagement, ['/properties']);
  assertRouterOwnsOnly(marketplace, ['/marketplace']);
});
