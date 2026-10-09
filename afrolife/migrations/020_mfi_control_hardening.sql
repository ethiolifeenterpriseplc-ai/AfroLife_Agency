CREATE TABLE IF NOT EXISTS mfi_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfi_membership_user_active_idx
  ON mfi_institution_memberships (user_id, active, institution_id);
CREATE INDEX IF NOT EXISTS mfi_audit_recent_idx
  ON mfi_audit_logs (institution_id, created_at DESC);

CREATE OR REPLACE FUNCTION mfi_user_has_role(target uuid, allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM mfi_institution_memberships
    WHERE institution_id = target AND user_id = app_user_id()
      AND active AND role = ANY(allowed_roles)
  )
$$;

DROP POLICY IF EXISTS mfi_membership_scope ON mfi_institution_memberships;
CREATE POLICY mfi_membership_scope ON mfi_institution_memberships
  USING (user_id = app_user_id() OR mfi_has_access(institution_id))
  WITH CHECK (app_role() = 'super_admin' OR mfi_user_has_role(institution_id, ARRAY['institution_admin']));

CREATE OR REPLACE FUNCTION mfi_validate_member_account() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actual_type text;
  active_member boolean;
  active_product boolean;
BEGIN
  SELECT product_type, active INTO actual_type, active_product
    FROM mfi_products
    WHERE institution_id=NEW.institution_id AND id=NEW.product_id;
  SELECT status='active' INTO active_member
    FROM mfi_members
    WHERE institution_id=NEW.institution_id AND id=NEW.member_id;
  IF actual_type IS DISTINCT FROM NEW.account_type OR NOT COALESCE(active_product, false) OR NOT COALESCE(active_member, false) THEN
    RAISE EXCEPTION 'Member account product or member is not eligible';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mfi_member_accounts_validate ON mfi_member_accounts;
CREATE TRIGGER mfi_member_accounts_validate
BEFORE INSERT ON mfi_member_accounts
FOR EACH ROW EXECUTE FUNCTION mfi_validate_member_account();

CREATE OR REPLACE FUNCTION mfi_validate_loan_request() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mfi_products p JOIN mfi_members m ON m.institution_id=p.institution_id
    WHERE p.institution_id=NEW.institution_id AND p.id=NEW.product_id AND p.product_type='loan' AND p.active
      AND m.id=NEW.member_id AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'Loan product or member is not eligible';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mfi_loans_validate ON mfi_loans;
CREATE TRIGGER mfi_loans_validate
BEFORE INSERT ON mfi_loans
FOR EACH ROW EXECUTE FUNCTION mfi_validate_loan_request();

ALTER TABLE mfi_journals ADD COLUMN IF NOT EXISTS reversal_of uuid;
ALTER TABLE mfi_journals ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE mfi_journals DROP CONSTRAINT IF EXISTS mfi_journals_institution_id_reversal_of_fkey;
ALTER TABLE mfi_journals
  ADD CONSTRAINT mfi_journals_institution_id_reversal_of_fkey
  FOREIGN KEY (institution_id, reversal_of) REFERENCES mfi_journals(institution_id, id);

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint WHERE conrelid='mfi_loans'::regclass AND contype='c'
  LOOP
    EXECUTE format('ALTER TABLE mfi_loans DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END
$$;

ALTER TABLE mfi_loans
  ADD CONSTRAINT mfi_loans_principal_check CHECK (principal_amount > 0),
  ADD CONSTRAINT mfi_loans_term_check CHECK (term_months BETWEEN 1 AND 360),
  ADD CONSTRAINT mfi_loans_status_check CHECK (status IN ('pending','approved','rejected','disbursed','repaid','cancelled')),
  ADD CONSTRAINT mfi_loans_principal_repaid_check CHECK (principal_repaid >= 0 AND principal_repaid <= principal_amount),
  ADD CONSTRAINT mfi_loans_review_state_check CHECK (
    (status = 'pending' AND checked_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved','rejected','disbursed','repaid','cancelled') AND checked_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  ADD CONSTRAINT mfi_loans_disbursement_state_check CHECK (
    (status IN ('disbursed','repaid','cancelled') AND member_account_id IS NOT NULL AND disbursed_by IS NOT NULL AND disbursed_at IS NOT NULL)
    OR (status NOT IN ('disbursed','repaid','cancelled') AND disbursed_by IS NULL AND disbursed_at IS NULL)
  ),
  ADD CONSTRAINT mfi_loans_checker_check CHECK (checked_by IS NULL OR checked_by <> created_by),
  ADD CONSTRAINT mfi_loans_disburser_check CHECK (disbursed_by IS NULL OR (disbursed_by <> created_by AND disbursed_by <> checked_by));

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint WHERE conrelid='mfi_journals'::regclass AND contype='c'
  LOOP
    EXECUTE format('ALTER TABLE mfi_journals DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END
$$;

ALTER TABLE mfi_journals
  ADD CONSTRAINT mfi_journals_amount_check CHECK (amount > 0),
  ADD CONSTRAINT mfi_journals_status_check CHECK (
    (status = 'draft' AND posted_at IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL)
  ),
  ADD CONSTRAINT mfi_journals_transaction_type_check CHECK (
    transaction_type IN ('savings_deposit','savings_withdrawal','share_contribution','loan_disbursement','loan_repayment','reversal')
  ),
  ADD CONSTRAINT mfi_journals_reversal_check CHECK (
    (transaction_type = 'reversal' AND reversal_of IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) BETWEEN 10 AND 1000)
    OR (transaction_type <> 'reversal' AND reversal_of IS NULL AND reversal_reason IS NULL)
  ),
  ADD CONSTRAINT mfi_journals_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS mfi_journal_single_reversal_idx
  ON mfi_journals (institution_id, reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION mfi_validate_journal_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MFI journals must be inserted as drafts';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mfi_journals_insert_guard ON mfi_journals;
CREATE TRIGGER mfi_journals_insert_guard
BEFORE INSERT ON mfi_journals
FOR EACH ROW EXECUTE FUNCTION mfi_validate_journal_insert();

CREATE OR REPLACE FUNCTION mfi_prevent_posted_journal_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journal_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO journal_status FROM mfi_journals
      WHERE institution_id = NEW.institution_id AND id = NEW.journal_id;
    IF journal_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'MFI journal lines can only be added to a draft journal';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM mfi_journals
    WHERE institution_id = OLD.institution_id AND id = OLD.journal_id AND status = 'posted'
  ) THEN
    RAISE EXCEPTION 'Posted MFI journal lines are immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO journal_status FROM mfi_journals
      WHERE institution_id = NEW.institution_id AND id = NEW.journal_id;
    IF journal_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'MFI journal lines can only be changed while their journal is a draft';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mfi_journal_lines_append_only ON mfi_journal_lines;
CREATE TRIGGER mfi_journal_lines_append_only
BEFORE INSERT OR UPDATE OR DELETE ON mfi_journal_lines
FOR EACH ROW EXECUTE FUNCTION mfi_prevent_posted_journal_mutation();

CREATE OR REPLACE FUNCTION mfi_prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MFI audit logs are append-only';
END
$$;

DROP TRIGGER IF EXISTS mfi_audit_logs_append_only ON mfi_audit_logs;
CREATE TRIGGER mfi_audit_logs_append_only
BEFORE UPDATE OR DELETE ON mfi_audit_logs
FOR EACH ROW EXECUTE FUNCTION mfi_prevent_audit_mutation();

ALTER TABLE mfi_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mfi_audit_scope ON mfi_audit_logs;
CREATE POLICY mfi_audit_scope ON mfi_audit_logs
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
