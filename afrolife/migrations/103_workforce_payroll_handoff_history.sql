CREATE TABLE workforce_payroll_export_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  export_id uuid NOT NULL REFERENCES workforce_payroll_exports(id),
  event_type text NOT NULL CHECK (event_type IN ('generated','handoff_failed','handed_off')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  external_reference text CHECK (external_reference IS NULL OR length(trim(external_reference)) BETWEEN 3 AND 160),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((event_type='handed_off' AND external_reference IS NOT NULL)
    OR (event_type<>'handed_off' AND external_reference IS NULL))
);
CREATE INDEX workforce_payroll_export_events_history_idx
  ON workforce_payroll_export_events(export_id,created_at,id);

CREATE OR REPLACE FUNCTION prevent_workforce_payroll_export_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Payroll export handoff evidence is append-only'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER workforce_payroll_export_events_immutable
  BEFORE UPDATE OR DELETE ON workforce_payroll_export_events
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_payroll_export_event_mutation();

ALTER TABLE workforce_payroll_export_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_events FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_payroll_export_events_manager_read
  ON workforce_payroll_export_events FOR SELECT
  USING (app_has_permission('workforce.payroll.export'));
CREATE POLICY workforce_payroll_export_events_manager_insert
  ON workforce_payroll_export_events FOR INSERT
  WITH CHECK (app_has_permission('workforce.payroll.export') AND actor_id=app_user_id());
GRANT SELECT,INSERT ON workforce_payroll_export_events TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE workforce_payroll_export_events_id_seq TO "{{role}}";
