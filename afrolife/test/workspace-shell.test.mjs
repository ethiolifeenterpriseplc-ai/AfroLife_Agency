import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkspaceServices, createApiMetrics } from '../src/workspace-status.ts';
import { isPanelEnabled, panelFromUrl, panelUrl } from '../public/workspace-navigation.js';
import { MIN_SEARCH_QUERY_LENGTH, searchWorkspaceRecords } from '../public/workspace-search.js';

test('workspace deep links retain the current URL and only resolve visible panels', () => {
  assert.equal(panelFromUrl('https://agency.test/?panel=rent', new Set(['overview', 'rent'])), 'rent');
  assert.equal(panelFromUrl('https://agency.test/?panel=admin', new Set(['overview'])), 'overview');
  assert.equal(panelFromUrl('https://agency.test/?panel=unknown', new Set(['overview', 'rent'])), 'overview');
  assert.equal(panelUrl('/agency?campaign=staff#main', 'rent'), '/agency?campaign=staff&panel=rent#main');
  assert.equal(panelUrl('/agency?panel=rent#main', 'overview'), '/agency#main');
  assert.equal(isPanelEnabled('admin', []), true);
  assert.equal(isPanelEnabled('rent', ['leads']), false);
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
