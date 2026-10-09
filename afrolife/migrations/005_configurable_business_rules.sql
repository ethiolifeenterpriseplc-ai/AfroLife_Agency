INSERT INTO config_rules (key, value) VALUES
  ('agent_pro_monthly_etb', 500),
  ('agent_enterprise_monthly_etb', 1000),
  ('agent_subscription_grace_days', 7),
  ('match_minimum_score', 0),
  ('match_sibling_area_factor', 0.5),
  ('match_availability_within_2_weeks', 0.6),
  ('match_availability_later', 0.2),
  ('match_rate_tolerance_pct', 50),
  ('worker_requires_reference', 0),
  ('worker_requires_certificate', 0),
  ('lease_default_due_day', 5),
  ('lease_max_months', 24),
  ('invoice_due_days', 7),
  ('refund_fee_cap_pct', 100),
  ('refund_guarantee_cap_pct', 100)
ON CONFLICT (key) DO NOTHING;
