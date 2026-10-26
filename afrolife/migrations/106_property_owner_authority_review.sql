ALTER TABLE properties
  ADD COLUMN authority_review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (authority_review_status IN ('pending_review','approved','needs_info','rejected')),
  ADD COLUMN authority_review_note text,
  ADD COLUMN authority_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN authority_reviewed_at timestamptz,
  ADD CONSTRAINT properties_authority_review_actor_check
    CHECK (authority_reviewed_by IS NULL OR authority_reviewed_by <> created_by),
  ADD CONSTRAINT properties_authority_review_timestamp_check
    CHECK ((authority_reviewed_by IS NULL) = (authority_reviewed_at IS NULL)),
  ADD CONSTRAINT properties_authority_review_pending_check
    CHECK (authority_review_status <> 'pending_review' OR (
      authority_reviewed_by IS NULL AND authority_reviewed_at IS NULL
    )),
  ADD CONSTRAINT properties_authority_review_decision_check
    CHECK (authority_review_status NOT IN ('approved','needs_info','rejected') OR (
      authority_reviewed_by IS NOT NULL AND authority_reviewed_at IS NOT NULL
    )),
  ADD CONSTRAINT properties_authority_review_reason_check
    CHECK (authority_review_status NOT IN ('needs_info','rejected') OR
      length(trim(coalesce(authority_review_note, ''))) >= 10);

CREATE INDEX properties_authority_review_queue_idx
  ON properties (created_at DESC)
  WHERE authority_review_status = 'pending_review';

CREATE TABLE property_authority_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  evidence_type text NOT NULL CHECK (evidence_type IN ('ownership_authority','delegated_authority')),
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  scan_status text NOT NULL CHECK (scan_status = 'clean'),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_authority_evidence_property_idx
  ON property_authority_evidence(property_id, created_at, id);

ALTER TABLE property_authority_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_authority_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY property_authority_evidence_read ON property_authority_evidence
  FOR SELECT
  USING (
    app_role() IN ('super_admin','corporate_business_manager')
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR app_can_access_agent(p.source_agent_id)
        )
    )
  );
CREATE POLICY property_authority_evidence_insert ON property_authority_evidence
  FOR INSERT
  WITH CHECK (
    uploaded_by = app_user_id()
    AND (
        app_role() IN ('super_admin','corporate_business_manager')
        OR EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id = property_id
            AND p.authority_review_status IN ('pending_review','needs_info','rejected')
            AND (
              (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
              OR app_can_access_agent(p.source_agent_id)
            )
        )
    )
  );

CREATE OR REPLACE FUNCTION guard_property_authority_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE property_status text;
BEGIN
  SELECT authority_review_status INTO property_status
  FROM properties WHERE id = NEW.property_id;
  IF property_status IS NULL
    OR property_status NOT IN ('pending_review','needs_info','rejected')
    OR NEW.uploaded_by IS DISTINCT FROM app_user_id()
    OR NEW.scan_status <> 'clean' THEN
    RAISE EXCEPTION 'Property authority evidence must be uploaded by an authorized owner or agent and pass malware scanning'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER property_authority_evidence_insert_guard
  BEFORE INSERT ON property_authority_evidence
  FOR EACH ROW EXECUTE FUNCTION guard_property_authority_evidence();

CREATE OR REPLACE FUNCTION prevent_property_authority_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Property authority evidence is append-only'
    USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER property_authority_evidence_immutable
  BEFORE UPDATE OR DELETE ON property_authority_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_property_authority_evidence_mutation();

CREATE TABLE property_authority_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('submitted','evidence_submitted','approved','needs_info','rejected','resubmitted')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('pending_review','approved','needs_info','rejected')),
  to_status text NOT NULL CHECK (to_status IN ('pending_review','approved','needs_info','rejected')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type NOT IN ('needs_info','rejected') OR length(trim(coalesce(reason, ''))) >= 10)
);
CREATE INDEX property_authority_review_events_property_idx
  ON property_authority_review_events(property_id, created_at, id);

ALTER TABLE property_authority_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_authority_review_events FORCE ROW LEVEL SECURITY;
CREATE POLICY property_authority_review_events_read ON property_authority_review_events
  FOR SELECT
  USING (
    app_role() IN ('super_admin','corporate_business_manager')
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR app_can_access_agent(p.source_agent_id)
        )
    )
  );
CREATE POLICY property_authority_review_events_insert ON property_authority_review_events
  FOR INSERT
  WITH CHECK (
    actor_id = app_user_id()
    AND (
      app_role() IN ('super_admin','corporate_business_manager')
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

CREATE OR REPLACE FUNCTION guard_property_authority_review_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  property_status text;
  property_created_by uuid;
  property_reviewed_by uuid;
  property_review_note text;
BEGIN
  NEW.created_at := now();
  SELECT authority_review_status, created_by, authority_reviewed_by, authority_review_note
    INTO property_status, property_created_by, property_reviewed_by, property_review_note
  FROM properties WHERE id = NEW.property_id;

  IF NEW.actor_id IS DISTINCT FROM app_user_id() OR property_status IS NULL THEN
    RAISE EXCEPTION 'Property authority history requires the authenticated property actor'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.event_type = 'submitted'
    AND property_created_by = NEW.actor_id
    AND property_status = 'pending_review'
    AND NEW.from_status IS NULL AND NEW.to_status = 'pending_review'
    AND NOT EXISTS (
      SELECT 1 FROM property_authority_review_events event
      WHERE event.property_id = NEW.property_id
    ) THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'evidence_submitted'
    AND property_status = NEW.to_status
    AND NEW.from_status IS NOT DISTINCT FROM NEW.to_status
    AND EXISTS (
      SELECT 1 FROM property_authority_evidence evidence
      WHERE evidence.property_id = NEW.property_id
        AND evidence.uploaded_by = NEW.actor_id
        AND evidence.created_at >= transaction_timestamp()
    ) THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type IN ('approved','needs_info','rejected')
    AND NEW.from_status = 'pending_review'
    AND NEW.to_status = property_status
    AND NEW.event_type = NEW.to_status
    AND property_reviewed_by = NEW.actor_id
    AND property_review_note IS NOT DISTINCT FROM NEW.reason
    AND property_status IN ('approved','needs_info','rejected') THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'resubmitted'
    AND NEW.from_status IN ('needs_info','rejected')
    AND NEW.to_status = 'pending_review'
    AND property_status = 'pending_review'
    AND EXISTS (
      SELECT 1 FROM property_authority_evidence evidence
      WHERE evidence.property_id = NEW.property_id
        AND evidence.created_at > COALESCE((
          SELECT event.created_at FROM property_authority_review_events event
          WHERE event.property_id = NEW.property_id
            AND event.event_type IN ('needs_info','rejected')
          ORDER BY event.created_at DESC,event.id DESC
          LIMIT 1
        ), '-infinity'::timestamptz)
    )
    AND NOT EXISTS (
      SELECT 1 FROM property_authority_review_events event
      WHERE event.property_id = NEW.property_id
        AND event.event_type = 'resubmitted'
        AND event.created_at > COALESCE((
          SELECT decision.created_at FROM property_authority_review_events decision
          WHERE decision.property_id = NEW.property_id
            AND decision.event_type IN ('needs_info','rejected')
          ORDER BY decision.created_at DESC,decision.id DESC
          LIMIT 1
        ), '-infinity'::timestamptz)
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Property authority history must match a completed evidence or review transition'
    USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER property_authority_review_events_insert_guard
  BEFORE INSERT ON property_authority_review_events
  FOR EACH ROW EXECUTE FUNCTION guard_property_authority_review_event();

CREATE OR REPLACE FUNCTION prevent_property_authority_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Property authority review history is append-only'
    USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER property_authority_review_events_immutable
  BEFORE UPDATE OR DELETE ON property_authority_review_events
  FOR EACH ROW EXECUTE FUNCTION prevent_property_authority_event_mutation();

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

  IF app_role() IN ('super_admin','corporate_business_manager') THEN
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
      app_role() IN ('super_admin','corporate_business_manager')
      OR
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
CREATE TRIGGER properties_authority_review_guard
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION guard_property_authority_review();

CREATE POLICY properties_authority_review_read ON properties
  FOR SELECT
  USING (app_role() IN ('super_admin','corporate_business_manager'));
CREATE POLICY properties_authority_review_update ON properties
  FOR UPDATE
  USING (app_role() IN ('super_admin','corporate_business_manager'))
  WITH CHECK (app_role() IN ('super_admin','corporate_business_manager'));

DROP POLICY properties_read_scope ON properties;
CREATE POLICY properties_read_scope ON properties
  FOR SELECT
  USING (
    app_role() = 'super_admin'
    OR app_can_access_agent(source_agent_id)
    OR (app_role() = 'property_owner' AND owner_user_id = app_user_id())
    OR (
      app_role() = 'customer' AND status = 'available'
      AND listing_review_status = 'approved' AND authority_review_status = 'approved'
    )
  );

DROP POLICY units_read_scope ON property_units;
CREATE POLICY units_read_scope ON property_units
  FOR SELECT
  USING (
    app_is_staff()
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR (
            app_role() = 'customer' AND p.status = 'available'
            AND p.listing_review_status = 'approved' AND p.authority_review_status = 'approved'
          )
        )
    )
  );

DROP POLICY property_photos_read_scope ON property_photos;
CREATE POLICY property_photos_read_scope ON property_photos
  FOR SELECT
  USING (
    app_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
          OR (
            app_role() = 'customer' AND p.status = 'available'
            AND p.listing_review_status = 'approved' AND p.authority_review_status = 'approved'
          )
        )
    )
  );
