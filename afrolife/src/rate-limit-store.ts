import { createHmac } from 'node:crypto';
import rateLimit, { type Store, type Options } from 'express-rate-limit';
import type { Pool } from 'pg';
import { JWT_SECRET, pool } from './core.js';

interface StoredLimit {
  hit_count: number;
  reset_at: Date | string;
}

const cleanupIntervalMs = 10 * 60_000;
let cleanupTimer: NodeJS.Timeout | undefined;

function startCleanup(pool: Pool) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    pool.query('DELETE FROM auth_rate_limit_buckets WHERE reset_at <= now()')
      .catch((error: unknown) => console.error('rate-limit bucket cleanup failed', error));
  }, cleanupIntervalMs);
  cleanupTimer.unref();
}

export class PostgresRateLimitStore implements Store {
  windowMs = 15 * 60_000;

  constructor(
    private readonly pool: Pool,
    private readonly namespace: string,
    private readonly keySecret: string,
  ) {
    if (!/^[a-z0-9-]+$/.test(namespace)) throw new Error('Invalid rate-limit namespace');
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
    startCleanup(this.pool);
  }

  private bucketKey(key: string) {
    const digest = createHmac('sha256', this.keySecret).update(`${this.namespace}\0${key}`).digest('hex');
    return `${this.namespace}:${digest}`;
  }

  async get(key: string) {
    const result = await this.pool.query<StoredLimit>(
      `SELECT hit_count, reset_at FROM auth_rate_limit_buckets
       WHERE bucket_key=$1 AND reset_at > now()`,
      [this.bucketKey(key)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      totalHits: Number(row.hit_count),
      resetTime: row.reset_at instanceof Date ? row.reset_at : new Date(row.reset_at),
    };
  }

  async increment(key: string) {
    const result = await this.pool.query<StoredLimit>(
      `INSERT INTO auth_rate_limit_buckets (bucket_key, hit_count, reset_at)
       VALUES ($1, 1, now() + ($2::double precision * interval '1 millisecond'))
       ON CONFLICT (bucket_key) DO UPDATE SET
         hit_count = CASE
           WHEN auth_rate_limit_buckets.reset_at <= now() THEN 1
           ELSE auth_rate_limit_buckets.hit_count + 1
         END,
         reset_at = CASE
           WHEN auth_rate_limit_buckets.reset_at <= now()
             THEN now() + ($2::double precision * interval '1 millisecond')
           ELSE auth_rate_limit_buckets.reset_at
         END
       RETURNING hit_count, reset_at`,
      [this.bucketKey(key), this.windowMs],
    );
    const row = result.rows[0];
    return {
      totalHits: Number(row.hit_count),
      resetTime: row.reset_at instanceof Date ? row.reset_at : new Date(row.reset_at),
    };
  }

  async decrement(key: string) {
    await this.pool.query(
      `UPDATE auth_rate_limit_buckets SET hit_count=GREATEST(hit_count - 1, 0)
       WHERE bucket_key=$1 AND reset_at > now()`,
      [this.bucketKey(key)],
    );
  }

  async resetKey(key: string) {
    await this.pool.query('DELETE FROM auth_rate_limit_buckets WHERE bucket_key=$1', [this.bucketKey(key)]);
  }

  async resetAll() {
    await this.pool.query('DELETE FROM auth_rate_limit_buckets WHERE bucket_key LIKE $1', [`${this.namespace}:%`]);
  }
}

export function createApiRateLimiter(namespace: string, limit: number, windowMs = 15 * 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(process.env.NODE_ENV === 'production'
      ? { store: new PostgresRateLimitStore(pool, namespace, JWT_SECRET) }
      : {}),
  });
}
