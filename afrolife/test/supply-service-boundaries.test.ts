import test from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';
import { router as workerManagement } from '../src/worker-management.js';
import { router as staffing } from '../src/staffing.js';
import { router as propertyManagement } from '../src/property-management.js';
import { router as marketplace } from '../src/marketplace.js';

function assertRouterOwnsOnly(router: Router, prefixes: string[]) {
  const paths = router.stack.flatMap((layer) => (layer.route ? [layer.route.path] : []));
  assert.ok(paths.length > 0, 'service router should register routes');
  for (const path of paths) {
    assert.equal(typeof path, 'string');
    assert.ok(prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)), `unexpected route ${path}`);
  }
}

test('worker management router contains only worker and document routes', () => {
  assertRouterOwnsOnly(workerManagement, ['/workers', '/documents']);
});

test('staffing router contains only request and match routes', () => {
  assertRouterOwnsOnly(staffing, ['/requests', '/matches']);
});

test('property management and marketplace routers stay in their own domains', () => {
  assertRouterOwnsOnly(propertyManagement, ['/properties']);
  assertRouterOwnsOnly(marketplace, ['/marketplace']);
});
