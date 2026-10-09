DROP POLICY properties_scope ON properties;
CREATE POLICY properties_read_scope ON properties
  FOR SELECT
  USING (
    app_role() = 'super_admin'
    OR app_can_access_agent(source_agent_id)
    OR (app_role() = 'property_owner' AND owner_user_id = app_user_id())
    OR (app_role() = 'customer' AND status = 'available')
  );
CREATE POLICY properties_write_scope ON properties
  FOR ALL
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
          OR (app_role() = 'customer' AND p.status = 'available')
        )
    )
  );
CREATE POLICY units_write_scope ON property_units
  FOR ALL
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
          OR (app_role() = 'customer' AND p.status = 'available')
        )
    )
  );
CREATE POLICY property_photos_write_scope ON property_photos
  FOR ALL
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
