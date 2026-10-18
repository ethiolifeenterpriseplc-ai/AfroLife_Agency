CREATE TABLE global_bi_metric_catalog (
  metric_key text PRIMARY KEY,
  label text NOT NULL,
  source_service text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('count','currency')),
  temporal_aggregation text NOT NULL CHECK (temporal_aggregation IN ('flow','snapshot')),
  UNIQUE (metric_key,source_service,unit)
);

INSERT INTO global_bi_metric_catalog(metric_key,label,source_service,unit,temporal_aggregation) VALUES
  ('finance.posted_journals','Posted journals','accounting','count','flow'),
  ('finance.pending_journals','Pending journals','accounting','count','snapshot'),
  ('finance.posted_volume','Posted volume','accounting','currency','flow'),
  ('workforce.workers_registered','Workers registered','workforce-management','count','flow'),
  ('staffing.engagements_completed','Engagements completed','staffing','count','flow'),
  ('property.listings_created','Listings created','property-management','count','flow'),
  ('marketplace.orders_completed','Orders completed','marketplace','count','flow'),
  ('edir.members_registered','Members registered','edir','count','flow'),
  ('mfi.loan_disbursements','Loan disbursements','mfi','currency','flow'),
  ('insurance.policies_issued','Policies issued','insurance','count','flow')
ON CONFLICT (metric_key) DO NOTHING;

CREATE TABLE global_bi_aggregates (
  tenant_id uuid NOT NULL,
  metric_key text NOT NULL,
  source_service text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric_value numeric(20,4) NOT NULL CHECK (metric_value >= 0),
  unit text NOT NULL CHECK (unit IN ('count','currency')),
  currency text NOT NULL DEFAULT '',
  projected_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,metric_key,period_start,currency),
  FOREIGN KEY (metric_key,source_service,unit)
    REFERENCES global_bi_metric_catalog(metric_key,source_service,unit),
  CHECK (
    period_start = date_trunc('month',period_start)::date
    AND period_end = (date_trunc('month',period_start) + interval '1 month - 1 day')::date
  ),
  CHECK ((unit='currency' AND currency ~ '^[A-Z]{3}$') OR (unit='count' AND currency='')),
  CHECK (metric_value < 10000000000000000)
);

ALTER TABLE global_bi_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_bi_aggregates FORCE ROW LEVEL SECURITY;
CREATE POLICY global_bi_aggregates_authorized_read ON global_bi_aggregates
  FOR SELECT USING (current_setting('app.role',true) IN (
    'global_admin','super_admin','finance','finance_manager'
  ));
CREATE POLICY global_bi_aggregates_projector_write ON global_bi_aggregates
  FOR ALL USING (current_setting('app.service',true)='global_bi_projector')
  WITH CHECK (current_setting('app.service',true)='global_bi_projector');

ALTER TABLE global_bi_metric_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_bi_metric_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY global_bi_metric_catalog_runtime_read ON global_bi_metric_catalog
  FOR SELECT USING (true);

CREATE INDEX global_bi_aggregates_period_metric
  ON global_bi_aggregates(period_start,metric_key,tenant_id);
CREATE INDEX global_bi_aggregates_projected_at
  ON global_bi_aggregates(projected_at);

GRANT USAGE ON SCHEMA public TO "{{query_role}}","{{ingest_role}}";
GRANT SELECT ON TABLE global_bi_aggregates,global_bi_metric_catalog TO "{{query_role}}";
GRANT SELECT ON TABLE global_bi_aggregates,global_bi_metric_catalog TO "{{ingest_role}}";
GRANT INSERT,UPDATE,DELETE ON TABLE global_bi_aggregates TO "{{ingest_role}}";
