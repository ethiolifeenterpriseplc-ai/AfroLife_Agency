CREATE TABLE accounting_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_entity_id uuid,
  source_system text,
  source_entity_id text,
  entity_type text NOT NULL CHECK (entity_type IN ('group','legal_entity','subsidiary','branch','business_unit','department','cooperative','merchant','landlord','edir','insurance_broker','agent_network','agent','property_owner','other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  legal_name text CHECK (legal_name IS NULL OR length(trim(legal_name)) BETWEEN 2 AND 200),
  base_currency char(3) NOT NULL DEFAULT 'ETB' CHECK (base_currency ~ '^[A-Z]{3}$'),
  fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, parent_entity_id),
  UNIQUE (source_system, source_entity_id),
  FOREIGN KEY (parent_entity_id) REFERENCES accounting_entities(id)
);
CREATE INDEX accounting_entities_parent_idx ON accounting_entities(parent_entity_id, name);

CREATE TABLE accounting_local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK(email=lower(email) AND length(email)<=320),
  display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 160),
  password_hash text NOT NULL CHECK(password_hash ~ '^[0-9a-f]{32}:[0-9a-f]{128}$'),
  platform_role text NOT NULL DEFAULT 'user' CHECK(platform_role IN ('user','super_admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounting_memberships (
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('entity_admin','finance_manager','accountant','reviewer','auditor','viewer','consolidated_viewer')),
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id,user_id)
);
CREATE INDEX accounting_memberships_user_idx ON accounting_memberships(user_id,active);

CREATE FUNCTION accounting_can_access(target uuid, allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT current_setting('app.role',true) IN ('global_admin','super_admin') OR EXISTS (
    SELECT 1 FROM accounting_memberships m WHERE m.entity_id=target
      AND m.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND m.active AND m.role=ANY(allowed_roles)
  )
$$;
REVOKE ALL ON FUNCTION accounting_can_access(uuid,text[]) FROM PUBLIC;
CREATE FUNCTION accounting_has_direct_role(target uuid, allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT current_setting('app.role',true) IN ('global_admin','super_admin') OR EXISTS(
    SELECT 1 FROM accounting_memberships m WHERE m.entity_id=target
      AND m.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND m.active AND m.role=ANY(allowed_roles)
  )
$$;
REVOKE ALL ON FUNCTION accounting_has_direct_role(uuid,text[]) FROM PUBLIC;

CREATE TABLE accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  code varchar(24) NOT NULL CHECK (code ~ '^[A-Z0-9-]{2,24}$'),
  name varchar(160) NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  name_am varchar(200),
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id,code), UNIQUE(id,entity_id)
);

CREATE TABLE accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','review','closed')),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(period_end >= period_start),
  UNIQUE(entity_id,period_start,period_end), UNIQUE(id,entity_id)
);

CREATE TABLE accounting_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  period_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
  entry_date date NOT NULL,
  source_reference varchar(160) NOT NULL,
  description varchar(1000) NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 1000),
  amount numeric(18,2) NOT NULL CHECK(amount>0),
  transaction_type text NOT NULL DEFAULT 'manual' CHECK(transaction_type IN ('manual','reversal')),
  reversal_of uuid,
  reversal_reason text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','posted','rejected')),
  created_by uuid NOT NULL,
  approved_by uuid,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  UNIQUE(entity_id,idempotency_key), UNIQUE(id,entity_id),
  FOREIGN KEY(period_id,entity_id) REFERENCES accounting_periods(id,entity_id),
  FOREIGN KEY(reversal_of,entity_id) REFERENCES accounting_journals(id,entity_id),
  CHECK((transaction_type='manual' AND reversal_of IS NULL AND reversal_reason IS NULL) OR
        (transaction_type='reversal' AND reversal_of IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason))>=10)),
  CHECK(approved_by IS NULL OR approved_by<>created_by)
);
CREATE INDEX accounting_journals_entity_date_idx ON accounting_journals(entity_id,entry_date DESC);
CREATE UNIQUE INDEX accounting_one_live_reversal_idx ON accounting_journals(reversal_of) WHERE reversal_of IS NOT NULL AND status<>'rejected';

CREATE TABLE accounting_journal_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  line_no smallint NOT NULL CHECK(line_no>0),
  account_id uuid NOT NULL,
  description varchar(255),
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK(debit>=0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK(credit>=0),
  UNIQUE(journal_id,line_no),
  FOREIGN KEY(journal_id,entity_id) REFERENCES accounting_journals(id,entity_id),
  FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id),
  CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
CREATE INDEX accounting_lines_entity_account_idx ON accounting_journal_lines(entity_id,account_id,journal_id);

CREATE TABLE accounting_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounting_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  source_system text NOT NULL CHECK(source_system ~ '^[a-z][a-z0-9_-]{1,39}$'),
  source_entity_id text NOT NULL CHECK(length(trim(source_entity_id)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system,source_entity_id), UNIQUE(id,entity_id)
);
CREATE TABLE accounting_source_account_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  source_system text NOT NULL, source_account_code text NOT NULL CHECK(length(trim(source_account_code)) BETWEEN 1 AND 80),
  account_id uuid NOT NULL, active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id,source_system,source_account_code), FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id)
);
CREATE TABLE accounting_source_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  source_system text NOT NULL, source_event_id uuid NOT NULL, payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
  journal_id uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_system,source_event_id),
  FOREIGN KEY(journal_id,entity_id) REFERENCES accounting_journals(id,entity_id)
);

CREATE TABLE accounting_consolidated_totals (
  parent_entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  posted_journals bigint NOT NULL DEFAULT 0,
  posted_volume numeric(18,2) NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(parent_entity_id,entity_id)
);
ALTER TABLE accounting_consolidated_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_consolidated_totals_read ON accounting_consolidated_totals FOR SELECT
  USING(accounting_has_direct_role(parent_entity_id,ARRAY['entity_admin','finance_manager','consolidated_viewer']));
GRANT SELECT ON accounting_consolidated_totals TO "{{role}}";

CREATE FUNCTION accounting_record_consolidated_posting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.status<>'posted' AND NEW.status='posted' THEN
    WITH RECURSIVE parent_path(id,parent_entity_id) AS (
      SELECT id,parent_entity_id FROM accounting_entities WHERE id=NEW.entity_id
      UNION ALL SELECT e.id,e.parent_entity_id FROM accounting_entities e JOIN parent_path p ON p.parent_entity_id=e.id
    )
    INSERT INTO accounting_consolidated_totals(parent_entity_id,entity_id,posted_journals,posted_volume,refreshed_at)
      SELECT id,NEW.entity_id,1,NEW.amount,now() FROM parent_path
    ON CONFLICT(parent_entity_id,entity_id) DO UPDATE SET
      posted_journals=accounting_consolidated_totals.posted_journals+1,
      posted_volume=accounting_consolidated_totals.posted_volume+EXCLUDED.posted_volume,
      refreshed_at=now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION accounting_record_consolidated_posting() FROM PUBLIC;
CREATE TRIGGER accounting_consolidated_posted AFTER UPDATE OF status ON accounting_journals
  FOR EACH ROW EXECUTE FUNCTION accounting_record_consolidated_posting();

CREATE OR REPLACE FUNCTION accounting_guard_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric(18,2); c numeric(18,2); period_status text; period_start date; period_end date;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting journals cannot be deleted'; END IF;
  IF OLD.status='draft' AND NEW.status='pending_approval' THEN
    SELECT coalesce(sum(debit),0),coalesce(sum(credit),0) INTO d,c FROM accounting_journal_lines WHERE journal_id=OLD.id;
    IF d<=0 OR d<>c OR d<>NEW.amount THEN RAISE EXCEPTION 'Journal lines must balance and equal the journal amount'; END IF;
    SELECT status,accounting_periods.period_start,accounting_periods.period_end INTO period_status,period_start,period_end FROM accounting_periods WHERE id=NEW.period_id AND entity_id=NEW.entity_id;
    IF period_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Journal period is not open'; END IF;
    IF NEW.entry_date NOT BETWEEN period_start AND period_end THEN RAISE EXCEPTION 'Journal date is outside the selected period'; END IF;
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Journal content is immutable after submission'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='pending_approval' AND NEW.status IN ('posted','rejected') THEN
    IF NEW.approved_by IS NULL OR NEW.approval_reason IS NULL OR length(trim(NEW.approval_reason))<10 THEN RAISE EXCEPTION 'Approval actor and reason are required'; END IF;
    IF NEW.approved_by=OLD.created_by THEN RAISE EXCEPTION 'Journal maker cannot approve their own entry'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','approved_by','approval_reason','posted_at'])<>(to_jsonb(OLD)-ARRAY['status','approved_by','approval_reason','posted_at']) THEN RAISE EXCEPTION 'Journal content cannot be changed'; END IF;
    IF NEW.status='posted' THEN NEW.posted_at=now(); END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid accounting journal state transition';
END $$;
CREATE TRIGGER accounting_journal_guard BEFORE UPDATE OR DELETE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_guard_journal();
CREATE FUNCTION accounting_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='closed' THEN RAISE EXCEPTION 'Closed accounting periods cannot be changed'; END IF;
  IF NEW.status='closed' THEN
    IF NEW.closed_by IS NULL OR NEW.closed_at IS NULL THEN RAISE EXCEPTION 'Period close actor and time are required'; END IF;
    IF EXISTS(SELECT 1 FROM accounting_journals WHERE entity_id=NEW.entity_id AND period_id=NEW.id AND status='pending_approval') THEN
      RAISE EXCEPTION 'Resolve pending journals before period close';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_period_guard BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION accounting_guard_period();
CREATE FUNCTION accounting_immutable_rows() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Accounting history is append-only'; END $$;
CREATE TRIGGER accounting_lines_immutable BEFORE UPDATE OR DELETE ON accounting_journal_lines FOR EACH ROW EXECUTE FUNCTION accounting_immutable_rows();
CREATE TRIGGER accounting_audit_immutable BEFORE UPDATE OR DELETE ON accounting_audit FOR EACH ROW EXECUTE FUNCTION accounting_immutable_rows();

ALTER TABLE accounting_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_entities_read ON accounting_entities FOR SELECT USING(accounting_can_access(id,ARRAY['entity_admin','finance_manager','accountant','reviewer','auditor','viewer','consolidated_viewer']));
CREATE POLICY accounting_entities_write ON accounting_entities FOR INSERT WITH CHECK(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(parent_entity_id,ARRAY['entity_admin']));
ALTER TABLE accounting_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_members_read ON accounting_memberships FOR SELECT USING(user_id=nullif(current_setting('app.user_id',true),'')::uuid OR accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager']));
CREATE POLICY accounting_members_write ON accounting_memberships FOR ALL USING(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(entity_id,ARRAY['entity_admin'])) WITH CHECK(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(entity_id,ARRAY['entity_admin']));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounting_accounts','accounting_periods','accounting_journals','accounting_journal_lines','accounting_audit'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'',''reviewer'',''auditor'',''viewer'']))',t||'_read',t);
    IF t='accounting_journal_lines' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'']) AND EXISTS(SELECT 1 FROM accounting_journals j WHERE j.id=accounting_journal_lines.journal_id AND j.entity_id=accounting_journal_lines.entity_id AND j.status=''draft'' AND j.created_by=nullif(current_setting(''app.user_id'',true),'''')::uuid))',t||'_insert',t);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'']))',t||'_insert',t);
    END IF;
  END LOOP;
  EXECUTE 'CREATE POLICY accounting_journals_decide ON accounting_journals FOR UPDATE USING(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''reviewer''])) WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''reviewer'']))';
  EXECUTE 'CREATE POLICY accounting_periods_close ON accounting_periods FOR UPDATE USING(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager''])) WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'']))';
END $$;

ALTER TABLE accounting_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_source_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting_source_mappings_read ON accounting_source_mappings FOR SELECT USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','accountant','auditor','viewer']));
CREATE POLICY accounting_source_mappings_write ON accounting_source_mappings FOR ALL USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager']));
ALTER TABLE accounting_source_account_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_source_account_maps FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting_source_account_maps_read ON accounting_source_account_maps FOR SELECT USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','accountant','auditor','viewer']));
CREATE POLICY accounting_source_account_maps_write ON accounting_source_account_maps FOR ALL USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager']));
ALTER TABLE accounting_source_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_source_events FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting_source_events_read ON accounting_source_events FOR SELECT USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','accountant','auditor','viewer']));
CREATE POLICY accounting_source_events_ingest ON accounting_source_events FOR INSERT WITH CHECK(current_setting('app.role',true) IN ('global_admin','super_admin'));

GRANT EXECUTE ON FUNCTION accounting_can_access(uuid,text[]) TO "{{role}}";
GRANT EXECUTE ON FUNCTION accounting_has_direct_role(uuid,text[]) TO "{{role}}";
GRANT EXECUTE ON FUNCTION accounting_can_access(uuid,text[]) TO "{{role}}";
GRANT SELECT,INSERT ON accounting_entities,accounting_memberships,accounting_accounts,accounting_periods,accounting_journals,accounting_journal_lines,accounting_audit TO "{{role}}";
GRANT UPDATE ON accounting_memberships TO "{{role}}";
GRANT SELECT,INSERT,UPDATE ON accounting_source_mappings,accounting_source_account_maps TO "{{role}}";
GRANT SELECT,INSERT ON accounting_source_events TO "{{role}}";
GRANT SELECT,INSERT,UPDATE ON accounting_local_users TO "{{role}}";
GRANT UPDATE(status,approved_by,approval_reason,posted_at) ON accounting_journals TO "{{role}}";
GRANT UPDATE(status,closed_by,closed_at) ON accounting_periods TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE accounting_journal_lines_id_seq,accounting_audit_id_seq TO "{{role}}";
