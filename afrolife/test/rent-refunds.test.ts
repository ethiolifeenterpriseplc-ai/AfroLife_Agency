import test from 'node:test';
import assert from 'node:assert/strict';
import { rentSchedule, endDate } from '../src/rent.js';
import { refundLimit } from '../src/refunds.js';

test('rent schedule: one charge per month, across a year boundary', () => {
  const s = rentSchedule('2026-11-15', 3, 15000);
  assert.deepEqual(s.map((x) => x.period), ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  assert.deepEqual(s.map((x) => x.due_on), ['2026-11-15', '2026-12-05', '2027-01-05', '2027-02-05']);
  assert.deepEqual(s.map((x) => x.amount), [8000, 15000, 15000, 7500]);
});
test('due day is capped at 28 so every month has it', () => assert.equal(rentSchedule('2027-01-01', 2, 1, 31)[1].due_on, '2027-02-28'));
test('lease end date is the day before its calendar-month anniversary', () => {
  assert.equal(endDate('2026-11-15', 3), '2027-02-14');
  assert.equal(endDate('2027-01-01', 1), '2027-01-31');
  assert.equal(endDate('2027-03-10', 12), '2028-03-09');
  assert.equal(endDate('2027-01-31', 1), '2027-02-27'); // clamp anniversary in February
});

const A = { onboarding_amt: 20000, guarantee_amt: 2000, monthly_mgmt_amt: 5000, employer_fee_amt: 0, other_fee_amt: 0 };
test('refund limits: fees and guarantee are capped separately, less what was already refunded', () => {
  assert.equal(refundLimit(A, 'fee', 0), 25000);
  assert.equal(refundLimit(A, 'guarantee', 0), 2000);
  assert.equal(refundLimit(A, 'fee', 5000), 20000);
  assert.equal(refundLimit(A, 'guarantee', 2000), 0);
  assert.equal(refundLimit(A, 'fee', 99999), 0); // never negative
  assert.equal(refundLimit({ ...A, onboarding_amt: 0, guarantee_amt: 0, monthly_mgmt_amt: 0, employer_fee_amt: 10000, other_fee_amt: 10000 }, 'fee', 0), 20000);
});

test('configured refund percentages can reduce, but never exceed, amounts collected', () => {
  assert.equal(refundLimit(A, 'fee', 0, 50), 12500);
  assert.equal(refundLimit(A, 'guarantee', 0, 50), 1000);
  assert.equal(refundLimit(A, 'fee', 12500, 50), 0);
});
