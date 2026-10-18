import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GLOBAL_BI_METRICS,
  getGlobalBiMetric,
  isGlobalBiMetricKey,
  isMonthlyWindow,
} from '../services/global-bi/catalog.js';
import { validateGlobalBiProjectionBatch } from '../services/global-bi/projection-contract.js';

const now = new Date('2026-10-14T12:00:00.000Z');
const validBatch = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  generatedAt: '2026-10-14T12:00:00.000Z',
  projections: [
    {
      metricKey: 'finance.posted_journals',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      value: '24',
    },
    {
      metricKey: 'finance.posted_volume',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      value: '42150.00',
      currency: 'ETB',
    },
  ],
};

test('Global BI catalog defines bounded aggregate metrics and monthly windows', () => {
  assert.equal(GLOBAL_BI_METRICS.length, 10);
  assert.equal(isGlobalBiMetricKey('finance.posted_volume'), true);
  assert.equal(isGlobalBiMetricKey('users.email_addresses'), false);
  assert.equal(getGlobalBiMetric('finance.pending_journals').aggregation, 'snapshot');
  assert.equal(isMonthlyWindow('2024-02-01', '2024-02-29'), true);
  assert.equal(isMonthlyWindow('2025-13-01', '2026-01-31'), false);
  assert.equal(isMonthlyWindow('2026-10-01', '2026-10-30'), false);
});

test('Global BI accepts strict, aggregate-only monthly projections', () => {
  assert.deepEqual(validateGlobalBiProjectionBatch(validBatch, now), validBatch);
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      customerEmail: 'private@example.test',
    }, now),
    /Unrecognized key/,
  );
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [{ ...validBatch.projections[0], transactionId: 'sensitive-row-id' }],
    }, now),
    /Unrecognized key/,
  );
});

test('Global BI rejects duplicate, stale, future, and unit-mismatched projections', () => {
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [validBatch.projections[0], validBatch.projections[0]],
    }, now),
    /only once/,
  );
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [{ ...validBatch.projections[0], periodStart: '2025-09-01', periodEnd: '2025-09-30' }],
    }, now),
    /13-month retention window/,
  );
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [{ ...validBatch.projections[0], periodStart: '2026-11-01', periodEnd: '2026-11-30' }],
    }, now),
    /future month/,
  );
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [{ ...validBatch.projections[0], value: '1.5' }],
    }, now),
    /integer count/,
  );
  assert.throws(
    () => validateGlobalBiProjectionBatch({
      ...validBatch,
      projections: [{ ...validBatch.projections[1], currency: undefined }],
    }, now),
    /requires a currency/,
  );
});

test('Global BI schema gives query and projector separate privileges', async () => {
  const migration = await readFile(
    new URL('../services/global-bi/migrations/001_global_bi_aggregates.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /global_bi_aggregates_authorized_read/);
  assert.match(migration, /GRANT SELECT ON TABLE global_bi_aggregates,global_bi_metric_catalog TO "\{\{query_role\}\}"/);
  assert.match(migration, /GRANT INSERT,UPDATE,DELETE ON TABLE global_bi_aggregates TO "\{\{ingest_role\}\}"/);
});
