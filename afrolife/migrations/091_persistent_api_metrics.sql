CREATE TABLE system_api_route_metrics (
  route_key text PRIMARY KEY CHECK (length(route_key) BETWEEN 1 AND 300),
  request_count bigint NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  failure_count bigint NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  total_duration_ms numeric(20,2) NOT NULL DEFAULT 0 CHECK (total_duration_ms >= 0),
  max_duration_ms numeric(14,2) NOT NULL DEFAULT 0 CHECK (max_duration_ms >= 0),
  last_request_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (failure_count <= request_count)
);

ALTER TABLE system_api_route_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_api_route_metrics FORCE ROW LEVEL SECURITY;
CREATE POLICY system_api_route_metrics_admin_read ON system_api_route_metrics
  FOR SELECT USING (current_setting('app.role', true) = 'global_admin');
CREATE POLICY system_api_route_metrics_writer_read ON system_api_route_metrics
  FOR SELECT USING (current_setting('app.metrics_writer', true) = 'true');
CREATE POLICY system_api_route_metrics_persist ON system_api_route_metrics
  FOR INSERT WITH CHECK (current_setting('app.metrics_writer', true) = 'true');
CREATE POLICY system_api_route_metrics_update ON system_api_route_metrics
  FOR UPDATE USING (current_setting('app.metrics_writer', true) = 'true')
  WITH CHECK (current_setting('app.metrics_writer', true) = 'true');

GRANT SELECT, INSERT, UPDATE ON system_api_route_metrics TO "{{role}}";
