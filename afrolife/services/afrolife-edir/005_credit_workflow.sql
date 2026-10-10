CREATE TABLE edir_credit_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','superseded','rejected')),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, version),
  UNIQUE (id, organization_id),
  CHECK (
    (status='pending' AND approved_by IS NULL AND approved_at IS NULL AND review_reason IS NULL)
    OR (status IN ('active','superseded','rejected') AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE UNIQUE INDEX edir_credit_policy_one_pending_idx
  ON edir_credit_policy_versions (organization_id) WHERE status='pending';
CREATE UNIQUE INDEX edir_credit_policy_one_active_idx
  ON edir_credit_policy_versions (organization_id) WHERE status='active';

ALTER TABLE edir_memberships ADD COLUMN activated_at timestamptz;
UPDATE edir_memberships
SET activated_at=coalesce(reviewed_at, created_at)
WHERE status IN ('active','suspended','closed');
ALTER TABLE edir_memberships ADD CONSTRAINT edir_membership_activation_time_check
  CHECK (
    (status IN ('active','suspended','closed') AND activated_at IS NOT NULL)
    OR (status IN ('pending','rejected') AND activated_at IS NULL)
  );

CREATE OR REPLACE FUNCTION edir_guard_membership_activation_time() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Edir membership activation time is assigned only during approval';
    END IF;
  ELSIF OLD.status='pending' AND NEW.status='active' THEN
    IF OLD.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Pending Edir membership cannot have an activation time';
    END IF;
    NEW.activated_at := coalesce(NEW.reviewed_at, now());
  ELSIF OLD.activated_at IS DISTINCT FROM NEW.activated_at THEN
    RAISE EXCEPTION 'Edir membership activation time is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_membership_activation_time_guard
BEFORE INSERT OR UPDATE OF status, activated_at ON edir_memberships
FOR EACH ROW EXECUTE FUNCTION edir_guard_membership_activation_time();
CREATE POLICY edir_membership_credit_read ON edir_memberships FOR SELECT
  USING (edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager']));

CREATE POLICY edir_financial_journals_credit_read ON edir_financial_journals FOR SELECT
  USING (edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager']));
CREATE POLICY edir_financial_journal_lines_credit_read ON edir_financial_journal_lines FOR SELECT
  USING (edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager']));

CREATE TABLE edir_loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  member_id uuid NOT NULL,
  requested_principal numeric(14,2) NOT NULL CHECK (requested_principal > 0),
  requested_term_months integer NOT NULL CHECK (requested_term_months BETWEEN 1 AND 360),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 3 AND 1000),
  monthly_income numeric(14,2) NOT NULL CHECK (monthly_income > 0),
  monthly_expenses numeric(14,2) NOT NULL CHECK (monthly_expenses >= 0),
  monthly_debt numeric(14,2) NOT NULL CHECK (monthly_debt >= 0),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('awaiting_policy','submitted','scored','approved','rejected','accepted')),
  policy_version_id uuid,
  credit_score smallint CHECK (credit_score BETWEEN 0 AND 100),
  score_factors jsonb,
  scored_by uuid,
  scored_at timestamptz,
  decision_by uuid,
  decision_at timestamptz,
  decision_reason text,
  accepted_at timestamptz,
  created_by uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, created_by, idempotency_key),
  FOREIGN KEY (member_id, organization_id) REFERENCES edir_memberships(id, organization_id),
  FOREIGN KEY (policy_version_id, organization_id) REFERENCES edir_credit_policy_versions(id, organization_id),
  CHECK (score_factors IS NULL OR jsonb_typeof(score_factors)='object'),
  CHECK (
    (status IN ('awaiting_policy','submitted') AND policy_version_id IS NULL
      AND credit_score IS NULL AND score_factors IS NULL AND scored_by IS NULL AND scored_at IS NULL)
    OR (status IN ('scored','approved','rejected','accepted') AND policy_version_id IS NOT NULL
      AND credit_score IS NOT NULL AND score_factors IS NOT NULL AND scored_by IS NOT NULL AND scored_at IS NOT NULL)
  ),
  CHECK (
    (status IN ('approved','rejected','accepted') AND decision_by IS NOT NULL AND decision_at IS NOT NULL
      AND decision_reason IS NOT NULL AND length(trim(decision_reason)) BETWEEN 10 AND 1000)
    OR (status IN ('awaiting_policy','submitted','scored') AND decision_by IS NULL AND decision_at IS NULL AND decision_reason IS NULL)
  ),
  CHECK ((status='accepted' AND accepted_at IS NOT NULL) OR (status<>'accepted' AND accepted_at IS NULL))
);

CREATE INDEX edir_loan_applications_member_idx
  ON edir_loan_applications (organization_id, member_id, created_at DESC);
CREATE INDEX edir_loan_applications_review_idx
  ON edir_loan_applications (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION edir_has_active_membership() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM edir_memberships
    WHERE user_id=app_user_id() AND organization_id=app_edir_id() AND status='active'
  )
$$;

CREATE OR REPLACE FUNCTION edir_guard_credit_policy_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir credit policy history cannot be deleted'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.policy IS DISTINCT FROM OLD.policy
     OR NEW.change_reason IS DISTINCT FROM OLD.change_reason
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir credit policy content and authorship are immutable';
  END IF;
  IF OLD.status='pending' AND NEW.status IN ('active','rejected') THEN
    IF NEW.approved_by IS DISTINCT FROM app_user_id() OR NEW.approved_by=NEW.created_by
       OR NEW.approved_at IS NULL OR NEW.review_reason IS NULL
       OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Edir credit policy approval requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='superseded' THEN
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Edir credit policy review evidence is immutable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid Edir credit policy lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_credit_policy_history_guard
BEFORE UPDATE OR DELETE ON edir_credit_policy_versions
FOR EACH ROW EXECUTE FUNCTION edir_guard_credit_policy_history();
CREATE TRIGGER edir_credit_policy_versions_tenant_guard
BEFORE UPDATE OF organization_id ON edir_credit_policy_versions
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();

CREATE OR REPLACE FUNCTION edir_guard_loan_application_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  member_user_id uuid;
  policy_status text;
  policy_data jsonb;
  factors jsonb;
  member_activated_at timestamptz;
  savings_balance numeric;
  savings_target numeric;
  principal_payment numeric;
  debt_service_bps numeric;
  maximum_debt_service_bps numeric;
  minimum_savings_coverage_bps numeric;
  minimum_membership_days integer;
  expected_membership_days integer;
  expected_affordability integer;
  expected_savings integer;
  expected_tenure integer;
  expected_score integer;
  concurrent_applications integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir loan application history cannot be deleted'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.requested_principal IS DISTINCT FROM OLD.requested_principal
     OR NEW.requested_term_months IS DISTINCT FROM OLD.requested_term_months
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.monthly_income IS DISTINCT FROM OLD.monthly_income
     OR NEW.monthly_expenses IS DISTINCT FROM OLD.monthly_expenses
     OR NEW.monthly_debt IS DISTINCT FROM OLD.monthly_debt
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Edir loan application details are immutable';
  END IF;
  IF OLD.status IN ('submitted','awaiting_policy') AND NEW.status='scored' THEN
    IF NEW.scored_by IS DISTINCT FROM app_user_id() OR NEW.scored_by=OLD.created_by OR NEW.scored_at IS NULL
       OR NEW.policy_version_id IS NULL OR NEW.credit_score IS NULL OR NEW.score_factors IS NULL
       OR NEW.decision_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Edir loan assessment must use an approved policy';
    END IF;
    SELECT status,policy INTO policy_status,policy_data
    FROM edir_credit_policy_versions
    WHERE id=NEW.policy_version_id AND organization_id=NEW.organization_id;
    IF policy_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Edir loan assessment requires the current active credit policy';
    END IF;
    IF jsonb_typeof(NEW.score_factors)<>'object'
       OR NOT (NEW.score_factors ?& ARRAY[
         'affordability','savings','membership_tenure','debt_service_bps','membership_days'
       ]) THEN
      RAISE EXCEPTION 'Edir credit assessment factors are incomplete';
    END IF;
    factors := NEW.score_factors;
    SELECT activated_at INTO member_activated_at
    FROM edir_memberships
    WHERE id=NEW.member_id AND organization_id=NEW.organization_id AND status='active';
    IF member_activated_at IS NULL THEN
      RAISE EXCEPTION 'An active Edir membership is required for credit assessment';
    END IF;
    expected_membership_days := greatest(
      floor(extract(epoch FROM (NEW.scored_at-member_activated_at))/86400),0
    )::integer;
    SELECT coalesce(sum(line.credit-line.debit),0) INTO savings_balance
    FROM edir_member_accounts account
    JOIN edir_financial_products product
      ON product.id=account.product_id AND product.organization_id=account.organization_id
      AND product.product_type='savings'
    JOIN edir_financial_journal_lines line
      ON line.member_account_id=account.id AND line.organization_id=account.organization_id
    JOIN edir_financial_journals journal
      ON journal.id=line.journal_id AND journal.organization_id=line.organization_id
      AND journal.status='posted'
    WHERE account.member_id=NEW.member_id AND account.organization_id=NEW.organization_id
      AND account.status='active';
    principal_payment := ceil(NEW.requested_principal*100/NEW.requested_term_months)/100;
    debt_service_bps := least(
      ceil(((NEW.monthly_expenses+NEW.monthly_debt+principal_payment)*10000)/NEW.monthly_income),
      9007199254740991
    );
    maximum_debt_service_bps := (policy_data->>'maximum_debt_service_bps')::numeric;
    minimum_savings_coverage_bps := (policy_data->>'minimum_savings_coverage_bps')::numeric;
    minimum_membership_days := (policy_data->>'minimum_membership_days')::integer;
    savings_target := ceil(NEW.requested_principal*minimum_savings_coverage_bps*100/10000)/100;
    expected_affordability := CASE
      WHEN debt_service_bps>maximum_debt_service_bps THEN 0
      ELSE greatest(0,least(100,floor(
        (maximum_debt_service_bps-debt_service_bps)*100/maximum_debt_service_bps
      )::integer))
    END;
    expected_savings := CASE
      WHEN savings_target=0 THEN 100
      ELSE greatest(0,least(100,floor(savings_balance*100/savings_target)::integer))
    END;
    expected_tenure := CASE
      WHEN minimum_membership_days=0 THEN 100
      ELSE least(100,floor(expected_membership_days*100/minimum_membership_days)::integer)
    END;
    expected_score := round((
      expected_affordability*(policy_data->'scorecard'->'weights'->>'affordability')::numeric
      + expected_savings*(policy_data->'scorecard'->'weights'->>'savings')::numeric
      + expected_tenure*(policy_data->'scorecard'->'weights'->>'membership_tenure')::numeric
    )/100)::integer;
    IF (factors->>'affordability')::integer<>expected_affordability
       OR (factors->>'savings')::integer<>expected_savings
       OR (factors->>'membership_tenure')::integer<>expected_tenure
       OR (factors->>'debt_service_bps')::numeric<>debt_service_bps
       OR (factors->>'membership_days')::integer<>expected_membership_days
       OR NEW.credit_score<>expected_score THEN
      RAISE EXCEPTION 'Edir loan assessment does not match the approved policy and ledger evidence';
    END IF;
  ELSIF OLD.status='scored' AND NEW.status IN ('approved','rejected') THEN
    IF NEW.decision_by IS DISTINCT FROM app_user_id()
       OR NEW.decision_by IN (OLD.created_by, OLD.scored_by)
       OR NEW.decision_at IS NULL OR NEW.decision_reason IS NULL
       OR length(trim(NEW.decision_reason)) NOT BETWEEN 10 AND 1000
       OR NEW.scored_by IS DISTINCT FROM OLD.scored_by
       OR NEW.scored_at IS DISTINCT FROM OLD.scored_at
       OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
       OR NEW.credit_score IS DISTINCT FROM OLD.credit_score
       OR NEW.score_factors IS DISTINCT FROM OLD.score_factors THEN
      RAISE EXCEPTION 'Edir loan decision requires an independent reviewer and reason';
    END IF;
    IF NEW.status='approved' THEN
      SELECT policy INTO policy_data
      FROM edir_credit_policy_versions
      WHERE id=OLD.policy_version_id AND organization_id=OLD.organization_id
        AND status IN ('active','superseded');
      IF policy_data IS NULL THEN
        RAISE EXCEPTION 'The approved policy used for Edir loan scoring is unavailable';
      END IF;
      factors := OLD.score_factors;
      PERFORM 1 FROM edir_memberships
      WHERE id=OLD.member_id AND organization_id=OLD.organization_id
      FOR UPDATE;
      SELECT count(*)::integer INTO concurrent_applications
      FROM edir_loan_applications
      WHERE member_id=OLD.member_id AND organization_id=OLD.organization_id
        AND id<>OLD.id AND status IN ('awaiting_policy','submitted','scored','approved','accepted');
      IF OLD.requested_principal>(policy_data->>'maximum_principal')::numeric
         OR OLD.requested_term_months>(policy_data->>'maximum_tenor_months')::integer
         OR (factors->>'membership_days')::integer<(policy_data->>'minimum_membership_days')::integer
         OR (factors->>'debt_service_bps')::numeric>(policy_data->>'maximum_debt_service_bps')::numeric
         OR (factors->>'savings')::integer<100
         OR OLD.credit_score<(policy_data->'scorecard'->>'minimum_score')::integer
         OR concurrent_applications>=(policy_data->>'maximum_concurrent_applications')::integer THEN
        RAISE EXCEPTION 'Edir loan application does not meet its approved policy limits';
      END IF;
    END IF;
  ELSIF OLD.status='approved' AND NEW.status='accepted' THEN
    SELECT user_id INTO member_user_id FROM edir_memberships WHERE id=OLD.member_id;
    IF member_user_id IS DISTINCT FROM app_user_id() OR NEW.accepted_at IS NULL
       OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
       OR NEW.credit_score IS DISTINCT FROM OLD.credit_score
       OR NEW.score_factors IS DISTINCT FROM OLD.score_factors
       OR NEW.scored_by IS DISTINCT FROM OLD.scored_by
       OR NEW.scored_at IS DISTINCT FROM OLD.scored_at
       OR NEW.decision_by IS DISTINCT FROM OLD.decision_by
       OR NEW.decision_at IS DISTINCT FROM OLD.decision_at
       OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason THEN
      RAISE EXCEPTION 'Only the loan applicant may accept an approved offer';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid Edir loan application lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edir_loan_application_lifecycle_guard
BEFORE UPDATE OR DELETE ON edir_loan_applications
FOR EACH ROW EXECUTE FUNCTION edir_guard_loan_application_lifecycle();
CREATE TRIGGER edir_loan_applications_tenant_guard
BEFORE UPDATE OF organization_id ON edir_loan_applications
FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();

ALTER TABLE edir_credit_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_credit_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_credit_policy_versions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE edir_loan_applications NO FORCE ROW LEVEL SECURITY;

CREATE POLICY edir_credit_policy_read ON edir_credit_policy_versions FOR SELECT
  USING (status='active' AND edir_has_active_membership()
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','compliance','auditor']));
CREATE POLICY edir_credit_policy_create ON edir_credit_policy_versions FOR INSERT
  WITH CHECK (created_by=app_user_id() AND status='pending'
    AND (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager'])));
CREATE POLICY edir_credit_policy_decide ON edir_credit_policy_versions FOR UPDATE
  USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager']));
CREATE POLICY edir_credit_policy_tenant_scope ON edir_credit_policy_versions AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());

CREATE POLICY edir_loan_application_read ON edir_loan_applications FOR SELECT
  USING (member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id())
    OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','compliance','auditor']));
CREATE POLICY edir_loan_application_create ON edir_loan_applications FOR INSERT
  WITH CHECK (created_by=app_user_id() AND status IN ('awaiting_policy','submitted')
    AND member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id() AND status='active'));
CREATE POLICY edir_loan_application_assess ON edir_loan_applications FOR UPDATE
  USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager']));
CREATE POLICY edir_loan_application_accept ON edir_loan_applications FOR UPDATE
  USING (status='approved' AND member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id()))
  WITH CHECK (member_id IN (SELECT id FROM edir_memberships WHERE user_id=app_user_id()));
CREATE POLICY edir_loan_application_tenant_scope ON edir_loan_applications AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON TABLE edir_credit_policy_versions TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE edir_loan_applications TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_has_active_membership() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_credit_policy_history() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_loan_application_lifecycle() TO "{{role}}";
