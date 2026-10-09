import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInsuranceJournalLines } from '../src/insurance-ledger-validation.js';

test('insurance journals balance exact decimal amounts and normalize line order', () => {
  const result = validateInsuranceJournalLines([
    { account_code: 'INS-200', debit: '0', credit: '125.50' },
    { account_code: 'INS-100', debit: '125.5', credit: '0' },
  ]);
  assert.equal(result.amount, '125.50');
  assert.deepEqual(result.lines.map((line) => line.account_code), ['INS-100', 'INS-200']);
});

test('insurance journal validation rejects unbalanced and zero-value entries', () => {
  assert.throws(() => validateInsuranceJournalLines([
    { account_code: 'INS-100', debit: '10.00', credit: '0' },
    { account_code: 'INS-200', debit: '0', credit: '9.99' },
  ]), /must be equal/);
  assert.throws(() => validateInsuranceJournalLines([
    { account_code: 'INS-100', debit: '0', credit: '0' },
    { account_code: 'INS-200', debit: '0', credit: '0' },
  ]), /either a debit or a credit/);
});

test('insurance journal validation rejects duplicate accounts and excess precision', () => {
  assert.throws(() => validateInsuranceJournalLines([
    { account_code: 'INS-100', debit: '1.00', credit: '0' },
    { account_code: 'INS-100', debit: '0', credit: '1.00' },
  ]), /may appear only once/);
  assert.throws(() => validateInsuranceJournalLines([
    { account_code: 'INS-100', debit: '1.001', credit: '0' },
    { account_code: 'INS-200', debit: '0', credit: '1.001' },
  ]));
});
