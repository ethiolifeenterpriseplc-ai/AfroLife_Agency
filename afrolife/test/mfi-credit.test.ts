import test from 'node:test';
import assert from 'node:assert/strict';
import { creditPolicySchema, principalSchedule, scoreLoan } from '../src/mfi-credit.js';

const policy = creditPolicySchema.parse({
  scorecard: { minimum_score: 60, maximum_debt_service_pct: 40, savings_coverage_target_pct: 20,
    membership_tenure_target_days: 365, new_borrower_score: 50,
    weights: { affordability: 40, savings: 20, tenure: 20, repayment_history: 20 } },
  delinquency: { watch_days: 1, substandard_days: 91, doubtful_days: 181, loss_days: 366 },
});

test('credit policy requires normalized score weights and strictly increasing aging bands', () => {
  assert.equal(policy.scorecard.weights.affordability, 40);
  assert.throws(() => creditPolicySchema.parse({ ...policy, scorecard: { ...policy.scorecard,
    weights: { ...policy.scorecard.weights, savings: 19 } } }), /add up to 100/);
  assert.throws(() => creditPolicySchema.parse({ ...policy, delinquency: { ...policy.delinquency, loss_days: 180 } }), /must increase/);
});

test('credit score is explainable and flags unaffordable applications', () => {
  const score = scoreLoan({ policy, requestedAmount: '12000.00', termMonths: 12,
    monthlyIncome: '5000.00', monthlyExpenses: '1000.00', monthlyDebt: '1000.00',
    savingsBalance: '3000.00', membershipDays: 365, priorLoans: 0, repaidLoans: 0 });
  assert.equal(score.factors.affordability, 0);
  assert.equal(score.factors.savings, 100);
  assert.equal(score.factors.repayment_history, 50);
  assert.equal(score.eligible, false);
});

test('principal schedule allocates every cent and clamps due days to valid month dates', () => {
  const schedule = principalSchedule('100.00', 3, '2026-01-31');
  assert.deepEqual(schedule.map((row) => row.principal_due), ['33.34', '33.33', '33.33']);
  assert.deepEqual(schedule.map((row) => row.due_on), ['2026-01-28', '2026-02-28', '2026-03-28']);
});
