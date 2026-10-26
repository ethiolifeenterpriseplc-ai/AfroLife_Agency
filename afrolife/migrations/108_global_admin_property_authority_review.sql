DROP POLICY property_authority_evidence_read ON property_authority_evidence;
CREATE POLICY property_authority_evidence_read ON property_authority_evidence
  FOR SELECT
  USING (
    app_role() IN ('global_admin','super_admin','corporate_business_manager')
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR app_can_access_agent(p.source_agent_id)
        )
    )
  );

DROP POLICY property_authority_review_events_read ON property_authority_review_events;
CREATE POLICY property_authority_review_events_read ON property_authority_review_events
  FOR SELECT
  USING (
    app_role() IN ('global_admin','super_admin','corporate_business_manager')
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR app_can_access_agent(p.source_agent_id)
        )
    )
  );

DROP POLICY property_authority_review_events_insert ON property_authority_review_events;
CREATE POLICY property_authority_review_events_insert ON property_authority_review_events
  FOR INSERT
  WITH CHECK (
    actor_id = app_user_id()
    AND (
      app_role() IN ('global_admin','super_admin','corporate_business_manager')
      OR EXISTS (
        SELECT 1 FROM properties p
        WHERE p.id = property_id
          AND (
            (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
            OR app_can_access_agent(p.source_agent_id)
          )
      )
    )
  );

CREATE OR REPLACE FUNCTION guard_property_authority_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE actor uuid := app_user_id();
BEGIN
  IF NEW.authority_review_status IS NOT DISTINCT FROM OLD.authority_review_status
    AND NEW.authority_review_note IS NOT DISTINCT FROM OLD.authority_review_note
    AND NEW.authority_reviewed_by IS NOT DISTINCT FROM OLD.authority_reviewed_by
    AND NEW.authority_reviewed_at IS NOT DISTINCT FROM OLD.authority_reviewed_at THEN
    RETURN NEW;
  END IF;

  IF app_role() IN ('global_admin','super_admin','corporate_business_manager') THEN
    IF actor IS NULL OR actor = OLD.created_by
      OR (to_jsonb(NEW) - 'authority_review_status' - 'authority_review_note'
        - 'authority_reviewed_by' - 'authority_reviewed_at' - 'updated_at')
        <> (to_jsonb(OLD) - 'authority_review_status' - 'authority_review_note'
          - 'authority_reviewed_by' - 'authority_reviewed_at' - 'updated_at')
      OR OLD.authority_review_status <> 'pending_review'
      OR NEW.authority_review_status NOT IN ('approved','needs_info','rejected') THEN
      RAISE EXCEPTION 'Only an independent reviewer may decide a pending property authority review'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.authority_review_status IN ('needs_info','rejected')
      AND length(trim(coalesce(NEW.authority_review_note, ''))) < 10 THEN
      RAISE EXCEPTION 'A reason is required for an adverse property authority decision'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.authority_review_status = 'approved' AND NOT EXISTS (
      SELECT 1 FROM property_authority_evidence
      WHERE property_id = OLD.id AND scan_status = 'clean'
    ) THEN
      RAISE EXCEPTION 'Property authority approval requires malware-scanned evidence'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.authority_review_status = 'approved' AND NOT EXISTS (
      SELECT 1 FROM users subject
      WHERE subject.id = COALESCE(OLD.owner_user_id, OLD.source_agent_id)
        AND subject.active = true AND subject.kyc_status = 'verified'
    ) THEN
      RAISE EXCEPTION 'Property authority approval requires verified identity for the listed owner or agent'
        USING ERRCODE = '23514';
    END IF;
    NEW.authority_reviewed_by := actor;
    NEW.authority_reviewed_at := now();
    RETURN NEW;
  END IF;

  IF OLD.authority_review_status IN ('needs_info','rejected')
    AND NEW.authority_review_status = 'pending_review'
    AND actor IS NOT NULL
    AND (
      (app_role() = 'property_owner' AND OLD.owner_user_id = actor)
      OR app_can_access_agent(OLD.source_agent_id)
    )
    AND NEW.authority_review_note IS NULL
    AND NEW.authority_reviewed_by IS NULL
    AND NEW.authority_reviewed_at IS NULL
    AND (to_jsonb(NEW) - 'authority_review_status' - 'authority_review_note'
      - 'authority_reviewed_by' - 'authority_reviewed_at' - 'updated_at')
      = (to_jsonb(OLD) - 'authority_review_status' - 'authority_review_note'
        - 'authority_reviewed_by' - 'authority_reviewed_at' - 'updated_at')
    AND EXISTS (
      SELECT 1 FROM property_authority_evidence evidence
      WHERE evidence.property_id = OLD.id
        AND evidence.scan_status = 'clean'
        AND evidence.created_at > COALESCE((
          SELECT event.created_at FROM property_authority_review_events event
          WHERE event.property_id = OLD.id
            AND event.event_type IN ('needs_info','rejected')
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
        ), '-infinity'::timestamptz)
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Property authority review state is protected'
    USING ERRCODE = '42501';
END
$$;

DROP POLICY properties_authority_review_read ON properties;
CREATE POLICY properties_authority_review_read ON properties
  FOR SELECT
  USING (app_role() IN ('global_admin','super_admin','corporate_business_manager'));

DROP POLICY properties_authority_review_update ON properties;
CREATE POLICY properties_authority_review_update ON properties
  FOR UPDATE
  USING (app_role() IN ('global_admin','super_admin','corporate_business_manager'))
  WITH CHECK (app_role() IN ('global_admin','super_admin','corporate_business_manager'));
