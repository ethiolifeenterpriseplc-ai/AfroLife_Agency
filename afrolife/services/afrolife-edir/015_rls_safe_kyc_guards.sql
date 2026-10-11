-- KYC guard triggers must read through the caller's SELECT policies. FOR UPDATE
-- requires update visibility and therefore hid a member's own row from member
-- acceptance and from finance reviewers checking a disbursement.
CREATE OR REPLACE FUNCTION edir_require_verified_member_kyc_for_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE verified_status text;
BEGIN
  SELECT kyc_status INTO verified_status FROM edir_memberships
  WHERE id=NEW.member_id AND organization_id=NEW.organization_id;
  IF verified_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Edir member KYC must be independently verified before accepting a loan';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION edir_require_verified_member_kyc_for_disbursement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE verified_status text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'approved' AND NEW.status='approved' AND NEW.operation_type='disbursement' THEN
    SELECT member.kyc_status INTO verified_status FROM edir_loans loan
    JOIN edir_memberships member ON member.id=loan.member_id AND member.organization_id=loan.organization_id
    WHERE loan.id=NEW.loan_id AND loan.organization_id=NEW.organization_id;
    IF verified_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Edir member KYC must be independently verified before disbursement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION edir_require_verified_member_kyc_for_acceptance() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_require_verified_member_kyc_for_disbursement() TO "{{role}}";
