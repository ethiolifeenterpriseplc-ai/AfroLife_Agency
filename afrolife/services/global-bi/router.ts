import express, { type Request, type Response, type NextFunction } from 'express';
import type { AuthUser } from '../../src/auth-types.js';
import { GLOBAL_BI_BUCKET_MINUTES } from './projection-contract.js';
import { assertGlobalBiAccess } from './access-control.js';
import { parseGlobalBiRange } from './query-range.js';
import { summarizeProjectionStatus } from './projection-status.js';
import { withUser } from './db.js';

const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function createGlobalBiRouter() {
  const router = express.Router();
  router.get('/status', h(async (req, res) => {
    assertGlobalBiAccess(req.user!.role);
    const freshness = await withUser(req.user! as AuthUser, async (client) => (await client.query(
      `SELECT count(DISTINCT tenant_id)::int AS observed_tenants,
              max(projected_at) AS latest_projection
       FROM global_bi_30m_aggregates`,
    )).rows[0]);
    res.json(summarizeProjectionStatus(
      freshness.latest_projection,
      Number(freshness.observed_tenants),
    ));
  }));
  router.get('/dashboard', h(async (req, res) => {
    assertGlobalBiAccess(req.user!.role);
    const { from, to } = parseGlobalBiRange(req.query);
    const result = await withUser(req.user! as AuthUser, async (client) => {
      const metrics = (await client.query(
        `WITH selected AS (
           SELECT a.tenant_id,a.metric_key,a.bucket_start,a.metric_value,a.unit,a.currency,
                  c.temporal_aggregation
           FROM global_bi_30m_aggregates a
           JOIN global_bi_metric_catalog c ON c.metric_key=a.metric_key
           WHERE a.bucket_start >= $1::timestamptz AND a.bucket_start <= $2::timestamptz
             AND (c.temporal_aggregation='flow' OR a.bucket_start=(
               SELECT max(latest.bucket_start) FROM global_bi_30m_aggregates latest
               WHERE latest.tenant_id=a.tenant_id AND latest.metric_key=a.metric_key
                 AND coalesce(latest.currency,'')=coalesce(a.currency,'')
                 AND latest.bucket_start >= $1::timestamptz AND latest.bucket_start <= $2::timestamptz
             ))
         )
         SELECT metric_key AS key,sum(metric_value)::text AS value,unit,currency
         FROM selected GROUP BY metric_key,unit,currency ORDER BY metric_key,currency`,
        [from, to],
      )).rows;
      const series = (await client.query(
        `SELECT a.bucket_start AS period,a.metric_key AS metric,
                sum(a.metric_value)::text AS value,a.unit,a.currency
         FROM global_bi_30m_aggregates a
         WHERE a.bucket_start >= $1::timestamptz AND a.bucket_start <= $2::timestamptz
         GROUP BY a.bucket_start,a.metric_key,a.unit,a.currency
         ORDER BY a.bucket_start,a.metric_key,a.currency`,
        [from, to],
      )).rows;
      const freshness = (await client.query(
        `SELECT count(DISTINCT tenant_id)::int AS observed_tenants,
                max(projected_at) AS latest_projection,
                min(projected_at) AS oldest_projection
         FROM global_bi_30m_aggregates
         WHERE bucket_start >= $1::timestamptz AND bucket_start <= $2::timestamptz`,
        [from, to],
      )).rows[0];
      const projectionStatus = summarizeProjectionStatus(
        freshness.latest_projection,
        Number(freshness.observed_tenants),
      );
      return {
        from,
        to,
        ...projectionStatus,
        reportingTenants: projectionStatus.observedTenants,
        asOf: projectionStatus.latestProjectionAt,
        oldestProjectionAt: freshness.oldest_projection?.toISOString?.() ?? null,
        metrics,
        series,
      };
    });
    res.json(result);
  }));
  return router;
}
