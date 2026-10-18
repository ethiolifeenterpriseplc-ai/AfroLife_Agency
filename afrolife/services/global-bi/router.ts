import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { HttpError } from '../../src/http-error.js';
import type { AuthUser } from '../../src/auth-types.js';
import { withUser } from './db.js';

const GLOBAL_BI_ROLES = ['global_admin', 'super_admin', 'finance', 'finance_manager'];
const dateRange = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).strict();

function defaultDateRange(now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
    .toISOString().slice(0, 10);
  return { from: start, to: end };
}

function thirteenMonthsAgo(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
    .toISOString().slice(0, 10);
}

const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function createGlobalBiRouter() {
  const router = express.Router();
  router.get('/dashboard', h(async (req, res) => {
    if (!GLOBAL_BI_ROLES.includes(req.user!.role)) {
      throw new HttpError(403, 'Your role cannot view Global BI');
    }
    const input = dateRange.parse(req.query);
    const defaults = defaultDateRange();
    const from = input.from ?? defaults.from;
    const to = input.to ?? defaults.to;
    if (from > to) throw new HttpError(400, 'Report start date must be on or before its end date');
    if (from < thirteenMonthsAgo()) throw new HttpError(400, 'Global BI reports are limited to the 13-month retention window');

    const result = await withUser(req.user! as AuthUser, async (client) => {
      const metrics = (await client.query(
        `WITH selected AS (
           SELECT a.tenant_id, a.metric_key, a.period_start, a.metric_value, a.unit,
                  a.currency, a.projected_at, c.temporal_aggregation
           FROM global_bi_aggregates a
           JOIN global_bi_metric_catalog c ON c.metric_key=a.metric_key
           WHERE a.period_start >= $1::date AND a.period_end <= $2::date
             AND (
               c.temporal_aggregation='flow'
               OR a.period_start=(
                 SELECT max(latest.period_start)
                 FROM global_bi_aggregates latest
                 WHERE latest.tenant_id=a.tenant_id
                   AND latest.metric_key=a.metric_key
                   AND coalesce(latest.currency,'')=coalesce(a.currency,'')
                   AND latest.period_start >= $1::date AND latest.period_end <= $2::date
               )
             )
         )
         SELECT metric_key AS key, sum(metric_value)::text AS value, unit, currency
         FROM selected
         GROUP BY metric_key, unit, currency
         ORDER BY metric_key, currency`,
        [from, to],
      )).rows;
      const series = (await client.query(
        `SELECT a.period_start::text AS period, a.metric_key AS metric,
                sum(a.metric_value)::text AS value, a.unit, a.currency
         FROM global_bi_aggregates a
         WHERE a.period_start >= $1::date AND a.period_end <= $2::date
         GROUP BY a.period_start, a.metric_key, a.unit, a.currency
         ORDER BY a.period_start, a.metric_key, a.currency`,
        [from, to],
      )).rows;
      const freshness = (await client.query(
        `SELECT count(DISTINCT tenant_id)::int AS reporting_tenants,
                min(projected_at) AS as_of
         FROM global_bi_aggregates
         WHERE period_start >= $1::date AND period_end <= $2::date`,
        [from, to],
      )).rows[0];
      return {
        from,
        to,
        asOf: freshness.as_of?.toISOString?.() ?? null,
        reportingTenants: freshness.reporting_tenants,
        metrics,
        series,
      };
    });
    res.json(result);
  }));
  return router;
}
