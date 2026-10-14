CREATE TABLE mfi_sandbox_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  simulation text NOT NULL CHECK (simulation IN ('crb','biometrics','payment_rail','regulatory_return','ml_shadow')),
  scenario text NOT NULL CHECK (length(trim(scenario)) BETWEEN 1 AND 100),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (result->>'sandbox_only'='true'),
  CHECK (result->>'production_side_effects'='false'),
  CHECK (result->>'real_customer_data_used'='false'),
  CHECK (result->>'real_provider_called'='false')
);
CREATE INDEX mfi_sandbox_runs_recent_idx ON mfi_sandbox_runs(institution_id,created_at DESC);
ALTER TABLE mfi_sandbox_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_sandbox_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_sandbox_runs_scope ON mfi_sandbox_runs
  USING (mfi_has_access(institution_id))
  WITH CHECK (mfi_has_access(institution_id) AND actor_id=app_user_id());
REVOKE ALL ON TABLE mfi_sandbox_runs FROM PUBLIC;
GRANT SELECT,INSERT ON TABLE mfi_sandbox_runs TO "{{role}}";

CREATE OR REPLACE FUNCTION mfi_guard_sandbox_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sandbox simulation records are append-only';
END $$;
REVOKE ALL ON FUNCTION mfi_guard_sandbox_run() FROM PUBLIC;
CREATE TRIGGER mfi_sandbox_runs_immutable BEFORE UPDATE OR DELETE ON mfi_sandbox_runs
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_sandbox_run();
GRANT EXECUTE ON FUNCTION mfi_guard_sandbox_run() TO "{{role}}";
