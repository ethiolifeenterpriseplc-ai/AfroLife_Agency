import { z } from 'zod';
import { HttpError } from '../../src/http-error.js';
import { GLOBAL_BI_BUCKET_MINUTES, GLOBAL_BI_MAX_QUERY_DAYS, GLOBAL_BI_RETENTION_MONTHS } from './projection-contract.js';

const interval = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
}).strict();

function floorBucket(date: Date): Date {
  const bucket = new Date(date);
  bucket.setUTCMinutes(bucket.getUTCMinutes() - (bucket.getUTCMinutes() % GLOBAL_BI_BUCKET_MINUTES), 0, 0);
  return bucket;
}

function defaultRange(now = new Date()) {
  const to = floorBucket(now);
  return { from: new Date(to.valueOf() - 24 * 60 * 60_000), to };
}

function retentionStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (GLOBAL_BI_RETENTION_MONTHS - 1), 1));
}

export function parseGlobalBiRange(input: unknown, now = new Date()) {
  const defaults = defaultRange(now);
  const parsed = interval.safeParse(input);
  const from = parsed.success ? new Date(parsed.data.from) : defaults.from;
  const to = parsed.success ? new Date(parsed.data.to) : defaults.to;
  if (!parsed.success && input && typeof input === 'object' && Object.keys(input).length) {
    throw new HttpError(400, 'Provide valid UTC from and to timestamps.');
  }
  if (from.valueOf() > to.valueOf()) throw new HttpError(400, 'Report start must be before report end.');
  if (from.valueOf() % 1_800_000 !== 0 || to.valueOf() % 1_800_000 !== 0) {
    throw new HttpError(400, 'Global BI filters must align to a 30-minute UTC bucket.');
  }
  if (from < retentionStart(now)) throw new HttpError(400, 'Global BI reports are limited to the retention window.');
  if (to.valueOf() - from.valueOf() > GLOBAL_BI_MAX_QUERY_DAYS * 24 * 60 * 60_000) {
    throw new HttpError(400, `Global BI report windows are limited to ${GLOBAL_BI_MAX_QUERY_DAYS} days.`);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}
