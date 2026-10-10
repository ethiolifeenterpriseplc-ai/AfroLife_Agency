CREATE TABLE insurance_ledger_organizations (
  id uuid PRIMARY KEY,
  parent_organization_id uuid REFERENCES insurance_ledger_organizations(id),
  organization_type text NOT NULL CHECK (organization_type IN ('umbrella_master','independent_master','member_edir')),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO insurance_ledger_organizations (id,parent_organization_id,organization_type,display_name,legal_name,status)
VALUES
 ('00000000-0000-4000-8000-000000000001',NULL,'umbrella_master','AfroLife Master Edir','AfroLife Master Edir','active'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','independent_master','AfroLife Edir','AfroLife Edir','active')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION app_edir_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.edir_id',true),'')::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid)
$$;

CREATE TABLE insurance_ledger_staff (
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES insurance_ledger_organizations(id),
  role text NOT NULL CHECK (role IN ('insurance_master_admin','insurance_admin','finance','finance_manager','compliance','auditor')),
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
CREATE INDEX insurance_ledger_staff_org_role_idx ON insurance_ledger_staff (organization_id,role) WHERE active;

ALTER TABLE insurance_ledger_accounts ADD COLUMN organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE insurance_ledger_journals ADD COLUMN organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE insurance_ledger_lines ADD COLUMN organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE insurance_ledger_audit ADD COLUMN organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE insurance_ledger_accounts ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE insurance_ledger_journals ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE insurance_ledger_lines ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE insurance_ledger_audit ALTER COLUMN organization_id SET DEFAULT app_edir_id();

ALTER TABLE insurance_ledger_accounts DROP CONSTRAINT IF EXISTS insurance_ledger_accounts_account_code_key;
ALTER TABLE insurance_ledger_accounts ADD CONSTRAINT insurance_ledger_accounts_org_code_key UNIQUE (organization_id,account_code);
ALTER TABLE insurance_ledger_accounts ADD CONSTRAINT insurance_ledger_accounts_id_org_key UNIQUE (id,organization_id);
ALTER TABLE insurance_ledger_journals ADD CONSTRAINT insurance_ledger_journals_id_org_key UNIQUE (id,organization_id);
ALTER TABLE insurance_ledger_accounts ADD CONSTRAINT insurance_ledger_accounts_organization_fk FOREIGN KEY (organization_id) REFERENCES insurance_ledger_organizations(id);
ALTER TABLE insurance_ledger_journals ADD CONSTRAINT insurance_ledger_journals_organization_fk FOREIGN KEY (organization_id) REFERENCES insurance_ledger_organizations(id);
ALTER TABLE insurance_ledger_lines ADD CONSTRAINT insurance_ledger_lines_organization_fk FOREIGN KEY (organization_id) REFERENCES insurance_ledger_organizations(id);
ALTER TABLE insurance_ledger_audit ADD CONSTRAINT insurance_ledger_audit_organization_fk FOREIGN KEY (organization_id) REFERENCES insurance_ledger_organizations(id);
ALTER TABLE insurance_ledger_lines DROP CONSTRAINT IF EXISTS insurance_ledger_lines_journal_id_fkey;
ALTER TABLE insurance_ledger_lines DROP CONSTRAINT IF EXISTS insurance_ledger_lines_account_id_fkey;
ALTER TABLE insurance_ledger_journals DROP CONSTRAINT IF EXISTS insurance_ledger_journals_reversal_of_fkey;
ALTER TABLE insurance_ledger_journals ADD CONSTRAINT insurance_ledger_journals_reversal_org_fk
  FOREIGN KEY (reversal_of,organization_id) REFERENCES insurance_ledger_journals(id,organization_id);
ALTER TABLE insurance_ledger_lines ADD CONSTRAINT insurance_ledger_lines_journal_org_fk FOREIGN KEY (journal_id,organization_id) REFERENCES insurance_ledger_journals(id,organization_id);
ALTER TABLE insurance_ledger_lines ADD CONSTRAINT insurance_ledger_lines_account_org_fk FOREIGN KEY (account_id,organization_id) REFERENCES insurance_ledger_accounts(id,organization_id);

CREATE OR REPLACE FUNCTION insurance_ledger_has_role(allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM insurance_ledger_staff
    WHERE user_id=app_user_id() AND organization_id=app_edir_id() AND active
      AND (role=ANY(allowed_roles) OR role='insurance_admin'))
$$;
CREATE OR REPLACE FUNCTION insurance_ledger_is_master() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM insurance_ledger_staff
    WHERE user_id=app_user_id() AND organization_id='00000000-0000-4000-8000-000000000001'
      AND active AND role='insurance_master_admin')
$$;

ALTER TABLE insurance_ledger_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_organizations NO FORCE ROW LEVEL SECURITY;
CREATE POLICY insurance_org_catalog ON insurance_ledger_organizations FOR SELECT
  USING (status='active' OR id=app_edir_id() OR insurance_ledger_is_master() OR app_role()='super_admin');
CREATE POLICY insurance_org_master_create ON insurance_ledger_organizations FOR INSERT
  WITH CHECK ((insurance_ledger_is_master() OR app_role()='super_admin') AND parent_organization_id='00000000-0000-4000-8000-000000000001'
    AND organization_type IN ('member_edir','independent_master'));
CREATE POLICY insurance_org_master_update ON insurance_ledger_organizations FOR UPDATE
  USING (insurance_ledger_is_master() OR app_role()='super_admin')
  WITH CHECK (insurance_ledger_is_master() OR app_role()='super_admin');

ALTER TABLE insurance_ledger_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_staff FORCE ROW LEVEL SECURITY;
CREATE POLICY insurance_staff_self_read ON insurance_ledger_staff FOR SELECT
  USING (user_id=app_user_id() OR organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role()='super_admin');
CREATE POLICY insurance_staff_manage ON insurance_ledger_staff FOR ALL
  USING (organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role()='super_admin')
  WITH CHECK (organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role()='super_admin');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['insurance_ledger_accounts','insurance_ledger_journals','insurance_ledger_lines','insurance_ledger_audit'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (organization_id=app_edir_id() OR app_role()=''super_admin'') WITH CHECK (organization_id=app_edir_id() OR app_role()=''super_admin'')',table_name||'_tenant_scope',table_name);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY',table_name);
  END LOOP;
END $$;

DROP POLICY insurance_ledger_accounts_read ON insurance_ledger_accounts;
DROP POLICY insurance_ledger_accounts_create ON insurance_ledger_accounts;
DROP POLICY insurance_ledger_journals_read ON insurance_ledger_journals;
DROP POLICY insurance_ledger_journals_create ON insurance_ledger_journals;
DROP POLICY insurance_ledger_journals_decide ON insurance_ledger_journals;
DROP POLICY insurance_ledger_lines_read ON insurance_ledger_lines;
DROP POLICY insurance_ledger_lines_create ON insurance_ledger_lines;
DROP POLICY insurance_ledger_audit_read ON insurance_ledger_audit;
DROP POLICY insurance_ledger_audit_create ON insurance_ledger_audit;

CREATE POLICY insurance_ledger_accounts_read ON insurance_ledger_accounts FOR SELECT
  USING (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
CREATE POLICY insurance_ledger_accounts_create ON insurance_ledger_accounts FOR INSERT
  WITH CHECK (created_by=app_user_id() AND (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin'])));
CREATE POLICY insurance_ledger_journals_read ON insurance_ledger_journals FOR SELECT
  USING (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
CREATE POLICY insurance_ledger_journals_create ON insurance_ledger_journals FOR INSERT
  WITH CHECK (created_by=app_user_id() AND (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['finance','finance_manager','insurance_admin'])));
CREATE POLICY insurance_ledger_journals_decide ON insurance_ledger_journals FOR UPDATE
  USING (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['finance_manager','insurance_admin']))
  WITH CHECK (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['finance_manager','insurance_admin']));
CREATE POLICY insurance_ledger_lines_read ON insurance_ledger_lines FOR SELECT
  USING (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
CREATE POLICY insurance_ledger_lines_create ON insurance_ledger_lines FOR INSERT
  WITH CHECK ((app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['finance','finance_manager','insurance_admin']))
    AND EXISTS (SELECT 1 FROM insurance_ledger_journals j WHERE j.id=journal_id AND j.organization_id=insurance_ledger_lines.organization_id AND j.status='draft' AND j.created_by=app_user_id()));
CREATE POLICY insurance_ledger_audit_read ON insurance_ledger_audit FOR SELECT
  USING (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance','auditor']));
CREATE POLICY insurance_ledger_audit_create ON insurance_ledger_audit FOR INSERT
  WITH CHECK (actor_id=app_user_id() AND (app_role()='super_admin' OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager'])));

CREATE OR REPLACE FUNCTION insurance_ledger_consolidated_summary()
RETURNS TABLE (organization_id uuid, organization_name text, status text,
  ledger_accounts bigint, journals bigint, posted_journals bigint, posted_volume numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
BEGIN
  IF NOT insurance_ledger_is_master() THEN RAISE EXCEPTION 'Umbrella Insurance Master access required'; END IF;
  RETURN QUERY SELECT o.id,o.display_name,o.status,
    (SELECT count(*) FROM insurance_ledger_accounts a WHERE a.organization_id=o.id),
    (SELECT count(*) FROM insurance_ledger_journals j WHERE j.organization_id=o.id),
    (SELECT count(*) FROM insurance_ledger_journals j WHERE j.organization_id=o.id AND j.status='posted'),
    (SELECT coalesce(sum(j.amount),0) FROM insurance_ledger_journals j WHERE j.organization_id=o.id AND j.status='posted')
  FROM insurance_ledger_organizations o WHERE o.organization_type<>'umbrella_master' ORDER BY o.display_name;
END $$;

GRANT EXECUTE ON FUNCTION app_edir_id() TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_ledger_has_role(text[]) TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_ledger_is_master() TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_ledger_consolidated_summary() TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_organizations TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_staff TO "{{role}}";
