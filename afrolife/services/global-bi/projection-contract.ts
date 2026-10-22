import { z } from 'zod';
import { getGlobalBiMetric, isGlobalBiMetricKey, isThirtyMinuteBucket, type GlobalBiMetricKey } from './catalog.js';

const projectionValue = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);
const batchSchema = z.object({
  tenantId: z.string().uuid(),
  generatedAt: z.string().datetime({ offset: true }),
  projections: z.array(z.object({
    metricKey: z.custom<GlobalBiMetricKey>(isGlobalBiMetricKey),
    bucketStart: z.string().refine(isThirtyMinuteBucket, 'bucketStart must be a UTC 00 or 30 minute boundary'),
    value: projectionValue,
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  }).strict()).min(1).max(5000),
}).strict().superRefine((batch, context) => {
  const seen = new Set<string>();
  batch.projections.forEach((projection, index) => {
    const key = `${projection.metricKey}:${projection.bucketStart}:${projection.currency ?? ''}`;
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projections', index],
        message: 'A metric may appear only once per 30-minute bucket',
      });
    }
    seen.add(key);
  });
});

export type GlobalBiProjectionBatch = z.infer<typeof batchSchema>;
export const GLOBAL_BI_BUCKET_MINUTES = 30;
export const GLOBAL_BI_RETENTION_MONTHS = 13;
export const GLOBAL_BI_MAX_QUERY_DAYS = 31;

export function assertProjectionTenant(batch: GlobalBiProjectionBatch, configuredTenantId: string | undefined): void {
  const expectedTenantId = z.string().uuid().safeParse(configuredTenantId);
  if (!expectedTenantId.success) {
    throw new Error('GLOBAL_BI_PROJECTOR_TENANT_ID must be a valid UUID');
  }
  if (batch.tenantId !== expectedTenantId.data) {
    throw new Error('Projection tenantId does not match this projector deployment');
  }
}

export function validateGlobalBiProjectionBatch(value: unknown, now = new Date()): GlobalBiProjectionBatch {
  const batch = batchSchema.parse(value);
  const generatedAt = new Date(batch.generatedAt);
  if (generatedAt.valueOf() > now.valueOf() + 5 * 60_000) {
    throw new Error('Projection generatedAt cannot be more than five minutes in the future');
  }
  const retentionStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  for (const projection of batch.projections) {
    const definition = getGlobalBiMetric(projection.metricKey);
    const bucketStart = new Date(projection.bucketStart);
    if (bucketStart.valueOf() > now.valueOf() + 5 * 60_000) {
      throw new Error(`Projection ${projection.metricKey} cannot be for a future bucket`);
    }
    if (bucketStart.valueOf() > generatedAt.valueOf()) {
      throw new Error(`Projection ${projection.metricKey} bucket must not start after it was generated`);
    }
    if (bucketStart < retentionStart) {
      throw new Error(`Projection ${projection.metricKey} is outside the 13-month retention window`);
    }
    if ((definition.unit === 'currency') !== Boolean(projection.currency)) {
      throw new Error(`Projection ${projection.metricKey} requires ${definition.unit === 'currency' ? 'a' : 'no'} currency`);
    }
    if (definition.unit === 'count' && !/^\d+$/.test(projection.value)) {
      throw new Error(`Projection ${projection.metricKey} must be an integer count`);
    }
  }
  return batch;
}
