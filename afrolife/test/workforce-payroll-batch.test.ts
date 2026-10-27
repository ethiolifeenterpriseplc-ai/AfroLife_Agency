import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCsv } from '../src/csv.js';
import {
  takeWorkforcePayrollBatch,
  WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS,
  WORKFORCE_PAYROLL_EXPORT_MAX_ROWS,
} from '../src/workforce-payroll-batch.js';
import {
  encryptPayrollExport,
  readPayrollExportCsv,
  WORKFORCE_PAYROLL_EXPORT_COLUMNS,
} from '../src/workforce-payroll-export.js';

const workforceOperations = readFileSync(new URL('../src/workforce-operations.ts', import.meta.url), 'utf8');
const publicApp = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const publicTranslations = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');

test('payroll batch helper bounds returned rows and reports remaining work', () => {
  assert.deepEqual(takeWorkforcePayrollBatch([], WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS), { rows: [], hasMore: false });
  assert.deepEqual(takeWorkforcePayrollBatch([1, 2], 2), { rows: [1, 2], hasMore: false });
  assert.deepEqual(takeWorkforcePayrollBatch([1, 2, 3], 2), { rows: [1, 2], hasMore: true });
  assert.equal(takeWorkforcePayrollBatch(Array(WORKFORCE_PAYROLL_EXPORT_MAX_ROWS + 1).fill(0), WORKFORCE_PAYROLL_EXPORT_MAX_ROWS).hasMore, true);
  assert.throws(() => takeWorkforcePayrollBatch([], 0), /positive integer/);
});

test('payroll retry reads only authenticated source CSV with the configured key and manifest', () => {
  const key = Buffer.alloc(32, 7);
  const sourceCsv = toCsv([{
    worker_id: 'worker-1',
    worker_name: 'Worker, One',
    worker_type: 'part_time',
    billing_unit: 'hour',
    contract_rate: '100.00',
    payable_minutes: 60,
    payable_hours: '1.00',
    shift_start: '2026-10-25T06:00:00.000Z',
    shift_end: '2026-10-25T07:00:00.000Z',
    policy_version: 'v1',
  }], WORKFORCE_PAYROLL_EXPORT_COLUMNS);
  const encrypted = encryptPayrollExport(sourceCsv, key, 'payroll-key-v1');

  assert.deepEqual(
    readPayrollExportCsv(encrypted.payload, key, 'payroll-key-v1', encrypted.controlHash, 1),
    { csv: sourceCsv, rows: [
      [...WORKFORCE_PAYROLL_EXPORT_COLUMNS],
      ['worker-1', 'Worker, One', 'part_time', 'hour', '100.00', '60', '1.00',
        '2026-10-25T06:00:00.000Z', '2026-10-25T07:00:00.000Z', 'v1'],
    ] },
  );
  assert.throws(
    () => readPayrollExportCsv(encrypted.payload, Buffer.alloc(32, 8), 'payroll-key-v1', encrypted.controlHash, 1),
    /could not be authenticated/,
  );
  assert.throws(
    () => readPayrollExportCsv(encrypted.payload, key, 'rotated-key', encrypted.controlHash, 1),
    /different encryption key/,
  );
  assert.throws(
    () => readPayrollExportCsv(encrypted.payload, key, 'payroll-key-v1', '0'.repeat(64), 1),
    /control hash does not match/,
  );
  assert.throws(
    () => readPayrollExportCsv(encrypted.payload, key, 'payroll-key-v1', encrypted.controlHash, 2),
    /stored export manifest/,
  );
});

test('payable-time calculation and payroll export process one locked batch before reporting remaining work', () => {
  assert.match(workforceOperations, /LIMIT \$\{WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS \+ 1\}[\s\S]*?FOR UPDATE OF t SKIP LOCKED/);
  assert.match(workforceOperations, /LIMIT \$\{WORKFORCE_PAYROLL_EXPORT_MAX_ROWS \+ 1\}[\s\S]*?FOR UPDATE OF t SKIP LOCKED/);
  assert.match(workforceOperations, /takeWorkforcePayrollBatch\(selectedEntries, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS\)/);
  assert.match(workforceOperations, /takeWorkforcePayrollBatch\(selectedRows, WORKFORCE_PAYROLL_EXPORT_MAX_ROWS\)/);
  assert.match(workforceOperations, /count: calculated\.length, has_more: hasMore/);
  assert.match(workforceOperations, /calculated, has_more: hasMore/);
  assert.match(workforceOperations, /has_more: hasMore/);
  assert.match(workforceOperations, /remaining\.status='approved'[\s\S]*?AS has_more/);
  assert.match(workforceOperations, /const hasMore = batch\.hasMore \|\| remainingEntries\.rows\[0\]\.has_more/);
  assert.match(workforceOperations, /const hasMore = batch\.hasMore \|\| remainingRows\.rows\[0\]\.has_more/);

  const calculationGuard = workforceOperations.indexOf('takeWorkforcePayrollBatch(selectedEntries');
  const firstCalculationWrite = workforceOperations.indexOf("UPDATE workforce_time_entries SET status='payable'");
  const exportGuard = workforceOperations.indexOf('takeWorkforcePayrollBatch(selectedRows');
  const firstExportWrite = workforceOperations.indexOf('INSERT INTO workforce_payroll_exports');
  assert.ok(calculationGuard >= 0 && calculationGuard < firstCalculationWrite);
  assert.ok(exportGuard >= 0 && exportGuard < firstExportWrite);
  assert.match(publicApp, /Calculate next payable-time batch/);
  assert.match(publicApp, /Generate next encrypted export batch/);
  assert.match(publicTranslations, /'Calculate next payable-time batch':/);
  assert.match(publicTranslations, /'Generate next encrypted export batch':/);
});

test('payroll failed-row retries retain the operator-provided rejection reference in idempotency evidence', () => {
  assert.match(workforceOperations, /external_reference: z\.string\(\)\.trim\(\)\.min\(3\)\.max\(160\)\.optional\(\)/);
  assert.match(workforceOperations, /external_reference: body\.external_reference \?\? null/);
  assert.match(workforceOperations, /external_reference: body\.external_reference \?\? null,[\s\S]*?\}\)\)\s*\.digest/);
  assert.doesNotMatch(workforceOperations, /source\.handoff_reference, req\.user!\.id/);
  assert.match(publicApp, /external_reference: normalizedExternalReference \|\| undefined/);
  assert.match(publicApp, /externalReference: normalizedExternalReference \|\| null/);
  assert.match(publicTranslations, /'Enter the external rejection reference, or leave blank\.'/);
  assert.match(publicTranslations, /'External rejection reference must be at least 3 characters\.'/);
});

test('shift schedule exposes engagement rates and estimates direct labor cost only for hourly billing', () => {
  assert.match(workforceOperations, /e\.billing_unit,e\.worker_rate::text/);
  assert.match(workforceOperations, /CASE WHEN e\.billing_unit='hour'[\s\S]*?scheduled_labor_cost_estimate/);
  assert.match(workforceOperations, /round\(e\.worker_rate \* extract\(epoch FROM \(s\.ends_at-s\.starts_at\)\)\/3600,2\)/);
  assert.match(publicApp, /schedule estimate, not approved or payable time/);
  assert.match(publicApp, /Scheduled cost is not estimated for this billing unit/);
});
