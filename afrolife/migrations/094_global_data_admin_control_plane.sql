CREATE TABLE platform_tenant_capability_grants (
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('database_admin','analytics_admin')),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id,capability)
);
CREATE INDEX platform_tenant_capability_user_idx
  ON platform_tenant_capability_grants(user_id,tenant_id);

ALTER TABLE platform_tenant_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_capability_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_capability_global_admin ON platform_tenant_capability_grants
  FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');

CREATE FUNCTION guard_platform_tenant_capability_grant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.role',true) IS DISTINCT FROM 'global_admin' THEN
    RAISE EXCEPTION 'Only Global Admin may manage tenant capability grants';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN platform_tenants t ON t.id=NEW.tenant_id
    WHERE u.id=NEW.user_id AND u.active
      AND u.role NOT IN ('super_admin','master_agent','global_admin')
      AND t.status='active'
  ) THEN
    RAISE EXCEPTION 'Capability grants require an active eligible user and active tenant';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION guard_platform_tenant_capability_grant() FROM PUBLIC;
CREATE TRIGGER platform_tenant_capability_grant_guard
  BEFORE INSERT OR UPDATE ON platform_tenant_capability_grants
  FOR EACH ROW EXECUTE FUNCTION guard_platform_tenant_capability_grant();

CREATE TABLE platform_tenant_capability_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id),
  subject_user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'capability_granted','capability_revoked','capabilities_replaced'
  )),
  capabilities text[] NOT NULL CHECK (
    capabilities <@ ARRAY['database_admin','analytics_admin']::text[]
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_tenant_capability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_capability_events FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_capability_events_global_admin ON platform_tenant_capability_events
  FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE TRIGGER platform_tenant_capability_events_immutable
  BEFORE UPDATE OR DELETE ON platform_tenant_capability_events
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_control_event_mutation();

CREATE FUNCTION audit_platform_tenant_capability_grant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO platform_tenant_capability_events
      (tenant_id,subject_user_id,actor_id,event_type,capabilities)
    VALUES(OLD.tenant_id,OLD.user_id,app_user_id(),'capability_revoked',ARRAY[OLD.capability]);
    RETURN OLD;
  END IF;
  INSERT INTO platform_tenant_capability_events
    (tenant_id,subject_user_id,actor_id,event_type,capabilities)
  VALUES(NEW.tenant_id,NEW.user_id,app_user_id(),'capability_granted',ARRAY[NEW.capability]);
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION audit_platform_tenant_capability_grant() FROM PUBLIC;
CREATE TRIGGER platform_tenant_capability_grant_audit
  AFTER INSERT OR DELETE ON platform_tenant_capability_grants
  FOR EACH ROW EXECUTE FUNCTION audit_platform_tenant_capability_grant();

CREATE TABLE platform_tenant_operator_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN (
    'migration_review','backup_restore_review','database_change_review'
  )),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 10 AND 1000),
  evidence_reference text CHECK (
    evidence_reference IS NULL OR
    (length(trim(evidence_reference)) BETWEEN 2 AND 200
      AND evidence_reference !~* '(password|secret|token|credential|://|postgres(ql)?)')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_tenant_operator_requests_tenant_created_idx
  ON platform_tenant_operator_requests(tenant_id,created_at DESC);
ALTER TABLE platform_tenant_operator_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tenant_operator_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_tenant_operator_requests_global_admin ON platform_tenant_operator_requests
  FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE TRIGGER platform_tenant_operator_requests_immutable
  BEFORE UPDATE OR DELETE ON platform_tenant_operator_requests
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_control_event_mutation();

GRANT SELECT,INSERT,DELETE ON platform_tenant_capability_grants TO "{{role}}";
GRANT SELECT,INSERT ON platform_tenant_capability_events TO "{{role}}";
GRANT SELECT,INSERT ON platform_tenant_operator_requests TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE platform_tenant_capability_events_id_seq TO "{{role}}";
