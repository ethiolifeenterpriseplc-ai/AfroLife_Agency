ALTER TABLE user_signups
  ADD COLUMN IF NOT EXISTS date_of_birth date;

INSERT INTO config_rules (key, value) VALUES
  ('worker_min_age_years', 18),
  ('lease_min_term_months', 24),
  ('lease_max_advance_months', 2),
  ('lease_registration_deadline_days', 30),
  ('rent_annual_increase_cap_pct', 11.5)
ON CONFLICT (key) DO NOTHING;
