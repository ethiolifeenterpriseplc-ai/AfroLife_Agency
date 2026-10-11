import test from 'node:test';
import assert from 'node:assert/strict';
import { cooldownRemainingDays, evaluateLoanEligibility, lendingProductTermsSchema, quoteLoan } from '../src/lending-products.js';

const terms = lendingProductTermsSchema.parse({
  product_code: 'YOUTH-01',
  name: 'Youth entrepreneur',
  customer_categories: ['youth_entrepreneur'],
  minimum_principal: '1000',
  maximum_principal: '50000',
  minimum_tenor_months: 3,
  maximum_tenor_months: 24,
  repayment_frequency: 'monthly',
  annual_interest_rate_bps: 1200,
  interest_method: 'reducing_balance',
  origination_fee_bps: 100,
  late_penalty_bps: 0,
  grace_days: 0,
  repayment_priority: ['penalty', 'fee', 'interest', 'principal'],
  maximum_debt_service_bps: 3300,
  minimum_membership_days: 30,
  minimum_savings_coverage_bps: 0,
  maximum_concurrent_loans: 1,
  minimum_age: 21,
  maximum_age: 35,
  minimum_business_months: 6,
  minimum_equity_bps: 0,
  required_documents: ['business_plan'],
  required_fields: ['business_sector'],
  collateral_required: false,
  maximum_loan_to_value_bps: 0,
  manual_review_required: true,
});

test('reducing-balance quotes preserve exact cents across installments', () => {
  const quote = quoteLoan({ principal: '1000.00', tenorMonths: 12, firstDueOn: '2026-01-31', terms });
  assert.equal(quote.installments.length, 12);
  assert.equal(quote.installments[0].due_on, '2026-01-28');
  assert.equal(quote.installments[1].due_on, '2026-02-28');
  assert.equal(quote.installments.reduce((sum, item) => sum + BigInt(item.principal_due.replace('.', '')), 0n), 100000n);
  assert.equal(quote.origination_fee, '10.00');
  assert.equal(quote.installments.reduce((sum, item) => sum + BigInt(item.interest_due.replace('.', '')), 0n), BigInt(quote.total_interest.replace('.', '')));
  assert.ok(BigInt(quote.total_interest.replace('.', '')) > 0n);
});

test('flat interest allocates every interest cent and totals nominal contracted pricing', () => {
  const flat = lendingProductTermsSchema.parse({ ...terms, interest_method: 'flat' });
  const quote = quoteLoan({ principal: '1000.00', tenorMonths: 12, firstDueOn: '2026-01-28', terms: flat });
  assert.equal(quote.total_interest, '120.00');
  assert.equal(quote.total_repayment, '1120.00');
  assert.equal(quote.installments.reduce((sum, item) => sum + BigInt(item.interest_due.replace('.', '')), 0n), 12000n);
});

test('monthly due dates clamp to day 28 across month and year boundaries', () => {
  const quote = quoteLoan({ principal: '1200.00', tenorMonths: 3, firstDueOn: '2026-12-31', terms });
  assert.deepEqual(quote.installments.map((item) => item.due_on), ['2026-12-28', '2027-01-28', '2027-02-28']);
});

test('product eligibility reports category, term, age, experience, collateral and document failures', () => {
  const result = evaluateLoanEligibility({
    terms: lendingProductTermsSchema.parse({
      ...terms,
      collateral_required: true,
      maximum_loan_to_value_bps: 7000,
      minimum_equity_bps: 2000,
    }),
    category: 'formal_business',
    principal: '50000',
    tenorMonths: 36,
    debtServiceBps: 4000,
    membershipDays: 1,
    savingsBalance: '0',
    activeLoans: 1,
    age: 20,
    businessMonths: 2,
    equityAmount: '1000',
    collateralValue: '50000',
    suppliedDocuments: [],
    suppliedFields: [],
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [
    'customer_category_not_eligible', 'tenor_outside_product_limits', 'debt_service_limit_exceeded',
    'minimum_membership_tenure_not_met', 'concurrent_loan_limit_reached', 'minimum_age_not_met',
    'minimum_business_experience_not_met', 'minimum_equity_not_met', 'maximum_loan_to_value_exceeded',
    'required_documents_missing', 'required_fields_missing',
  ]);
});

test('loan product rejects inconsistent ranges, interest terms, and duplicate repayment priority', () => {
  assert.equal(lendingProductTermsSchema.safeParse({ ...terms, minimum_principal: '60000' }).success, false);
  assert.equal(lendingProductTermsSchema.safeParse({ ...terms, interest_method: 'none' }).success, false);
  assert.equal(lendingProductTermsSchema.safeParse({ ...terms, repayment_priority: ['principal', 'principal', 'fee', 'interest'] }).success, false);
});

test('cooldown windows round remaining calendar duration upward and expire at the boundary', () => {
  const now = new Date('2026-10-11T12:00:00.000Z');
  assert.equal(cooldownRemainingDays('2026-10-10T12:00:00.000Z', 2, now), 1);
  assert.equal(cooldownRemainingDays('2026-10-09T12:00:00.000Z', 2, now), 0);
  assert.equal(cooldownRemainingDays('invalid-date', 4, now), 0);
  assert.equal(cooldownRemainingDays('2026-10-10T12:00:00.000Z', 0, now), 0);
});

test('loan product cooldowns default to disabled and reject excessive windows', () => {
  assert.equal(terms.rejection_cooldown_days, 0);
  assert.equal(terms.settlement_cooldown_days, 0);
  assert.equal(lendingProductTermsSchema.safeParse({ ...terms, rejection_cooldown_days: 3651 }).success, false);
});
