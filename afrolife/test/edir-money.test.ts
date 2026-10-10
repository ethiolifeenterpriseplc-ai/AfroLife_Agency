import test from 'node:test';
import assert from 'node:assert/strict';
import { edirCashPostings, formatEdirMoney, parseEdirMoney } from '../services/afrolife-edir/money.js';

test('Edir monetary values are parsed and formatted exactly in cents', () => {
  assert.equal(parseEdirMoney('0.01'), 1n);
  assert.equal(parseEdirMoney('1200'), 120000n);
  assert.equal(parseEdirMoney('1200.5'), 120050n);
  assert.equal(formatEdirMoney(120050n), '1200.50');
});

test('Edir money rejects floating-point, negative, zero, and excess-precision values', () => {
  for (const amount of [0, '0', '-1.00', '1.009', '01.00', '1e3']) {
    assert.throws(() => parseEdirMoney(amount));
  }
  assert.equal(parseEdirMoney('0.00', true), 0n);
});

test('Edir cash journal direction always balances the member and cash accounts', () => {
  const deposit = edirCashPostings('deposit', '12.34');
  assert.deepEqual(deposit, [
    { account: 'cash', debit: '12.34', credit: '0.00' },
    { account: 'member', debit: '0.00', credit: '12.34' },
  ]);
  const withdrawal = edirCashPostings('withdrawal', '12.34');
  assert.deepEqual(withdrawal, [
    { account: 'member', debit: '12.34', credit: '0.00' },
    { account: 'cash', debit: '0.00', credit: '12.34' },
  ]);
  assert.deepEqual(edirCashPostings('contribution', '12.34'), deposit);
});
