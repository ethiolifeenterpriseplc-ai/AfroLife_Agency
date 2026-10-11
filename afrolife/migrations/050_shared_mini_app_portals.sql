ALTER TABLE mfi_members
  ADD COLUMN user_id uuid REFERENCES users(id);

CREATE UNIQUE INDEX mfi_members_institution_user_idx
  ON mfi_members (institution_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE mfi_member_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
  phone text NOT NULL CHECK (length(trim(phone)) BETWEEN 7 AND 32),
  email text CHECK (email IS NULL OR length(trim(email)) <= 254),
  consented_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by <> user_id)
);

CREATE UNIQUE INDEX mfi_member_application_pending_idx
  ON mfi_member_applications (institution_id, user_id)
  WHERE status = 'pending';
CREATE INDEX mfi_member_applications_user_idx
  ON mfi_member_applications (user_id, created_at DESC);

CREATE FUNCTION mfi_guard_member_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SACCO membership application history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'reviewed_by' - 'reviewed_at' - 'review_reason')
     <> (to_jsonb(OLD) - 'status' - 'reviewed_by' - 'reviewed_at' - 'review_reason')
     OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
     OR NEW.reviewed_by = OLD.user_id
     OR NOT mfi_user_has_role(OLD.institution_id, ARRAY['institution_admin','compliance'])
     OR NEW.reviewed_at IS NULL
     OR NEW.review_reason IS NULL
     OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'SACCO membership decisions require an independent reviewer and documented reason';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER mfi_member_application_guard
  BEFORE UPDATE OR DELETE ON mfi_member_applications
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_member_application();

ALTER TABLE mfi_member_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_member_applications FORCE ROW LEVEL SECURITY;

CREATE POLICY mfi_institution_catalog_read ON mfi_institutions
  FOR SELECT USING (true);
CREATE POLICY mfi_member_application_read ON mfi_member_applications
  FOR SELECT USING (user_id = app_user_id() OR mfi_has_access(institution_id));
CREATE POLICY mfi_member_application_create ON mfi_member_applications
  FOR INSERT WITH CHECK (
    user_id = app_user_id() AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL
  );
CREATE POLICY mfi_member_application_review ON mfi_member_applications
  FOR UPDATE USING (mfi_has_access(institution_id))
  WITH CHECK (mfi_has_access(institution_id));

CREATE POLICY mfi_member_application_audit_create ON mfi_audit_logs
  FOR INSERT WITH CHECK (
    mfi_has_access(institution_id)
    OR (
      actor_id = app_user_id()
      AND action = 'mfi_member_application_submitted'
      AND entity = 'mfi_member_application'
      AND EXISTS (
        SELECT 1 FROM mfi_member_applications application
        WHERE application.id::text = mfi_audit_logs.entity_id
          AND application.institution_id = mfi_audit_logs.institution_id
          AND application.user_id = app_user_id()
      )
    )
  );

DROP POLICY mfi_members_scope ON mfi_members;
CREATE POLICY mfi_members_scope ON mfi_members
  USING (mfi_has_access(institution_id) OR user_id = app_user_id())
  WITH CHECK (mfi_has_access(institution_id));

CREATE POLICY mfi_member_accounts_self_read ON mfi_member_accounts
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_members member
      WHERE member.institution_id = mfi_member_accounts.institution_id
        AND member.id = mfi_member_accounts.member_id
        AND member.user_id = app_user_id()
    )
  );
CREATE POLICY mfi_products_member_read ON mfi_products
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_member_accounts account
      JOIN mfi_members member
        ON member.institution_id = account.institution_id AND member.id = account.member_id
      WHERE account.institution_id = mfi_products.institution_id
        AND account.product_id = mfi_products.id
        AND member.user_id = app_user_id()
    )
  );
CREATE POLICY mfi_loans_self_read ON mfi_loans
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_members member
      WHERE member.institution_id = mfi_loans.institution_id
        AND member.id = mfi_loans.member_id
        AND member.user_id = app_user_id()
    )
  );
CREATE POLICY mfi_installments_self_read ON mfi_loan_installments
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_loans loan
      JOIN mfi_members member
        ON member.institution_id = loan.institution_id AND member.id = loan.member_id
      WHERE loan.institution_id = mfi_loan_installments.institution_id
        AND loan.id = mfi_loan_installments.loan_id
        AND member.user_id = app_user_id()
    )
  );
CREATE POLICY mfi_journals_self_read ON mfi_journals
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_member_accounts account
      JOIN mfi_members member
        ON member.institution_id = account.institution_id AND member.id = account.member_id
      WHERE account.institution_id = mfi_journals.institution_id
        AND account.id = mfi_journals.member_account_id
        AND member.user_id = app_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM mfi_loans loan
      JOIN mfi_members member
        ON member.institution_id = loan.institution_id AND member.id = loan.member_id
      WHERE loan.institution_id = mfi_journals.institution_id
        AND loan.id = mfi_journals.loan_id
        AND member.user_id = app_user_id()
    )
  );
CREATE POLICY mfi_journal_lines_self_read ON mfi_journal_lines
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_member_accounts account
      JOIN mfi_members member
        ON member.institution_id = account.institution_id AND member.id = account.member_id
      WHERE account.institution_id = mfi_journal_lines.institution_id
        AND account.id = mfi_journal_lines.member_account_id
        AND member.user_id = app_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM mfi_journals journal
      WHERE journal.institution_id = mfi_journal_lines.institution_id
        AND journal.id = mfi_journal_lines.journal_id
        AND (
          EXISTS (
            SELECT 1 FROM mfi_member_accounts account
            JOIN mfi_members member
              ON member.institution_id = account.institution_id AND member.id = account.member_id
            WHERE account.institution_id = journal.institution_id
              AND account.id = journal.member_account_id
              AND member.user_id = app_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM mfi_loans loan
            JOIN mfi_members member
              ON member.institution_id = loan.institution_id AND member.id = loan.member_id
            WHERE loan.institution_id = journal.institution_id
              AND loan.id = journal.loan_id
              AND member.user_id = app_user_id()
          )
        )
    )
  );
CREATE POLICY mfi_gl_accounts_member_read ON mfi_gl_accounts
  FOR SELECT USING (
    mfi_has_access(institution_id)
    OR EXISTS (
      SELECT 1 FROM mfi_journal_lines line
      JOIN mfi_member_accounts account
        ON account.institution_id = line.institution_id AND account.id = line.member_account_id
      JOIN mfi_members member
        ON member.institution_id = account.institution_id AND member.id = account.member_id
      WHERE line.institution_id = mfi_gl_accounts.institution_id
        AND line.gl_account_id = mfi_gl_accounts.id
        AND member.user_id = app_user_id()
    )
  );

CREATE POLICY marketplace_published_authenticated_read ON marketplace_listings
  FOR SELECT USING (status = 'published' AND app_user_id() IS NOT NULL);

CREATE TABLE insurance_interest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  product_interest text NOT NULL CHECK (product_interest IN ('life','household','property')),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 10 AND 500),
  consented_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','responded','closed')),
  response_note text,
  responded_by uuid REFERENCES users(id),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND response_note IS NULL AND responded_by IS NULL AND responded_at IS NULL)
    OR (status <> 'pending' AND response_note IS NOT NULL
      AND length(trim(response_note)) BETWEEN 10 AND 1000 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
  )
);
CREATE INDEX insurance_interest_requests_user_idx
  ON insurance_interest_requests (user_id, created_at DESC);
CREATE INDEX insurance_interest_requests_status_idx
  ON insurance_interest_requests (status, created_at DESC);

CREATE FUNCTION insurance_guard_interest_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Insurance information request history cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.product_interest IS DISTINCT FROM OLD.product_interest
     OR NEW.message IS DISTINCT FROM OLD.message OR NEW.consented_at IS DISTINCT FROM OLD.consented_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('responded','closed')
     OR NEW.responded_by IS DISTINCT FROM app_user_id()
     OR NEW.responded_at IS NULL OR NEW.response_note IS NULL
     OR length(trim(NEW.response_note)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Insurance request responses require an authorized reviewer and documented note';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER insurance_interest_request_guard
  BEFORE UPDATE OR DELETE ON insurance_interest_requests
  FOR EACH ROW EXECUTE FUNCTION insurance_guard_interest_request();

ALTER TABLE insurance_interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_interest_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY insurance_interest_request_read ON insurance_interest_requests
  FOR SELECT USING (
    user_id = app_user_id()
    OR app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance','auditor'])
  );
CREATE POLICY insurance_interest_request_create ON insurance_interest_requests
  FOR INSERT WITH CHECK (
    user_id = app_user_id() AND status = 'pending'
    AND responded_by IS NULL AND responded_at IS NULL AND response_note IS NULL
  );
CREATE POLICY insurance_interest_request_review ON insurance_interest_requests
  FOR UPDATE USING (
    app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance'])
  )
  WITH CHECK (
    app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance'])
  );

GRANT SELECT, INSERT, UPDATE ON mfi_member_applications TO "{{role}}";
GRANT SELECT ON mfi_institutions, mfi_members, mfi_member_accounts, mfi_products,
  mfi_loans, mfi_loan_installments, mfi_journals, mfi_journal_lines, mfi_gl_accounts TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON insurance_interest_requests TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_member_application() TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_guard_interest_request() TO "{{role}}";
