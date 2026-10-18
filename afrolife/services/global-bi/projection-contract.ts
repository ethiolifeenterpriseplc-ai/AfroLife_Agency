import { z } from 'zod';
import { getGlobalBiMetric, isGlobalBiMetricKey, isMonthlyWindow, type GlobalBiMetricKey } from './catalog.js';

const projectionValue = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);

const batchSchema = z.object({
  tenantId: z.string().uuid(),
  generatedAt: z.string().datetime({ offset: true }),
  projections: z.array(z.object({
    metricKey: z.custom<GlobalBiMetricKey>(isGlobalBiMetricKey),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    value: projectionValue,
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  }).strict()).min(1).max(5000),
}).strict().superRefine((batch, context) => {
  const seen = new Set<string>();
  batch.projections.forEach((projection, index) => {
    const key = `${projection.metricKey}:${projection.periodStart}:${projection.currency ?? ''}`;
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projections', index],
        message: 'A monthly metric may appear only once in a projection batch',
      });
    }
    seen.add(key);
  });
});

export type GlobalBiProjectionBatch = z.infer<typeof batchSchema>;

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
  const retentionStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
    .toISOString().slice(0, 10);
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().slice(0, 10);
  for (const projection of batch.projections) {
    const definition = getGlobalBiMetric(projection.metricKey);
    if (!isMonthlyWindow(projection.periodStart, projection.periodEnd)) {
      throw new Error(`Projection ${projection.metricKey} must use an exact calendar-month period`);
    }
    if ((definition.unit === 'currency') !== Boolean(projection.currency)) {
      throw new Error(`Projection ${projection.metricKey} requires ${definition.unit === 'currency' ? 'a' : 'no'} currency`);
    }
    if (definition.unit === 'count' && !/^\d+$/.test(projection.value)) {
      throw new Error(`Projection ${projection.metricKey} must be an integer count`);
    }
    if (projection.periodStart < retentionStart) {
      throw new Error(`Projection ${projection.metricKey} is outside the 13-month retention window`);
    }
    if (projection.periodStart > currentMonthStart) {
      throw new Error(`Projection ${projection.metricKey} cannot be for a future month`);
    }
  }
  return batch;
}
