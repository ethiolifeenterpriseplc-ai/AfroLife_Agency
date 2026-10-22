import { GLOBAL_BI_BUCKET_MINUTES, GLOBAL_BI_RETENTION_MONTHS } from './projection-contract.js';

export type ProjectionState = 'not_configured' | 'recent_projection_observed' | 'stale' | 'invalid_timestamp';

export function summarizeProjectionStatus(
  latestValue: Date | string | null | undefined,
  observedTenants: number,
  now = new Date(),
) {
  const latest = latestValue
    ? latestValue instanceof Date ? new Date(latestValue.valueOf()) : new Date(latestValue)
    : null;
  const validLatest = latest && Number.isFinite(latest.valueOf()) ? latest : null;
  const ageMs = validLatest ? now.valueOf() - validLatest.valueOf() : null;
  const projectionState: ProjectionState = !latestValue
    ? 'not_configured'
    : !validLatest || ageMs! < 0
      ? 'invalid_timestamp'
      : ageMs! <= GLOBAL_BI_BUCKET_MINUTES * 60_000
        ? 'recent_projection_observed'
        : 'stale';
  return {
    grain: '30_minutes',
    bucketTimeZone: 'UTC',
    targetIntervalMinutes: GLOBAL_BI_BUCKET_MINUTES,
    retentionMonths: GLOBAL_BI_RETENTION_MONTHS,
    observedTenants: Math.max(0, Math.trunc(observedTenants)),
    latestProjectionAt: validLatest?.toISOString() ?? null,
    latestAgeMinutes: ageMs === null || ageMs < 0 ? null : Math.floor(ageMs / 60_000),
    projectionState,
    projectorConfiguration: 'not_configured' as const,
    schedulerConfiguration: 'not_configured' as const,
    tenantProjectorHealth: 'unconfirmed' as const,
    healthEvidence: 'Central platform has no trusted tenant-projector health signal or expected tenant inventory.',
  };
}
