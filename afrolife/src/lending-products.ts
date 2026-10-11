import { z } from 'zod';

const money = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const productCategory = z.enum([
  'employee', 'individual', 'petty_trader', 'formal_business', 'partnership', 'plc',
  'student', 'youth_entrepreneur', 'agriculture', 'group_member',
]);

export const lendingProductTermsSchema = z.object({
  product_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  name: z.string().trim().min(2).max(100),
  customer_categories: z.array(productCategory).min(1).max(10),
  minimum_principal: money,
  maximum_principal: money,
  minimum_tenor_months: z.number().int().min(1).max(360),
  maximum_tenor_months: z.number().int().min(1).max(360),
  repayment_frequency: z.enum(['monthly', 'fortnightly', 'weekly']),
  annual_interest_rate_bps: z.number().int().min(0).max(100000),
  interest_method: z.enum(['none', 'flat', 'reducing_balance']),
  origination_fee_bps: z.number().int().min(0).max(10000),
  late_penalty_bps: z.number().int().min(0).max(10000),
  grace_days: z.number().int().min(0).max(365),
  repayment_priority: z.array(z.enum(['penalty', 'fee', 'interest', 'principal'])).length(4),
  maximum_debt_service_bps: z.number().int().min(100).max(10000),
  minimum_membership_days: z.number().int().min(0).max(36500),
  minimum_savings_coverage_bps: z.number().int().min(0).max(100000),
  maximum_concurrent_loans: z.number().int().min(1).max(100),
  rejection_cooldown_days: z.number().int().min(0).max(3650).default(0),
  settlement_cooldown_days: z.number().int().min(0).max(3650).default(0),
  minimum_age: z.number().int().min(18).max(100).optional(),
  maximum_age: z.number().int().min(18).max(100).optional(),
  minimum_business_months: z.number().int().min(0).max(1200).optional(),
  minimum_employment_months: z.number().int().min(0).max(1200).optional(),
  minimum_equity_bps: z.number().int().min(0).max(10000).default(0),
  required_documents: z.array(z.string().trim().min(2).max(80)).max(30),
  required_fields: z.array(z.string().trim().min(2).max(80)).max(30),
  collateral_required: z.boolean(),
  maximum_loan_to_value_bps: z.number().int().min(0).max(10000).default(0),
  manual_review_required: z.boolean(),
}).strict().superRefine((terms, ctx) => {
  if (toCents(terms.minimum_principal) > toCents(terms.maximum_principal)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum_principal'], message: 'Maximum principal must be at least the minimum principal' });
  }
  if (terms.minimum_tenor_months > terms.maximum_tenor_months) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum_tenor_months'], message: 'Maximum tenor must be at least the minimum tenor' });
  }
  if (terms.interest_method === 'none' && terms.annual_interest_rate_bps !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['annual_interest_rate_bps'], message: 'Interest-free products must have a zero interest rate' });
  }
  if (new Set(terms.repayment_priority).size !== 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repayment_priority'], message: 'Repayment priority must contain each allocation exactly once' });
  }
  if (terms.minimum_age !== undefined && terms.maximum_age !== undefined && terms.minimum_age > terms.maximum_age) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum_age'], message: 'Maximum age must be at least the minimum age' });
  }
  if (terms.collateral_required && terms.maximum_loan_to_value_bps <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum_loan_to_value_bps'], message: 'Collateral products require a positive maximum LTV' });
  }
});

export type LendingProductTerms = z.infer<typeof lendingProductTermsSchema>;
export type RepaymentBucket = 'penalty' | 'fee' | 'interest' | 'principal';

export function cooldownRemainingDays(completedAt: Date | string | null | undefined, cooldownDays: number,
  now: Date = new Date()): number {
  if (!completedAt || cooldownDays <= 0) return 0;
  const completedTime = completedAt instanceof Date ? completedAt.getTime() : Date.parse(completedAt);
  if (!Number.isFinite(completedTime)) return 0;
  return Math.max(0, Math.ceil((completedTime + cooldownDays * 86400000 - now.getTime()) / 86400000));
}

export function toCents(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid ETB amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function fromCents(value: bigint): string {
  if (value < 0n) throw new Error('Amount cannot be negative');
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

function roundRatio(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / 2n) / denominator;
}

function schedulePeriodCount(tenorMonths: number, frequency: LendingProductTerms['repayment_frequency']) {
  const periodsPerYear = frequency === 'monthly' ? 12 : frequency === 'fortnightly' ? 26 : 52;
  const periods = Math.ceil(tenorMonths * periodsPerYear / 12);
  return { periods, periodsPerYear };
}

export function quoteLoan(input: {
  principal: string;
  tenorMonths: number;
  firstDueOn: string;
  terms: LendingProductTerms;
}) {
  const principal = toCents(input.principal);
  const { terms } = input;
  if (principal < toCents(terms.minimum_principal) || principal > toCents(terms.maximum_principal)) {
    throw new Error('Requested principal is outside the product limits');
  }
  if (!Number.isInteger(input.tenorMonths) || input.tenorMonths < terms.minimum_tenor_months
      || input.tenorMonths > terms.maximum_tenor_months) {
    throw new Error('Requested tenor is outside the product limits');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueOn) || Number.isNaN(Date.parse(`${input.firstDueOn}T00:00:00Z`))) {
    throw new Error('First due date must be an ISO calendar date');
  }
  const { periods, periodsPerYear } = schedulePeriodCount(input.tenorMonths, terms.repayment_frequency);
  const basePrincipal = principal / BigInt(periods);
  const principalRemainder = principal % BigInt(periods);
  const flatTotalInterest = terms.interest_method === 'flat'
    ? roundRatio(principal * BigInt(terms.annual_interest_rate_bps) * BigInt(input.tenorMonths), 120000n)
    : 0n;
  const baseFlatInterest = periods ? flatTotalInterest / BigInt(periods) : 0n;
  const flatInterestRemainder = periods ? flatTotalInterest % BigInt(periods) : 0n;
  let remaining = principal;
  const firstDue = new Date(`${input.firstDueOn}T00:00:00Z`);
  const firstDay = Math.min(firstDue.getUTCDate(), 28);
  const installments = Array.from({ length: periods }, (_, index) => {
    const principalDue = basePrincipal + (BigInt(index) < principalRemainder ? 1n : 0n);
    const interestDue = terms.interest_method === 'flat'
      ? baseFlatInterest + (BigInt(index) < flatInterestRemainder ? 1n : 0n)
      : terms.interest_method === 'reducing_balance'
        ? roundRatio(remaining * BigInt(terms.annual_interest_rate_bps), BigInt(periodsPerYear) * 10000n)
        : 0n;
    remaining -= principalDue;
    const due = new Date(firstDue);
    if (terms.repayment_frequency === 'monthly') {
      due.setUTCDate(1);
      due.setUTCMonth(due.getUTCMonth() + index);
      due.setUTCDate(firstDay);
    }
    else due.setUTCDate(due.getUTCDate() + index * (terms.repayment_frequency === 'weekly' ? 7 : 14));
    return {
      installment_no: index + 1,
      due_on: due.toISOString().slice(0, 10),
      principal_due: fromCents(principalDue),
      interest_due: fromCents(interestDue),
      total_due: fromCents(principalDue + interestDue),
    };
  });
  const totalInterest = installments.reduce((sum, installment) => sum + toCents(installment.interest_due), 0n);
  const originationFee = roundRatio(principal * BigInt(terms.origination_fee_bps), 10000n);
  return {
    currency: 'ETB' as const,
    principal: fromCents(principal),
    tenor_months: input.tenorMonths,
    frequency: terms.repayment_frequency,
    annual_interest_rate_bps: terms.annual_interest_rate_bps,
    interest_method: terms.interest_method,
    origination_fee: fromCents(originationFee),
    total_interest: fromCents(totalInterest),
    total_repayment: fromCents(principal + totalInterest),
    installments,
  };
}

export function evaluateLoanEligibility(input: {
  terms: LendingProductTerms;
  category: LendingProductTerms['customer_categories'][number];
  principal: string;
  tenorMonths: number;
  debtServiceBps: number;
  membershipDays: number;
  savingsBalance: string;
  activeLoans: number;
  age?: number;
  businessMonths?: number;
  employmentMonths?: number;
  equityAmount?: string;
  collateralValue?: string;
  suppliedDocuments: string[];
  suppliedFields: string[];
}) {
  const reasons: string[] = [];
  const { terms } = input;
  const principal = toCents(input.principal);
  if (!terms.customer_categories.includes(input.category)) reasons.push('customer_category_not_eligible');
  if (principal < toCents(terms.minimum_principal) || principal > toCents(terms.maximum_principal)) reasons.push('principal_outside_product_limits');
  if (input.tenorMonths < terms.minimum_tenor_months || input.tenorMonths > terms.maximum_tenor_months) reasons.push('tenor_outside_product_limits');
  if (input.debtServiceBps > terms.maximum_debt_service_bps) reasons.push('debt_service_limit_exceeded');
  if (input.membershipDays < terms.minimum_membership_days) reasons.push('minimum_membership_tenure_not_met');
  if (input.activeLoans >= terms.maximum_concurrent_loans) reasons.push('concurrent_loan_limit_reached');
  if (terms.minimum_age !== undefined && (input.age === undefined || input.age < terms.minimum_age)) reasons.push('minimum_age_not_met');
  if (terms.maximum_age !== undefined && (input.age === undefined || input.age > terms.maximum_age)) reasons.push('maximum_age_exceeded');
  if (terms.minimum_business_months !== undefined && (input.businessMonths === undefined || input.businessMonths < terms.minimum_business_months)) reasons.push('minimum_business_experience_not_met');
  if (terms.minimum_employment_months !== undefined && (input.employmentMonths === undefined || input.employmentMonths < terms.minimum_employment_months)) reasons.push('minimum_employment_tenure_not_met');
  const savingsTarget = roundRatio(principal * BigInt(terms.minimum_savings_coverage_bps), 10000n);
  if (toCents(input.savingsBalance) < savingsTarget) reasons.push('minimum_savings_coverage_not_met');
  const equityRequired = roundRatio(principal * BigInt(terms.minimum_equity_bps), 10000n);
  if (toCents(input.equityAmount ?? '0') < equityRequired) reasons.push('minimum_equity_not_met');
  if (terms.collateral_required && input.collateralValue === undefined) reasons.push('required_collateral_missing');
  if (terms.collateral_required && input.collateralValue !== undefined
      && principal * 10000n > toCents(input.collateralValue) * BigInt(terms.maximum_loan_to_value_bps)) reasons.push('maximum_loan_to_value_exceeded');
  const missingDocuments = terms.required_documents.filter((document) => !input.suppliedDocuments.includes(document));
  const missingFields = terms.required_fields.filter((field) => !input.suppliedFields.includes(field));
  if (missingDocuments.length) reasons.push('required_documents_missing');
  if (missingFields.length) reasons.push('required_fields_missing');
  return { eligible: reasons.length === 0, reasons, missing_documents: missingDocuments, missing_fields: missingFields };
}
