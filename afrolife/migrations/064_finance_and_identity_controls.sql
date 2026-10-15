-- 064_finance_and_identity_controls.sql
ALTER TABLE service_identities
  ADD COLUMN secret_manager_reference text,
  ADD COLUMN last_rotated_by uuid REFERENCES users(id),
  ADD COLUMN last_rotation_evidence text;

ALTER TABLE service_identities
  ADD CONSTRAINT service_identity_vault_reference_check
    CHECK (secret_manager_reference IS NULL OR secret_manager_reference ~ '^(vault|aws-sm|azure-kv)://[A-Za-z0-9._/-]+$'),
  ADD CONSTRAINT service_identity_rotation_actor_check
    CHECK (last_rotated_by IS NULL OR rotated_at IS NOT NULL);

CREATE TABLE service_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_identity_id uuid NOT NULL REFERENCES service_identities(id),
  action text NOT NULL CHECK (action IN ('created','rotated','retired')),
  actor_id uuid NOT NULL REFERENCES users(id),
  previous_status text,
  current_status text NOT NULL CHECK (current_status IN ('active','rotated','revoked','retired')),
  evidence text NOT NULL CHECK (length(trim(evidence)) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_service_identity_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Service identity events are append-only';
END
$$;
CREATE TRIGGER service_identity_events_immutable
BEFORE UPDATE OR DELETE ON service_identity_events
FOR EACH ROW EXECUTE FUNCTION prevent_service_identity_event_mutation();

ALTER TABLE service_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY service_identities_platform_admin ON service_identities
  FOR ALL USING (app_role() IN ('global_admin','super_admin'))
  WITH CHECK (app_role() IN ('global_admin','super_admin'));

ALTER TABLE service_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_identity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY service_identity_events_platform_admin ON service_identity_events
  FOR SELECT USING (app_role() IN ('global_admin','super_admin'));
CREATE POLICY service_identity_events_insert ON service_identity_events
  FOR INSERT WITH CHECK (
    app_role() IN ('global_admin','super_admin')
    AND actor_id = app_user_id()
  );

ALTER TABLE release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY release_approvals_read ON release_approvals
  FOR SELECT USING (app_role() IN ('global_admin','super_admin','finance','finance_manager'));
CREATE POLICY release_approvals_insert ON release_approvals
  FOR INSERT WITH CHECK (
    app_role() IN ('global_admin','super_admin','finance','finance_manager')
    AND approver_role = app_role()
    AND approver_name = (SELECT legal_name FROM users WHERE id=app_user_id())
    AND approver_email IS NOT DISTINCT FROM (SELECT email FROM users WHERE id=app_user_id())
  );

REVOKE ALL ON TABLE service_identities FROM PUBLIC;
REVOKE ALL ON TABLE service_identity_events FROM PUBLIC;
REVOKE ALL ON TABLE release_approvals FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE service_identities TO "{{role}}";
GRANT SELECT, INSERT ON TABLE service_identity_events TO "{{role}}";
GRANT SELECT, INSERT ON TABLE release_approvals TO "{{role}}";
