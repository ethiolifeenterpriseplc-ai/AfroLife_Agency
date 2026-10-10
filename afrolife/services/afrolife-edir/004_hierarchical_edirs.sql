-- Multi-organization Edir model. Existing AfroLife Edir rows remain in their own legal Edir.
CREATE TABLE edir_organizations (
  id uuid PRIMARY KEY,
  parent_organization_id uuid REFERENCES edir_organizations(id),
  organization_type text NOT NULL CHECK (organization_type IN ('umbrella_master','independent_master','member_edir')),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 200),
  registration_reference text UNIQUE CHECK (registration_reference IS NULL OR length(trim(registration_reference)) BETWEEN 2 AND 100),
  onboarding_status text NOT NULL DEFAULT 'active' CHECK (onboarding_status IN ('pending','review','active','rejected','suspended')),
  governance_reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((organization_type='umbrella_master' AND parent_organization_id IS NULL)
    OR (organization_type<>'umbrella_master' AND parent_organization_id IS NOT NULL))
);

INSERT INTO edir_organizations (id, parent_organization_id, organization_type, display_name, legal_name, onboarding_status)
VALUES
 ('00000000-0000-4000-8000-000000000001', NULL, 'umbrella_master', 'AfroLife Master Edir', 'AfroLife Master Edir', 'active'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'independent_master', 'AfroLife Edir', 'AfroLife Edir', 'active')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE edir_registration_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  umbrella_organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'
    REFERENCES edir_organizations(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 200),
  registration_reference text CHECK (registration_reference IS NULL OR length(trim(registration_reference)) BETWEEN 2 AND 100),
  governance_reference text CHECK (governance_reference IS NULL OR length(trim(governance_reference)) BETWEEN 2 AND 500),
  contact_name text NOT NULL CHECK (length(trim(contact_name)) BETWEEN 2 AND 160),
  contact_phone text NOT NULL CHECK (length(trim(contact_phone)) BETWEEN 7 AND 32),
  contact_email text CHECK (contact_email IS NULL OR length(trim(contact_email)) <= 254),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  organization_id uuid REFERENCES edir_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND organization_id IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000
      AND ((status='accepted' AND organization_id IS NOT NULL) OR (status='rejected' AND organization_id IS NULL))))
);

CREATE OR REPLACE FUNCTION app_edir_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.edir_id', true), '')::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid)
$$;

ALTER TABLE edir_staff ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE edir_staff SET organization_id='00000000-0000-4000-8000-000000000002' WHERE organization_id IS NULL;
ALTER TABLE edir_staff ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE edir_staff ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_staff ADD CONSTRAINT edir_staff_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_staff DROP CONSTRAINT IF EXISTS edir_staff_pkey;
ALTER TABLE edir_staff ADD CONSTRAINT edir_staff_pkey PRIMARY KEY (user_id, organization_id);
ALTER TABLE edir_staff DROP CONSTRAINT IF EXISTS edir_staff_role_check;
ALTER TABLE edir_staff ADD CONSTRAINT edir_staff_role_check CHECK (role IN (
  'edir_master_admin','org_onboarding_admin','edir_admin','member_support','compliance','auditor',
  'finance_manager','treasurer','credit_officer','credit_manager'
));
CREATE INDEX edir_staff_org_roles_idx ON edir_staff (organization_id, role) WHERE active;

ALTER TABLE edir_memberships ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_groups ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_group_memberships ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_audit_logs ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_ledger_accounts ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_financial_products ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_member_accounts ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_financial_transactions ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_financial_journals ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
ALTER TABLE edir_financial_journal_lines ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';

ALTER TABLE edir_memberships ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_groups ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_group_memberships ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_audit_logs ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_ledger_accounts ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_financial_products ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_member_accounts ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_financial_transactions ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_financial_journals ALTER COLUMN organization_id SET DEFAULT app_edir_id();
ALTER TABLE edir_financial_journal_lines ALTER COLUMN organization_id SET DEFAULT app_edir_id();

ALTER TABLE edir_memberships DROP CONSTRAINT IF EXISTS edir_memberships_user_id_key;
ALTER TABLE edir_memberships ADD CONSTRAINT edir_memberships_org_user_key UNIQUE (organization_id, user_id);
ALTER TABLE edir_memberships ADD CONSTRAINT edir_memberships_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_groups ADD CONSTRAINT edir_groups_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_ledger_accounts DROP CONSTRAINT IF EXISTS edir_ledger_accounts_code_key;
ALTER TABLE edir_ledger_accounts ADD CONSTRAINT edir_ledger_accounts_org_code_key UNIQUE (organization_id, code);
ALTER TABLE edir_ledger_accounts ADD CONSTRAINT edir_ledger_accounts_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_financial_products DROP CONSTRAINT IF EXISTS edir_financial_products_product_code_key;
ALTER TABLE edir_financial_products ADD CONSTRAINT edir_financial_products_org_code_key UNIQUE (organization_id, product_code);
ALTER TABLE edir_financial_products ADD CONSTRAINT edir_financial_products_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_member_accounts ADD CONSTRAINT edir_member_accounts_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_financial_transactions ADD CONSTRAINT edir_financial_transactions_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_financial_journals ADD CONSTRAINT edir_financial_journals_id_org_key UNIQUE (id, organization_id);
ALTER TABLE edir_memberships ADD CONSTRAINT edir_memberships_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_groups ADD CONSTRAINT edir_groups_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_group_memberships ADD CONSTRAINT edir_group_memberships_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_audit_logs ADD CONSTRAINT edir_audit_logs_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_ledger_accounts ADD CONSTRAINT edir_ledger_accounts_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_financial_products ADD CONSTRAINT edir_financial_products_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_member_accounts ADD CONSTRAINT edir_member_accounts_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_financial_transactions ADD CONSTRAINT edir_financial_transactions_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_financial_journals ADD CONSTRAINT edir_financial_journals_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_financial_journal_lines ADD CONSTRAINT edir_financial_journal_lines_organization_fk FOREIGN KEY (organization_id) REFERENCES edir_organizations(id);
ALTER TABLE edir_group_memberships DROP CONSTRAINT IF EXISTS edir_group_memberships_group_id_fkey;
ALTER TABLE edir_group_memberships DROP CONSTRAINT IF EXISTS edir_group_memberships_member_id_fkey;
ALTER TABLE edir_group_memberships ADD CONSTRAINT edir_group_memberships_group_org_fk FOREIGN KEY (group_id, organization_id) REFERENCES edir_groups(id, organization_id);
ALTER TABLE edir_group_memberships ADD CONSTRAINT edir_group_memberships_member_org_fk FOREIGN KEY (member_id, organization_id) REFERENCES edir_memberships(id, organization_id);
ALTER TABLE edir_financial_products DROP CONSTRAINT IF EXISTS edir_financial_products_ledger_account_id_fkey;
ALTER TABLE edir_financial_products ADD CONSTRAINT edir_financial_products_ledger_org_fk FOREIGN KEY (ledger_account_id, organization_id) REFERENCES edir_ledger_accounts(id, organization_id);
ALTER TABLE edir_member_accounts DROP CONSTRAINT IF EXISTS edir_member_accounts_member_id_fkey;
ALTER TABLE edir_member_accounts DROP CONSTRAINT IF EXISTS edir_member_accounts_product_id_fkey;
ALTER TABLE edir_member_accounts ADD CONSTRAINT edir_member_accounts_member_org_fk FOREIGN KEY (member_id, organization_id) REFERENCES edir_memberships(id, organization_id);
ALTER TABLE edir_member_accounts ADD CONSTRAINT edir_member_accounts_product_org_fk FOREIGN KEY (product_id, organization_id) REFERENCES edir_financial_products(id, organization_id);
ALTER TABLE edir_financial_transactions DROP CONSTRAINT IF EXISTS edir_financial_transactions_member_account_id_fkey;
ALTER TABLE edir_financial_transactions DROP CONSTRAINT IF EXISTS edir_financial_transactions_reverses_transaction_id_fkey;
ALTER TABLE edir_financial_transactions ADD CONSTRAINT edir_financial_transactions_account_org_fk FOREIGN KEY (member_account_id, organization_id) REFERENCES edir_member_accounts(id, organization_id);
ALTER TABLE edir_financial_transactions ADD CONSTRAINT edir_financial_transactions_reversal_org_fk FOREIGN KEY (reverses_transaction_id, organization_id) REFERENCES edir_financial_transactions(id, organization_id);
ALTER TABLE edir_financial_journals DROP CONSTRAINT IF EXISTS edir_financial_journals_transaction_id_fkey;
ALTER TABLE edir_financial_journals ADD CONSTRAINT edir_financial_journals_transaction_org_fk FOREIGN KEY (transaction_id, organization_id) REFERENCES edir_financial_transactions(id, organization_id);
ALTER TABLE edir_financial_journal_lines DROP CONSTRAINT IF EXISTS edir_financial_journal_lines_journal_id_fkey;
ALTER TABLE edir_financial_journal_lines DROP CONSTRAINT IF EXISTS edir_financial_journal_lines_ledger_account_id_fkey;
ALTER TABLE edir_financial_journal_lines DROP CONSTRAINT IF EXISTS edir_financial_journal_lines_member_account_id_fkey;
ALTER TABLE edir_financial_journal_lines ADD CONSTRAINT edir_financial_journal_lines_journal_org_fk FOREIGN KEY (journal_id, organization_id) REFERENCES edir_financial_journals(id, organization_id);
ALTER TABLE edir_financial_journal_lines ADD CONSTRAINT edir_financial_journal_lines_account_org_fk FOREIGN KEY (ledger_account_id, organization_id) REFERENCES edir_ledger_accounts(id, organization_id);
ALTER TABLE edir_financial_journal_lines ADD CONSTRAINT edir_financial_journal_lines_member_account_org_fk FOREIGN KEY (member_account_id, organization_id) REFERENCES edir_member_accounts(id, organization_id);

CREATE OR REPLACE FUNCTION edir_has_staff_role(allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM edir_staff
    WHERE user_id=app_user_id() AND organization_id=app_edir_id() AND active AND role=ANY(allowed_roles)
  )
$$;

CREATE OR REPLACE FUNCTION edir_is_master_operator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM edir_staff
    WHERE user_id=app_user_id() AND organization_id='00000000-0000-4000-8000-000000000001'
      AND active AND role IN ('edir_master_admin','org_onboarding_admin')
  )
$$;

CREATE OR REPLACE FUNCTION edir_prevent_tenant_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Edir ownership is immutable';
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'edir_memberships','edir_groups','edir_group_memberships','edir_audit_logs','edir_staff',
    'edir_ledger_accounts','edir_financial_products','edir_member_accounts',
    'edir_financial_transactions','edir_financial_journals','edir_financial_journal_lines'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF organization_id ON %I FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change()', table_name || '_tenant_guard', table_name);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (organization_id=app_edir_id() OR edir_is_platform_admin()) WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin())', table_name || '_tenant_scope', table_name);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

ALTER TABLE edir_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_organizations NO FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_organizations_catalog ON edir_organizations FOR SELECT
  USING (onboarding_status='active' OR id=app_edir_id() OR parent_organization_id=app_edir_id() OR edir_is_platform_admin() OR edir_is_master_operator());
CREATE POLICY edir_organizations_onboard ON edir_organizations FOR INSERT
  WITH CHECK (edir_is_master_operator() AND parent_organization_id='00000000-0000-4000-8000-000000000001'
    AND organization_type IN ('member_edir','independent_master') AND onboarding_status IN ('pending','review','active'));
CREATE POLICY edir_organizations_approve ON edir_organizations FOR UPDATE
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());
ALTER TABLE edir_registration_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_registration_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_registration_public_submit ON edir_registration_applications FOR INSERT
  WITH CHECK (app_role()='public' AND umbrella_organization_id='00000000-0000-4000-8000-000000000001'
    AND status='pending' AND created_by=app_user_id());
CREATE POLICY edir_registration_master_read ON edir_registration_applications FOR SELECT
  USING (edir_is_master_operator());
CREATE POLICY edir_registration_master_review ON edir_registration_applications FOR UPDATE
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());
CREATE POLICY edir_staff_master_management ON edir_staff FOR ALL
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());
CREATE POLICY edir_staff_platform_provision ON edir_staff FOR ALL
  USING (edir_is_platform_admin()) WITH CHECK (edir_is_platform_admin());
CREATE POLICY edir_staff_local_management ON edir_staff FOR ALL
  USING (organization_id=app_edir_id() AND edir_has_staff_role(ARRAY['edir_admin']))
  WITH CHECK (organization_id=app_edir_id() AND edir_has_staff_role(ARRAY['edir_admin']));
DROP POLICY IF EXISTS edir_staff_tenant_scope ON edir_staff;
CREATE POLICY edir_staff_tenant_scope ON edir_staff AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin() OR edir_is_master_operator())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin() OR edir_is_master_operator());
CREATE POLICY edir_master_financial_catalog ON edir_ledger_accounts FOR ALL
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());
CREATE POLICY edir_master_product_catalog ON edir_financial_products FOR ALL
  USING (edir_is_master_operator()) WITH CHECK (edir_is_master_operator());
CREATE POLICY edir_audit_master_insert ON edir_audit_logs FOR INSERT
  WITH CHECK (edir_is_master_operator());

CREATE OR REPLACE FUNCTION edir_consolidated_summary()
RETURNS TABLE (organization_id uuid, organization_name text, onboarding_status text,
  active_members bigint, pending_members bigint, active_groups bigint,
  approved_transactions bigint, approved_volume numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp SET row_security=off AS $$
BEGIN
  IF NOT edir_is_master_operator() THEN RAISE EXCEPTION 'Umbrella Master Edir access required'; END IF;
  RETURN QUERY
  SELECT o.id, o.display_name, o.onboarding_status,
    (SELECT count(*) FROM edir_memberships m WHERE m.organization_id=o.id AND m.status='active'),
    (SELECT count(*) FROM edir_memberships m WHERE m.organization_id=o.id AND m.status='pending'),
    (SELECT count(*) FROM edir_groups g WHERE g.organization_id=o.id AND g.status='active'),
    (SELECT count(*) FROM edir_financial_transactions t JOIN edir_member_accounts a ON a.id=t.member_account_id AND a.organization_id=t.organization_id
      WHERE t.organization_id=o.id AND t.status='approved'),
    (SELECT coalesce(sum(t.amount),0) FROM edir_financial_transactions t WHERE t.organization_id=o.id AND t.status='approved')
  FROM edir_organizations o WHERE o.organization_type <> 'umbrella_master' ORDER BY o.display_name;
END $$;

GRANT EXECUTE ON FUNCTION app_edir_id() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_is_master_operator() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_consolidated_summary() TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_organizations TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_registration_applications TO "{{role}}";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE edir_staff TO "{{role}}";
