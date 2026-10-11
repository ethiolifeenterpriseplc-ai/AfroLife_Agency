ALTER TABLE mfi_loans DROP CONSTRAINT mfi_loans_status_check;
ALTER TABLE mfi_loans ADD CONSTRAINT mfi_loans_status_check
  CHECK (status IN ('pending','approved','rejected','disbursed','repaid','cancelled','written_off'));
ALTER TABLE mfi_loans DROP CONSTRAINT mfi_loans_review_state_check;
ALTER TABLE mfi_loans ADD CONSTRAINT mfi_loans_review_state_check CHECK (
  (status='pending' AND checked_by IS NULL AND reviewed_at IS NULL)
  OR (status IN ('approved','rejected','disbursed','repaid','cancelled','written_off')
      AND checked_by IS NOT NULL AND reviewed_at IS NOT NULL)
);
ALTER TABLE mfi_loans DROP CONSTRAINT mfi_loans_disbursement_state_check;
ALTER TABLE mfi_loans ADD CONSTRAINT mfi_loans_disbursement_state_check CHECK (
  (status IN ('disbursed','repaid','cancelled','written_off')
    AND member_account_id IS NOT NULL AND disbursed_by IS NOT NULL AND disbursed_at IS NOT NULL)
  OR (status NOT IN ('disbursed','repaid','cancelled','written_off')
    AND disbursed_by IS NULL AND disbursed_at IS NULL)
);

ALTER TABLE mfi_journals DROP CONSTRAINT mfi_journals_transaction_type_check;
ALTER TABLE mfi_journals ADD CONSTRAINT mfi_journals_transaction_type_check CHECK (
  transaction_type IN ('savings_deposit','savings_withdrawal','share_contribution','loan_disbursement',
    'loan_repayment','loan_writeoff','reversal')
);
ALTER TABLE mfi_journals ADD COLUMN writeoff_id uuid;

CREATE TABLE mfi_loan_writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL,
  amount numeric(16,2) NOT NULL CHECK (amount>0),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  journal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id,loan_id) REFERENCES mfi_loans(institution_id,id),
  FOREIGN KEY (institution_id,journal_id) REFERENCES mfi_journals(institution_id,id),
  UNIQUE (institution_id,id),
  UNIQUE (institution_id,idempotency_key),
  UNIQUE (institution_id,journal_id),
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL AND journal_id IS NULL)
    OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000 AND journal_id IS NOT NULL)
    OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000 AND journal_id IS NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
ALTER TABLE mfi_journals ADD CONSTRAINT mfi_journals_writeoff_fk
  FOREIGN KEY (institution_id,writeoff_id) REFERENCES mfi_loan_writeoffs(institution_id,id);
ALTER TABLE mfi_journals ADD CONSTRAINT mfi_journals_writeoff_link_check CHECK (
  (transaction_type='loan_writeoff' AND writeoff_id IS NOT NULL AND loan_id IS NOT NULL
    AND member_account_id IS NULL AND reversal_of IS NULL)
  OR (transaction_type<>'loan_writeoff' AND writeoff_id IS NULL)
);
CREATE UNIQUE INDEX mfi_writeoff_single_approved_idx
  ON mfi_loan_writeoffs(institution_id,loan_id) WHERE status='approved';

INSERT INTO mfi_gl_accounts(institution_id,account_code,name,account_type)
SELECT id,'5100','Loan write-off expense','expense' FROM mfi_institutions
ON CONFLICT (institution_id,account_code) DO NOTHING;

CREATE FUNCTION mfi_guard_loan_writeoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loan write-off history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'journal_id')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'journal_id') THEN
    RAISE EXCEPTION 'Loan write-off request terms are immutable';
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Loan write-off decision requires an independent reviewer and reason';
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
CREATE TRIGGER mfi_loan_writeoff_guard BEFORE UPDATE OR DELETE ON mfi_loan_writeoffs
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_loan_writeoff();

CREATE FUNCTION mfi_validate_writeoff_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal mfi_loan_writeoffs%ROWTYPE;
BEGIN
  IF NEW.transaction_type='loan_writeoff' THEN
    SELECT * INTO proposal FROM mfi_loan_writeoffs
    WHERE institution_id=NEW.institution_id AND id=NEW.writeoff_id FOR UPDATE;
    IF NOT FOUND OR proposal.status<>'pending' OR proposal.loan_id<>NEW.loan_id
       OR proposal.amount<>NEW.amount OR proposal.idempotency_key<>NEW.idempotency_key
       OR proposal.created_by=NEW.created_by THEN
      RAISE EXCEPTION 'Loan write-off journal must match a pending independently reviewed request';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_journal_writeoff_guard BEFORE INSERT ON mfi_journals
  FOR EACH ROW EXECUTE FUNCTION mfi_validate_writeoff_journal();

ALTER TABLE mfi_loan_writeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loan_writeoffs FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_loan_writeoffs_scope ON mfi_loan_writeoffs
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_loan_writeoffs TO "{{role}}";
GRANT SELECT,UPDATE ON TABLE mfi_journals TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_loan_writeoff() TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_validate_writeoff_journal() TO "{{role}}";
