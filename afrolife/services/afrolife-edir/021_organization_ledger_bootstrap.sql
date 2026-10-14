GRANT INSERT ON TABLE edir_ledger_accounts TO "{{role}}";

CREATE FUNCTION edir_seed_organization_ledger_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.organization_type <> 'umbrella_master' THEN
    INSERT INTO edir_ledger_accounts (organization_id,code,name,category,normal_balance)
    VALUES
      (NEW.id,'1000','Cash and bank','asset','debit'),
      (NEW.id,'1300','Loan receivable','asset','debit'),
      (NEW.id,'2100','Member savings payable','liability','credit'),
      (NEW.id,'2200','Member contribution payable','liability','credit'),
      (NEW.id,'3100','Member share capital','equity','credit'),
      (NEW.id,'3200','Edir mutual reserve','equity','credit'),
      (NEW.id,'5100','Loan write-off expense','expense','debit')
    ON CONFLICT (organization_id,code) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION edir_seed_organization_ledger_accounts() FROM PUBLIC;

INSERT INTO edir_ledger_accounts (organization_id,code,name,category,normal_balance)
SELECT organization.id,account.code,account.name,account.category,account.normal_balance
FROM edir_organizations organization
CROSS JOIN (VALUES
  ('1000','Cash and bank','asset','debit'),
  ('1300','Loan receivable','asset','debit'),
  ('2100','Member savings payable','liability','credit'),
  ('2200','Member contribution payable','liability','credit'),
  ('3100','Member share capital','equity','credit'),
  ('3200','Edir mutual reserve','equity','credit'),
  ('5100','Loan write-off expense','expense','debit')
) AS account(code,name,category,normal_balance)
WHERE organization.organization_type <> 'umbrella_master'
ON CONFLICT (organization_id,code) DO NOTHING;

CREATE TRIGGER edir_organization_ledger_bootstrap
AFTER INSERT ON edir_organizations
FOR EACH ROW EXECUTE FUNCTION edir_seed_organization_ledger_accounts();
