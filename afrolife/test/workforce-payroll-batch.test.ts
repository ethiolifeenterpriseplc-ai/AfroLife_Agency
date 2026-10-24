import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  exceedsWorkforcePayrollBatchLimit,
  WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS,
  WORKFORCE_PAYROLL_EXPORT_MAX_ROWS,
} from '../src/workforce-payroll-batch.js';

const workforceOperations = readFileSync(new URL('../src/workforce-operations.ts', import.meta.url), 'utf8');

test('payroll batch boundary distinguishes complete and truncated batches', () => {
  assert.equal(exceedsWorkforcePayrollBatchLimit(0, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS), false);
  assert.equal(exceedsWorkforcePayrollBatchLimit(WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS), false);
  assert.equal(exceedsWorkforcePayrollBatchLimit(WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS + 1, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS), true);
  assert.equal(exceedsWorkforcePayrollBatchLimit(WORKFORCE_PAYROLL_EXPORT_MAX_ROWS + 1, WORKFORCE_PAYROLL_EXPORT_MAX_ROWS), true);
});

test('payable-time calculation and payroll export reject a lookahead row before writing', () => {
  assert.match(workforceOperations, /LIMIT \$\{WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS \+ 1\}[\s\S]*?if \(exceedsWorkforcePayrollBatchLimit\(entries\.length, WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS\)\)/);
  assert.match(workforceOperations, /LIMIT \$\{WORKFORCE_PAYROLL_EXPORT_MAX_ROWS \+ 1\}[\s\S]*?if \(exceedsWorkforcePayrollBatchLimit\(rows\.length, WORKFORCE_PAYROLL_EXPORT_MAX_ROWS\)\)/);

  const calculationGuard = workforceOperations.indexOf('if (exceedsWorkforcePayrollBatchLimit(entries.length');
  const firstCalculationWrite = workforceOperations.indexOf("UPDATE workforce_time_entries SET status='payable'");
  const exportGuard = workforceOperations.indexOf('if (exceedsWorkforcePayrollBatchLimit(rows.length');
  const firstExportWrite = workforceOperations.indexOf('INSERT INTO workforce_payroll_exports');
  assert.ok(calculationGuard >= 0 && calculationGuard < firstCalculationWrite);
  assert.ok(exportGuard >= 0 && exportGuard < firstExportWrite);
});
