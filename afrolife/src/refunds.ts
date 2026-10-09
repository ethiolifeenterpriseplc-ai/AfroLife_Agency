/** How much more can be refunded for a contract. Fee refunds are capped at fees collected, guarantee returns at the guarantee held. */
export function refundLimit(
  k: { onboarding_amt: unknown; guarantee_amt: unknown; monthly_mgmt_amt: unknown; employer_fee_amt: unknown; other_fee_amt: unknown },
  kind: 'fee' | 'guarantee',
  alreadyRefunded: number,
  capPercent = 100,
): number {
  const guar = Number(k.guarantee_amt);
  const initial = Number(k.onboarding_amt) + guar + Number(k.monthly_mgmt_amt) + Number(k.employer_fee_amt) + Number(k.other_fee_amt);
  const cap = (kind === 'guarantee' ? guar : initial - guar) * Math.min(Math.max(capPercent, 0), 100) / 100;
  return Math.max(0, Math.round((cap - alreadyRefunded) * 100) / 100);
}
