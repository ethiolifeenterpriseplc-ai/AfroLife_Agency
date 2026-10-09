CREATE TABLE insurance_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE CHECK (account_code ~ '^[A-Z0-9-]{2,24}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurance_ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  transaction_type text NOT NULL CHECK (transaction_type IN ('manual','reversal')),
  source_reference text NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 1000),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  reversal_of uuid REFERENCES insurance_ledger_journals(id),
  reversal_reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','posted','rejected')),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approval_reason text,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (transaction_type = 'manual' AND reversal_of IS NULL AND reversal_reason IS NULL)
    OR (transaction_type = 'reversal' AND reversal_of IS NOT NULL AND reversal_reason IS NOT NULL
        AND length(trim(reversal_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (
    (status IN ('draft','pending_approval') AND approved_by IS NULL AND approval_reason IS NULL AND approved_at IS NULL AND posted_at IS NULL)
    OR (status = 'posted' AND approved_by IS NOT NULL AND approval_reason IS NOT NULL AND approved_at IS NOT NULL AND posted_at IS NOT NULL)
    OR (status = 'rejected' AND approved_by IS NOT NULL AND approval_reason IS NOT NULL AND approved_at IS NOT NULL AND posted_at IS NULL)
  ),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE TABLE insurance_ledger_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES insurance_ledger_journals(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  account_id uuid NOT NULL REFERENCES insurance_ledger_accounts(id),
  debit numeric(16,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(16,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_id, line_no),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX insurance_ledger_lines_account_idx ON insurance_ledger_lines (account_id, journal_id);
CREATE INDEX insurance_ledger_journals_status_idx ON insurance_ledger_journals (status, created_at DESC);
CREATE UNIQUE INDEX insurance_ledger_single_live_reversal_idx
  ON insurance_ledger_journals (reversal_of)
  WHERE reversal_of IS NOT NULL AND status <> 'rejected';

CREATE TABLE insurance_ledger_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX insurance_ledger_audit_recent_idx ON insurance_ledger_audit (created_at DESC);

CREATE OR REPLACE FUNCTION insurance_ledger_guard_journal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  debit_total numeric(16,2);
  credit_total numeric(16,2);
  original insurance_ledger_journals%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.posted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Insurance journals must begin as drafts';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Insurance ledger journals cannot be deleted';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'pending_approval' THEN
    IF (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'Insurance journal content is immutable after submission';
    END IF;
    SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0)
      INTO debit_total, credit_total
      FROM insurance_ledger_lines WHERE journal_id = NEW.id;
    IF debit_total <= 0 OR debit_total <> credit_total OR debit_total <> NEW.amount THEN
      RAISE EXCEPTION 'Insurance journal must have balanced lines equal to its amount';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_approval' AND NEW.status IN ('posted','rejected') THEN
    IF (to_jsonb(NEW) - 'status' - 'approved_by' - 'approval_reason' - 'approved_at' - 'posted_at')
       <> (to_jsonb(OLD) - 'status' - 'approved_by' - 'approval_reason' - 'approved_at' - 'posted_at')
       OR NEW.approved_by IS NULL OR NEW.approved_by = NEW.created_by
       OR NEW.approval_reason IS NULL OR length(trim(NEW.approval_reason)) NOT BETWEEN 10 AND 1000
       OR NEW.approved_at IS NULL
       OR (NEW.status = 'posted' AND NEW.posted_at IS NULL)
       OR (NEW.status = 'rejected' AND NEW.posted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Invalid insurance journal approval transition';
    END IF;

    IF NEW.status = 'posted' THEN
      SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0)
        INTO debit_total, credit_total
        FROM insurance_ledger_lines WHERE journal_id = NEW.id;
      IF debit_total <= 0 OR debit_total <> credit_total OR debit_total <> NEW.amount THEN
        RAISE EXCEPTION 'Insurance journal must have balanced lines equal to its amount';
      END IF;

      IF NEW.transaction_type = 'reversal' THEN
        SELECT * INTO original FROM insurance_ledger_journals
          WHERE id = NEW.reversal_of AND status = 'posted' AND transaction_type = 'manual';
        IF NOT FOUND OR NEW.amount <> original.amount OR EXISTS (
          (SELECT account_id, debit, credit FROM insurance_ledger_lines WHERE journal_id = NEW.id
           EXCEPT
           SELECT account_id, credit, debit FROM insurance_ledger_lines WHERE journal_id = original.id)
          UNION ALL
          (SELECT account_id, credit, debit FROM insurance_ledger_lines WHERE journal_id = original.id
           EXCEPT
           SELECT account_id, debit, credit FROM insurance_ledger_lines WHERE journal_id = NEW.id)
        ) THEN
          RAISE EXCEPTION 'Insurance reversal must exactly reverse an original posted manual journal';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid insurance journal state transition';
END
$$;

CREATE TRIGGER insurance_ledger_journal_guard
BEFORE INSERT OR UPDATE OR DELETE ON insurance_ledger_journals
FOR EACH ROW EXECUTE FUNCTION insurance_ledger_guard_journal();

CREATE OR REPLACE FUNCTION insurance_ledger_guard_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journal_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Insurance ledger lines are immutable';
  END IF;
  SELECT status INTO journal_status FROM insurance_ledger_journals WHERE id = NEW.journal_id;
  IF journal_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Insurance ledger lines can only be added to a draft journal';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER insurance_ledger_line_guard
BEFORE INSERT OR UPDATE OR DELETE ON insurance_ledger_lines
FOR EACH ROW EXECUTE FUNCTION insurance_ledger_guard_line();

CREATE OR REPLACE FUNCTION insurance_ledger_guard_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance ledger accounts are immutable';
END
$$;

CREATE TRIGGER insurance_ledger_account_guard
BEFORE UPDATE OR DELETE ON insurance_ledger_accounts
FOR EACH ROW EXECUTE FUNCTION insurance_ledger_guard_account();

CREATE OR REPLACE FUNCTION insurance_ledger_guard_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance ledger audit records are append-only';
END
$$;

CREATE TRIGGER insurance_ledger_audit_guard
BEFORE UPDATE OR DELETE ON insurance_ledger_audit
FOR EACH ROW EXECUTE FUNCTION insurance_ledger_guard_audit();

ALTER TABLE insurance_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_ledger_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_ledger_accounts_read ON insurance_ledger_accounts
  FOR SELECT USING (app_role() = ANY(ARRAY['super_admin','finance','finance_manager','compliance']));
CREATE POLICY insurance_ledger_accounts_create ON insurance_ledger_accounts
  FOR INSERT WITH CHECK (app_role() = 'super_admin' AND created_by = app_user_id());

CREATE POLICY insurance_ledger_journals_read ON insurance_ledger_journals
  FOR SELECT USING (app_role() = ANY(ARRAY['super_admin','finance','finance_manager','compliance']));
CREATE POLICY insurance_ledger_journals_create ON insurance_ledger_journals
  FOR INSERT WITH CHECK (app_role() = ANY(ARRAY['super_admin','finance_manager']) AND created_by = app_user_id());
CREATE POLICY insurance_ledger_journals_decide ON insurance_ledger_journals
  FOR UPDATE
  USING (
    app_role() = ANY(ARRAY['super_admin','finance_manager'])
    AND (
      (status = 'draft' AND created_by = app_user_id())
      OR status = 'pending_approval'
    )
  )
  WITH CHECK (
    app_role() = ANY(ARRAY['super_admin','finance_manager'])
    AND (
      (status = 'pending_approval' AND created_by = app_user_id())
      OR (status IN ('posted','rejected') AND approved_by = app_user_id())
    )
  );

CREATE POLICY insurance_ledger_lines_read ON insurance_ledger_lines
  FOR SELECT USING (app_role() = ANY(ARRAY['super_admin','finance','finance_manager','compliance']));
CREATE POLICY insurance_ledger_lines_create ON insurance_ledger_lines
  FOR INSERT WITH CHECK (
    app_role() = ANY(ARRAY['super_admin','finance_manager'])
    AND EXISTS (
      SELECT 1 FROM insurance_ledger_journals j
      WHERE j.id = journal_id AND j.status = 'draft' AND j.created_by = app_user_id()
    )
  );

CREATE POLICY insurance_ledger_audit_read ON insurance_ledger_audit
  FOR SELECT USING (app_role() = ANY(ARRAY['super_admin','finance','finance_manager','compliance']));
CREATE POLICY insurance_ledger_audit_create ON insurance_ledger_audit
  FOR INSERT WITH CHECK (
    app_role() = ANY(ARRAY['super_admin','finance_manager'])
    AND actor_id = app_user_id()
  );
