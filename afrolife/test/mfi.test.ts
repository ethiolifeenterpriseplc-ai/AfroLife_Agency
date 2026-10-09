import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalToCents, parseMfiAmount } from '../src/mfi-money.js';

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
