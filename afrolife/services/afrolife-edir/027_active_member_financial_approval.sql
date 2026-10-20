CREATE OR REPLACE FUNCTION edir_require_active_member_for_financial_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  membership_status text;
BEGIN
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  SELECT membership.status INTO membership_status
  FROM edir_member_accounts account
  JOIN edir_memberships membership
    ON membership.id=account.member_id
   AND membership.organization_id=account.organization_id
  WHERE account.id=NEW.member_account_id
    AND account.organization_id=NEW.organization_id
  FOR UPDATE OF membership;
  IF membership_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Edir financial approval requires an active member';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_transaction_active_member_guard
BEFORE UPDATE OF status ON edir_financial_transactions
FOR EACH ROW EXECUTE FUNCTION edir_require_active_member_for_financial_approval();
