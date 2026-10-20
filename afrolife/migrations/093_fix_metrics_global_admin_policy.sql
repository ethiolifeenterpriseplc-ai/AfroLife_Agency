DROP POLICY system_api_route_metrics_admin_read ON system_api_route_metrics;
CREATE POLICY system_api_route_metrics_admin_read ON system_api_route_metrics
  FOR SELECT USING (current_setting('app.role', true) = 'global_admin');
