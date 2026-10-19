-- Agent networks are business tenants, separate from platform_tenants, which
-- represents deployment registrations and hosting configuration.
CREATE TABLE platform_business_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE CHECK (tenant_key ~ '^(agent-network|super-admin)-[0-9a-f-]{36}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  tenant_type text NOT NULL CHECK (tenant_type IN ('agent_network','super_admin_tenant')),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','active','suspended','retired')),
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_business_tenant_members (
  tenant_id uuid NOT NULL REFERENCES platform_business_tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  member_role text NOT NULL CHECK (member_role IN ('network_owner','super_admin','master_agent','field_agent')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE INDEX platform_business_tenant_members_user_idx ON platform_business_tenant_members(user_id,tenant_id);

CREATE TABLE platform_business_tenant_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform_business_tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('agent_network_created','member_added','member_deactivated','tenant_activated','tenant_suspended','tenant_retired')),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_data)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every tenant Super Admin and Master Agent owns a Global Platform business tenant.
-- Field Agents inherit their direct Master's network; they cannot choose a tenant.
CREATE FUNCTION sync_user_business_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  key_prefix text;
  entity_type text;
  member_role text;
  found_agent_type text;
  tenant_record platform_business_tenants%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active AND OLD.role IN ('super_admin','master_agent') THEN
    UPDATE platform_business_tenants SET status='suspended',updated_at=now()
    WHERE owner_user_id=NEW.id AND status IN ('onboarding','active');
    UPDATE platform_business_tenant_members SET status='inactive' WHERE user_id=NEW.id;
    RETURN NEW;
  END IF;
  IF NEW.role='super_admin' THEN
    key_prefix:='super-admin-'; entity_type:='super_admin_tenant'; member_role:='super_admin';
  ELSIF NEW.role='master_agent' THEN
    SELECT agent_type INTO found_agent_type FROM agents WHERE id=NEW.id;
    IF found_agent_type IS DISTINCT FROM 'master' THEN RETURN NEW; END IF;
    key_prefix:='agent-network-'; entity_type:='agent_network'; member_role:='master_agent';
  ELSE
    IF TG_OP='UPDATE' AND OLD.role IN ('super_admin','master_agent') THEN
      UPDATE platform_business_tenant_members SET status='inactive' WHERE user_id=NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  INSERT INTO platform_business_tenants(tenant_key,display_name,tenant_type,owner_user_id,status)
  VALUES(key_prefix||NEW.id::text,NEW.legal_name,entity_type,NEW.id,
    CASE WHEN NEW.active THEN 'active' ELSE 'onboarding' END)
  ON CONFLICT(owner_user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
    status=CASE WHEN platform_business_tenants.status='onboarding' AND EXCLUDED.status='active' THEN 'active' ELSE platform_business_tenants.status END,
    updated_at=now()
  RETURNING * INTO tenant_record;
  INSERT INTO platform_business_tenant_members(tenant_id,user_id,member_role,status,assigned_by)
  VALUES(tenant_record.id,NEW.id,'network_owner','active',NEW.id)
  ON CONFLICT(tenant_id,user_id) DO UPDATE SET member_role='network_owner',status='active';
  RETURN NEW;
END $$;

CREATE FUNCTION sync_agent_business_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  tenant_record platform_business_tenants%ROWTYPE;
  tenant_owner uuid;
  legal_name_value text;
  active_value boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE platform_business_tenant_members SET status='inactive' WHERE user_id=OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    UPDATE platform_business_tenant_members SET status='inactive'
      WHERE user_id=NEW.id AND member_role='field_agent';
  END IF;
  IF NEW.agent_type='master' THEN
    SELECT legal_name,active INTO legal_name_value,active_value FROM users WHERE id=NEW.id;
    INSERT INTO platform_business_tenants(tenant_key,display_name,tenant_type,owner_user_id,status)
    VALUES('agent-network-'||NEW.id::text,legal_name_value,'agent_network',NEW.id,
      CASE WHEN active_value THEN 'active' ELSE 'onboarding' END)
    ON CONFLICT(owner_user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
      status=CASE WHEN platform_business_tenants.status='onboarding' AND EXCLUDED.status='active' THEN 'active' ELSE platform_business_tenants.status END,
      updated_at=now()
    RETURNING * INTO tenant_record;
    INSERT INTO platform_business_tenant_members(tenant_id,user_id,member_role,status,assigned_by)
    VALUES(tenant_record.id,NEW.id,'network_owner','active',NEW.id)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET member_role='network_owner',status='active';
  ELSE
    SELECT tenant.id,tenant.owner_user_id INTO tenant_record.id,tenant_owner
    FROM platform_business_tenants tenant
    WHERE tenant.owner_user_id=NEW.parent_id AND tenant.tenant_type='agent_network';
    IF tenant_record.id IS NULL THEN
      RAISE EXCEPTION 'Field agent parent does not own a registered Agent Network tenant';
    END IF;
    INSERT INTO platform_business_tenant_members(tenant_id,user_id,member_role,status,assigned_by)
    VALUES(tenant_record.id,NEW.id,'field_agent','active',tenant_owner)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET member_role='field_agent',status='active';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agents_sync_business_tenant
AFTER INSERT OR UPDATE OF agent_type,parent_id ON agents
FOR EACH ROW EXECUTE FUNCTION sync_agent_business_tenant();

CREATE TRIGGER users_sync_business_tenant
AFTER INSERT OR UPDATE OF role,active ON users
FOR EACH ROW EXECUTE FUNCTION sync_user_business_tenant();

INSERT INTO platform_business_tenants(tenant_key,display_name,tenant_type,owner_user_id,status)
SELECT 'agent-network-'||a.id::text,u.legal_name,'agent_network',a.id,
  CASE WHEN u.active THEN 'active' ELSE 'onboarding' END
FROM agents a JOIN users u ON u.id=a.id WHERE a.agent_type='master'
ON CONFLICT(owner_user_id) DO NOTHING;
INSERT INTO platform_business_tenants(tenant_key,display_name,tenant_type,owner_user_id,status)
SELECT 'super-admin-'||u.id::text,u.legal_name,'super_admin_tenant',u.id,
  CASE WHEN u.active THEN 'active' ELSE 'onboarding' END
FROM users u WHERE u.role='super_admin'
ON CONFLICT(owner_user_id) DO NOTHING;
INSERT INTO platform_business_tenant_members(tenant_id,user_id,member_role,status,assigned_by)
SELECT tenant.id,tenant.owner_user_id,'network_owner','active',tenant.owner_user_id
FROM platform_business_tenants tenant
ON CONFLICT(tenant_id,user_id) DO NOTHING;
INSERT INTO platform_business_tenant_members(tenant_id,user_id,member_role,status,assigned_by)
SELECT tenant.id,agent.id,'field_agent','active',tenant.owner_user_id
FROM agents agent JOIN platform_business_tenants tenant ON tenant.owner_user_id=agent.parent_id
WHERE agent.agent_type='field'
ON CONFLICT(tenant_id,user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_platform_business_tenant_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Agent tenant history is append-only'; END $$;
CREATE TRIGGER platform_business_tenant_events_immutable BEFORE UPDATE OR DELETE ON platform_business_tenant_events
FOR EACH ROW EXECUTE FUNCTION prevent_platform_business_tenant_event_mutation();

ALTER TABLE platform_business_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_business_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_business_tenants_global_admin ON platform_business_tenants FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_business_tenants_member_read ON platform_business_tenants FOR SELECT
  USING (owner_user_id=app_user_id() OR owner_user_id=(SELECT parent_id FROM agents WHERE id=app_user_id()));

ALTER TABLE platform_business_tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_business_tenant_members FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_business_tenant_members_global_admin ON platform_business_tenant_members FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_business_tenant_members_self_read ON platform_business_tenant_members FOR SELECT
  USING (user_id=app_user_id() OR tenant_id IN (SELECT id FROM platform_business_tenants WHERE owner_user_id=app_user_id()));

ALTER TABLE platform_business_tenant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_business_tenant_events FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_business_tenant_events_global_admin ON platform_business_tenant_events FOR ALL
  USING (current_setting('app.role',true)='global_admin')
  WITH CHECK (current_setting('app.role',true)='global_admin');
CREATE POLICY platform_business_tenant_events_owner_read ON platform_business_tenant_events FOR SELECT
  USING (tenant_id IN (SELECT id FROM platform_business_tenants WHERE owner_user_id=app_user_id()));

GRANT SELECT,UPDATE ON TABLE platform_business_tenants TO "{{role}}";
GRANT SELECT ON TABLE platform_business_tenant_members,platform_business_tenant_events TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE platform_business_tenant_events_id_seq TO "{{role}}";
GRANT EXECUTE ON FUNCTION sync_agent_business_tenant() TO "{{role}}";
GRANT EXECUTE ON FUNCTION sync_user_business_tenant() TO "{{role}}";
GRANT EXECUTE ON FUNCTION prevent_platform_business_tenant_event_mutation() TO "{{role}}";
