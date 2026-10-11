ALTER TABLE edir_memberships
  ADD COLUMN kyc_status text NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','rejected')),
  ADD COLUMN kyc_reviewed_by uuid,
  ADD COLUMN kyc_reviewed_at timestamptz,
  ADD COLUMN kyc_review_reason text,
  ADD CONSTRAINT edir_member_kyc_review_evidence_check CHECK (
    (kyc_status='pending' AND kyc_reviewed_by IS NULL AND kyc_reviewed_at IS NULL AND kyc_review_reason IS NULL)
    OR (kyc_status IN ('verified','rejected') AND kyc_reviewed_by IS NOT NULL AND kyc_reviewed_at IS NOT NULL
      AND kyc_review_reason IS NOT NULL AND length(trim(kyc_review_reason)) BETWEEN 10 AND 1000)
  );

CREATE OR REPLACE FUNCTION edir_guard_membership_kyc_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kyc_status IS NOT DISTINCT FROM OLD.kyc_status
     AND NEW.kyc_reviewed_by IS NOT DISTINCT FROM OLD.kyc_reviewed_by
     AND NEW.kyc_reviewed_at IS NOT DISTINCT FROM OLD.kyc_reviewed_at
     AND NEW.kyc_review_reason IS NOT DISTINCT FROM OLD.kyc_review_reason THEN
    RETURN NEW;
  END IF;
  IF NEW.kyc_status NOT IN ('verified','rejected') OR NEW.kyc_reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.kyc_reviewed_by=NEW.created_by OR NEW.kyc_reviewed_by=NEW.user_id
     OR NEW.kyc_reviewed_by IS NOT DISTINCT FROM OLD.kyc_reviewed_by
     OR NEW.kyc_reviewed_at IS NULL OR NEW.kyc_review_reason IS NULL
     OR length(trim(NEW.kyc_review_reason)) NOT BETWEEN 10 AND 1000
     OR NOT edir_has_staff_role(ARRAY['edir_admin','compliance']) THEN
    RAISE EXCEPTION 'Edir KYC review requires an independent authorized reviewer and reason';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edir_membership_kyc_review_guard BEFORE UPDATE ON edir_memberships
  FOR EACH ROW EXECUTE FUNCTION edir_guard_membership_kyc_review();

CREATE FUNCTION edir_require_verified_member_kyc_for_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE verified_status text;
BEGIN
  SELECT kyc_status INTO verified_status FROM edir_memberships
  WHERE id=NEW.member_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF verified_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Edir member KYC must be independently verified before accepting a loan';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edir_loan_acceptance_kyc_guard BEFORE INSERT ON edir_loan_acceptances
  FOR EACH ROW EXECUTE FUNCTION edir_require_verified_member_kyc_for_acceptance();

CREATE FUNCTION edir_require_verified_member_kyc_for_disbursement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE verified_status text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'approved' AND NEW.status='approved' AND NEW.operation_type='disbursement' THEN
    SELECT member.kyc_status INTO verified_status FROM edir_loans loan
    JOIN edir_memberships member ON member.id=loan.member_id AND member.organization_id=loan.organization_id
    WHERE loan.id=NEW.loan_id AND loan.organization_id=NEW.organization_id FOR UPDATE OF member;
    IF verified_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Edir member KYC must be independently verified before disbursement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edir_loan_operation_disbursement_kyc_guard BEFORE UPDATE OF status ON edir_loan_operations
  FOR EACH ROW EXECUTE FUNCTION edir_require_verified_member_kyc_for_disbursement();

DROP POLICY IF EXISTS edir_membership_review ON edir_memberships;
CREATE POLICY edir_membership_review ON edir_memberships FOR UPDATE
  USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','compliance']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','compliance']));

GRANT EXECUTE ON FUNCTION edir_guard_membership_kyc_review() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_require_verified_member_kyc_for_acceptance() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_require_verified_member_kyc_for_disbursement() TO "{{role}}";
