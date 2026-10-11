CREATE OR REPLACE FUNCTION mfi_guard_loan_writeoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM app_user_id() OR NEW.status<>'pending'
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL
       OR NEW.journal_id IS NOT NULL
       OR NOT mfi_user_has_role(NEW.institution_id,ARRAY['institution_admin','finance_manager','credit_manager','compliance']) THEN
      RAISE EXCEPTION 'Loan write-off proposals require an authorized maker and pending status';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loan write-off history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'journal_id')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'journal_id') THEN
    RAISE EXCEPTION 'Loan write-off request terms are immutable';
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000
     OR NOT mfi_user_has_role(NEW.institution_id,ARRAY['institution_admin','finance_manager','compliance']) THEN
    RAISE EXCEPTION 'Loan write-off decision requires an independent authorized reviewer and reason';
  END IF;
  IF NEW.status='approved' AND NOT EXISTS (
    SELECT 1 FROM mfi_journals journal WHERE journal.institution_id=NEW.institution_id
      AND journal.id=NEW.journal_id AND journal.writeoff_id=NEW.id
      AND journal.transaction_type='loan_writeoff' AND journal.status='posted' AND journal.amount=NEW.amount
  ) THEN RAISE EXCEPTION 'Approved write-off requires its matching posted journal'; END IF;
  IF NEW.status='rejected' AND NEW.journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Rejected write-off cannot have a journal';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER mfi_loan_writeoff_guard ON mfi_loan_writeoffs;
CREATE TRIGGER mfi_loan_writeoff_guard BEFORE INSERT OR UPDATE OR DELETE ON mfi_loan_writeoffs
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_loan_writeoff();

CREATE OR REPLACE FUNCTION mfi_validate_writeoff_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal mfi_loan_writeoffs%ROWTYPE;
BEGIN
  IF NEW.transaction_type='loan_writeoff' THEN
    SELECT * INTO proposal FROM mfi_loan_writeoffs
    WHERE institution_id=NEW.institution_id AND id=NEW.writeoff_id FOR UPDATE;
    IF NOT FOUND OR proposal.status<>'pending' OR proposal.loan_id<>NEW.loan_id
       OR proposal.amount<>NEW.amount OR proposal.idempotency_key<>NEW.idempotency_key
       OR proposal.created_by=NEW.created_by
       OR NOT mfi_user_has_role(NEW.institution_id,ARRAY['institution_admin','finance_manager','compliance']) THEN
      RAISE EXCEPTION 'Loan write-off journal requires a matching pending request and an independent authorized reviewer';
    END IF;
  END IF;
  RETURN NEW;
END $$;
GRANT EXECUTE ON FUNCTION mfi_guard_loan_writeoff() TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_validate_writeoff_journal() TO "{{role}}";
