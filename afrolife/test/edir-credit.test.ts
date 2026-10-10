import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEdirLoan, edirCreditPolicySchema, edirPrincipalSchedule } from '../services/afrolife-edir/credit.js';

const policy = {
  maximum_principal: '1000.00',
  maximum_tenor_months: 12,
  maximum_debt_service_bps: 4000,
  minimum_membership_days: 180,
  maximum_concurrent_applications: 1,
  minimum_savings_coverage_bps: 10000,
  amortization_method: 'equal_principal',
  interest_rate_bps: 0,
  fee_bps: 0,
  scorecard: {
    minimum_score: 60,
    weights: { affordability: 40, savings: 35, membership_tenure: 25 },
  },
} as const;

test('Edir credit policy validates score weights and keeps pricing disabled', () => {
  assert.equal(edirCreditPolicySchema.parse(policy).interest_rate_bps, 0);
  assert.throws(() => edirCreditPolicySchema.parse({
    ...policy,
    scorecard: { ...policy.scorecard, weights: { affordability: 40, savings: 40, membership_tenure: 25 } },
  }));
  assert.throws(() => edirCreditPolicySchema.parse({ ...policy, fee_bps: 1 }));
});

test('Edir credit assessment uses cents and meets the saved policy factors', () => {
  const result = assessEdirLoan({
    policy: edirCreditPolicySchema.parse(policy),
    requestedPrincipal: '500.00',
    requestedTermMonths: 10,
    monthlyIncome: '1000.00',
    monthlyExpenses: '100.00',
    monthlyDebt: '100.00',
    savingsBalance: '500.00',
    membershipDays: 360,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.factors.debt_service_bps, 2500);
  assert.equal(result.factors.membership_days, 360);
  assert.equal(result.score, 75);
});

test('Edir credit assessment rejects limit, tenure, affordability, and sub-cent coverage failures', () => {
  const base = {
    policy: edirCreditPolicySchema.parse(policy),
    requestedPrincipal: '1000.01',
    requestedTermMonths: 10,
    monthlyIncome: '1000.00',
    monthlyExpenses: '100.00',
    monthlyDebt: '100.00',
    savingsBalance: '500.00',
    membershipDays: 360,
  };
  assert.equal(assessEdirLoan({ ...base, savingsBalance: '1000.01' }).eligible, false);
  assert.equal(assessEdirLoan({ ...base, requestedPrincipal: '500.00', savingsBalance: '499.99' }).eligible, false);
  assert.equal(assessEdirLoan({ ...base, requestedPrincipal: '500.00', membershipDays: 179 }).eligible, false);
  assert.equal(assessEdirLoan({
    ...base, requestedPrincipal: '500.00', monthlyIncome: '100.00', monthlyExpenses: '90.00',
  }).eligible, false);
});

test('Edir debt-service ratio rounds upward before checking the configured limit', () => {
  const strictPolicy = edirCreditPolicySchema.parse({ ...policy, maximum_debt_service_bps: 2500 });
  const result = assessEdirLoan({
    policy: strictPolicy,
    requestedPrincipal: '500.01',
    requestedTermMonths: 10,
    monthlyIncome: '1000.00',
    monthlyExpenses: '100.00',
    monthlyDebt: '100.00',
    savingsBalance: '1000.00',
    membershipDays: 360,
  });
  assert.equal(result.factors.debt_service_bps, 2501);
  assert.equal(result.eligible, false);
});

test('Edir credit scoring caps oversized exact ratios before converting to JavaScript numbers', () => {
  const result = assessEdirLoan({
    policy: edirCreditPolicySchema.parse(policy),
    requestedPrincipal: '999999999999.99',
    requestedTermMonths: 1,
    monthlyIncome: '0.01',
    monthlyExpenses: '999999999999.99',
    monthlyDebt: '999999999999.99',
    savingsBalance: '0.01',
    membershipDays: 180,
  });
  assert.equal(result.factors.debt_service_bps, Number.MAX_SAFE_INTEGER);
  assert.equal(result.eligible, false);
});

test('Edir savings coverage rounds required ETB savings upward to whole cents', () => {
  const coveragePolicy = edirCreditPolicySchema.parse({
    ...policy,
    minimum_savings_coverage_bps: 15000,
  });
  const input = {
    policy: coveragePolicy,
    requestedPrincipal: '0.01',
    requestedTermMonths: 1,
    monthlyIncome: '1000.00',
    monthlyExpenses: '0.00',
    monthlyDebt: '0.00',
    membershipDays: 360,
  };
  const underCovered = assessEdirLoan({ ...input, savingsBalance: '0.01' });
  assert.equal(underCovered.factors.savings, 50);
  assert.equal(underCovered.eligible, false);
  assert.equal(assessEdirLoan({ ...input, savingsBalance: '0.02' }).eligible, true);
});

test('Edir principal schedule allocates every cent and clamps monthly due dates', () => {
  const schedule = edirPrincipalSchedule('10.01', 3, new Date('2025-01-31T15:00:00Z'));
  assert.deepEqual(schedule, [
    { installment_no: 1, due_on: '2025-02-28', principal_due: '3.34' },
    { installment_no: 2, due_on: '2025-03-28', principal_due: '3.34' },
    { installment_no: 3, due_on: '2025-04-28', principal_due: '3.33' },
  ]);
  assert.equal(schedule.reduce((sum, installment) => sum + parseInt(installment.principal_due.replace('.', ''), 10), 0), 1001);
});
