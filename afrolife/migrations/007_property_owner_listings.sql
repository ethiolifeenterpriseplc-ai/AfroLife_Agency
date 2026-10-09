ALTER TABLE user_signups
  DROP CONSTRAINT user_signups_account_type_check,
  ADD CONSTRAINT user_signups_account_type_check
    CHECK (account_type IN ('worker','customer','agent','property_owner'));

ALTER TABLE properties
  ALTER COLUMN source_agent_id DROP NOT NULL,
  ADD COLUMN owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT properties_single_owner_check
    CHECK ((source_agent_id IS NULL) <> (owner_user_id IS NULL));

DROP POLICY properties_scope ON properties;
CREATE POLICY properties_scope ON properties
  USING (
    app_role() = 'super_admin'
    OR app_can_access_agent(source_agent_id)
    OR (app_role() = 'property_owner' AND owner_user_id = app_user_id())
  )
  WITH CHECK (
    app_role() = 'super_admin'
    OR (
      app_role() IN ('master_agent','field_agent')
      AND source_agent_id = app_user_id()
      AND owner_user_id IS NULL
    )
    OR (
      app_role() = 'property_owner'
      AND source_agent_id IS NULL
      AND owner_user_id = app_user_id()
    )
  );

DROP POLICY units_scope ON property_units;
CREATE POLICY units_scope ON property_units
  USING (
    app_is_staff()
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
        )
    )
  )
  WITH CHECK (
    app_is_staff()
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
        )
    )
  );

DROP POLICY property_photos_scope ON property_photos;
CREATE POLICY property_photos_scope ON property_photos
  USING (
    app_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
        )
    )
  )
  WITH CHECK (
    app_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND (
          app_can_access_agent(p.source_agent_id)
          OR (app_role() = 'property_owner' AND p.owner_user_id = app_user_id())
        )
    )
  );
