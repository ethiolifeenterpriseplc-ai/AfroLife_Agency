INSERT INTO config_rules (key, value) VALUES ('lead_protection_days', 90)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leads ADD COLUMN protected_until timestamptz;
UPDATE leads
SET protected_until = created_at + make_interval(days => 90)
WHERE protected_until IS NULL;
ALTER TABLE leads ALTER COLUMN protected_until SET NOT NULL;
ALTER TABLE leads ALTER COLUMN protected_until SET DEFAULT (now() + interval '90 days');
CREATE INDEX leads_protection_expiry_idx ON leads (protected_until, source_agent_id);

CREATE TABLE lead_attribution_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id),
  prior_agent_id uuid REFERENCES agents(id),
  new_agent_id uuid NOT NULL REFERENCES agents(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text,
  event_type text NOT NULL CHECK (event_type IN ('created','reassigned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((event_type='created' AND prior_agent_id IS NULL AND reason IS NULL)
      OR (event_type='reassigned' AND prior_agent_id IS NOT NULL AND prior_agent_id<>new_agent_id
          AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 10 AND 1000))
);
CREATE INDEX lead_attribution_history_lead_idx ON lead_attribution_history (lead_id, created_at DESC, id DESC);

ALTER TABLE lead_attribution_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_attribution_history_read ON lead_attribution_history FOR SELECT
  USING (app_role() IN ('global_admin','super_admin') OR app_is_staff() OR EXISTS (
    SELECT 1 FROM leads l WHERE l.id=lead_id AND app_can_access_agent(l.source_agent_id)
  ));

CREATE OR REPLACE FUNCTION record_lead_attribution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO lead_attribution_history (lead_id,prior_agent_id,new_agent_id,actor_id,event_type)
    VALUES (NEW.id,NULL,NEW.source_agent_id,coalesce(app_user_id(),NEW.source_agent_id),'created');
  ELSIF OLD.source_agent_id IS DISTINCT FROM NEW.source_agent_id THEN
    v_reason := nullif(trim(current_setting('app.lead_reassignment_reason',true)), '');
    IF app_role() NOT IN ('global_admin','super_admin') OR v_reason IS NULL OR length(v_reason)<10 THEN
      RAISE EXCEPTION 'Lead reassignment requires a privileged actor and documented reason';
    END IF;
    INSERT INTO lead_attribution_history (lead_id,prior_agent_id,new_agent_id,actor_id,reason,event_type)
    VALUES (NEW.id,OLD.source_agent_id,NEW.source_agent_id,app_user_id(),v_reason,'reassigned');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION record_lead_attribution() FROM PUBLIC;
CREATE TRIGGER leads_record_attribution
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION record_lead_attribution();

CREATE OR REPLACE FUNCTION reject_lead_attribution_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lead attribution history is append-only';
END;
$$;
CREATE TRIGGER lead_attribution_history_immutable
  BEFORE UPDATE OR DELETE ON lead_attribution_history
  FOR EACH ROW EXECUTE FUNCTION reject_lead_attribution_history_mutation();
REVOKE ALL ON FUNCTION reject_lead_attribution_history_mutation() FROM PUBLIC;

CREATE POLICY leads_platform_reassignment ON leads FOR UPDATE
  USING (app_role() IN ('global_admin','super_admin'))
  WITH CHECK (app_role() IN ('global_admin','super_admin') OR source_agent_id=app_user_id());
CREATE POLICY leads_platform_admin_read ON leads FOR SELECT
  USING (app_role() IN ('global_admin','super_admin'));
CREATE POLICY agents_platform_admin_read ON agents FOR SELECT
  USING (app_role() IN ('global_admin','super_admin'));

CREATE OR REPLACE FUNCTION lead_has_non_cancelled_contract(target_lead_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF app_role() NOT IN ('global_admin','super_admin') THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  RETURN EXISTS (SELECT 1 FROM contracts WHERE lead_id=target_lead_id AND state<>'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION lead_has_non_cancelled_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lead_has_non_cancelled_contract(uuid) TO "{{role}}";

REVOKE ALL ON TABLE lead_attribution_history FROM PUBLIC;
GRANT SELECT ON TABLE lead_attribution_history TO "{{role}}";
