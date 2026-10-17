CREATE TABLE accounting_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  contact_type text NOT NULL CHECK(contact_type IN ('customer','vendor','both')),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 200), email text, phone text, tax_id text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(address)='object'), active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,entity_id)
);
CREATE TABLE accounting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id),
  document_type text NOT NULL CHECK(document_type IN ('invoice','bill')), contact_id uuid NOT NULL,
  document_number text NOT NULL CHECK(length(trim(document_number)) BETWEEN 1 AND 80), issue_date date NOT NULL, due_date date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ETB', subtotal numeric(18,2) NOT NULL CHECK(subtotal>0), tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0), tax_account_id uuid, control_account_id uuid NOT NULL,
  total numeric(18,2) NOT NULL CHECK(total=subtotal+tax_amount), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','partially_paid','paid','void','rejected')),
  journal_id uuid, description text NOT NULL CHECK(length(trim(description)) BETWEEN 2 AND 1000), created_by uuid NOT NULL,
  approved_by uuid, approval_reason text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  FOREIGN KEY(contact_id,entity_id) REFERENCES accounting_contacts(id,entity_id),
  FOREIGN KEY(tax_account_id,entity_id) REFERENCES accounting_accounts(id,entity_id),
  FOREIGN KEY(control_account_id,entity_id) REFERENCES accounting_accounts(id,entity_id),
  FOREIGN KEY(journal_id,entity_id) REFERENCES accounting_journals(id,entity_id),
  UNIQUE(entity_id,document_type,document_number), UNIQUE(id,entity_id), CHECK(due_date>=issue_date),
  CHECK(approved_by IS NULL OR approved_by<>created_by)
);
CREATE TABLE accounting_document_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity_id uuid NOT NULL, document_id uuid NOT NULL,
  line_no smallint NOT NULL CHECK(line_no>0), description text NOT NULL CHECK(length(trim(description)) BETWEEN 2 AND 255),
  account_id uuid NOT NULL, quantity numeric(14,4) NOT NULL DEFAULT 1 CHECK(quantity>0), unit_price numeric(18,2) NOT NULL CHECK(unit_price>=0),
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100), line_subtotal numeric(18,2) NOT NULL CHECK(line_subtotal>=0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
  FOREIGN KEY(document_id,entity_id) REFERENCES accounting_documents(id,entity_id),
  FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id), UNIQUE(document_id,line_no)
);
CREATE TABLE accounting_document_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL, document_id uuid NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>0),
  payment_date date NOT NULL, reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160), account_id uuid NOT NULL,
  journal_id uuid, status text NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval','posted','rejected')),
  recorded_by uuid NOT NULL, reviewed_by uuid, review_reason text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  FOREIGN KEY(document_id,entity_id) REFERENCES accounting_documents(id,entity_id),
  FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id), FOREIGN KEY(journal_id,entity_id) REFERENCES accounting_journals(id,entity_id),
  UNIQUE(entity_id,reference), UNIQUE(id,entity_id), CHECK(reviewed_by IS NULL OR reviewed_by<>recorded_by),
  CHECK((status='pending_approval' AND reviewed_by IS NULL AND journal_id IS NULL) OR (status IN ('posted','rejected') AND reviewed_by IS NOT NULL AND review_reason IS NOT NULL))
);
CREATE TABLE accounting_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id), name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
  period_start date NOT NULL, period_end date NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','closed')),
  created_by uuid NOT NULL, approved_by uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,entity_id), CHECK(period_end>=period_start),
  CHECK(approved_by IS NULL OR approved_by<>created_by)
);
CREATE TABLE accounting_budget_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity_id uuid NOT NULL, budget_id uuid NOT NULL, account_id uuid NOT NULL,
  period_month date NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>=0), note text,
  FOREIGN KEY(budget_id,entity_id) REFERENCES accounting_budgets(id,entity_id), FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id),
  UNIQUE(budget_id,account_id,period_month)
);
CREATE TABLE accounting_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id), account_id uuid NOT NULL,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160), institution text, account_last4 text, currency char(3) NOT NULL DEFAULT 'ETB',
  active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,entity_id) REFERENCES accounting_accounts(id,entity_id), UNIQUE(id,entity_id)
);
CREATE TABLE accounting_bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL, bank_account_id uuid NOT NULL, transaction_date date NOT NULL,
  description text NOT NULL CHECK(length(trim(description)) BETWEEN 2 AND 500), reference text, amount numeric(18,2) NOT NULL CHECK(amount<>0),
  import_batch uuid NOT NULL, line_fingerprint char(64) NOT NULL CHECK(line_fingerprint ~ '^[0-9a-f]{64}$'), imported_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(bank_account_id,entity_id) REFERENCES accounting_bank_accounts(id,entity_id), UNIQUE(bank_account_id,import_batch,line_fingerprint),
  UNIQUE(id,entity_id,bank_account_id)
);
CREATE TABLE accounting_bank_reconciliations (
  statement_line_id uuid PRIMARY KEY, entity_id uuid NOT NULL, bank_account_id uuid NOT NULL, journal_id uuid NOT NULL,
  matched_by uuid NOT NULL, matched_at timestamptz NOT NULL DEFAULT now(), note text,
  FOREIGN KEY(statement_line_id,entity_id,bank_account_id) REFERENCES accounting_bank_statement_lines(id,entity_id,bank_account_id),
  FOREIGN KEY(bank_account_id,entity_id) REFERENCES accounting_bank_accounts(id,entity_id),
  FOREIGN KEY(journal_id,entity_id) REFERENCES accounting_journals(id,entity_id), UNIQUE(journal_id,statement_line_id)
);
CREATE TABLE accounting_tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id), tax_type text NOT NULL CHECK(tax_type IN ('vat','withholding','income','customs','other')),
  period_start date NOT NULL, period_end date NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','submitted','accepted','rejected','paid')),
  taxable_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(taxable_amount>=0), tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0), currency char(3) NOT NULL DEFAULT 'ETB',
  reference text, notes text, created_by uuid NOT NULL, reviewed_by uuid, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id,tax_type,period_start,period_end), CHECK(period_end>=period_start), CHECK(reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE TABLE accounting_entity_standards (
  entity_id uuid PRIMARY KEY REFERENCES accounting_entities(id), accounting_basis text NOT NULL CHECK(accounting_basis IN ('ifrs','ifrs_for_smes','ethiopian_gaap','other')),
  effective_from date NOT NULL, configured_by uuid NOT NULL, configured_at timestamptz NOT NULL DEFAULT now(), notes text
);
CREATE TABLE accounting_service_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES accounting_entities(id), package_code text NOT NULL,
  status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','suspended','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, external_subscription_id text, updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entity_id), CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE FUNCTION accounting_guard_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='draft' AND NEW.status='pending_approval' THEN
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Submitted document content is immutable'; END IF;
  ELSIF OLD.status='pending_approval' AND NEW.status IN ('approved','rejected') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by=OLD.created_by OR length(trim(coalesce(NEW.approval_reason,'')))<10 THEN RAISE EXCEPTION 'Document requires independent approval and reason'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','approved_by','approval_reason','approved_at','journal_id'])<>(to_jsonb(OLD)-ARRAY['status','approved_by','approval_reason','approved_at','journal_id']) THEN RAISE EXCEPTION 'Submitted document content is immutable'; END IF;
  ELSIF OLD.status IN ('approved','partially_paid') AND NEW.status IN ('partially_paid','paid','void') THEN
    IF (to_jsonb(NEW)-'status')<>(to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Posted document content is immutable'; END IF;
  ELSE RAISE EXCEPTION 'Invalid accounting document transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_document_guard BEFORE UPDATE ON accounting_documents FOR EACH ROW EXECUTE FUNCTION accounting_guard_document();
CREATE FUNCTION accounting_guard_document_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc_status text;
BEGIN
  SELECT status INTO doc_status FROM accounting_documents WHERE id=coalesce(OLD.document_id,NEW.document_id) AND entity_id=coalesce(OLD.entity_id,NEW.entity_id);
  IF doc_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Document lines are immutable after submission'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER accounting_document_lines_guard BEFORE UPDATE OR DELETE ON accounting_document_lines FOR EACH ROW EXECUTE FUNCTION accounting_guard_document_lines();
CREATE FUNCTION accounting_guard_budget_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE budget_status text;
BEGIN
  SELECT status INTO budget_status FROM accounting_budgets WHERE id=coalesce(OLD.budget_id,NEW.budget_id) AND entity_id=coalesce(OLD.entity_id,NEW.entity_id);
  IF budget_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Approved budget lines cannot be changed'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER accounting_budget_lines_guard BEFORE UPDATE OR DELETE ON accounting_budget_lines FOR EACH ROW EXECUTE FUNCTION accounting_guard_budget_lines();
CREATE POLICY accounting_documents_review_update ON accounting_documents FOR UPDATE USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']));
CREATE POLICY accounting_document_payments_review_update ON accounting_document_payments FOR UPDATE USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']));
CREATE POLICY accounting_budgets_review_update ON accounting_budgets FOR UPDATE USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']));
CREATE POLICY accounting_tax_filings_review_update ON accounting_tax_filings FOR UPDATE USING(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer'])) WITH CHECK(accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']));
CREATE POLICY accounting_document_journal_review_insert ON accounting_journals FOR INSERT WITH CHECK(
  accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']) AND
  (EXISTS(SELECT 1 FROM accounting_documents d WHERE d.id=accounting_journals.idempotency_key AND d.entity_id=accounting_journals.entity_id
    AND d.created_by=accounting_journals.created_by AND accounting_journals.source_reference=d.document_type||':'||d.document_number)
   OR EXISTS(SELECT 1 FROM accounting_document_payments p WHERE p.id=accounting_journals.idempotency_key AND p.entity_id=accounting_journals.entity_id
    AND p.recorded_by=accounting_journals.created_by AND accounting_journals.source_reference='payment:'||p.reference))
);
CREATE POLICY accounting_document_journal_line_review_insert ON accounting_journal_lines FOR INSERT WITH CHECK(
  accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer']) AND
  (EXISTS(SELECT 1 FROM accounting_journals j JOIN accounting_documents d ON d.id=j.idempotency_key AND d.entity_id=j.entity_id
    WHERE j.id=accounting_journal_lines.journal_id AND j.entity_id=accounting_journal_lines.entity_id
      AND j.created_by=d.created_by AND j.source_reference=d.document_type||':'||d.document_number)
   OR EXISTS(SELECT 1 FROM accounting_journals j JOIN accounting_document_payments p ON p.id=j.idempotency_key AND p.entity_id=j.entity_id
    WHERE j.id=accounting_journal_lines.journal_id AND j.entity_id=accounting_journal_lines.entity_id
      AND j.created_by=p.recorded_by AND j.source_reference='payment:'||p.reference))
);
CREATE POLICY accounting_workflow_audit_review_insert ON accounting_audit FOR INSERT WITH CHECK(
  accounting_can_access(entity_id,ARRAY['entity_admin','finance_manager','reviewer'])
  AND record_type IN ('accounting_document','accounting_document_payment','accounting_budget','accounting_tax_filing')
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounting_contacts','accounting_documents','accounting_document_lines','accounting_document_payments',
    'accounting_budgets','accounting_budget_lines','accounting_bank_accounts','accounting_bank_statement_lines','accounting_bank_reconciliations',
    'accounting_tax_filings','accounting_entity_standards','accounting_service_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    IF t IN ('accounting_entity_standards','accounting_service_subscriptions') THEN
      EXECUTE format('CREATE POLICY %I ON %I USING(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'',''reviewer'',''auditor'',''viewer''])) WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'']))',t||'_scope',t);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I USING(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'',''reviewer'',''auditor'',''viewer''])) WITH CHECK(accounting_can_access(entity_id,ARRAY[''entity_admin'',''finance_manager'',''accountant'']))',t||'_scope',t);
    END IF;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO "{{role}}"',t);
  END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE accounting_document_lines_id_seq,accounting_budget_lines_id_seq TO "{{role}}";
