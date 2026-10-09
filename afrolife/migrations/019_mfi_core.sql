CREATE SEQUENCE IF NOT EXISTS mfi_member_seq START 1;

CREATE TABLE mfi_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_code text NOT NULL UNIQUE CHECK (institution_code ~ '^[A-Z0-9]{2,12}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  currency text NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfi_institution_memberships (
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('institution_admin','finance_manager','credit_manager','loan_officer','teller','compliance','auditor')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, user_id)
);

CREATE TABLE mfi_audit_logs (
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

CREATE OR REPLACE FUNCTION mfi_has_access(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM mfi_institution_memberships
    WHERE institution_id = target AND user_id = app_user_id() AND active
  )
$$;

CREATE TABLE mfi_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  product_code text NOT NULL CHECK (product_code ~ '^[A-Z0-9-]{2,20}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  product_type text NOT NULL CHECK (product_type IN ('savings','share','loan')),
  minimum_balance numeric(16,2) NOT NULL DEFAULT 0 CHECK (minimum_balance >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, product_code),
  UNIQUE (institution_id, id),
  CHECK (product_type = 'savings' OR minimum_balance = 0)
);

CREATE TABLE mfi_gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  account_code text NOT NULL CHECK (account_code ~ '^[0-9]{4,8}$'),
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, account_code),
  UNIQUE (institution_id, id)
);

CREATE TABLE mfi_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  member_number text NOT NULL,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone text NOT NULL CHECK (length(trim(phone)) BETWEEN 7 AND 32),
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','suspended','closed')),
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, member_number),
  UNIQUE (institution_id, id),
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);

CREATE TABLE mfi_member_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  product_id uuid NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('savings','share','loan')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, member_id) REFERENCES mfi_members(institution_id, id),
  FOREIGN KEY (institution_id, product_id) REFERENCES mfi_products(institution_id, id),
  UNIQUE (institution_id, account_number),
  UNIQUE (institution_id, id)
);

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

CREATE TRIGGER mfi_member_accounts_validate
BEFORE INSERT ON mfi_member_accounts
FOR EACH ROW EXECUTE FUNCTION mfi_validate_member_account();

CREATE UNIQUE INDEX mfi_member_product_account_unique
  ON mfi_member_accounts (institution_id, member_id, product_id)
  WHERE account_type <> 'loan';

CREATE TABLE mfi_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  product_id uuid NOT NULL,
  member_account_id uuid,
  principal_amount numeric(16,2) NOT NULL CHECK (principal_amount > 0),
  term_months integer NOT NULL CHECK (term_months BETWEEN 1 AND 360),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','disbursed','repaid','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  checked_by uuid REFERENCES users(id),
  decision_reason text,
  disbursed_by uuid REFERENCES users(id),
  principal_repaid numeric(16,2) NOT NULL DEFAULT 0 CHECK (principal_repaid >= 0 AND principal_repaid <= principal_amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  disbursed_at timestamptz,
  FOREIGN KEY (institution_id, member_id) REFERENCES mfi_members(institution_id, id),
  FOREIGN KEY (institution_id, product_id) REFERENCES mfi_products(institution_id, id),
  FOREIGN KEY (institution_id, member_account_id) REFERENCES mfi_member_accounts(institution_id, id),
  UNIQUE (institution_id, id),
  CHECK ((status IN ('pending') AND checked_by IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved','rejected','disbursed','repaid') AND checked_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK ((status IN ('disbursed','repaid','cancelled') AND member_account_id IS NOT NULL AND disbursed_by IS NOT NULL AND disbursed_at IS NOT NULL)
      OR (status NOT IN ('disbursed','repaid','cancelled') AND disbursed_by IS NULL AND disbursed_at IS NULL)),
  CHECK (checked_by IS NULL OR checked_by <> created_by),
  CHECK (disbursed_by IS NULL OR (disbursed_by <> created_by AND disbursed_by <> checked_by))
);

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

CREATE TRIGGER mfi_loans_validate
BEFORE INSERT ON mfi_loans
FOR EACH ROW EXECUTE FUNCTION mfi_validate_loan_request();

CREATE TABLE mfi_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  transaction_type text NOT NULL CHECK (transaction_type IN ('savings_deposit','savings_withdrawal','share_contribution','loan_disbursement','loan_repayment','reversal')),
  member_account_id uuid,
  loan_id uuid,
  reversal_of uuid,
  reversal_reason text,
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  FOREIGN KEY (institution_id, member_account_id) REFERENCES mfi_member_accounts(institution_id, id),
  FOREIGN KEY (institution_id, loan_id) REFERENCES mfi_loans(institution_id, id),
  FOREIGN KEY (institution_id, reversal_of) REFERENCES mfi_journals(institution_id, id),
  UNIQUE (institution_id, idempotency_key),
  UNIQUE (institution_id, id),
  CHECK ((status = 'draft' AND posted_at IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL)),
  CHECK (
    (transaction_type = 'reversal' AND reversal_of IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) BETWEEN 10 AND 1000)
    OR (transaction_type <> 'reversal' AND reversal_of IS NULL AND reversal_reason IS NULL)
  )
);

CREATE UNIQUE INDEX mfi_journal_single_reversal_idx
  ON mfi_journals (institution_id, reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE TABLE mfi_journal_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL,
  gl_account_id uuid NOT NULL,
  member_account_id uuid,
  debit numeric(16,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(16,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, journal_id) REFERENCES mfi_journals(institution_id, id),
  FOREIGN KEY (institution_id, gl_account_id) REFERENCES mfi_gl_accounts(institution_id, id),
  FOREIGN KEY (institution_id, member_account_id) REFERENCES mfi_member_accounts(institution_id, id),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX mfi_members_status_idx ON mfi_members (institution_id, status, created_at DESC);
CREATE INDEX mfi_accounts_member_idx ON mfi_member_accounts (institution_id, member_id, created_at DESC);
CREATE INDEX mfi_loans_status_idx ON mfi_loans (institution_id, status, created_at DESC);
CREATE INDEX mfi_journals_account_idx ON mfi_journals (institution_id, member_account_id, created_at DESC);
CREATE INDEX mfi_journal_lines_subledger_idx ON mfi_journal_lines (institution_id, member_account_id, journal_id);

CREATE OR REPLACE FUNCTION mfi_validate_journal_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MFI journals must be inserted as drafts';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER mfi_journals_insert_guard
BEFORE INSERT ON mfi_journals
FOR EACH ROW EXECUTE FUNCTION mfi_validate_journal_insert();

CREATE OR REPLACE FUNCTION mfi_check_journal_posting() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  debit_total numeric(16,2);
  credit_total numeric(16,2);
BEGIN
  IF OLD.status <> 'draft' OR NEW.status <> 'posted' OR
     (to_jsonb(NEW) - 'status' - 'posted_at') <> (to_jsonb(OLD) - 'status' - 'posted_at') OR
     NEW.posted_at IS NULL THEN
    RAISE EXCEPTION 'Posted MFI journals are immutable';
  END IF;

  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO debit_total, credit_total
    FROM mfi_journal_lines WHERE institution_id = NEW.institution_id AND journal_id = NEW.id;

  IF debit_total <= 0 OR debit_total <> credit_total OR debit_total <> NEW.amount THEN
    RAISE EXCEPTION 'MFI journal must be balanced and equal its transaction amount';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER mfi_journals_post_guard
BEFORE UPDATE ON mfi_journals
FOR EACH ROW EXECUTE FUNCTION mfi_check_journal_posting();

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
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER mfi_journal_lines_append_only
BEFORE INSERT OR UPDATE OR DELETE ON mfi_journal_lines
FOR EACH ROW EXECUTE FUNCTION mfi_prevent_posted_journal_mutation();

CREATE OR REPLACE FUNCTION mfi_prevent_posted_journal_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Posted MFI journals are immutable'; END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER mfi_journals_no_delete
BEFORE DELETE ON mfi_journals
FOR EACH ROW EXECUTE FUNCTION mfi_prevent_posted_journal_deletion();

CREATE OR REPLACE FUNCTION mfi_prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MFI audit logs are append-only';
END
$$;

CREATE TRIGGER mfi_audit_logs_append_only
BEFORE UPDATE OR DELETE ON mfi_audit_logs
FOR EACH ROW EXECUTE FUNCTION mfi_prevent_audit_mutation();

ALTER TABLE mfi_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_institution_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_journal_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE mfi_institutions FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_products FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_gl_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_members FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_member_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_loans FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE mfi_audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY mfi_institution_scope ON mfi_institutions
  USING (mfi_has_access(id))
  WITH CHECK (app_role() = 'super_admin' OR mfi_has_access(id));
CREATE POLICY mfi_membership_scope ON mfi_institution_memberships
  USING (user_id = app_user_id() OR mfi_has_access(institution_id))
  WITH CHECK (app_role() = 'super_admin' OR mfi_has_access(institution_id));
CREATE POLICY mfi_audit_scope ON mfi_audit_logs
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));

CREATE POLICY mfi_products_scope ON mfi_products
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_gl_accounts_scope ON mfi_gl_accounts
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_members_scope ON mfi_members
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_member_accounts_scope ON mfi_member_accounts
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_loans_scope ON mfi_loans
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_journals_scope ON mfi_journals
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE POLICY mfi_journal_lines_scope ON mfi_journal_lines
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
