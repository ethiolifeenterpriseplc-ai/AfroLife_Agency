CREATE TABLE release_readiness_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN (
    'platform','workforce','insurance','mfi','edir','property','marketplace','agency'
  )),
  category text NOT NULL CHECK (category IN (
    'legal','provider','finance','security','operations','accessibility',
    'capacity','dr','incident','service_account','release_owner','privacy'
  )),
  status text NOT NULL CHECK (status IN (
    'open','evidence_recorded','blocked','not_applicable'
  )),
  owner_name text NOT NULL CHECK (length(trim(owner_name)) BETWEEN 2 AND 160),
  approver_name text NOT NULL CHECK (length(trim(approver_name)) BETWEEN 2 AND 160),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 3 AND 500),
  environment text NOT NULL CHECK (environment IN ('production','staging','sandbox','development')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_by_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX release_readiness_evidence_module_created_idx
  ON release_readiness_evidence (module, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_release_readiness_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Release readiness evidence is append-only';
END
$$;

CREATE TRIGGER release_readiness_evidence_immutable
BEFORE UPDATE OR DELETE ON release_readiness_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_release_readiness_evidence_mutation();

ALTER TABLE release_readiness_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_readiness_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY release_readiness_evidence_read ON release_readiness_evidence
  FOR SELECT USING (app_role() IN ('global_admin','super_admin'));
CREATE POLICY release_readiness_evidence_insert ON release_readiness_evidence
  FOR INSERT WITH CHECK (
    app_role() IN ('global_admin','super_admin')
    AND recorded_by = app_user_id()
    AND recorded_by_role = coalesce(nullif(current_setting('app.role', true), ''), '')
  );

REVOKE ALL ON TABLE release_readiness_evidence FROM PUBLIC;
REVOKE ALL ON TABLE release_readiness_evidence FROM "{{role}}";
GRANT SELECT, INSERT ON TABLE release_readiness_evidence TO "{{role}}";
