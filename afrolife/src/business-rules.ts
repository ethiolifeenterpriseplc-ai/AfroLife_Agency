export const BUSINESS_RULES = [
  { key: 'A_onboarding_pct', group: 'Contract pricing', label: 'Track A onboarding fee (%)', min: 0, max: 100, step: 0.01 },
  { key: 'A_guarantee_pct', group: 'Contract pricing', label: 'Track A guarantee (%)', min: 0, max: 100, step: 0.01 },
  { key: 'A_monthly_pct', group: 'Contract pricing', label: 'Track A monthly management fee (%)', min: 0, max: 100, step: 0.01 },
  { key: 'B_employer_pct', group: 'Contract pricing', label: 'Track B employer fee (%)', min: 0, max: 100, step: 0.01 },
  { key: 'B_other_pct', group: 'Contract pricing', label: 'Track B other fee (%)', min: 0, max: 100, step: 0.01 },
  { key: 'first_contract_commission_pct', group: 'Contract pricing', label: 'First-contract commission (%)', min: 0, max: 100, step: 0.01 },
  { key: 'guarantee_commissionable', group: 'Contract pricing', label: 'Include guarantee in commission calculation', min: 0, max: 1, step: 1 },
  { key: 'agent_pro_monthly_etb', group: 'Agent plans', label: 'Pro monthly price (ETB)', min: 1, max: 10000000, step: 1 },
  { key: 'agent_enterprise_monthly_etb', group: 'Agent plans', label: 'Enterprise monthly price (ETB)', min: 1, max: 10000000, step: 1 },
  { key: 'agent_subscription_grace_days', group: 'Agent plans', label: 'Paid-plan renewal grace period (days)', min: 0, max: 30, step: 1 },
  { key: 'match_w_skills', group: 'Worker matching', label: 'Skills match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_w_location', group: 'Worker matching', label: 'Location match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_w_availability', group: 'Worker matching', label: 'Availability match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_w_experience', group: 'Worker matching', label: 'Experience match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_w_rate', group: 'Worker matching', label: 'Rate match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_w_language', group: 'Worker matching', label: 'Language match weight', min: 0, max: 100, step: 0.01 },
  { key: 'match_minimum_score', group: 'Worker matching', label: 'Minimum candidate score (%)', min: 0, max: 100, step: 0.1 },
  { key: 'match_sibling_area_factor', group: 'Worker matching', label: 'Sibling-area location score factor', min: 0, max: 1, step: 0.01 },
  { key: 'match_availability_within_2_weeks', group: 'Worker matching', label: 'Available within two weeks score', min: 0, max: 1, step: 0.01 },
  { key: 'match_availability_later', group: 'Worker matching', label: 'Available later score', min: 0, max: 1, step: 0.01 },
  { key: 'match_rate_tolerance_pct', group: 'Worker matching', label: 'Rate tolerance above offer (%)', min: 1, max: 500, step: 0.1 },
  { key: 'worker_requires_reference', group: 'Worker eligibility', label: 'Require a verified reference document', min: 0, max: 1, step: 1 },
  { key: 'worker_requires_certificate', group: 'Worker eligibility', label: 'Require a verified certificate', min: 0, max: 1, step: 1 },
  { key: 'lease_default_due_day', group: 'Property management', label: 'Default rent due day', min: 1, max: 28, step: 1 },
  { key: 'lease_max_months', group: 'Property management', label: 'Maximum lease term (months)', min: 1, max: 120, step: 1 },
  { key: 'invoice_due_days', group: 'Contract workflow', label: 'Invoice payment period (days)', min: 1, max: 90, step: 1 },
  { key: 'refund_fee_cap_pct', group: 'Refunds', label: 'Maximum fee refund (% of fees collected)', min: 0, max: 100, step: 0.01 },
  { key: 'refund_guarantee_cap_pct', group: 'Refunds', label: 'Maximum guarantee refund (% of guarantee held)', min: 0, max: 100, step: 0.01 },
] as const;

export type BusinessRuleKey = typeof BUSINESS_RULES[number]['key'];

const definitions = new Map(BUSINESS_RULES.map((rule) => [rule.key, rule]));

export function validateBusinessRuleUpdates(
  values: Record<string, number>,
  current: Record<string, number>,
): string[] {
  const errors: string[] = [];
  const keys = Object.keys(values);

  if (!keys.length) errors.push('Choose at least one rule to update.');
  for (const key of keys) {
    const rule = definitions.get(key as BusinessRuleKey);
    const value = values[key];
    if (!rule) {
      errors.push(`Unknown business rule: ${key}.`);
      continue;
    }
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      errors.push(`${rule.label} must be between ${rule.min} and ${rule.max}.`);
      continue;
    }
    const steps = (value - rule.min) / rule.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-8) {
      errors.push(`${rule.label} has too many decimal places.`);
    }
  }

  const next = { ...current, ...values };
  const weightKeys = [
    'match_w_skills', 'match_w_location', 'match_w_availability',
    'match_w_experience', 'match_w_rate', 'match_w_language',
  ];
  if (weightKeys.every((key) => Number(next[key]) === 0)) {
    errors.push('At least one worker matching weight must be greater than zero.');
  }
  return errors;
}
