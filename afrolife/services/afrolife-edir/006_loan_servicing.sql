CREATE TABLE edir_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  application_id uuid NOT NULL,
  member_id uuid NOT NULL,
  member_account_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  principal_amount numeric(14,2) NOT NULL CHECK (principal_amount > 0),
  principal_repaid numeric(14,2) NOT NULL DEFAULT 0
    CHECK (principal_repaid >= 0 AND principal_repaid <= principal_amount),
  term_months integer NOT NULL CHECK (term_months BETWEEN 1 AND 360),
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','disbursed','repaid')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  disbursed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (application_id, organization_id) REFERENCES edir_loan_applications(id, organization_id),
  FOREIGN KEY (member_id, organization_id) REFERENCES edir_memberships(id, organization_id),
  FOREIGN KEY (member_account_id, organization_id) REFERENCES edir_member_accounts(id, organization_id),
  FOREIGN KEY (policy_version_id, organization_id) REFERENCES edir_credit_policy_versions(id, organization_id),
  CHECK (
    (status='accepted' AND disbursed_at IS NULL AND principal_repaid=0)
    OR (status='disbursed' AND disbursed_at IS NOT NULL AND principal_repaid<principal_amount)
    OR (status='repaid' AND disbursed_at IS NOT NULL AND principal_repaid=principal_amount)
  )
);

CREATE TABLE edir_loan_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  application_id uuid NOT NULL,
  member_id uuid NOT NULL,
  member_account_id uuid NOT NULL,
  accepted_by uuid NOT NULL,
  consent_text text NOT NULL CHECK (length(trim(consent_text)) BETWEEN 20 AND 1000),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id),
  UNIQUE (application_id, organization_id),
  FOREIGN KEY (application_id, organization_id) REFERENCES edir_loan_applications(id, organization_id),
  FOREIGN KEY (member_id, organization_id) REFERENCES edir_memberships(id, organization_id),
  FOREIGN KEY (member_account_id, organization_id) REFERENCES edir_member_accounts(id, organization_id)
);

CREATE TABLE edir_loan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  loan_id uuid NOT NULL,
  installment_no integer NOT NULL CHECK (installment_no > 0),
  due_on date NOT NULL,
  principal_due numeric(14,2) NOT NULL CHECK (principal_due > 0),
  principal_paid numeric(14,2) NOT NULL DEFAULT 0
    CHECK (principal_paid >= 0 AND principal_paid <= principal_due),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','partial','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_no),
  FOREIGN KEY (loan_id, organization_id) REFERENCES edir_loans(id, organization_id),
  CHECK (
    (status='due' AND principal_paid=0)
    OR (status='partial' AND principal_paid>0 AND principal_paid<principal_due)
    OR (status='paid' AND principal_paid=principal_due)
  )
);

CREATE OR REPLACE FUNCTION edir_guard_loan_installment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth()<2 THEN
    RAISE EXCEPTION 'Edir installment changes must originate from a posted loan journal';
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir installment history cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
    OR NEW.installment_no IS DISTINCT FROM OLD.installment_no
    OR NEW.due_on IS DISTINCT FROM OLD.due_on
    OR NEW.principal_due IS DISTINCT FROM OLD.principal_due
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.principal_paid<OLD.principal_paid
  ) THEN
    RAISE EXCEPTION 'Edir installment terms and repayment history are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_installment_guard
BEFORE INSERT OR UPDATE OR DELETE ON edir_loan_installments
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_installment();

CREATE INDEX edir_loan_installment_due_idx
  ON edir_loan_installments (organization_id, due_on, status);

CREATE OR REPLACE FUNCTION edir_guard_loan_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE application_row edir_loan_applications%ROWTYPE;
  member_user_id uuid;
  account_member_id uuid;
  account_status text;
  product_type text;
  product_status text;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Edir loan acceptances are immutable'; END IF;
  IF NEW.accepted_by IS DISTINCT FROM app_user_id() THEN
    RAISE EXCEPTION 'Edir loan acceptance must be recorded by the signed-in member';
  END IF;
  SELECT * INTO application_row FROM edir_loan_applications
  WHERE id=NEW.application_id AND organization_id=NEW.organization_id FOR UPDATE;
  SELECT user_id INTO member_user_id FROM edir_memberships
  WHERE id=NEW.member_id AND organization_id=NEW.organization_id AND status='active';
  IF application_row.status<>'approved' OR application_row.member_id<>NEW.member_id
     OR member_user_id IS DISTINCT FROM NEW.accepted_by THEN
    RAISE EXCEPTION 'Only the active loan applicant may accept an approved Edir offer';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.member_account_id::text),779815);
  SELECT account.member_id,account.status,product.product_type,product.status
  INTO account_member_id,account_status,product_type,product_status
  FROM edir_member_accounts account
  JOIN edir_financial_products product
    ON product.id=account.product_id AND product.organization_id=account.organization_id
  WHERE account.id=NEW.member_account_id AND account.organization_id=NEW.organization_id;
  IF account_member_id IS DISTINCT FROM NEW.member_id OR account_status IS DISTINCT FROM 'active'
     OR product_type IS DISTINCT FROM 'savings' OR product_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Edir loan proceeds must go to the member own active savings account';
  END IF;
  UPDATE edir_loan_applications SET status='accepted',accepted_at=NEW.accepted_at
  WHERE id=NEW.application_id AND organization_id=NEW.organization_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_acceptance_immutable
BEFORE INSERT OR UPDATE OR DELETE ON edir_loan_acceptances
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_acceptance();
CREATE TRIGGER edir_loan_acceptances_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_acceptances
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();

CREATE TABLE edir_loan_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  loan_id uuid NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('disbursement','repayment')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, created_by, idempotency_key),
  UNIQUE (id, organization_id),
  FOREIGN KEY (loan_id, organization_id) REFERENCES edir_loans(id, organization_id),
  CHECK (
    (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);

CREATE TABLE edir_loan_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  operation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (operation_id, organization_id) REFERENCES edir_loan_operations(id, organization_id),
  CHECK ((status='draft' AND posted_by IS NULL AND posted_at IS NULL)
    OR (status='posted' AND posted_by IS NOT NULL AND posted_at IS NOT NULL))
);

CREATE TABLE edir_loan_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  journal_id uuid NOT NULL,
  ledger_account_id uuid NOT NULL,
  member_account_id uuid,
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (journal_id, organization_id) REFERENCES edir_loan_journals(id, organization_id),
  FOREIGN KEY (ledger_account_id, organization_id) REFERENCES edir_ledger_accounts(id, organization_id),
  FOREIGN KEY (member_account_id, organization_id) REFERENCES edir_member_accounts(id, organization_id),
  CHECK ((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);

CREATE INDEX edir_loan_journal_lines_member_idx
  ON edir_loan_journal_lines (organization_id, member_account_id, journal_id);

CREATE OR REPLACE FUNCTION edir_guard_loan_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  application_row edir_loan_applications%ROWTYPE;
  accepted_account uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO application_row FROM edir_loan_applications
    WHERE id=NEW.application_id AND organization_id=NEW.organization_id;
    SELECT member_account_id INTO accepted_account FROM edir_loan_acceptances
    WHERE application_id=NEW.application_id AND organization_id=NEW.organization_id;
    IF application_row.status<>'accepted' OR accepted_account IS DISTINCT FROM NEW.member_account_id
       OR application_row.member_id IS DISTINCT FROM NEW.member_id
       OR application_row.policy_version_id IS DISTINCT FROM NEW.policy_version_id
       OR application_row.requested_principal IS DISTINCT FROM NEW.principal_amount
       OR application_row.requested_term_months IS DISTINCT FROM NEW.term_months
       OR NEW.status<>'accepted' OR NEW.principal_repaid<>0 OR NEW.disbursed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Edir loan record does not match member acceptance and approved offer';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan records cannot be deleted'; END IF;
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Edir loan servicing changes must originate from a posted journal'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
     OR NEW.principal_amount IS DISTINCT FROM OLD.principal_amount
     OR NEW.term_months IS DISTINCT FROM OLD.term_months
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan terms and borrower account are immutable';
  END IF;
  IF OLD.status='accepted' AND NEW.status='disbursed' THEN
    IF NEW.disbursed_at IS NULL OR NEW.principal_repaid<>0 THEN
      RAISE EXCEPTION 'Edir loan disbursement evidence is incomplete';
    END IF;
  ELSIF OLD.status='disbursed' AND NEW.status IN ('disbursed','repaid') THEN
    IF NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at
       OR NEW.principal_repaid<OLD.principal_repaid THEN
      RAISE EXCEPTION 'Edir loan repayment history cannot be reversed';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid Edir loan lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_record_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON edir_loans
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_record();

CREATE OR REPLACE FUNCTION edir_validate_loan_operation_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'pending' OR NEW.created_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New Edir loan operations must be pending requests from the current actor';
  END IF;
  IF NEW.operation_type='disbursement'
     AND NOT (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])) THEN
    RAISE EXCEPTION 'Edir loan disbursement access is required';
  END IF;
  IF NEW.operation_type='repayment' AND NOT (
     NEW.created_by IN (SELECT membership.user_id FROM edir_memberships membership
       JOIN edir_loans loan ON loan.member_id=membership.id
       WHERE loan.id=NEW.loan_id AND membership.organization_id=NEW.organization_id)
     OR edir_is_platform_admin()
     OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer'])
  ) THEN
    RAISE EXCEPTION 'Edir loan repayment must be requested by its member or authorized staff';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_operation_insert_guard
BEFORE INSERT ON edir_loan_operations
FOR EACH ROW EXECUTE FUNCTION edir_validate_loan_operation_insert();

CREATE OR REPLACE FUNCTION edir_guard_loan_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  loan_row edir_loans%ROWTYPE;
  application_row edir_loan_applications%ROWTYPE;
  remaining_principal numeric(14,2);
  account_balance numeric(14,2);
  minimum_balance numeric(14,2);
  product_status text;
  account_status text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan operation history cannot be deleted'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
     OR NEW.operation_type IS DISTINCT FROM OLD.operation_type
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan operation request is immutable';
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by=NEW.created_by OR NEW.reviewed_at IS NULL
     OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Invalid Edir loan operation decision';
  END IF;
  IF NEW.status='approved' THEN
    SELECT * INTO loan_row FROM edir_loans
    WHERE id=NEW.loan_id AND organization_id=NEW.organization_id FOR UPDATE;
    SELECT * INTO application_row FROM edir_loan_applications
    WHERE id=loan_row.application_id AND organization_id=NEW.organization_id;
    IF NEW.operation_type='disbursement' THEN
      IF loan_row.status<>'accepted' OR NEW.amount<>loan_row.principal_amount
         OR NEW.created_by IN (application_row.created_by,application_row.scored_by,application_row.decision_by)
         OR NEW.reviewed_by IN (application_row.created_by,application_row.scored_by,application_row.decision_by) THEN
        RAISE EXCEPTION 'Edir disbursement requires an accepted loan and independent authorized actors';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtext(loan_row.member_account_id::text),779815);
      SELECT account.status,product.status,product.minimum_balance
      INTO account_status,product_status,minimum_balance
      FROM edir_member_accounts account
      JOIN edir_financial_products product
        ON product.id=account.product_id AND product.organization_id=account.organization_id
      WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id
        AND account.member_id=loan_row.member_id AND product.product_type='savings';
      IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Edir loan destination must be an active member savings account';
      END IF;
      SELECT * INTO STRICT application_row FROM edir_loan_applications
      WHERE id=loan_row.application_id AND organization_id=NEW.organization_id;
      IF application_row.status<>'accepted' OR NOT EXISTS (
        SELECT 1 FROM edir_loan_acceptances acceptance
        WHERE acceptance.application_id=loan_row.application_id
          AND acceptance.organization_id=NEW.organization_id
          AND acceptance.member_account_id=loan_row.member_account_id
      ) THEN
        RAISE EXCEPTION 'The member has not accepted this loan into the selected savings account';
      END IF;
    ELSIF NEW.operation_type='repayment' THEN
      IF loan_row.status<>'disbursed'
         OR NEW.amount>loan_row.principal_amount-loan_row.principal_repaid
         OR NEW.created_by=application_row.scored_by
         OR NEW.reviewed_by IN (application_row.created_by,application_row.scored_by,application_row.decision_by) THEN
        RAISE EXCEPTION 'Edir repayment exceeds the outstanding principal or lacks independent review';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtext(loan_row.member_account_id::text),779815);
      SELECT account.status,product.status,product.minimum_balance
      INTO account_status,product_status,minimum_balance
      FROM edir_member_accounts account
      JOIN edir_financial_products product
        ON product.id=account.product_id AND product.organization_id=account.organization_id
      WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id;
      account_balance := edir_loan_account_balance(loan_row.member_account_id);
      IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active'
         OR account_balance-NEW.amount<minimum_balance THEN
        RAISE EXCEPTION 'Edir savings balance is insufficient for the loan repayment';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_operation_lifecycle_guard
BEFORE UPDATE OR DELETE ON edir_loan_operations
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_operation();

CREATE OR REPLACE FUNCTION edir_guard_loan_journal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  operation edir_loan_operations%ROWTYPE;
  loan_row edir_loans%ROWTYPE;
  debit_total numeric(14,2);
  credit_total numeric(14,2);
  line_count bigint;
  remaining_principal numeric(14,2);
  loan_ledger uuid;
  savings_ledger uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted Edir loan journals are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted Edir loan journals are immutable'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan journal identity and amount are immutable';
  END IF;
  IF NEW.status='posted' THEN
    IF NEW.posted_by IS DISTINCT FROM app_user_id() OR NEW.posted_at IS NULL THEN
      RAISE EXCEPTION 'Edir loan journal poster must match the current actor';
    END IF;
    SELECT * INTO operation FROM edir_loan_operations
    WHERE id=NEW.operation_id AND organization_id=NEW.organization_id;
    IF operation.status<>'approved' OR operation.reviewed_by<>NEW.posted_by
       OR operation.amount<>NEW.amount THEN
      RAISE EXCEPTION 'Only an approved Edir loan operation may be posted';
    END IF;
    SELECT * INTO loan_row FROM edir_loans
    WHERE id=operation.loan_id AND organization_id=NEW.organization_id;
    SELECT id INTO loan_ledger FROM edir_ledger_accounts
    WHERE code='1300' AND active;
    SELECT product.ledger_account_id INTO savings_ledger
    FROM edir_member_accounts account
    JOIN edir_financial_products product
      ON product.id=account.product_id AND product.organization_id=account.organization_id
    WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id;
    IF loan_ledger IS NULL OR savings_ledger IS NULL THEN
      RAISE EXCEPTION 'Edir loan or savings ledger mapping is unavailable';
    END IF;
    SELECT coalesce(sum(debit),0),coalesce(sum(credit),0),count(*)
    INTO debit_total,credit_total,line_count FROM edir_loan_journal_lines
    WHERE journal_id=NEW.id AND organization_id=NEW.organization_id;
    IF debit_total<>credit_total OR debit_total<>NEW.amount OR line_count<>2 THEN
      RAISE EXCEPTION 'Edir loan journal is not balanced';
    END IF;
    IF operation.operation_type='disbursement' AND NOT EXISTS (
      SELECT 1 FROM edir_loan_journal_lines
      WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loan_ledger AND member_account_id IS NULL
        AND debit=NEW.amount AND credit=0
    ) THEN
      RAISE EXCEPTION 'Edir disbursement must debit the loan receivable ledger';
    ELSIF operation.operation_type='repayment' AND NOT EXISTS (
      SELECT 1 FROM edir_loan_journal_lines
      WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loan_ledger AND member_account_id IS NULL
        AND credit=NEW.amount AND debit=0
    ) THEN
      RAISE EXCEPTION 'Edir repayment must credit the loan receivable ledger';
    END IF;
    IF operation.operation_type='disbursement' AND NOT EXISTS (
      SELECT 1 FROM edir_loan_journal_lines
      WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=savings_ledger AND member_account_id=loan_row.member_account_id
        AND credit=NEW.amount AND debit=0
    ) THEN
      RAISE EXCEPTION 'Edir disbursement must credit the accepted member savings account';
    ELSIF operation.operation_type='repayment' AND NOT EXISTS (
      SELECT 1 FROM edir_loan_journal_lines
      WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=savings_ledger AND member_account_id=loan_row.member_account_id
        AND debit=NEW.amount AND credit=0
    ) THEN
      RAISE EXCEPTION 'Edir repayment must debit the member savings account';
    END IF;
    IF operation.operation_type='disbursement' THEN
      UPDATE edir_loans SET status='disbursed',disbursed_at=NEW.posted_at
      WHERE id=loan_row.id AND organization_id=NEW.organization_id;
      INSERT INTO edir_loan_installments
        (organization_id,loan_id,installment_no,due_on,principal_due)
      SELECT NEW.organization_id,loan_row.id,installment_no,
        (
          date_trunc('month',NEW.posted_at::date + (installment_no||' months')::interval)::date
          + least(extract(day FROM NEW.posted_at::date)::integer,28)-1
        ),principal_due
      FROM (
        SELECT installment_no,
          ((floor((loan_row.principal_amount*100)/loan_row.term_months)
             + CASE WHEN installment_no<=mod(round(loan_row.principal_amount*100)::bigint,loan_row.term_months)
               THEN 1 ELSE 0 END)::numeric/100)::numeric(14,2) AS principal_due
        FROM generate_series(1,loan_row.term_months) AS installment_no
      ) schedule;
    ELSE
      remaining_principal := loan_row.principal_amount-loan_row.principal_repaid-operation.amount;
      UPDATE edir_loans SET principal_repaid=principal_repaid+operation.amount,
        status=CASE WHEN remaining_principal=0 THEN 'repaid' ELSE 'disbursed' END
      WHERE id=loan_row.id AND organization_id=NEW.organization_id;
      WITH allocations AS (
        SELECT id,principal_due-principal_paid AS remaining,
          least(principal_due-principal_paid,greatest(0,operation.amount-
            coalesce(sum(principal_due-principal_paid) OVER (
              ORDER BY installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),0))) AS paid
        FROM edir_loan_installments
        WHERE loan_id=loan_row.id AND organization_id=NEW.organization_id
          AND status IN ('due','partial')
        ORDER BY installment_no
      )
      UPDATE edir_loan_installments installment
      SET principal_paid=installment.principal_paid+allocations.paid,
        status=CASE
          WHEN installment.principal_paid+allocations.paid=installment.principal_due THEN 'paid'
          WHEN installment.principal_paid+allocations.paid>0 THEN 'partial'
          ELSE 'due'
        END
      FROM allocations
      WHERE installment.id=allocations.id AND allocations.paid>0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_journal_lifecycle_guard
BEFORE UPDATE OR DELETE ON edir_loan_journals
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_journal();

CREATE OR REPLACE FUNCTION edir_guard_loan_journal_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE journal_status text;
BEGIN
  SELECT status INTO journal_status FROM edir_loan_journals
  WHERE id=coalesce(NEW.journal_id,OLD.journal_id);
  IF journal_status='posted' THEN RAISE EXCEPTION 'Posted Edir loan journal lines are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_journal_line_immutable
BEFORE INSERT OR UPDATE OR DELETE ON edir_loan_journal_lines
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_journal_line();

CREATE TRIGGER edir_loans_tenant_guard BEFORE UPDATE OF organization_id ON edir_loans
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE TRIGGER edir_loan_installments_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_installments
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE TRIGGER edir_loan_operations_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_operations
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE TRIGGER edir_loan_journals_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_journals
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE TRIGGER edir_loan_journal_lines_tenant_guard BEFORE UPDATE OF organization_id ON edir_loan_journal_lines
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();

CREATE OR REPLACE FUNCTION edir_loan_account_balance(account_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(sum(line.credit-line.debit),0)
    + coalesce((
      SELECT sum(loan_line.credit-loan_line.debit)
      FROM edir_loan_journal_lines loan_line
      JOIN edir_loan_journals loan_journal
        ON loan_journal.id=loan_line.journal_id AND loan_journal.organization_id=loan_line.organization_id
        AND loan_journal.status='posted'
      WHERE loan_line.member_account_id=account_id
        AND loan_line.organization_id=app_edir_id()
    ),0)
  FROM edir_financial_journal_lines line
  JOIN edir_financial_journals journal
    ON journal.id=line.journal_id AND journal.organization_id=line.organization_id AND journal.status='posted'
  WHERE line.member_account_id=account_id AND line.organization_id=app_edir_id()
$$;

CREATE OR REPLACE FUNCTION edir_guard_financial_transaction_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  account_type text;
  account_status text;
  product_status text;
  withdrawals_allowed boolean;
  minimum_balance numeric(14,2);
  current_balance numeric(14,2);
  cash_balance numeric(14,2);
  original_direction text;
  effective_direction text;
  original_status text;
  original_account_id uuid;
  original_amount numeric(14,2);
  original_created_by uuid;
  original_reviewed_by uuid;
BEGIN
  IF NEW.member_account_id<>OLD.member_account_id OR NEW.direction<>OLD.direction
     OR NEW.amount<>OLD.amount
     OR NEW.reverses_transaction_id IS DISTINCT FROM OLD.reverses_transaction_id
     OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason
     OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.payload_hash<>OLD.payload_hash
     OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Edir financial transaction details are immutable';
  END IF;
  IF NEW.status='approved' THEN
    effective_direction:=NEW.direction;
    IF NEW.direction='reversal' THEN
      SELECT t.direction,t.status,t.member_account_id,t.amount,t.created_by,t.reviewed_by
        INTO original_direction,original_status,original_account_id,original_amount,
             original_created_by,original_reviewed_by
      FROM edir_financial_transactions t
      JOIN edir_financial_journals j ON j.transaction_id=t.id AND j.status='posted'
      WHERE t.id=NEW.reverses_transaction_id FOR UPDATE OF t;
      IF original_status IS DISTINCT FROM 'approved'
         OR original_direction NOT IN ('deposit','withdrawal')
         OR original_account_id IS DISTINCT FROM NEW.member_account_id
         OR original_amount IS DISTINCT FROM NEW.amount
         OR NEW.created_by IN (original_created_by,original_reviewed_by)
         OR EXISTS (SELECT 1 FROM edir_financial_transactions r
           WHERE r.reverses_transaction_id=NEW.reverses_transaction_id AND r.status='approved') THEN
        RAISE EXCEPTION 'Edir reversal must reference an eligible unreversed transaction';
      END IF;
      effective_direction:=CASE original_direction WHEN 'deposit' THEN 'withdrawal' WHEN 'withdrawal' THEN 'deposit' END;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW.member_account_id::text),779815);
    SELECT p.product_type,ma.status,p.status,p.minimum_balance,p.withdrawals_allowed
    INTO account_type,account_status,product_status,minimum_balance,withdrawals_allowed
    FROM edir_member_accounts ma
    JOIN edir_financial_products p ON p.id=ma.product_id AND p.organization_id=ma.organization_id
    WHERE ma.id=NEW.member_account_id AND ma.organization_id=NEW.organization_id;
    IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active'
       OR (effective_direction='contribution' AND account_type<>'contribution')
       OR (effective_direction IN ('deposit','withdrawal') AND account_type NOT IN ('savings','share'))
       OR (effective_direction='withdrawal' AND NEW.direction<>'reversal' AND NOT withdrawals_allowed) THEN
      RAISE EXCEPTION 'Edir transaction direction does not match an active account product';
    END IF;
    IF effective_direction='withdrawal' THEN
      current_balance:=edir_loan_account_balance(NEW.member_account_id);
      IF current_balance-NEW.amount<(CASE WHEN NEW.direction='reversal' THEN 0 ELSE minimum_balance END) THEN
        RAISE EXCEPTION 'Edir withdrawal exceeds the available account balance';
      END IF;
      PERFORM pg_advisory_xact_lock(779814,1000);
      SELECT coalesce(sum(l.debit-l.credit),0) INTO cash_balance
      FROM edir_financial_journal_lines l
      JOIN edir_financial_journals j ON j.id=l.journal_id AND j.organization_id=l.organization_id AND j.status='posted'
      JOIN edir_ledger_accounts a ON a.id=l.ledger_account_id AND a.organization_id=l.organization_id AND a.code='1000'
      WHERE l.organization_id=NEW.organization_id;
      IF cash_balance<NEW.amount THEN RAISE EXCEPTION 'Edir cash balance is insufficient for this withdrawal'; END IF;
    END IF;
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=NEW.created_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Invalid Edir financial transaction decision';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE edir_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loans FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_installments FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_journal_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY edir_loan_acceptance_read ON edir_loan_acceptances FOR SELECT
  USING (accepted_by=app_user_id()
    OR member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_acceptance_create ON edir_loan_acceptances FOR INSERT
  WITH CHECK (accepted_by=app_user_id()
    AND member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id() AND status='active'));
CREATE POLICY edir_loan_read ON edir_loans FOR SELECT
  USING (member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_create ON edir_loans FOR INSERT
  WITH CHECK (status='accepted' AND member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id()));
CREATE POLICY edir_loan_update ON edir_loans FOR UPDATE
  USING (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_installment_read ON edir_loan_installments FOR SELECT
  USING (loan_id IN (SELECT id FROM edir_loans WHERE
    member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id()))
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_installment_write ON edir_loan_installments FOR INSERT
  WITH CHECK (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_installment_update ON edir_loan_installments FOR UPDATE
  USING (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_operation_read ON edir_loan_operations FOR SELECT
  USING (created_by=app_user_id()
    OR loan_id IN (SELECT id FROM edir_loans WHERE member_id IN
      (SELECT id FROM edir_memberships WHERE user_id=app_user_id()))
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_operation_create ON edir_loan_operations FOR INSERT
  WITH CHECK (status='pending' AND created_by=app_user_id()
    AND (operation_type='repayment'
      OR edir_is_platform_admin()
      OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])));
CREATE POLICY edir_loan_operation_decide ON edir_loan_operations FOR UPDATE
  USING (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']))
  WITH CHECK (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_journal_read ON edir_loan_journals FOR SELECT
  USING (operation_id IN (SELECT id FROM edir_loan_operations WHERE created_by=app_user_id())
    OR operation_id IN (SELECT operation.id FROM edir_loan_operations operation
      JOIN edir_loans loan ON loan.id=operation.loan_id
      WHERE loan.member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id()))
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_journal_create ON edir_loan_journals FOR INSERT
  WITH CHECK (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_journal_post ON edir_loan_journals FOR UPDATE
  USING (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']))
  WITH CHECK (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']));
CREATE POLICY edir_loan_journal_lines_read ON edir_loan_journal_lines FOR SELECT
  USING (member_account_id IN (
    SELECT account.id FROM edir_member_accounts account
    JOIN edir_memberships membership ON membership.id=account.member_id
    WHERE membership.user_id=app_user_id()
  ) OR journal_id IN (SELECT id FROM edir_loan_journals WHERE
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor'])));
CREATE POLICY edir_loan_journal_lines_create ON edir_loan_journal_lines FOR INSERT
  WITH CHECK (edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']));

CREATE POLICY edir_loan_credit_staff_read ON edir_loan_operations FOR SELECT
  USING (edir_has_staff_role(ARRAY['credit_officer','credit_manager']));
CREATE POLICY edir_loan_credit_staff_journal_read ON edir_loan_journals FOR SELECT
  USING (edir_has_staff_role(ARRAY['credit_officer','credit_manager']));

CREATE POLICY edir_loan_tenant_scope ON edir_loans AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE POLICY edir_loan_acceptance_tenant_scope ON edir_loan_acceptances AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE POLICY edir_loan_installment_tenant_scope ON edir_loan_installments AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE POLICY edir_loan_operation_tenant_scope ON edir_loan_operations AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE POLICY edir_loan_journal_tenant_scope ON edir_loan_journals AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE POLICY edir_loan_journal_lines_tenant_scope ON edir_loan_journal_lines AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());

CREATE POLICY edir_credit_staff_loan_application_read ON edir_loan_applications FOR SELECT
  USING (edir_has_staff_role(ARRAY['finance_manager','treasurer']));
CREATE POLICY edir_finance_servicing_membership_read ON edir_memberships FOR SELECT
  USING (edir_has_staff_role(ARRAY['finance_manager','treasurer']));

GRANT SELECT ON TABLE edir_loans,edir_loan_installments,edir_loan_operations,edir_loan_journals,edir_loan_journal_lines TO "{{role}}";
GRANT SELECT,INSERT ON TABLE edir_loan_acceptances TO "{{role}}";
GRANT INSERT,UPDATE ON TABLE edir_loans,edir_loan_installments,edir_loan_operations,edir_loan_journals TO "{{role}}";
GRANT INSERT ON TABLE edir_loan_journal_lines TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_record() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_operation() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_validate_loan_operation_insert() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_acceptance() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_installment() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_journal() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_journal_line() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_loan_account_balance(uuid) TO "{{role}}";
