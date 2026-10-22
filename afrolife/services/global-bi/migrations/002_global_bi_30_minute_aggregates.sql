CREATE TABLE global_bi_30m_aggregates (
  tenant_id uuid NOT NULL,
  metric_key text NOT NULL,
  source_service text NOT NULL,
  bucket_start timestamptz NOT NULL,
  metric_value numeric(20,4) NOT NULL CHECK (metric_value >= 0),
  unit text NOT NULL CHECK (unit IN ('count','currency')),
  currency text NOT NULL DEFAULT '',
  projected_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,metric_key,bucket_start,currency),
  FOREIGN KEY (metric_key,source_service,unit)
    REFERENCES global_bi_metric_catalog(metric_key,source_service,unit),
  CHECK (extract(epoch FROM bucket_start)::bigint % 1800 = 0),
  CHECK ((unit='currency' AND currency ~ '^[A-Z]{3}$') OR (unit='count' AND currency='')),
  CHECK (metric_value < 10000000000000000)
);
DROP POLICY IF EXISTS global_bi_aggregates_authorized_read ON global_bi_aggregates;
CREATE POLICY global_bi_aggregates_global_admin_read ON global_bi_aggregates
  FOR SELECT USING (current_setting('app.role',true)='global_admin');
ALTER TABLE global_bi_30m_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_bi_30m_aggregates FORCE ROW LEVEL SECURITY;
CREATE POLICY global_bi_30m_aggregates_global_admin_read ON global_bi_30m_aggregates
  FOR SELECT USING (current_setting('app.role',true)='global_admin');
CREATE POLICY global_bi_30m_aggregates_projector_write ON global_bi_30m_aggregates
  FOR ALL USING (current_setting('app.service',true)='global_bi_projector')
  WITH CHECK (current_setting('app.service',true)='global_bi_projector');
CREATE INDEX global_bi_30m_aggregates_bucket_metric
  ON global_bi_30m_aggregates(bucket_start,metric_key,tenant_id);
CREATE INDEX global_bi_30m_aggregates_projected_at
  ON global_bi_30m_aggregates(projected_at);

REVOKE ALL ON TABLE global_bi_30m_aggregates FROM PUBLIC;
GRANT SELECT ON TABLE global_bi_30m_aggregates TO "{{query_role}}";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE global_bi_30m_aggregates TO "{{ingest_role}}";
