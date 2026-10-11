-- Apply write-off loan-state changes only after the journal row is visibly
-- posted. The status guard can then keep requiring durable posted evidence.
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
    ELSIF operation.operation_type='repayment' THEN
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

CREATE FUNCTION edir_apply_posted_writeoff() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation edir_loan_operations%ROWTYPE;
BEGIN
  IF NEW.status='posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    SELECT * INTO operation FROM edir_loan_operations
    WHERE id=NEW.operation_id AND organization_id=NEW.organization_id;
    IF operation.operation_type='writeoff' THEN
      UPDATE edir_loans SET status='written_off'
      WHERE id=operation.loan_id AND organization_id=NEW.organization_id;
      UPDATE edir_loan_installments SET status='waived'
      WHERE loan_id=operation.loan_id AND organization_id=NEW.organization_id
        AND status IN('due','partial');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_loan_writeoff_apply_after_post
  AFTER UPDATE OF status ON edir_loan_journals
  FOR EACH ROW EXECUTE FUNCTION edir_apply_posted_writeoff();

GRANT EXECUTE ON FUNCTION edir_guard_loan_journal() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_apply_posted_writeoff() TO "{{role}}";
