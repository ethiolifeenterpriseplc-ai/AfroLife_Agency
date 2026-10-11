INSERT INTO edir_ledger_accounts(code,name,category,normal_balance)
VALUES('5100','Loan write-off expense','expense','debit')
ON CONFLICT(code) DO NOTHING;

ALTER TABLE edir_loans DROP CONSTRAINT edir_loans_status_check;
ALTER TABLE edir_loans ADD CONSTRAINT edir_loans_status_check
  CHECK(status IN ('accepted','disbursed','repaid','written_off'));
ALTER TABLE edir_loans DROP CONSTRAINT edir_loans_check;
ALTER TABLE edir_loans ADD CONSTRAINT edir_loans_check CHECK (
  (status='accepted' AND disbursed_at IS NULL AND principal_repaid=0)
  OR (status='disbursed' AND disbursed_at IS NOT NULL AND principal_repaid<principal_amount)
  OR (status IN ('repaid','written_off') AND disbursed_at IS NOT NULL
      AND (status='written_off' OR principal_repaid=principal_amount))
);
ALTER TABLE edir_loan_installments DROP CONSTRAINT edir_loan_installments_status_check;
ALTER TABLE edir_loan_installments ADD CONSTRAINT edir_loan_installments_status_check
  CHECK(status IN ('due','partial','paid','waived'));
ALTER TABLE edir_loan_installments DROP CONSTRAINT edir_loan_installments_check;
ALTER TABLE edir_loan_installments ADD CONSTRAINT edir_loan_installments_check CHECK (
  (status='due' AND principal_paid=0)
  OR (status='partial' AND principal_paid>0 AND principal_paid<principal_due)
  OR (status='paid' AND principal_paid=principal_due)
  OR status='waived'
);
ALTER TABLE edir_loan_operations DROP CONSTRAINT edir_loan_operations_operation_type_check;
ALTER TABLE edir_loan_operations ADD CONSTRAINT edir_loan_operations_operation_type_check
  CHECK(operation_type IN ('disbursement','repayment','writeoff'));

CREATE TABLE edir_loan_writeoffs (
  operation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  loan_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(operation_id,organization_id) REFERENCES edir_loan_operations(id,organization_id),
  FOREIGN KEY(loan_id,organization_id) REFERENCES edir_loans(id,organization_id),
  UNIQUE(loan_id,organization_id)
);
CREATE FUNCTION edir_validate_loan_writeoff_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation edir_loan_operations%ROWTYPE;
BEGIN
  SELECT * INTO operation FROM edir_loan_operations WHERE id=NEW.operation_id
    AND organization_id=NEW.organization_id;
  IF operation.id IS NULL OR operation.operation_type<>'writeoff' OR operation.status<>'pending'
     OR operation.loan_id<>NEW.loan_id OR operation.amount<>NEW.amount
     OR operation.created_by IS DISTINCT FROM app_user_id() OR NEW.created_by IS DISTINCT FROM app_user_id()
     OR NOT (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])) THEN
    RAISE EXCEPTION 'Edir write-off proposal must match an authorized pending operation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_loan_writeoff_insert_guard BEFORE INSERT ON edir_loan_writeoffs
  FOR EACH ROW EXECUTE FUNCTION edir_validate_loan_writeoff_insert();
CREATE FUNCTION edir_loan_writeoff_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Edir loan write-off request evidence is immutable'; END $$;
CREATE TRIGGER edir_loan_writeoff_no_change BEFORE UPDATE OR DELETE ON edir_loan_writeoffs
  FOR EACH ROW EXECUTE FUNCTION edir_loan_writeoff_immutable();

ALTER TABLE edir_loan_writeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_writeoffs FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_loan_writeoff_read ON edir_loan_writeoffs FOR SELECT
  USING(edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer','compliance','auditor']));
CREATE POLICY edir_loan_writeoff_create ON edir_loan_writeoffs FOR INSERT
  WITH CHECK(created_by=app_user_id() AND
    (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])));
CREATE POLICY edir_loan_writeoff_tenant ON edir_loan_writeoffs AS RESTRICTIVE FOR ALL
  USING(organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK(organization_id=app_edir_id() OR edir_is_platform_admin());
GRANT SELECT,INSERT ON TABLE edir_loan_writeoffs TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_validate_loan_writeoff_insert() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_loan_writeoff_immutable() TO "{{role}}";

CREATE OR REPLACE FUNCTION edir_validate_loan_operation_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'pending' OR NEW.created_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New Edir loan operations must be pending requests from the current actor';
  END IF;
  IF NEW.operation_type='disbursement'
     AND NOT (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])) THEN
    RAISE EXCEPTION 'Edir loan disbursement access is required';
  ELSIF NEW.operation_type='writeoff'
     AND NOT (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])) THEN
    RAISE EXCEPTION 'Edir loan write-off access is required';
  ELSIF NEW.operation_type='repayment' AND NOT (
     NEW.created_by IN (SELECT membership.user_id FROM edir_memberships membership
       JOIN edir_loans loan ON loan.member_id=membership.id
       WHERE loan.id=NEW.loan_id AND membership.organization_id=NEW.organization_id)
     OR edir_is_platform_admin()
     OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','finance_manager','treasurer'])
  ) THEN RAISE EXCEPTION 'Edir loan repayment must be requested by its member or authorized staff';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION edir_guard_loan_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  loan_row edir_loans%ROWTYPE;
  application_row edir_loan_applications%ROWTYPE;
  account_balance numeric(14,2);
  minimum_balance numeric(14,2);
  product_status text;
  account_status text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan operation history cannot be deleted'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
     OR NEW.operation_type IS DISTINCT FROM OLD.operation_type OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan operation request is immutable';
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=NEW.created_by
     OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Invalid Edir loan operation decision';
  END IF;
  IF NEW.status='approved' THEN
    SELECT * INTO loan_row FROM edir_loans WHERE id=NEW.loan_id AND organization_id=NEW.organization_id FOR UPDATE;
    SELECT * INTO application_row FROM edir_loan_applications
      WHERE id=loan_row.application_id AND organization_id=NEW.organization_id;
    IF NEW.operation_type='disbursement' THEN
      IF loan_row.status<>'accepted' OR NEW.amount<>loan_row.principal_amount
         OR NEW.created_by IN(application_row.created_by,application_row.scored_by,application_row.decision_by)
         OR NEW.reviewed_by IN(application_row.created_by,application_row.scored_by,application_row.decision_by) THEN
        RAISE EXCEPTION 'Edir disbursement requires an accepted loan and independent authorized actors';
      END IF;
      SELECT account.status,product.status,product.minimum_balance
        INTO account_status,product_status,minimum_balance FROM edir_member_accounts account
        JOIN edir_financial_products product ON product.id=account.product_id AND product.organization_id=account.organization_id
        WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id
          AND account.member_id=loan_row.member_id AND product.product_type='savings';
      IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Edir loan destination must be an active member savings account';
      END IF;
      IF application_row.status<>'accepted' OR NOT EXISTS (
        SELECT 1 FROM edir_loan_acceptances acceptance WHERE acceptance.application_id=loan_row.application_id
          AND acceptance.organization_id=NEW.organization_id AND acceptance.member_account_id=loan_row.member_account_id
      ) THEN RAISE EXCEPTION 'The member has not accepted this loan into the selected savings account'; END IF;
    ELSIF NEW.operation_type='repayment' THEN
      IF loan_row.status<>'disbursed' OR NEW.amount>loan_row.principal_amount-loan_row.principal_repaid
         OR NEW.created_by=application_row.scored_by
         OR NEW.reviewed_by IN(application_row.created_by,application_row.scored_by,application_row.decision_by) THEN
        RAISE EXCEPTION 'Edir repayment exceeds the outstanding principal or lacks independent review';
      END IF;
      SELECT account.status,product.status,product.minimum_balance
        INTO account_status,product_status,minimum_balance FROM edir_member_accounts account
        JOIN edir_financial_products product ON product.id=account.product_id AND product.organization_id=account.organization_id
        WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id;
      account_balance:=edir_loan_account_balance(loan_row.member_account_id);
      IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active'
         OR account_balance-NEW.amount<minimum_balance THEN
        RAISE EXCEPTION 'Edir savings balance is insufficient for the loan repayment';
      END IF;
    ELSIF NEW.operation_type='writeoff' THEN
      IF loan_row.status<>'disbursed' OR NEW.amount<>loan_row.principal_amount-loan_row.principal_repaid
         OR NEW.created_by IN(application_row.created_by,application_row.scored_by,application_row.decision_by)
         OR NEW.reviewed_by IN(application_row.created_by,application_row.scored_by,application_row.decision_by)
         OR NOT EXISTS(SELECT 1 FROM edir_loan_writeoffs writeoff
           WHERE writeoff.operation_id=NEW.id AND writeoff.organization_id=NEW.organization_id
             AND writeoff.loan_id=NEW.loan_id AND writeoff.amount=NEW.amount AND writeoff.created_by=NEW.created_by) THEN
        RAISE EXCEPTION 'Edir write-off requires the full current principal balance and independent authorized actors';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION edir_guard_loan_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE application_row edir_loan_applications%ROWTYPE; accepted_account uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO application_row FROM edir_loan_applications WHERE id=NEW.application_id AND organization_id=NEW.organization_id;
    SELECT member_account_id INTO accepted_account FROM edir_loan_acceptances WHERE application_id=NEW.application_id AND organization_id=NEW.organization_id;
    IF application_row.status<>'accepted' OR accepted_account IS DISTINCT FROM NEW.member_account_id
       OR application_row.member_id IS DISTINCT FROM NEW.member_id OR application_row.policy_version_id IS DISTINCT FROM NEW.policy_version_id
       OR application_row.requested_principal IS DISTINCT FROM NEW.principal_amount
       OR application_row.requested_term_months IS DISTINCT FROM NEW.term_months
       OR NEW.status<>'accepted' OR NEW.principal_repaid<>0 OR NEW.disbursed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Edir loan record does not match member acceptance and approved offer';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan records cannot be deleted'; END IF;
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Edir loan servicing changes must originate from a posted journal'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id OR NEW.principal_amount IS DISTINCT FROM OLD.principal_amount
     OR NEW.term_months IS DISTINCT FROM OLD.term_months OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan terms and borrower account are immutable';
  END IF;
  IF OLD.status='accepted' AND NEW.status='disbursed' THEN
    IF NEW.disbursed_at IS NULL OR NEW.principal_repaid<>0 THEN RAISE EXCEPTION 'Edir loan disbursement evidence is incomplete'; END IF;
  ELSIF OLD.status='disbursed' AND NEW.status IN ('disbursed','repaid') THEN
    IF NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at OR NEW.principal_repaid<OLD.principal_repaid THEN
      RAISE EXCEPTION 'Edir loan repayment history cannot be reversed';
    END IF;
  ELSIF OLD.status='disbursed' AND NEW.status='written_off' THEN
    IF NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at OR NEW.principal_repaid IS DISTINCT FROM OLD.principal_repaid
       OR NOT EXISTS(SELECT 1 FROM edir_loan_journals journal JOIN edir_loan_operations operation
          ON operation.id=journal.operation_id AND operation.organization_id=journal.organization_id
          WHERE journal.status='posted' AND operation.operation_type='writeoff' AND operation.loan_id=OLD.id
            AND operation.organization_id=OLD.organization_id AND operation.reviewed_by=app_user_id()) THEN
      RAISE EXCEPTION 'Edir loan write-off must originate from an approved posted write-off journal';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid Edir loan lifecycle transition'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION edir_guard_loan_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  operation edir_loan_operations%ROWTYPE; loan_row edir_loans%ROWTYPE;
  debit_total numeric(14,2); credit_total numeric(14,2); line_count bigint;
  remaining_principal numeric(14,2); loan_ledger uuid; savings_ledger uuid; loss_ledger uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted Edir loan journals are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted Edir loan journals are immutable'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan journal identity and amount are immutable';
  END IF;
  IF NEW.status='posted' THEN
    IF NEW.posted_by IS DISTINCT FROM app_user_id() OR NEW.posted_at IS NULL THEN RAISE EXCEPTION 'Edir loan journal poster must match the current actor'; END IF;
    SELECT * INTO operation FROM edir_loan_operations WHERE id=NEW.operation_id AND organization_id=NEW.organization_id;
    IF operation.status<>'approved' OR operation.reviewed_by<>NEW.posted_by OR operation.amount<>NEW.amount THEN
      RAISE EXCEPTION 'Only an approved Edir loan operation may be posted';
    END IF;
    SELECT * INTO loan_row FROM edir_loans WHERE id=operation.loan_id AND organization_id=NEW.organization_id;
    SELECT id INTO loan_ledger FROM edir_ledger_accounts WHERE code='1300' AND active;
    SELECT product.ledger_account_id INTO savings_ledger FROM edir_member_accounts account
      JOIN edir_financial_products product ON product.id=account.product_id AND product.organization_id=account.organization_id
      WHERE account.id=loan_row.member_account_id AND account.organization_id=NEW.organization_id;
    SELECT id INTO loss_ledger FROM edir_ledger_accounts WHERE code='5100' AND active;
    IF loan_ledger IS NULL OR savings_ledger IS NULL OR (operation.operation_type='writeoff' AND loss_ledger IS NULL) THEN
      RAISE EXCEPTION 'Edir loan, savings, or write-off ledger mapping is unavailable';
    END IF;
    SELECT coalesce(sum(debit),0),coalesce(sum(credit),0),count(*) INTO debit_total,credit_total,line_count
      FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id;
    IF debit_total<>credit_total OR debit_total<>NEW.amount OR line_count<>2 THEN RAISE EXCEPTION 'Edir loan journal is not balanced'; END IF;
    IF operation.operation_type='disbursement' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loan_ledger AND member_account_id IS NULL AND debit=NEW.amount AND credit=0) THEN
      RAISE EXCEPTION 'Edir disbursement must debit the loan receivable ledger';
    ELSIF operation.operation_type='repayment' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loan_ledger AND member_account_id IS NULL AND credit=NEW.amount AND debit=0) THEN
      RAISE EXCEPTION 'Edir repayment must credit the loan receivable ledger';
    ELSIF operation.operation_type='writeoff' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loan_ledger AND member_account_id IS NULL AND credit=NEW.amount AND debit=0) THEN
      RAISE EXCEPTION 'Edir write-off must credit the loan receivable ledger';
    END IF;
    IF operation.operation_type='disbursement' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=savings_ledger AND member_account_id=loan_row.member_account_id AND credit=NEW.amount AND debit=0) THEN
      RAISE EXCEPTION 'Edir disbursement must credit the accepted member savings account';
    ELSIF operation.operation_type='repayment' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=savings_ledger AND member_account_id=loan_row.member_account_id AND debit=NEW.amount AND credit=0) THEN
      RAISE EXCEPTION 'Edir repayment must debit the member savings account';
    ELSIF operation.operation_type='writeoff' AND NOT EXISTS(
      SELECT 1 FROM edir_loan_journal_lines WHERE journal_id=NEW.id AND organization_id=NEW.organization_id
        AND ledger_account_id=loss_ledger AND member_account_id IS NULL AND debit=NEW.amount AND credit=0) THEN
      RAISE EXCEPTION 'Edir write-off must debit the loan loss expense ledger';
    END IF;
    IF operation.operation_type='disbursement' THEN
      UPDATE edir_loans SET status='disbursed',disbursed_at=NEW.posted_at WHERE id=loan_row.id AND organization_id=NEW.organization_id;
      INSERT INTO edir_loan_installments(organization_id,loan_id,installment_no,due_on,principal_due)
      SELECT NEW.organization_id,loan_row.id,installment_no,
        date_trunc('month',NEW.posted_at::date+(installment_no||' months')::interval)::date+least(extract(day FROM NEW.posted_at::date)::integer,28)-1,
        principal_due FROM (
          SELECT installment_no,((floor((loan_row.principal_amount*100)/loan_row.term_months)
            +CASE WHEN installment_no<=mod(round(loan_row.principal_amount*100)::bigint,loan_row.term_months) THEN 1 ELSE 0 END)::numeric/100)::numeric(14,2) AS principal_due
          FROM generate_series(1,loan_row.term_months) AS installment_no) schedule;
    ELSIF operation.operation_type='writeoff' THEN
      UPDATE edir_loans SET status='written_off' WHERE id=loan_row.id AND organization_id=NEW.organization_id;
      UPDATE edir_loan_installments SET status='waived' WHERE loan_id=loan_row.id AND organization_id=NEW.organization_id
        AND status IN('due','partial');
    ELSE
      remaining_principal:=loan_row.principal_amount-loan_row.principal_repaid-operation.amount;
      UPDATE edir_loans SET principal_repaid=principal_repaid+operation.amount,
        status=CASE WHEN remaining_principal=0 THEN 'repaid' ELSE 'disbursed' END
        WHERE id=loan_row.id AND organization_id=NEW.organization_id;
      WITH allocations AS (
        SELECT id,principal_due-principal_paid AS remaining,
          least(principal_due-principal_paid,greatest(0,operation.amount-coalesce(sum(principal_due-principal_paid) OVER(
            ORDER BY installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0))) AS paid
        FROM edir_loan_installments WHERE loan_id=loan_row.id AND organization_id=NEW.organization_id AND status IN('due','partial')
        ORDER BY installment_no)
      UPDATE edir_loan_installments installment SET principal_paid=installment.principal_paid+allocations.paid,
        status=CASE WHEN installment.principal_paid+allocations.paid=installment.principal_due THEN 'paid'
          WHEN installment.principal_paid+allocations.paid>0 THEN 'partial' ELSE 'due' END
        FROM allocations WHERE installment.id=allocations.id AND allocations.paid>0;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION edir_loan_account_balance(account_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(sum(line.credit-line.debit),0)+coalesce((
    SELECT sum(loan_line.credit-loan_line.debit) FROM edir_loan_journal_lines loan_line
    JOIN edir_loan_journals loan_journal ON loan_journal.id=loan_line.journal_id
      AND loan_journal.organization_id=loan_line.organization_id AND loan_journal.status='posted'
    WHERE loan_line.member_account_id=account_id AND loan_line.organization_id=app_edir_id()),0)
  FROM edir_financial_journal_lines line JOIN edir_financial_journals journal
    ON journal.id=line.journal_id AND journal.organization_id=line.organization_id AND journal.status='posted'
  WHERE line.member_account_id=account_id AND line.organization_id=app_edir_id()
$$;

DROP POLICY edir_loan_operation_create ON edir_loan_operations;
CREATE POLICY edir_loan_operation_create ON edir_loan_operations FOR INSERT
  WITH CHECK(status='pending' AND created_by=app_user_id()
    AND (operation_type='repayment' OR edir_is_platform_admin()
      OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer'])));
GRANT EXECUTE ON FUNCTION edir_validate_loan_operation_insert() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_operation() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_record() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_journal() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_loan_account_balance(uuid) TO "{{role}}";
