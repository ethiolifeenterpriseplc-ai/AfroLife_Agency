ALTER TABLE properties
  ADD COLUMN listing_review_status text NOT NULL DEFAULT 'approved'
    CHECK (listing_review_status IN ('pending_review','approved','rejected')),
  ADD COLUMN listing_review_note text,
  ADD COLUMN listing_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN listing_reviewed_at timestamptz,
  ADD CONSTRAINT properties_listing_review_actor_check
    CHECK (listing_reviewed_by IS NULL OR listing_reviewed_by <> created_by),
  ADD CONSTRAINT properties_listing_review_timestamp_check
    CHECK ((listing_reviewed_by IS NULL) = (listing_reviewed_at IS NULL)),
  ADD CONSTRAINT properties_listing_review_pending_check
    CHECK (listing_review_status <> 'pending_review' OR (listing_reviewed_by IS NULL AND listing_reviewed_at IS NULL)),
  ADD CONSTRAINT properties_listing_review_rejected_check
    CHECK (listing_review_status <> 'rejected' OR (
      listing_reviewed_by IS NOT NULL
      AND listing_reviewed_at IS NOT NULL
      AND length(trim(coalesce(listing_review_note, ''))) >= 10
    ));

CREATE INDEX properties_listing_review_queue_idx
  ON properties (created_at DESC)
  WHERE listing_review_status = 'pending_review';

DROP POLICY properties_read_scope ON properties;
CREATE POLICY properties_read_scope ON properties
  FOR SELECT
  USING (
    app_role() = 'super_admin'
    OR app_can_access_agent(source_agent_id)
    OR (app_role() = 'property_owner' AND owner_user_id = app_user_id())
    OR (app_role() = 'customer' AND status = 'available' AND listing_review_status = 'approved')
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
          OR (app_role() = 'customer' AND p.status = 'available' AND p.listing_review_status = 'approved')
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
          OR (app_role() = 'customer' AND p.status = 'available' AND p.listing_review_status = 'approved')
        )
    )
  );
