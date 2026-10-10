ALTER TABLE edir_staff DROP CONSTRAINT IF EXISTS edir_staff_role_check;
ALTER TABLE edir_staff ADD CONSTRAINT edir_staff_role_check
  CHECK (role IN (
    'edir_admin','member_support','compliance','auditor',
    'finance_manager','treasurer','credit_officer','credit_manager'
  ));

CREATE TABLE edir_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4}$'),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('asset','liability','equity','income','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO edir_ledger_accounts (code, name, category, normal_balance) VALUES
  ('1000','Cash and bank','asset','debit'),
  ('1300','Loan receivable','asset','debit'),
  ('2100','Member savings payable','liability','credit'),
  ('2200','Member contribution payable','liability','credit'),
  ('3100','Member share capital','equity','credit'),
  ('3200','Edir mutual reserve','equity','credit')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE edir_financial_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE CHECK (product_code ~ '^[A-Z0-9-]{2,20}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  product_type text NOT NULL CHECK (product_type IN ('savings','share','contribution')),
  ledger_account_id uuid NOT NULL REFERENCES edir_ledger_accounts(id),
  minimum_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimum_balance >= 0),
  withdrawals_allowed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','rejected','paused')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (product_type <> 'contribution' OR withdrawals_allowed=false),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);

CREATE TABLE edir_member_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES edir_memberships(id),
  product_id uuid NOT NULL REFERENCES edir_financial_products(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, product_id)
);

CREATE TABLE edir_financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_account_id uuid NOT NULL REFERENCES edir_member_accounts(id),
  direction text NOT NULL CHECK (direction IN ('deposit','withdrawal','contribution','reversal')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reverses_transaction_id uuid REFERENCES edir_financial_transactions(id),
  reversal_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (
    (direction='reversal' AND reverses_transaction_id IS NOT NULL
      AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) BETWEEN 10 AND 1000)
    OR (direction<>'reversal' AND reverses_transaction_id IS NULL AND reversal_reason IS NULL)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);

CREATE TABLE edir_financial_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES edir_financial_transactions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'draft' AND posted_by IS NULL AND posted_at IS NULL)
    OR (status = 'posted' AND posted_by IS NOT NULL AND posted_at IS NOT NULL))
);

CREATE UNIQUE INDEX edir_single_approved_reversal_idx
  ON edir_financial_transactions (reverses_transaction_id)
  WHERE direction='reversal' AND status='approved';

CREATE TABLE edir_financial_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES edir_financial_journals(id),
  ledger_account_id uuid NOT NULL REFERENCES edir_ledger_accounts(id),
  member_account_id uuid REFERENCES edir_member_accounts(id),
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE OR REPLACE FUNCTION edir_validate_financial_product() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  account_code text;
  expected_code text;
BEGIN
  SELECT code INTO account_code FROM edir_ledger_accounts WHERE id=NEW.ledger_account_id;
  expected_code := CASE NEW.product_type
    WHEN 'savings' THEN '2100'
    WHEN 'contribution' THEN '2200'
    WHEN 'share' THEN '3100'
  END;
  IF account_code IS DISTINCT FROM expected_code THEN
    RAISE EXCEPTION 'Edir financial product ledger account does not match product type';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_product_account_guard
BEFORE INSERT OR UPDATE OF product_type, ledger_account_id ON edir_financial_products
FOR EACH ROW EXECUTE FUNCTION edir_validate_financial_product();

CREATE OR REPLACE FUNCTION edir_guard_financial_product_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_code <> OLD.product_code OR NEW.product_type <> OLD.product_type
     OR NEW.ledger_account_id <> OLD.ledger_account_id OR NEW.minimum_balance <> OLD.minimum_balance
     OR NEW.withdrawals_allowed <> OLD.withdrawals_allowed
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.name <> OLD.name THEN
    RAISE EXCEPTION 'Edir financial product terms are immutable after creation';
  END IF;
  IF OLD.status = 'pending' THEN
    IF NEW.status <> OLD.status THEN
      IF NEW.status NOT IN ('active','rejected')
         OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
         OR NEW.reviewed_by = NEW.created_by
         OR NEW.reviewed_at IS NULL
         OR NEW.review_reason IS NULL
         OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
        RAISE EXCEPTION 'Invalid Edir financial product decision';
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Pending product review fields cannot change independently';
    END IF;
  ELSIF NEW.status <> OLD.status THEN
    IF NOT ((OLD.status = 'active' AND NEW.status = 'paused')
      OR (OLD.status = 'paused' AND NEW.status = 'active'))
      OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
      OR NEW.reviewed_by = NEW.created_by
      OR NEW.reviewed_at IS NULL
      OR NEW.review_reason IS NULL
      OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Invalid Edir financial product lifecycle transition';
    END IF;
  ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
    RAISE EXCEPTION 'Product decision evidence cannot change independently';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_product_lifecycle_guard
BEFORE UPDATE ON edir_financial_products
FOR EACH ROW EXECUTE FUNCTION edir_guard_financial_product_lifecycle();

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
  IF NEW.member_account_id <> OLD.member_account_id
     OR NEW.direction <> OLD.direction OR NEW.amount <> OLD.amount
     OR NEW.reverses_transaction_id IS DISTINCT FROM OLD.reverses_transaction_id
     OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.payload_hash <> OLD.payload_hash
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Edir financial transaction details are immutable';
  END IF;
  IF NEW.status='approved' THEN
    effective_direction := NEW.direction;
    IF NEW.direction='reversal' THEN
      SELECT t.direction, t.status, t.member_account_id, t.amount, t.created_by, t.reviewed_by
        INTO original_direction, original_status, original_account_id, original_amount,
             original_created_by, original_reviewed_by
        FROM edir_financial_transactions t
        JOIN edir_financial_journals j ON j.transaction_id=t.id AND j.status='posted'
        WHERE t.id=NEW.reverses_transaction_id
        FOR UPDATE OF t;
      IF original_status IS DISTINCT FROM 'approved'
         OR original_direction NOT IN ('deposit','withdrawal')
         OR original_account_id IS DISTINCT FROM NEW.member_account_id
         OR original_amount IS DISTINCT FROM NEW.amount
         OR NEW.created_by IN (original_created_by, original_reviewed_by)
         OR EXISTS (
           SELECT 1 FROM edir_financial_transactions r
           WHERE r.reverses_transaction_id=NEW.reverses_transaction_id AND r.status='approved'
         ) THEN
        RAISE EXCEPTION 'Edir reversal must reference an eligible unreversed transaction';
      END IF;
      effective_direction := CASE original_direction
        WHEN 'deposit' THEN 'withdrawal'
        WHEN 'withdrawal' THEN 'deposit'
      END;
    END IF;
    SELECT p.product_type, ma.status, p.status, p.minimum_balance, p.withdrawals_allowed
      INTO account_type, account_status, product_status, minimum_balance, withdrawals_allowed
      FROM edir_member_accounts ma
      JOIN edir_financial_products p ON p.id=ma.product_id
      WHERE ma.id=NEW.member_account_id
      FOR UPDATE OF ma;
    IF account_status IS DISTINCT FROM 'active' OR product_status IS DISTINCT FROM 'active'
       OR (effective_direction='contribution' AND account_type <> 'contribution')
       OR (effective_direction IN ('deposit','withdrawal') AND account_type NOT IN ('savings','share'))
       OR (effective_direction='withdrawal' AND NEW.direction<>'reversal' AND NOT withdrawals_allowed) THEN
      RAISE EXCEPTION 'Edir transaction direction does not match an active account product';
    END IF;
    IF effective_direction='withdrawal' THEN
      SELECT coalesce(sum(l.credit-l.debit),0) INTO current_balance
        FROM edir_financial_journal_lines l
        JOIN edir_financial_journals j ON j.id=l.journal_id AND j.status='posted'
        WHERE l.member_account_id=NEW.member_account_id;
      IF current_balance - NEW.amount < (CASE WHEN NEW.direction='reversal' THEN 0 ELSE minimum_balance END) THEN
        RAISE EXCEPTION 'Edir withdrawal exceeds the available account balance';
      END IF;
      PERFORM pg_advisory_xact_lock(779814,1000);
      SELECT coalesce(sum(l.debit-l.credit),0) INTO cash_balance
        FROM edir_financial_journal_lines l
        JOIN edir_financial_journals j ON j.id=l.journal_id AND j.status='posted'
        JOIN edir_ledger_accounts a ON a.id=l.ledger_account_id AND a.code='1000';
      IF cash_balance < NEW.amount THEN
        RAISE EXCEPTION 'Edir cash balance is insufficient for this withdrawal';
      END IF;
    END IF;
  END IF;
  IF OLD.status <> 'pending'
     OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by = NEW.created_by
     OR NEW.reviewed_at IS NULL
     OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Invalid Edir financial transaction decision';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_transaction_lifecycle_guard
BEFORE UPDATE ON edir_financial_transactions
FOR EACH ROW EXECUTE FUNCTION edir_guard_financial_transaction_lifecycle();

CREATE OR REPLACE FUNCTION edir_guard_posted_financial_journal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  debit_total numeric(14,2);
  credit_total numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Posted Edir journals are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'posted' THEN RAISE EXCEPTION 'Posted Edir journals are immutable'; END IF;
  IF NEW.transaction_id <> OLD.transaction_id OR NEW.amount <> OLD.amount
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Edir journal identity and amount are immutable';
  END IF;
  IF NEW.status = 'posted' THEN
    IF NEW.posted_by IS DISTINCT FROM app_user_id() OR NEW.posted_at IS NULL THEN
      RAISE EXCEPTION 'Journal poster must match the current Edir user';
    END IF;
    SELECT coalesce(sum(debit),0), coalesce(sum(credit),0)
      INTO debit_total, credit_total
      FROM edir_financial_journal_lines WHERE journal_id=NEW.id;
    IF debit_total <> credit_total OR debit_total <> NEW.amount THEN
      RAISE EXCEPTION 'Edir financial journal is not balanced';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_journal_immutable
BEFORE UPDATE OR DELETE ON edir_financial_journals
FOR EACH ROW EXECUTE FUNCTION edir_guard_posted_financial_journal();

CREATE OR REPLACE FUNCTION edir_prevent_posted_financial_line_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journal_status text;
BEGIN
  SELECT status INTO journal_status FROM edir_financial_journals WHERE id=COALESCE(NEW.journal_id,OLD.journal_id);
  IF journal_status = 'posted' THEN RAISE EXCEPTION 'Posted Edir journal lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_financial_journal_line_immutable
BEFORE INSERT OR UPDATE OR DELETE ON edir_financial_journal_lines
FOR EACH ROW EXECUTE FUNCTION edir_prevent_posted_financial_line_mutation();

CREATE OR REPLACE FUNCTION edir_validate_member_financial_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM edir_memberships m
    JOIN edir_financial_products p ON p.id=NEW.product_id AND p.status='active'
    WHERE m.id=NEW.member_id AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'An active Edir member and active financial product are required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_member_financial_account_guard
BEFORE INSERT ON edir_member_accounts
FOR EACH ROW EXECUTE FUNCTION edir_validate_member_financial_account();

CREATE INDEX edir_member_accounts_member_idx ON edir_member_accounts (member_id, opened_at DESC);
CREATE INDEX edir_financial_transactions_pending_idx ON edir_financial_transactions (status, created_at DESC);
CREATE INDEX edir_journal_lines_member_account_idx ON edir_financial_journal_lines (member_account_id, journal_id);

DROP POLICY IF EXISTS edir_membership_read ON edir_memberships;
CREATE POLICY edir_membership_read ON edir_memberships
  FOR SELECT USING (
    user_id=app_user_id() OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor','finance_manager','treasurer','credit_officer','credit_manager'])
  );
DROP POLICY IF EXISTS edir_group_read ON edir_groups;
CREATE POLICY edir_group_read ON edir_groups
  FOR SELECT USING (
    edir_is_platform_admin() OR edir_has_active_membership()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor','finance_manager','treasurer','credit_officer','credit_manager'])
  );
DROP POLICY IF EXISTS edir_group_membership_read ON edir_group_memberships;
CREATE POLICY edir_group_membership_read ON edir_group_memberships
  FOR SELECT USING (
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor','finance_manager','treasurer','credit_officer','credit_manager'])
    OR member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())
  );
DROP POLICY IF EXISTS edir_audit_read ON edir_audit_logs;
CREATE POLICY edir_audit_read ON edir_audit_logs
  FOR SELECT USING (
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','compliance','auditor','finance_manager','treasurer','credit_manager'])
  );

ALTER TABLE edir_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_ledger_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_products FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_member_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_financial_journal_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY edir_ledger_accounts_read ON edir_ledger_accounts
  FOR SELECT USING (
    edir_is_platform_admin() OR edir_has_active_membership()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','credit_officer','credit_manager','compliance','auditor'])
  );

CREATE POLICY edir_financial_products_read ON edir_financial_products
  FOR SELECT USING (
    status='active' AND (edir_has_active_membership() OR edir_is_platform_admin())
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','credit_officer','credit_manager','compliance','auditor'])
  );
CREATE POLICY edir_financial_products_create ON edir_financial_products
  FOR INSERT WITH CHECK (
    created_by=app_user_id()
    AND (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']))
    AND status='pending'
  );
CREATE POLICY edir_financial_products_decide ON edir_financial_products
  FOR UPDATE USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']));

CREATE POLICY edir_member_accounts_read ON edir_member_accounts
  FOR SELECT USING (
    member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','credit_officer','credit_manager','compliance','auditor'])
  );
CREATE POLICY edir_member_accounts_create ON edir_member_accounts
  FOR INSERT WITH CHECK (
    member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id() AND status='active')
  );

CREATE POLICY edir_financial_transactions_read ON edir_financial_transactions
  FOR SELECT USING (
    created_by=app_user_id()
    OR member_account_id IN (
      SELECT ma.id FROM edir_member_accounts ma
      JOIN edir_memberships m ON m.id=ma.member_id WHERE m.user_id=app_user_id()
    )
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','credit_officer','credit_manager','compliance','auditor'])
  );
CREATE POLICY edir_financial_transactions_create ON edir_financial_transactions
  FOR INSERT WITH CHECK (
    created_by=app_user_id()
    AND status='pending'
    AND (
      (direction='withdrawal' AND member_account_id IN (
        SELECT ma.id FROM edir_member_accounts ma
        JOIN edir_memberships m ON m.id=ma.member_id
        WHERE m.user_id=app_user_id() AND m.status='active'
      ))
      OR edir_is_platform_admin()
      OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer'])
    )
  );
CREATE POLICY edir_financial_transactions_decide ON edir_financial_transactions
  FOR UPDATE USING (
    edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer'])
  ) WITH CHECK (
    edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer'])
  );

CREATE POLICY edir_financial_journals_read ON edir_financial_journals
  FOR SELECT USING (
    transaction_id IN (
      SELECT id FROM edir_financial_transactions WHERE created_by=app_user_id()
        OR member_account_id IN (
          SELECT ma.id FROM edir_member_accounts ma
          JOIN edir_memberships m ON m.id=ma.member_id WHERE m.user_id=app_user_id()
        )
    )
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','compliance','auditor'])
  );
CREATE POLICY edir_financial_journals_create ON edir_financial_journals
  FOR INSERT WITH CHECK (
    status='draft' AND (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']))
  );
CREATE POLICY edir_financial_journals_post ON edir_financial_journals
  FOR UPDATE USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']));

CREATE POLICY edir_financial_journal_lines_read ON edir_financial_journal_lines
  FOR SELECT USING (
    member_account_id IN (
      SELECT ma.id FROM edir_member_accounts ma
      JOIN edir_memberships m ON m.id=ma.member_id WHERE m.user_id=app_user_id()
    )
    OR journal_id IN (
      SELECT id FROM edir_financial_journals WHERE edir_is_platform_admin()
        OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer','compliance','auditor'])
    )
  );
CREATE POLICY edir_financial_journal_lines_create ON edir_financial_journal_lines
  FOR INSERT WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']));

GRANT SELECT ON TABLE edir_ledger_accounts TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_financial_products TO "{{role}}";
GRANT SELECT, INSERT ON TABLE edir_member_accounts TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_financial_transactions TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_financial_journals TO "{{role}}";
GRANT SELECT, INSERT ON TABLE edir_financial_journal_lines TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_validate_financial_product() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_financial_product_lifecycle() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_financial_transaction_lifecycle() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_posted_financial_journal() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_prevent_posted_financial_line_mutation() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_validate_member_financial_account() TO "{{role}}";
