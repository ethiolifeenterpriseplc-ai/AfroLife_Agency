import { z } from 'zod';
import { formatEdirMoney, parseEdirMoney } from './money.js';

const positiveAmount = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((value) => parseEdirMoney(value) > 0n);

export const edirCreditPolicySchema = z.object({
  maximum_principal: positiveAmount,
  maximum_tenor_months: z.number().int().min(1).max(360),
  maximum_debt_service_bps: z.number().int().min(100).max(10000),
  minimum_membership_days: z.number().int().min(0).max(36500),
  maximum_concurrent_applications: z.number().int().min(1).max(100),
  minimum_savings_coverage_bps: z.number().int().min(0).max(100000),
  amortization_method: z.literal('equal_principal'),
  interest_rate_bps: z.literal(0),
  fee_bps: z.literal(0),
  scorecard: z.object({
    minimum_score: z.number().int().min(0).max(100),
    weights: z.object({
      affordability: z.number().int().min(0).max(100),
      savings: z.number().int().min(0).max(100),
      membership_tenure: z.number().int().min(0).max(100),
    }).strict(),
  }).strict(),
}).strict().superRefine((policy, ctx) => {
  const { weights } = policy.scorecard;
  if (Object.values(weights).reduce((total, value) => total + value, 0) !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scorecard', 'weights'],
      message: 'Credit score weights must add up to 100',
    });
  }
});

export type EdirCreditPolicy = z.infer<typeof edirCreditPolicySchema>;

export function assessEdirLoan(input: {
  policy: EdirCreditPolicy;
  requestedPrincipal: string;
  requestedTermMonths: number;
  monthlyIncome: string;
  monthlyExpenses: string;
  monthlyDebt: string;
  savingsBalance: string;
  membershipDays: number;
}) {
  const requested = parseEdirMoney(input.requestedPrincipal);
  const income = parseEdirMoney(input.monthlyIncome);
  const obligations = parseEdirMoney(input.monthlyExpenses, true) + parseEdirMoney(input.monthlyDebt, true);
  const proposedPrincipalPayment = (requested + BigInt(input.requestedTermMonths) - 1n)
    / BigInt(input.requestedTermMonths);
  const exactDebtServiceBps = income > 0n
    ? ((obligations + proposedPrincipalPayment) * 10000n + income - 1n) / income
    : BigInt(Number.MAX_SAFE_INTEGER);
  const debtServiceBps = Number(exactDebtServiceBps > BigInt(Number.MAX_SAFE_INTEGER)
    ? BigInt(Number.MAX_SAFE_INTEGER) : exactDebtServiceBps);
  const maximumDebtServiceBps = input.policy.maximum_debt_service_bps;
  const affordability = debtServiceBps > maximumDebtServiceBps
    ? 0
    : Math.max(0, Math.min(100, Math.floor((maximumDebtServiceBps - debtServiceBps) * 100 / maximumDebtServiceBps)));
  const savingsTarget = (requested * BigInt(input.policy.minimum_savings_coverage_bps) + 9999n) / 10000n;
  const savingsBalance = parseEdirMoney(input.savingsBalance, true);
  const savingsCoverage = savingsTarget === 0n ? 100n : savingsBalance * 100n / savingsTarget;
  const savings = Number(savingsCoverage > 100n ? 100n : savingsCoverage);
  const tenure = input.policy.minimum_membership_days === 0
    ? 100
    : Math.max(0, Math.min(100, Math.floor(input.membershipDays * 100 / input.policy.minimum_membership_days)));
  const factors = {
    affordability,
    savings,
    membership_tenure: tenure,
    debt_service_bps: debtServiceBps,
    membership_days: input.membershipDays,
  };
  const score = Math.round(
    (affordability * input.policy.scorecard.weights.affordability
      + savings * input.policy.scorecard.weights.savings
      + tenure * input.policy.scorecard.weights.membership_tenure) / 100,
  );
  const eligible = requested <= parseEdirMoney(input.policy.maximum_principal)
    && input.requestedTermMonths <= input.policy.maximum_tenor_months
    && input.membershipDays >= input.policy.minimum_membership_days
    && savingsBalance >= savingsTarget
    && debtServiceBps <= maximumDebtServiceBps
    && score >= input.policy.scorecard.minimum_score;
  return { score, eligible, factors };
}

export function edirPrincipalSchedule(principal: string, termMonths: number, firstDueOn: Date) {
  const totalCents = parseEdirMoney(principal);
  const installments = BigInt(termMonths);
  const base = totalCents / installments;
  const remainder = totalCents % installments;
  const firstDay = Math.min(firstDueOn.getUTCDate(), 28);
  const year = firstDueOn.getUTCFullYear();
  const month = firstDueOn.getUTCMonth();
  return Array.from({ length: termMonths }, (_, index) => {
    const due = new Date(Date.UTC(year, month + index + 1, firstDay));
    const cents = base + (BigInt(index) < remainder ? 1n : 0n);
    return { installment_no: index + 1, due_on: due.toISOString().slice(0, 10), principal_due: formatEdirMoney(cents) };
  });
}
