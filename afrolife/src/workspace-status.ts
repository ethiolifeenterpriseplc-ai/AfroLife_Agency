import type { RequestHandler } from 'express';

export type WorkspaceServiceStatus = 'available' | 'unavailable' | 'integrated' | 'disabled';

export interface WorkspaceService {
  id: string;
  name: string;
  status: WorkspaceServiceStatus;
  latency_ms: number | null;
}

interface ServiceProbe {
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
  };
}

const apiMetrics = createApiMetrics();
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

export function getApiMetrics() {
  return { captured_at: new Date().toISOString(), routes: apiMetrics.snapshot() };
}

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
