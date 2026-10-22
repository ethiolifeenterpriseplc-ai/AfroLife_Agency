import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkspaceServices, createApiMetrics } from '../src/workspace-status.ts';
import { isMiniAppAllowed, isPanelEnabled, panelFromUrl, panelUrl } from '../public/workspace-navigation.js';
import { MIN_SEARCH_QUERY_LENGTH, searchWorkspaceRecords } from '../public/workspace-search.js';
import { isGlobalBiUtcBucketBoundary, normalizeGlobalBiDashboard } from '../public/global-bi.js';
import { buildMiniAppAccessPayload } from '../public/mini-app-access.js';
import { normalizeAccountingTrendRows } from '../public/accounting-dashboard.js';
import { paginateRows } from '../public/row-pagination.js';

test('workspace deep links retain the current URL and only resolve visible panels', () => {
  assert.equal(panelFromUrl('https://agency.test/?panel=rent', new Set(['overview', 'rent'])), 'rent');
  assert.equal(panelFromUrl('https://agency.test/?panel=admin', new Set(['overview'])), 'overview');
  assert.equal(panelFromUrl('https://agency.test/?panel=unknown', new Set(['overview', 'rent'])), 'overview');
  assert.equal(panelUrl('/agency?campaign=staff#main', 'rent'), '/agency?campaign=staff&panel=rent#main');
  assert.equal(panelUrl('/agency?panel=rent#main', 'overview'), '/agency#main');
  assert.equal(isPanelEnabled('admin', []), true);
  assert.equal(isPanelEnabled('rent', ['leads']), false);
  assert.equal(isMiniAppAllowed('accounting', ['accounting']), true);
  assert.equal(isMiniAppAllowed('global-bi', []), false);
  assert.equal(isMiniAppAllowed('global-bi', undefined), false);
});

test('Global BI normalization preserves real empty-state values without filling sample metrics', () => {
  assert.deepEqual(normalizeGlobalBiDashboard({
    asOf: null,
    reportingTenants: 0,
    metrics: [],
    series: [],
  }), {
    grain: null,
    targetIntervalMinutes: null,
    asOf: null,
    oldestProjectionAt: null,
    projectionState: 'unknown',
    projectorConfiguration: 'unconfirmed',
    schedulerConfiguration: 'unconfirmed',
    tenantProjectorHealth: 'unconfirmed',
    reportingTenants: 0,
    metrics: [],
    series: [],
  });
  assert.deepEqual(normalizeGlobalBiDashboard({
    asOf: '2026-10-18T10:00:00Z',
    reportingTenants: null,
    grain: '30_minutes',
    targetIntervalMinutes: 30,
    projectionState: 'recent_projection_observed',
    projectorConfiguration: 'configured',
    schedulerConfiguration: 'configured',
    tenantProjectorHealth: 'unconfirmed',
    metrics: [{ key: 'posted_volume', value: '12.50', unit: 'ETB' }, { key: 5, value: 1, unit: 'count' }],
    series: [{ period: '2026-10', metric: 'posted_volume', value: '12.50' }, { period: 1, metric: 'ignored', value: 3 }],
  }), {
    grain: '30_minutes',
    targetIntervalMinutes: 30,
    asOf: '2026-10-18T10:00:00Z',
    oldestProjectionAt: null,
    projectionState: 'recent_projection_observed',
    projectorConfiguration: 'configured',
    schedulerConfiguration: 'configured',
    tenantProjectorHealth: 'unconfirmed',
    reportingTenants: null,
    metrics: [{ key: 'posted_volume', value: '12.50', unit: 'ETB' }],
    series: [{ period: '2026-10', metric: 'posted_volume', value: '12.50' }],
  });
  assert.equal(normalizeGlobalBiDashboard({
    grain: '30_minutes',
    targetIntervalMinutes: 60,
    metrics: [],
    series: [],
  }).grain, null);
  assert.equal(normalizeGlobalBiDashboard({
    grain: '30_minutes',
    targetIntervalMinutes: 30,
    projectionState: 'unrecognized',
    tenantProjectorHealth: 'healthy',
    metrics: [],
    series: [],
  }).projectionState, 'unknown');
  assert.equal(normalizeGlobalBiDashboard({
    grain: '30_minutes',
    targetIntervalMinutes: 30,
    tenantProjectorHealth: 'healthy',
    metrics: [],
    series: [],
  }).tenantProjectorHealth, 'unconfirmed');
});

test('Global BI range boundaries are validated after local-to-UTC conversion', () => {
  assert.equal(isGlobalBiUtcBucketBoundary(new Date('2026-10-21T09:30:00+03:00')), true);
  assert.equal(isGlobalBiUtcBucketBoundary(new Date('2026-10-21T09:45:00+03:00')), false);
  assert.equal(isGlobalBiUtcBucketBoundary(new Date('2026-10-21T09:30:01Z')), false);
  assert.equal(isGlobalBiUtcBucketBoundary(new Date('invalid')), false);
});

test('mini-app access payload reset clears custom modules and custom grants are deduplicated', () => {
  assert.deepEqual(buildMiniAppAccessPayload('role_default', ['accounting']), { mode: 'role_default', modules: [] });
  assert.deepEqual(buildMiniAppAccessPayload('custom', ['accounting', 'accounting', 'global-bi']), {
    mode: 'custom',
    modules: ['accounting', 'global-bi'],
  });
});

test('accounting chart accepts only returned monthly rows and does not synthesize values', () => {
  const monthly = [
    { month: '2026-10-01', posted_journals: 4, posted_volume: '950.00' },
    { posted_journals: 3, posted_volume: '500.00' },
    null,
  ];
  assert.deepEqual(normalizeAccountingTrendRows(monthly), [monthly[0]]);
  assert.deepEqual(normalizeAccountingTrendRows(undefined), []);
});

test('global workspace search matches literal input and normalized phone digits', () => {
  const records = [
    { title: 'Property 50% complete', searchable: ['Property 50% complete'], phones: [] },
    { title: 'Tenant account', searchable: ['Tenant account'], phones: ['+251 911 234 567'] },
  ];
  assert.equal(MIN_SEARCH_QUERY_LENGTH, 2);
  assert.deepEqual(searchWorkspaceRecords('%', records), []);
  assert.equal(searchWorkspaceRecords('50%', records)[0].title, 'Property 50% complete');
  assert.equal(searchWorkspaceRecords('911234', records)[0].title, 'Tenant account');
});

test('service status distinguishes integrated, disabled, unavailable, and healthy services', async () => {
  let fetchCalls = 0;
  const statuses = await checkWorkspaceServices([
    { id: 'legacy', name: 'Legacy service', enabled: true, withoutUrl: 'integrated' },
    { id: 'off', name: 'Disabled service', enabled: false, withoutUrl: 'disabled' },
    { id: 'up', name: 'Healthy service', enabled: true, url: 'http://127.0.0.1:3300/', withoutUrl: 'disabled' },
    { id: 'down', name: 'Unavailable service', enabled: true, url: 'http://127.0.0.1:3301', withoutUrl: 'disabled' },
  ], async (url) => {
    fetchCalls += 1;
    assert.equal(String(url), fetchCalls === 1 ? 'http://127.0.0.1:3300/healthz' : 'http://127.0.0.1:3301/healthz');
    return new Response(null, { status: fetchCalls === 1 ? 200 : 503 });
  }, () => assert.fail('A non-2xx status is not a thrown network error'));

  assert.deepEqual(statuses.map(({ id, status }) => [id, status]), [
    ['legacy', 'integrated'],
    ['off', 'disabled'],
    ['up', 'available'],
    ['down', 'unavailable'],
  ]);
  assert.equal(fetchCalls, 2);
});

test('a health-check network failure is reported without exposing service details', async () => {
  const logged = [];
  const status = await checkWorkspaceServices([
    { id: 'timeout', name: 'Slow service', enabled: true, url: 'http://127.0.0.1:3302', withoutUrl: 'disabled' },
  ], async () => { throw new Error('connection refused'); }, (name) => logged.push(name));
  assert.equal(status[0].status, 'unavailable');
  assert.deepEqual(logged, ['Slow service']);
  assert.equal(JSON.stringify(status).includes('connection refused'), false);
});

test('API metrics aggregate by route template and bound stored cardinality', () => {
  const metrics = createApiMetrics(3);
  const now = new Date('2026-10-18T10:00:00.000Z');
  metrics.record('get', '/api/v1/users/:id', 200, 20, now);
  metrics.record('GET', '/api/v1/users/:id', 503, 80, now);
  metrics.record('POST', '/api/v1/auth/login', 401, 4, now);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.length, 2);
  assert.ok(snapshot.some((metric) => metric.route === 'GET /api/v1/users/:id'));
  assert.equal(snapshot.some((metric) => metric.route.includes('4c8f')), false);
  assert.deepEqual(snapshot[0], {
    route: 'GET /api/v1/users/:id',
    requests: 2,
    failures: 1,
    average_duration_ms: 50,
    max_duration_ms: 80,
    last_request_at: now.toISOString(),
  });
  metrics.record('GET', '/api/v1/other', 200, 7, now);
  assert.equal(metrics.snapshot().length, 3);
  metrics.record('GET', '/api/v1/new-route', 200, 2, now);
  assert.equal(metrics.snapshot().length, 3);
});


test('row pagination supports page sizes and clamps page boundaries', () => {
  const rows = Array.from({ length: 51 }, (_, index) => index);
  assert.deepEqual(paginateRows(rows, 10, 2), { page: 2, pageSize: 10, pageCount: 6, start: 10, end: 20 });
  assert.deepEqual(paginateRows(rows, 25, 9), { page: 3, pageSize: 25, pageCount: 3, start: 50, end: 51 });
  assert.deepEqual(paginateRows(rows, 50, 0), { page: 1, pageSize: 50, pageCount: 2, start: 0, end: 50 });
  assert.deepEqual(paginateRows(rows, 100, 1), { page: 1, pageSize: 100, pageCount: 1, start: 0, end: 51 });
  assert.deepEqual(paginateRows([], 10, 2), { page: 1, pageSize: 10, pageCount: 1, start: 0, end: 0 });
  assert.equal(paginateRows(rows, 17).pageSize, 10);
});
