ALTER TABLE mfi_journals
  ADD COLUMN requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approval_reason text;

ALTER TABLE mfi_journals DROP CONSTRAINT mfi_journals_status_check;
ALTER TABLE mfi_journals ADD CONSTRAINT mfi_journals_status_check CHECK (
  (status IN ('draft','rejected') AND posted_at IS NULL) OR
  (status='posted' AND posted_at IS NOT NULL)
);
ALTER TABLE mfi_journals ADD CONSTRAINT mfi_journals_approval_fields_check CHECK (
  (status='draft' AND approved_by IS NULL AND approval_reason IS NULL) OR
  (status='posted' AND NOT requires_approval AND approved_by IS NULL AND approval_reason IS NULL) OR
  (status IN ('posted','rejected') AND requires_approval AND approved_by IS NOT NULL
    AND approved_by<>created_by AND length(trim(coalesce(approval_reason,'')))>=10)
);

CREATE OR REPLACE FUNCTION mfi_check_journal_posting() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE debit_total numeric(16,2); credit_total numeric(16,2);
BEGIN
  IF OLD.status<>'draft' OR NEW.status NOT IN ('posted','rejected') OR
     (to_jsonb(NEW)-ARRAY['status','posted_at','approved_by','approval_reason']) <>
     (to_jsonb(OLD)-ARRAY['status','posted_at','approved_by','approval_reason']) THEN
    RAISE EXCEPTION 'MFI journal approval cannot change journal content';
  END IF;
  IF NEW.requires_approval AND (NEW.approved_by IS NULL OR NEW.approved_by=OLD.created_by
      OR length(trim(coalesce(NEW.approval_reason,'')))<10) THEN
    RAISE EXCEPTION 'MFI journal requires an independent reviewer and reason';
  END IF;
  IF NOT NEW.requires_approval AND NEW.status<>'posted' THEN
    RAISE EXCEPTION 'Only approval-required MFI journals may be rejected';
  END IF;
  IF NEW.status='posted' THEN
    SELECT COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO debit_total,credit_total
      FROM mfi_journal_lines WHERE institution_id=NEW.institution_id AND journal_id=NEW.id;
    IF debit_total<=0 OR debit_total<>credit_total OR debit_total<>NEW.amount THEN
      RAISE EXCEPTION 'MFI journal must be balanced and equal its transaction amount';
    END IF;
    NEW.posted_at=now();
  ELSE
    NEW.posted_at=NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mfi_journals_post_guard ON mfi_journals;
CREATE TRIGGER mfi_journals_post_guard BEFORE UPDATE ON mfi_journals
  FOR EACH ROW EXECUTE FUNCTION mfi_check_journal_posting();
