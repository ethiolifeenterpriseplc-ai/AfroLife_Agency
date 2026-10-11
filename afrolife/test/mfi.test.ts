import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decimalToCents, parseMfiAmount } from '../src/mfi-money.js';

const sharedPortals = readFileSync(new URL('../migrations/050_shared_mini_app_portals.sql', import.meta.url), 'utf8');
const mfiRouter = readFileSync(new URL('../src/mfi.ts', import.meta.url), 'utf8');
const insuranceRequests = readFileSync(new URL('../src/insurance-requests.ts', import.meta.url), 'utf8');

test('MFI amounts preserve decimal cents without floating-point rounding', () => {
  assert.equal(parseMfiAmount('0.01'), '0.01');
  assert.equal(decimalToCents('0.01'), 1n);
  assert.equal(decimalToCents('12345678901234.56'), 1234567890123456n);
  assert.equal(decimalToCents(parseMfiAmount('12')), 1200n);
});

test('MFI amounts reject zero, excess precision, negatives and exponent notation', () => {
  for (const value of ['0', '0.00', '-1.00', '1.001', '1e2', '100000000000000.00']) {
    assert.throws(() => parseMfiAmount(value));
  }
  assert.throws(() => decimalToCents('1.001'), TypeError);
});

test('shared mini-app member portals require consent and isolate member financial records', () => {
  assert.match(sharedPortals, /CREATE TABLE mfi_member_applications/);
  assert.match(sharedPortals, /consented_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(sharedPortals, /user_id = app_user_id\(\)/);
  assert.match(sharedPortals, /mfi_journals_self_read/);
  assert.match(sharedPortals, /mfi_journal_lines_self_read/);
  assert.match(sharedPortals, /mfi_member_application_audit_create/);
  assert.match(sharedPortals, /application\.user_id = app_user_id\(\)/);
  assert.match(sharedPortals, /insurance_interest_request_read/);
  assert.match(mfiRouter, /mfiRouter\.get\('\/member-portal'/);
  assert.match(mfiRouter, /WHERE application\.user_id=\$1/);
  assert.match(mfiRouter, /z\.object\(\{ consent: z\.literal\(true\) \}\)\.strict\(\)/);
  assert.match(mfiRouter, /Applicants cannot review their own membership request/);
  assert.match(insuranceRequests, /consent: z\.literal\(true\)/);
  assert.match(insuranceRequests, /Assigned Insurance request-review access is required/);
});
