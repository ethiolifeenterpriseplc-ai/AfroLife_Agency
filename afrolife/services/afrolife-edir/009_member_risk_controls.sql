CREATE TABLE edir_member_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  member_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('identity_mismatch','suspicious_activity','fraud','aml_hold','delinquency_restriction')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','active','rejected','released')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  released_by uuid,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  FOREIGN KEY (member_id,organization_id) REFERENCES edir_memberships(id,organization_id),
  CHECK ((status='pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
     OR (status<>'pending_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
       AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 2000)),
  CHECK ((status='released' AND released_by IS NOT NULL AND released_at IS NOT NULL AND release_reason IS NOT NULL)
     OR (status<>'released' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE INDEX edir_member_risk_active_idx ON edir_member_risk_flags(organization_id,member_id) WHERE status='active';
CREATE FUNCTION edir_member_has_active_risk_hold(target_member uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM edir_member_risk_flags WHERE organization_id=app_edir_id()
    AND member_id=target_member AND status='active')
$$;
ALTER TABLE edir_member_risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_member_risk_flags NO FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_member_risk_read ON edir_member_risk_flags FOR SELECT
  USING (edir_has_staff_role(ARRAY['edir_admin','credit_officer','credit_manager','compliance','auditor']) OR edir_is_platform_admin());
CREATE POLICY edir_member_risk_create ON edir_member_risk_flags FOR INSERT
  WITH CHECK (created_by=app_user_id() AND
    (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','compliance'])));
CREATE POLICY edir_member_risk_review ON edir_member_risk_flags FOR UPDATE
  USING (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','compliance']))
  WITH CHECK (edir_is_platform_admin() OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','compliance']));
CREATE POLICY edir_member_risk_tenant_scope ON edir_member_risk_flags AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE TRIGGER edir_member_risk_tenant_guard BEFORE UPDATE OF organization_id ON edir_member_risk_flags
  FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
CREATE FUNCTION edir_guard_member_risk_flag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Edir member risk history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'released_by'-'released_at'-'release_reason')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'released_by'-'released_at'-'release_reason') THEN
    RAISE EXCEPTION 'Edir risk flag evidence is immutable';
  END IF;
  IF OLD.status='pending_review' AND NEW.status IN ('active','rejected') THEN
    IF NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL
       OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 2000 THEN
      RAISE EXCEPTION 'Edir risk flag review requires an independent actor and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='released' THEN
    IF NEW.released_by IS DISTINCT FROM app_user_id() OR NEW.released_by=OLD.created_by OR NEW.released_at IS NULL
       OR NEW.release_reason IS NULL OR length(trim(NEW.release_reason)) NOT BETWEEN 10 AND 2000 THEN
      RAISE EXCEPTION 'Edir risk hold release requires an independent actor and reason';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid Edir member risk flag transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER edir_member_risk_guard BEFORE UPDATE OR DELETE ON edir_member_risk_flags
  FOR EACH ROW EXECUTE FUNCTION edir_guard_member_risk_flag();
GRANT SELECT,INSERT,UPDATE ON TABLE edir_member_risk_flags TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_member_risk_flag() TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_member_has_active_risk_hold(uuid) TO "{{role}}";
