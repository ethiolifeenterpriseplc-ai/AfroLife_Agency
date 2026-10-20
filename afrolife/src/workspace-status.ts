import type { RequestHandler } from 'express';
import { pool } from './core.js';

export type WorkspaceServiceStatus = 'available' | 'unavailable' | 'integrated' | 'disabled';

export interface WorkspaceService {
  id: string;
  name: string;
  status: WorkspaceServiceStatus;
  latency_ms: number | null;
}

export interface ServiceProbe {
  id: string;
  name: string;
  enabled: boolean;
  url?: string;
  withoutUrl: 'integrated' | 'disabled';
}

export interface ApiRouteMetric {
  route: string;
  requests: number;
  failures: number;
  average_duration_ms: number;
  max_duration_ms: number;
  last_request_at: string;
}

export interface WorkspaceServiceSnapshot {
  checked_at: string;
  services: WorkspaceService[];
}

export function createApiMetrics(maxRoutes = 500) {
  const routes = new Map<string, {
    requests: number;
    failures: number;
    totalDuration: number;
    maxDuration: number;
    lastRequestAt: string;
  }>();

  return {
    record(method: string, route: string, status: number, durationMs: number, now = new Date()) {
      const key = `${method.toUpperCase()} ${route}`;
      let metric = routes.get(key);
      if (!metric) {
        if (routes.size >= maxRoutes) {
          const oldest = routes.keys().next().value;
          if (oldest) routes.delete(oldest);
        }
        metric = { requests: 0, failures: 0, totalDuration: 0, maxDuration: 0, lastRequestAt: '' };
        routes.set(key, metric);
      }
      const duration = Math.max(0, durationMs);
      metric.requests += 1;
      if (status >= 400) metric.failures += 1;
      metric.totalDuration += duration;
      metric.maxDuration = Math.max(metric.maxDuration, duration);
      metric.lastRequestAt = now.toISOString();
    },
    snapshot(): ApiRouteMetric[] {
      return [...routes.entries()].map(([route, metric]) => ({
        route,
        requests: metric.requests,
        failures: metric.failures,
        average_duration_ms: Math.round((metric.totalDuration / metric.requests) * 100) / 100,
        max_duration_ms: Math.round(metric.maxDuration * 100) / 100,
        last_request_at: metric.lastRequestAt,
      })).sort((left, right) => right.requests - left.requests || left.route.localeCompare(right.route));
    },
    drain() {
      const result = [...routes.entries()].map(([route, metric]) => ({
        route,
        requests: metric.requests,
        failures: metric.failures,
        total_duration_ms: metric.totalDuration,
        max_duration_ms: metric.maxDuration,
        last_request_at: metric.lastRequestAt,
      }));
      routes.clear();
      return result;
    },
    restore(deltas: Array<{ route: string; requests: number; failures: number; total_duration_ms: number; max_duration_ms: number; last_request_at: string }>) {
      for (const delta of deltas) {
        let metric = routes.get(delta.route);
        if (!metric) {
          if (routes.size >= maxRoutes) {
            const oldest = routes.keys().next().value;
            if (oldest) routes.delete(oldest);
          }
          metric = { requests: 0, failures: 0, totalDuration: 0, maxDuration: 0, lastRequestAt: '' };
          routes.set(delta.route, metric);
        }
        metric.requests += delta.requests;
        metric.failures += delta.failures;
        metric.totalDuration += delta.total_duration_ms;
        metric.maxDuration = Math.max(metric.maxDuration, delta.max_duration_ms);
        if (delta.last_request_at > metric.lastRequestAt) metric.lastRequestAt = delta.last_request_at;
      }
    },
  };
}

const apiMetrics = createApiMetrics();
let metricFlushPending: Promise<void> | undefined;
export async function flushApiMetrics() {
  if (metricFlushPending) return metricFlushPending;
  const deltas = apiMetrics.drain();
  if (!deltas.length) return;
  const flush = async () => {
    let client: import('pg').PoolClient | undefined;
    let transactionStarted = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query("SELECT set_config('app.metrics_writer','true',true)");
      for (const metric of deltas) {
        await client.query(
          `INSERT INTO system_api_route_metrics
             (route_key,request_count,failure_count,total_duration_ms,max_duration_ms,last_request_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (route_key) DO UPDATE SET
             request_count=system_api_route_metrics.request_count+EXCLUDED.request_count,
             failure_count=system_api_route_metrics.failure_count+EXCLUDED.failure_count,
             total_duration_ms=system_api_route_metrics.total_duration_ms+EXCLUDED.total_duration_ms,
             max_duration_ms=GREATEST(system_api_route_metrics.max_duration_ms,EXCLUDED.max_duration_ms),
             last_request_at=GREATEST(system_api_route_metrics.last_request_at,EXCLUDED.last_request_at),
             updated_at=now()`,
          [metric.route, metric.requests, metric.failures, metric.total_duration_ms, metric.max_duration_ms, metric.last_request_at],
        );
      }
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await client?.query('ROLLBACK').catch(() => undefined);
      apiMetrics.restore(deltas);
      throw error;
    } finally {
      client?.release();
    }
  };
  metricFlushPending = flush().finally(() => { metricFlushPending = undefined; });
  return metricFlushPending;
}

export function startApiMetricsPersistence() {
  const timer = setInterval(() => {
    void flushApiMetrics().catch((error) => console.error('API metrics persistence failed', error instanceof Error ? error.message : error));
  }, 5_000);
  timer.unref();
  return timer;
}

export async function readPersistedApiMetrics(client: import('pg').PoolClient) {
  const result = await client.query(
    `SELECT route_key AS route, request_count AS requests, failure_count AS failures,
       CASE WHEN request_count=0 THEN 0 ELSE round(total_duration_ms/request_count,2) END AS average_duration_ms,
       max_duration_ms, last_request_at
     FROM system_api_route_metrics ORDER BY request_count DESC, route_key LIMIT 500`,
  );
  return { captured_at: new Date().toISOString(), routes: result.rows };
}
export const apiMetricsMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();
  const baseUrl = req.baseUrl;
  res.once('finish', () => {
    const routePath = req.route?.path;
    const route = typeof routePath === 'string' ? `${baseUrl}${routePath}` : '/unmatched';
    apiMetrics.record(req.method, route, res.statusCode, performance.now() - startedAt);
  });
  next();
};

export function getApiMetrics() { return { captured_at: new Date().toISOString(), routes: apiMetrics.snapshot() }; }

export async function checkWorkspaceServices(
  probes: ServiceProbe[],
  fetcher: typeof fetch = fetch,
  logError: (name: string, error: unknown) => void = (name, error) => {
    console.error(`Workspace health check failed for ${name}`, error);
  },
): Promise<WorkspaceService[]> {
  return Promise.all(probes.map(async (probe): Promise<WorkspaceService> => {
    if (!probe.enabled) {
      return { id: probe.id, name: probe.name, status: 'disabled', latency_ms: null };
    }
    if (!probe.url) {
      return { id: probe.id, name: probe.name, status: probe.withoutUrl, latency_ms: null };
    }

    const startedAt = Date.now();
    try {
      const baseUrl = new URL(probe.url);
      baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/healthz`;
      baseUrl.search = '';
      baseUrl.hash = '';
      const response = await fetcher(baseUrl, { signal: AbortSignal.timeout(2500) });
      return {
        id: probe.id,
        name: probe.name,
        status: response.ok ? 'available' : 'unavailable',
        latency_ms: Date.now() - startedAt,
      };
    } catch (error) {
      logError(probe.name, error);
      return {
        id: probe.id,
        name: probe.name,
        status: 'unavailable',
        latency_ms: Date.now() - startedAt,
      };
    }
  }));
}

/** Reuses recent health results and coalesces simultaneous refreshes into one probe pass. */
export function createWorkspaceServiceStatusCache(
  ttlMs = 15_000,
  checker: typeof checkWorkspaceServices = checkWorkspaceServices,
) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Workspace status cache TTL must be positive');
  let cached: { expiresAt: number; snapshot: WorkspaceServiceSnapshot } | undefined;
  let pending: Promise<WorkspaceServiceSnapshot> | undefined;

  return async (probes: ServiceProbe[]): Promise<WorkspaceServiceSnapshot> => {
    if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
    if (pending) return pending;

    pending = checker(probes).then((services) => {
      const snapshot = { checked_at: new Date().toISOString(), services };
      cached = { expiresAt: Date.now() + ttlMs, snapshot };
      return snapshot;
    });
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
