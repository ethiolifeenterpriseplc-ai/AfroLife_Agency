export const GLOBAL_BI_METRICS = [
  { key: 'finance.posted_journals', label: 'Posted journals', source: 'accounting', unit: 'count', aggregation: 'flow' },
  { key: 'finance.pending_journals', label: 'Pending journals', source: 'accounting', unit: 'count', aggregation: 'snapshot' },
  { key: 'finance.posted_volume', label: 'Posted volume', source: 'accounting', unit: 'currency', aggregation: 'flow' },
  { key: 'workforce.workers_registered', label: 'Workers registered', source: 'workforce-management', unit: 'count', aggregation: 'flow' },
  { key: 'staffing.engagements_completed', label: 'Engagements completed', source: 'staffing', unit: 'count', aggregation: 'flow' },
  { key: 'property.listings_created', label: 'Listings created', source: 'property-management', unit: 'count', aggregation: 'flow' },
  { key: 'marketplace.orders_completed', label: 'Orders completed', source: 'marketplace', unit: 'count', aggregation: 'flow' },
  { key: 'edir.members_registered', label: 'Members registered', source: 'edir', unit: 'count', aggregation: 'flow' },
  { key: 'mfi.loan_disbursements', label: 'Loan disbursements', source: 'mfi', unit: 'currency', aggregation: 'flow' },
  { key: 'insurance.policies_issued', label: 'Policies issued', source: 'insurance', unit: 'count', aggregation: 'flow' },
] as const;

export type GlobalBiMetricKey = typeof GLOBAL_BI_METRICS[number]['key'];
export type GlobalBiSource = typeof GLOBAL_BI_METRICS[number]['source'];
export type GlobalBiMetricUnit = typeof GLOBAL_BI_METRICS[number]['unit'];
export type GlobalBiAggregation = typeof GLOBAL_BI_METRICS[number]['aggregation'];

export function isGlobalBiMetricKey(value: unknown): value is GlobalBiMetricKey {
  return typeof value === 'string' && GLOBAL_BI_METRICS.some((metric) => metric.key === value);
}

export function getGlobalBiMetric(key: GlobalBiMetricKey) {
  return GLOBAL_BI_METRICS.find((metric) => metric.key === key)!;
}

export function isThirtyMinuteBucket(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00(?:\.000)?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
