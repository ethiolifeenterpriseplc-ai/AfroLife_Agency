CREATE TABLE platform_service_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key text NOT NULL CHECK (service_key IN (
    'property_management','workforce_management','super_agent','edir',
    'insurance_brokerage','agent','landlord','seller'
  )),
  monthly_fee numeric(12,2) NOT NULL DEFAULT 1000.00 CHECK (monthly_fee=1000.00),
  currency text NOT NULL DEFAULT 'ETB' CHECK (currency='ETB'),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested','payment_review','accounting_pending','active','rejected'
  )),
  payment_reference text CHECK (payment_reference IS NULL OR length(trim(payment_reference)) BETWEEN 4 AND 160),
  payment_submitted_by uuid REFERENCES users(id),
  payment_submitted_at timestamptz,
  payment_confirmed_by uuid REFERENCES users(id),
  payment_confirmed_at timestamptz,
  active_from timestamptz,
  active_until timestamptz,
  decision_reason text,
  accounting_event_id uuid UNIQUE REFERENCES accounting_event_outbox(source_event_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status='requested' AND payment_reference IS NULL AND payment_submitted_by IS NULL
      AND payment_submitted_at IS NULL AND payment_confirmed_by IS NULL
      AND payment_confirmed_at IS NULL AND active_from IS NULL AND active_until IS NULL
      AND decision_reason IS NULL AND accounting_event_id IS NULL)
    OR (status='payment_review' AND payment_reference IS NOT NULL AND payment_submitted_by IS NOT NULL
      AND payment_submitted_at IS NOT NULL AND payment_confirmed_by IS NULL
      AND payment_confirmed_at IS NULL AND active_from IS NULL AND active_until IS NULL
      AND decision_reason IS NULL AND accounting_event_id IS NULL)
    OR (status='accounting_pending' AND payment_reference IS NOT NULL AND payment_submitted_by IS NOT NULL
      AND payment_submitted_at IS NOT NULL AND payment_confirmed_by IS NOT NULL
      AND payment_confirmed_at IS NOT NULL AND active_from IS NULL AND active_until IS NULL
      AND decision_reason IS NOT NULL AND accounting_event_id IS NOT NULL)
    OR (status='active' AND payment_reference IS NOT NULL AND payment_submitted_by IS NOT NULL
      AND payment_submitted_at IS NOT NULL AND payment_confirmed_by IS NOT NULL
      AND payment_confirmed_at IS NOT NULL AND active_from IS NOT NULL
      AND active_until=active_from+interval '1 month'
      AND decision_reason IS NOT NULL AND accounting_event_id IS NOT NULL)
    OR (status='rejected' AND payment_reference IS NOT NULL AND payment_submitted_by IS NOT NULL
      AND payment_submitted_at IS NOT NULL AND payment_confirmed_by IS NOT NULL
      AND payment_confirmed_at IS NOT NULL AND active_from IS NULL AND active_until IS NULL
      AND decision_reason IS NOT NULL AND accounting_event_id IS NULL)
  )
);

CREATE UNIQUE INDEX platform_service_subscription_one_open_request
  ON platform_service_subscriptions(user_id,service_key)
  WHERE status IN ('requested','payment_review','accounting_pending');
CREATE UNIQUE INDEX platform_service_subscription_payment_reference
  ON platform_service_subscriptions(lower(btrim(payment_reference)))
  WHERE payment_reference IS NOT NULL;
CREATE INDEX platform_service_subscription_review_queue
  ON platform_service_subscriptions(payment_submitted_at,id)
  WHERE status='payment_review';
CREATE INDEX platform_service_subscription_user_history
  ON platform_service_subscriptions(user_id,created_at DESC);

CREATE TABLE platform_service_subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES platform_service_subscriptions(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('requested','payment_submitted','payment_confirmed','payment_rejected')),
  previous_status text,
  next_status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_service_subscription_audit_history
  ON platform_service_subscription_audit(subscription_id,created_at DESC);

CREATE OR REPLACE FUNCTION platform_service_subscription_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.user_id<>app_user_id() OR NEW.status<>'requested'
      OR NEW.monthly_fee<>1000.00 OR NEW.currency<>'ETB' THEN
      RAISE EXCEPTION 'A service subscription request must be created by its owner at the published ETB monthly price';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.service_key,0));
    IF EXISTS (SELECT 1 FROM platform_service_subscriptions active
      WHERE active.user_id=NEW.user_id AND active.service_key=NEW.service_key
        AND active.status='active' AND active.active_until>now()) THEN
      RAISE EXCEPTION 'This service already has an active subscription';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP<>'UPDATE' THEN
    RAISE EXCEPTION 'Service subscription history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW)-'status'-'payment_reference'-'payment_submitted_by'-'payment_submitted_at'
      -'payment_confirmed_by'-'payment_confirmed_at'-'active_from'-'active_until'
      -'decision_reason'-'accounting_event_id'-'updated_at')
      <> (to_jsonb(OLD)-'status'-'payment_reference'-'payment_submitted_by'-'payment_submitted_at'
      -'payment_confirmed_by'-'payment_confirmed_at'-'active_from'-'active_until'
      -'decision_reason'-'accounting_event_id'-'updated_at') THEN
    RAISE EXCEPTION 'Service subscription identity, service, and price are immutable';
  END IF;
  IF OLD.status='requested' AND NEW.status='payment_review'
    AND NEW.user_id=app_user_id()
    AND NEW.payment_submitted_by=app_user_id()
    AND NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
    AND NEW.payment_reference IS NOT NULL AND NEW.payment_submitted_at IS NOT NULL
    AND NEW.payment_submitted_at BETWEEN now()-interval '5 minutes' AND now()+interval '5 seconds'
    AND NEW.payment_confirmed_by IS NULL AND NEW.active_from IS NULL AND NEW.active_until IS NULL
    AND NEW.decision_reason IS NULL AND NEW.accounting_event_id IS NULL THEN
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;
  IF OLD.status='payment_review' AND NEW.status IN ('accounting_pending','rejected')
    AND app_role() IN ('finance','finance_manager','global_admin','super_admin')
    AND NEW.payment_reference=OLD.payment_reference
    AND NEW.payment_submitted_by=OLD.payment_submitted_by
    AND NEW.payment_submitted_at=OLD.payment_submitted_at
    AND NEW.payment_confirmed_by=app_user_id()
    AND NEW.payment_confirmed_by<>NEW.payment_submitted_by
    AND NEW.payment_confirmed_at BETWEEN now()-interval '5 minutes' AND now()+interval '5 seconds'
    AND length(trim(NEW.decision_reason)) BETWEEN 10 AND 1000
    AND ((NEW.status='accounting_pending' AND NEW.active_from IS NULL AND NEW.active_until IS NULL
        AND NEW.accounting_event_id IS NOT NULL)
      OR (NEW.status='rejected' AND NEW.active_from IS NULL AND NEW.active_until IS NULL
        AND NEW.accounting_event_id IS NULL)) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.service_key,0));
    IF NEW.status='accounting_pending' AND EXISTS (SELECT 1 FROM platform_service_subscriptions active
      WHERE active.user_id=NEW.user_id AND active.service_key=NEW.service_key
        AND active.status='active' AND active.active_until>now()) THEN
      RAISE EXCEPTION 'This service already has an active subscription';
    END IF;
    IF NEW.status='accounting_pending' AND NOT EXISTS (
      SELECT 1 FROM accounting_event_outbox event
      WHERE event.source_event_id=NEW.accounting_event_id
        AND event.status='pending'
        AND event.payload->>'source_reference'=('platform-service-subscription:'||NEW.id::text)
    ) THEN
      RAISE EXCEPTION 'Subscription confirmation requires its matching pending Accounting event';
    END IF;
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;
  IF OLD.status='accounting_pending' AND NEW.status='active'
    AND app_role() IN ('finance','finance_manager','global_admin','super_admin')
    AND (to_jsonb(NEW)-'status'-'active_from'-'active_until'-'updated_at')
      =(to_jsonb(OLD)-'status'-'active_from'-'active_until'-'updated_at')
    AND NEW.active_from BETWEEN now()-interval '1 minute' AND now()+interval '5 seconds'
    AND NEW.active_until=NEW.active_from+interval '1 month'
    AND NEW.accounting_event_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM accounting_event_outbox event
      WHERE event.source_event_id=NEW.accounting_event_id AND event.status='delivered') THEN
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid service subscription lifecycle transition';
END $$;

CREATE TRIGGER platform_service_subscription_guard
  BEFORE INSERT OR UPDATE OR DELETE ON platform_service_subscriptions
  FOR EACH ROW EXECUTE FUNCTION platform_service_subscription_guard();

CREATE OR REPLACE FUNCTION platform_service_subscription_audit_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' OR NEW.actor_id<>app_user_id()
    OR jsonb_typeof(NEW.details)<>'object' THEN
    RAISE EXCEPTION 'Service subscription audit records are append-only';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER platform_service_subscription_audit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON platform_service_subscription_audit
  FOR EACH ROW EXECUTE FUNCTION platform_service_subscription_audit_guard();

ALTER TABLE platform_service_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_service_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_service_subscription_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_service_subscription_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_service_subscription_owner_read ON platform_service_subscriptions FOR SELECT
  USING (user_id=app_user_id() OR app_role() IN ('finance','finance_manager','global_admin','super_admin'));
CREATE POLICY platform_service_subscription_owner_create ON platform_service_subscriptions FOR INSERT
  WITH CHECK (user_id=app_user_id() AND status='requested');
CREATE POLICY platform_service_subscription_owner_update ON platform_service_subscriptions FOR UPDATE
  USING (user_id=app_user_id() OR app_role() IN ('finance','finance_manager','global_admin','super_admin'))
  WITH CHECK (user_id=app_user_id() OR app_role() IN ('finance','finance_manager','global_admin','super_admin'));

CREATE POLICY platform_service_subscription_audit_read ON platform_service_subscription_audit FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM platform_service_subscriptions subscription
      WHERE subscription.id=subscription_id AND subscription.user_id=app_user_id())
    OR app_role() IN ('finance','finance_manager','global_admin','super_admin')
  );
CREATE POLICY platform_service_subscription_audit_create ON platform_service_subscription_audit FOR INSERT
  WITH CHECK (
    actor_id=app_user_id()
    AND EXISTS (SELECT 1 FROM platform_service_subscriptions subscription
      WHERE subscription.id=subscription_id
        AND (subscription.user_id=app_user_id()
          OR app_role() IN ('finance','finance_manager','global_admin','super_admin')))
  );

GRANT SELECT,INSERT,UPDATE ON TABLE platform_service_subscriptions TO "{{role}}";
GRANT SELECT,INSERT ON TABLE platform_service_subscription_audit TO "{{role}}";
GRANT EXECUTE ON FUNCTION platform_service_subscription_guard() TO "{{role}}";
GRANT EXECUTE ON FUNCTION platform_service_subscription_audit_guard() TO "{{role}}";
