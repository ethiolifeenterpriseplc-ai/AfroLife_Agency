import { z } from 'zod';
import { centsToAmount, decimalToCents } from './mfi-money.js';

export const creditPolicySchema = z.object({
  scorecard: z.object({
    minimum_score: z.number().int().min(0).max(100),
    maximum_debt_service_pct: z.number().min(1).max(100),
    savings_coverage_target_pct: z.number().min(0).max(1000),
    membership_tenure_target_days: z.number().int().min(0).max(36500),
    new_borrower_score: z.number().int().min(0).max(100),
    weights: z.object({ affordability: z.number().int().min(0).max(100), savings: z.number().int().min(0).max(100),
      tenure: z.number().int().min(0).max(100), repayment_history: z.number().int().min(0).max(100) }).strict(),
  }).strict(),
  delinquency: z.object({
    watch_days: z.number().int().min(1).max(3650),
    substandard_days: z.number().int().min(1).max(3650),
    doubtful_days: z.number().int().min(1).max(3650),
    loss_days: z.number().int().min(1).max(3650),
  }).strict(),
}).strict().superRefine((policy, ctx) => {
  const { weights } = policy.scorecard;
  if (Object.values(weights).reduce((sum, value) => sum + value, 0) !== 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scorecard', 'weights'], message: 'Credit score weights must add up to 100' });
  }
  const bands = [policy.delinquency.watch_days, policy.delinquency.substandard_days,
    policy.delinquency.doubtful_days, policy.delinquency.loss_days];
  if (bands.some((days, index) => index > 0 && days <= bands[index - 1])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delinquency'], message: 'Delinquency day thresholds must increase from watch through loss' });
  }
});

export type CreditPolicy = z.infer<typeof creditPolicySchema>;

export function scoreLoan(input: {
  policy: CreditPolicy;
  requestedAmount: string;
  termMonths: number;
  monthlyIncome: string;
  monthlyExpenses: string;
  monthlyDebt: string;
  savingsBalance: string;
  membershipDays: number;
  priorLoans: number;
  repaidLoans: number;
}) {
  const { scorecard } = input.policy;
  const income = decimalToCents(input.monthlyIncome);
  const expenseAndDebt = decimalToCents(input.monthlyExpenses) + decimalToCents(input.monthlyDebt);
  const proposedPayment = (decimalToCents(input.requestedAmount) + BigInt(input.termMonths) - 1n) / BigInt(input.termMonths);
  const dsrPct = income > 0n ? Number(((expenseAndDebt + proposedPayment) * 10000n) / income) / 100 : 10000;
  const affordability = Math.max(0, Math.min(100, Math.round((1 - dsrPct / scorecard.maximum_debt_service_pct) * 100)));
  const savingsTarget = decimalToCents(input.requestedAmount) * BigInt(Math.round(scorecard.savings_coverage_target_pct * 100));
  const savingsNeed = savingsTarget / 10000n;
  const savings = savingsNeed === 0n ? 100 : Math.min(100, Number(decimalToCents(input.savingsBalance) * 100n / savingsNeed));
  const tenure = scorecard.membership_tenure_target_days === 0 ? 100
    : Math.min(100, Math.floor(input.membershipDays * 100 / scorecard.membership_tenure_target_days));
  const repaymentHistory = input.priorLoans === 0 ? scorecard.new_borrower_score
    : Math.floor(input.repaidLoans * 100 / input.priorLoans);
  const factors = { affordability, savings, tenure, repayment_history: repaymentHistory, debt_service_pct: dsrPct };
  const score = Math.round((affordability * scorecard.weights.affordability + savings * scorecard.weights.savings
    + tenure * scorecard.weights.tenure + repaymentHistory * scorecard.weights.repayment_history) / 100);
  return { score, eligible: score >= scorecard.minimum_score && dsrPct <= scorecard.maximum_debt_service_pct, factors };
}

export function principalSchedule(principal: string, termMonths: number, firstDueOn: string) {
  const total = decimalToCents(principal);
  const count = BigInt(termMonths);
  const base = total / count;
  const remainder = total % count;
  const [year, month, day] = firstDueOn.split('-').map(Number);
  return Array.from({ length: termMonths }, (_, index) => {
    const due = new Date(Date.UTC(year, month - 1 + index, Math.min(day, 28)));
    const amount = base + (BigInt(index) < remainder ? 1n : 0n);
    return { installment_no: index + 1, due_on: due.toISOString().slice(0, 10), principal_due: centsToAmount(amount) };
  });
}
