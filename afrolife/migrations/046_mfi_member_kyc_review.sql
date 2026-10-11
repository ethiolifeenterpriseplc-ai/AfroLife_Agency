ALTER TABLE mfi_members
  ADD COLUMN kyc_status text NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','rejected')),
  ADD COLUMN kyc_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN kyc_reviewed_at timestamptz,
  ADD COLUMN kyc_review_reason text,
  ADD CONSTRAINT mfi_member_kyc_review_evidence_check CHECK (
    (kyc_status='pending' AND kyc_reviewed_by IS NULL AND kyc_reviewed_at IS NULL AND kyc_review_reason IS NULL)
    OR (kyc_status IN ('verified','rejected') AND kyc_reviewed_by IS NOT NULL AND kyc_reviewed_at IS NOT NULL
      AND kyc_review_reason IS NOT NULL AND length(trim(kyc_review_reason)) BETWEEN 10 AND 1000)
  ),
  ADD CONSTRAINT mfi_member_kyc_reviewer_independence_check CHECK (
    kyc_reviewed_by IS NULL OR kyc_reviewed_by<>created_by
  );

CREATE FUNCTION mfi_guard_member_kyc_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kyc_status IS NOT DISTINCT FROM OLD.kyc_status
     AND NEW.kyc_reviewed_by IS NOT DISTINCT FROM OLD.kyc_reviewed_by
     AND NEW.kyc_reviewed_at IS NOT DISTINCT FROM OLD.kyc_reviewed_at
     AND NEW.kyc_review_reason IS NOT DISTINCT FROM OLD.kyc_review_reason THEN
    RETURN NEW;
  END IF;
  IF NEW.kyc_status NOT IN ('verified','rejected') OR NEW.kyc_reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.kyc_reviewed_by=NEW.created_by OR NEW.kyc_reviewed_by IS NOT DISTINCT FROM OLD.kyc_reviewed_by
     OR NEW.kyc_reviewed_at IS NULL OR NEW.kyc_review_reason IS NULL
     OR length(trim(NEW.kyc_review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'KYC review requires an independent reviewer and documented reason';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_member_kyc_review_guard BEFORE UPDATE ON mfi_members
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_member_kyc_review();

CREATE FUNCTION mfi_require_verified_member_kyc_for_disbursement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_kyc_status text;
BEGIN
  IF OLD.status='draft' AND NEW.status='posted' AND NEW.transaction_type='loan_disbursement' THEN
    SELECT member.kyc_status INTO member_kyc_status
    FROM mfi_loans loan JOIN mfi_members member
      ON member.id=loan.member_id AND member.institution_id=loan.institution_id
    WHERE loan.institution_id=NEW.institution_id AND loan.id=NEW.loan_id;
    IF member_kyc_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Member KYC must be independently verified before disbursement';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_journal_disbursement_kyc_guard BEFORE UPDATE ON mfi_journals
  FOR EACH ROW EXECUTE FUNCTION mfi_require_verified_member_kyc_for_disbursement();
GRANT EXECUTE ON FUNCTION mfi_guard_member_kyc_review() TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_require_verified_member_kyc_for_disbursement() TO "{{role}}";
