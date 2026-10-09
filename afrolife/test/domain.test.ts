import test from 'node:test';
import assert from 'node:assert/strict';

// core.ts checks for a JWT secret at import time; the pool does not connect until used.
process.env.JWT_SECRET = 'x'.repeat(32);
const { feeSnapshot, commissionFor, initialAmount } = await import('../src/domain.js');

const rules = {
  A_onboarding_pct: 20, A_guarantee_pct: 2, A_monthly_pct: 5,
  B_employer_pct: 10, B_other_pct: 10,
  first_contract_commission_pct: 50, guarantee_commissionable: 0,
};

test('Track A stores onboarding, guarantee and monthly fee separately', () => {
  const f = feeSnapshot('A', 100000, rules);
  assert.equal(f.onboarding_amt, 20000);
  assert.equal(f.guarantee_amt, 2000);
  assert.equal(f.monthly_mgmt_amt, 5000);
  assert.equal(initialAmount(f), 27000);
});

test('Track B splits 10% employer + 10% other party', () => {
  const f = feeSnapshot('B', 100000, rules);
  assert.equal(f.employer_fee_amt, 10000);
  assert.equal(f.other_fee_amt, 10000);
  assert.equal(initialAmount(f), 20000);
});

test('Track A commission excludes the guarantee by default', () => {
  const c = commissionFor(feeSnapshot('A', 100000, rules), rules);
  assert.equal(c.eligible, 25000);
  assert.equal(c.amount, 12500);
});

test('Track A commission includes the guarantee only when configured', () => {
  const c = commissionFor(feeSnapshot('A', 100000, rules), { ...rules, guarantee_commissionable: 1 });
  assert.equal(c.eligible, 27000);
  assert.equal(c.amount, 13500);
});

test('Track B commission is 50% of total agency revenue', () => {
  const c = commissionFor(feeSnapshot('B', 100000, rules), rules);
  assert.equal(c.amount, 10000);
});

test('rounds to cents', () => {
  const f = feeSnapshot('A', 33333, rules);
  assert.equal(f.onboarding_amt, 6666.6);
  assert.equal(f.guarantee_amt, 666.66);
});
