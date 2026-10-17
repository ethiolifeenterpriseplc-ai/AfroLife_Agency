DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM accounting_journals
    GROUP BY entity_id, source_reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate accounting source references must be reviewed before transaction identifiers can be made unique';
  END IF;
END $$;

CREATE UNIQUE INDEX accounting_journals_entity_source_reference_uq
  ON accounting_journals(entity_id, source_reference);

CREATE FUNCTION accounting_guard_journal_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approval_reason IS NOT NULL OR NEW.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting journals must be created as unapproved drafts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_journal_insert_guard
  BEFORE INSERT ON accounting_journals
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_journal_insert();

CREATE FUNCTION accounting_guard_period_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'open' OR NEW.closed_by IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting periods must be created open';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_period_insert_guard
  BEFORE INSERT ON accounting_periods
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_period_insert();

ALTER TABLE accounting_periods
  ADD COLUMN close_requested_by uuid,
  ADD COLUMN close_requested_at timestamptz,
  ADD COLUMN close_reason text,
  ADD COLUMN close_approval_reason text;

CREATE OR REPLACE FUNCTION accounting_guard_period_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'open' OR NEW.closed_by IS NOT NULL OR NEW.closed_at IS NOT NULL
     OR NEW.close_requested_by IS NOT NULL OR NEW.close_requested_at IS NOT NULL
     OR NEW.close_reason IS NOT NULL OR NEW.close_approval_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting periods must be created open and without close metadata';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_guard_period() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'review' THEN
    IF NEW.close_requested_by IS NULL OR NEW.close_requested_at IS NULL
       OR length(trim(coalesce(NEW.close_reason,''))) < 10
       OR NEW.closed_by IS NOT NULL OR NEW.closed_at IS NOT NULL
       OR NEW.close_approval_reason IS NOT NULL
       OR NEW.close_requested_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN
      RAISE EXCEPTION 'Period close request requires the authenticated actor and a reason';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['status','close_requested_by','close_requested_at','close_reason'])
       <> (to_jsonb(OLD)-ARRAY['status','close_requested_by','close_requested_at','close_reason']) THEN
      RAISE EXCEPTION 'Period content cannot be changed during close request';
    END IF;
    IF EXISTS(SELECT 1 FROM accounting_journals WHERE entity_id=NEW.entity_id AND period_id=NEW.id AND status='pending_approval') THEN
      RAISE EXCEPTION 'Resolve pending journals before requesting period close';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'review' AND NEW.status = 'closed' THEN
    IF OLD.close_requested_by IS NULL OR NEW.closed_by IS NULL OR NEW.closed_by = OLD.close_requested_by OR NEW.closed_at IS NULL
       OR length(trim(coalesce(NEW.close_approval_reason,''))) < 10
       OR NEW.closed_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN
      RAISE EXCEPTION 'Period close requires independent approval and a reason';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['status','closed_by','closed_at','close_approval_reason'])
       <> (to_jsonb(OLD)-ARRAY['status','closed_by','closed_at','close_approval_reason']) THEN
      RAISE EXCEPTION 'Period content cannot be changed during close approval';
    END IF;
    IF EXISTS(SELECT 1 FROM accounting_journals WHERE entity_id=NEW.entity_id AND period_id=NEW.id AND status='pending_approval') THEN
      RAISE EXCEPTION 'Resolve pending journals before period close';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid accounting period state transition';
END $$;

CREATE OR REPLACE FUNCTION accounting_guard_journal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE d numeric(18,2); c numeric(18,2); period_status text; period_start date; period_end date;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting journals cannot be deleted'; END IF;
  IF OLD.status='draft' AND NEW.status='pending_approval' THEN
    SELECT coalesce(sum(debit),0),coalesce(sum(credit),0) INTO d,c FROM accounting_journal_lines WHERE journal_id=OLD.id;
    IF d<=0 OR d<>c OR d<>NEW.amount THEN RAISE EXCEPTION 'Journal lines must balance and equal the journal amount'; END IF;
    SELECT status,accounting_periods.period_start,accounting_periods.period_end
      INTO period_status,period_start,period_end
      FROM accounting_periods WHERE id=NEW.period_id AND entity_id=NEW.entity_id FOR UPDATE;
    IF period_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Journal period is not open'; END IF;
    IF NEW.entry_date NOT BETWEEN period_start AND period_end THEN RAISE EXCEPTION 'Journal date is outside the selected period'; END IF;
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Journal content is immutable after submission'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='pending_approval' AND NEW.status IN ('posted','rejected') THEN
    IF NEW.approved_by IS NULL OR NEW.approval_reason IS NULL OR length(trim(NEW.approval_reason))<10 THEN RAISE EXCEPTION 'Approval actor and reason are required'; END IF;
    IF NEW.approved_by=OLD.created_by THEN RAISE EXCEPTION 'Journal maker cannot approve their own entry'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','approved_by','approval_reason','posted_at'])<>(to_jsonb(OLD)-ARRAY['status','approved_by','approval_reason','posted_at']) THEN RAISE EXCEPTION 'Journal content cannot be changed'; END IF;
    IF NEW.status='posted' THEN NEW.posted_at=now(); END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid accounting journal state transition';
END $$;

CREATE FUNCTION accounting_guard_journal_line_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE journal_status text;
BEGIN
  SELECT status INTO journal_status
  FROM accounting_journals
  WHERE id = NEW.journal_id AND entity_id = NEW.entity_id
  FOR UPDATE;
  IF journal_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Journal lines can only be added to draft journals';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_journal_line_insert_guard
  BEFORE INSERT ON accounting_journal_lines
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_journal_line_insert();

ALTER TABLE accounting_budgets
  ADD COLUMN approval_reason text,
  ADD COLUMN approved_at timestamptz;

CREATE OR REPLACE FUNCTION accounting_guard_budget_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE budget_status text; target_budget_id uuid; target_entity_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_budget_id := NEW.budget_id;
    target_entity_id := NEW.entity_id;
  ELSE
    target_budget_id := OLD.budget_id;
    target_entity_id := OLD.entity_id;
  END IF;

  SELECT status INTO budget_status FROM accounting_budgets
  WHERE id=target_budget_id AND entity_id=target_entity_id
  FOR UPDATE;
  IF budget_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Budget lines can only be changed while the budget is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.budget_id IS DISTINCT FROM OLD.budget_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id) THEN
    RAISE EXCEPTION 'Budget lines cannot be moved between budgets';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER accounting_budget_lines_guard ON accounting_budget_lines;
CREATE TRIGGER accounting_budget_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON accounting_budget_lines
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_budget_lines();

CREATE OR REPLACE FUNCTION accounting_guard_document_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE document_status text; target_document_id uuid; target_entity_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_document_id := NEW.document_id;
    target_entity_id := NEW.entity_id;
  ELSE
    target_document_id := OLD.document_id;
    target_entity_id := OLD.entity_id;
  END IF;

  SELECT status INTO document_status FROM accounting_documents
  WHERE id=target_document_id AND entity_id=target_entity_id
  FOR UPDATE;
  IF document_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Document lines can only be changed while the document is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id) THEN
    RAISE EXCEPTION 'Document lines cannot be moved between documents';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER accounting_document_lines_guard ON accounting_document_lines;
CREATE TRIGGER accounting_document_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON accounting_document_lines
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_document_lines();

CREATE FUNCTION accounting_guard_budget() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approval_reason IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Budgets must be created as unapproved drafts';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by = OLD.created_by
       OR length(trim(coalesce(NEW.approval_reason, ''))) < 10 OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Budgets require independent approval and a reason';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','approved_by','approval_reason','approved_at'])
       <> (to_jsonb(OLD) - ARRAY['status','approved_by','approval_reason','approved_at']) THEN
      RAISE EXCEPTION 'Budget content cannot be changed during approval';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid budget state transition';
END $$;
CREATE TRIGGER accounting_budget_guard
  BEFORE INSERT OR UPDATE ON accounting_budgets
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_budget();

CREATE FUNCTION accounting_guard_document_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approval_reason IS NOT NULL
     OR NEW.approved_at IS NOT NULL OR NEW.journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting documents must be created as unapproved drafts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_document_insert_guard
  BEFORE INSERT ON accounting_documents
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_document_insert();

CREATE OR REPLACE FUNCTION accounting_guard_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE journal_status text; journal_maker uuid; journal_checker uuid;
  journal_reference text; journal_amount numeric(18,2); journal_date date; journal_key uuid;
BEGIN
  IF OLD.status='draft' AND NEW.status='pending_approval' THEN
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN
      RAISE EXCEPTION 'Submitted document content is immutable';
    END IF;
  ELSIF OLD.status='pending_approval' AND NEW.status IN ('approved','rejected') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by=OLD.created_by
       OR length(trim(coalesce(NEW.approval_reason,'')))<10 OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Document requires independent approval and reason';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['status','approved_by','approval_reason','approved_at','journal_id'])
       <> (to_jsonb(OLD)-ARRAY['status','approved_by','approval_reason','approved_at','journal_id']) THEN
      RAISE EXCEPTION 'Submitted document content is immutable';
    END IF;
    IF NEW.status='rejected' THEN
      IF NEW.journal_id IS NOT NULL THEN RAISE EXCEPTION 'Rejected documents cannot reference a journal'; END IF;
    ELSE
      SELECT j.status,j.created_by,j.approved_by,j.source_reference,j.amount,j.entry_date,j.idempotency_key
        INTO journal_status,journal_maker,journal_checker,journal_reference,journal_amount,journal_date,journal_key
      FROM accounting_journals j WHERE j.id=NEW.journal_id AND j.entity_id=NEW.entity_id;
      IF journal_status IS DISTINCT FROM 'posted' OR journal_maker IS DISTINCT FROM OLD.created_by
         OR journal_checker IS DISTINCT FROM NEW.approved_by
         OR journal_reference IS DISTINCT FROM NEW.document_type||':'||NEW.document_number
         OR journal_amount IS DISTINCT FROM NEW.total OR journal_date IS DISTINCT FROM NEW.issue_date
         OR journal_key IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'Approved document must reference its balanced, independently approved journal';
      END IF;
    END IF;
  ELSIF OLD.status IN ('approved','partially_paid') AND NEW.status IN ('partially_paid','paid','void') THEN
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN
      RAISE EXCEPTION 'Posted document content is immutable';
    END IF;
    IF NEW.status='void' AND EXISTS(
      SELECT 1 FROM accounting_document_payments p WHERE p.document_id=OLD.id AND p.entity_id=OLD.entity_id AND p.status='posted'
    ) THEN RAISE EXCEPTION 'Documents with posted payments cannot be voided'; END IF;
  ELSE
    RAISE EXCEPTION 'Invalid accounting document transition';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION accounting_guard_document_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE journal_status text; journal_maker uuid; journal_checker uuid; journal_key uuid;
  journal_reference text; journal_amount numeric(18,2); journal_date date;
  document_type text; control_account_id uuid; payment_account_valid boolean;
  matching_lines integer; total_lines integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_approval' OR NEW.reviewed_by IS NOT NULL
       OR NEW.review_reason IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.journal_id IS NOT NULL THEN
      RAISE EXCEPTION 'Document payments must be created pending independent approval';
    END IF;
    IF NEW.recorded_by IS DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid THEN
      RAISE EXCEPTION 'Document payment recorder must be the authenticated actor';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending_approval' OR NEW.status NOT IN ('posted','rejected') THEN
    RAISE EXCEPTION 'Invalid document payment state transition';
  END IF;
  IF NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'Submitted document payment content is immutable';
  END IF;
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_by = OLD.recorded_by
     OR length(trim(coalesce(NEW.review_reason, ''))) < 10 OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Document payments require independent review and a reason';
  END IF;
  IF NEW.status = 'posted' THEN
    SELECT status, created_by, approved_by,idempotency_key,source_reference,amount,entry_date
      INTO journal_status,journal_maker,journal_checker,journal_key,journal_reference,journal_amount,journal_date
    FROM accounting_journals WHERE id = NEW.journal_id AND entity_id = NEW.entity_id;
    IF journal_status IS DISTINCT FROM 'posted' OR journal_maker IS DISTINCT FROM OLD.recorded_by
       OR journal_checker IS DISTINCT FROM NEW.reviewed_by OR journal_key IS DISTINCT FROM NEW.id
       OR journal_reference IS DISTINCT FROM 'payment:'||NEW.reference
       OR journal_amount IS DISTINCT FROM NEW.amount OR journal_date IS DISTINCT FROM NEW.payment_date THEN
      RAISE EXCEPTION 'Posted payment must reference its balanced, independently approved journal';
    END IF;
    SELECT d.document_type,d.control_account_id INTO document_type,control_account_id
    FROM accounting_documents d WHERE d.id=NEW.document_id AND d.entity_id=NEW.entity_id;
    SELECT EXISTS(SELECT 1 FROM accounting_accounts a WHERE a.id=NEW.account_id AND a.entity_id=NEW.entity_id
      AND a.active AND a.account_type='asset') INTO payment_account_valid;
    SELECT count(*)::int INTO total_lines FROM accounting_journal_lines
      WHERE journal_id=NEW.journal_id AND entity_id=NEW.entity_id;
    SELECT count(*)::int INTO matching_lines FROM accounting_journal_lines l
      WHERE l.journal_id=NEW.journal_id AND l.entity_id=NEW.entity_id
        AND ((document_type='invoice' AND l.account_id=NEW.account_id AND l.debit=NEW.amount AND l.credit=0)
          OR (document_type='invoice' AND l.account_id=control_account_id AND l.debit=0 AND l.credit=NEW.amount)
          OR (document_type='bill' AND l.account_id=control_account_id AND l.debit=NEW.amount AND l.credit=0)
          OR (document_type='bill' AND l.account_id=NEW.account_id AND l.debit=0 AND l.credit=NEW.amount));
    IF NOT payment_account_valid OR total_lines<>2 OR matching_lines<>2 THEN
      RAISE EXCEPTION 'Payment journal lines must clear the document control account against an active cash asset account';
    END IF;
  ELSIF NEW.journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Rejected document payments cannot reference a journal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_document_payment_guard
  BEFORE INSERT OR UPDATE ON accounting_document_payments
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_document_payment();

CREATE FUNCTION accounting_guard_tax_filing() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE allowed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.reviewed_by IS NOT NULL OR NEW.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Tax filings must be created as drafts';
    END IF;
    RETURN NEW;
  END IF;

  allowed := (OLD.status = 'draft' AND NEW.status = 'review')
    OR (OLD.status = 'review' AND NEW.status = 'submitted')
    OR (OLD.status = 'submitted' AND NEW.status IN ('accepted','rejected'))
    OR (OLD.status = 'accepted' AND NEW.status = 'paid');
  IF NOT allowed THEN RAISE EXCEPTION 'Invalid tax filing state transition'; END IF;
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_by = OLD.created_by THEN
    RAISE EXCEPTION 'Tax filings require a reviewer distinct from the maker';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','reference','notes','reviewed_by','submitted_at'])
     <> (to_jsonb(OLD) - ARRAY['status','reference','notes','reviewed_by','submitted_at']) THEN
    RAISE EXCEPTION 'Tax filing financial details are immutable after submission';
  END IF;
  IF NEW.status = 'submitted' AND (NEW.submitted_at IS NULL OR length(trim(coalesce(NEW.reference, ''))) < 1) THEN
    RAISE EXCEPTION 'Submitted tax filings require a submission reference and timestamp';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_tax_filing_guard
  BEFORE INSERT OR UPDATE ON accounting_tax_filings
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_tax_filing();

CREATE FUNCTION accounting_guard_bank_reconciliation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE importer uuid; journal_status text; journal_date date; journal_amount numeric(18,2);
BEGIN
  SELECT imported_by, transaction_date INTO importer, journal_date
  FROM accounting_bank_statement_lines
  WHERE id = NEW.statement_line_id AND entity_id = NEW.entity_id AND bank_account_id = NEW.bank_account_id;
  IF importer IS NULL OR importer = NEW.matched_by THEN
    RAISE EXCEPTION 'Bank statement importer cannot reconcile their own statement line';
  END IF;
  SELECT j.status, j.entry_date, sum(l.debit - l.credit) INTO journal_status, journal_date, journal_amount
  FROM accounting_journals j
  JOIN accounting_journal_lines l ON l.journal_id = j.id AND l.entity_id = j.entity_id
  JOIN accounting_bank_accounts b ON b.account_id = l.account_id AND b.entity_id = l.entity_id
  WHERE j.id = NEW.journal_id AND j.entity_id = NEW.entity_id AND b.id = NEW.bank_account_id
  GROUP BY j.id;
  IF journal_status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'Bank reconciliation requires a posted journal for the selected bank account';
  END IF;
  IF journal_date IS DISTINCT FROM (
    SELECT transaction_date FROM accounting_bank_statement_lines WHERE id = NEW.statement_line_id
  ) OR journal_amount IS DISTINCT FROM (
    SELECT amount FROM accounting_bank_statement_lines WHERE id = NEW.statement_line_id
  ) THEN
    RAISE EXCEPTION 'Bank statement amount and date must match the posted journal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_bank_reconciliation_guard
  BEFORE INSERT ON accounting_bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION accounting_guard_bank_reconciliation();

REVOKE ALL ON FUNCTION accounting_guard_journal_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_period_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_journal_line_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_budget_lines() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_document_lines() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_budget() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_document_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_document_payment() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_tax_filing() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_bank_reconciliation() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting_guard_period() FROM PUBLIC;

GRANT UPDATE(status,close_requested_by,close_requested_at,close_reason,close_approval_reason,closed_by,closed_at)
  ON accounting_periods TO "{{role}}";
