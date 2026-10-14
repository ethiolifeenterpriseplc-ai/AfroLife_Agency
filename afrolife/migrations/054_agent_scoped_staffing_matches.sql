CREATE POLICY workers_agent_reservation_update ON workers
  FOR UPDATE
  USING (
    app_role() IN ('master_agent','field_agent')
    AND app_can_access_agent(source_agent_id)
  )
  WITH CHECK (
    app_role() IN ('master_agent','field_agent')
    AND app_can_access_agent(source_agent_id)
  );

CREATE POLICY job_requests_agent_lifecycle_update ON job_requests
  FOR UPDATE
  USING (
    app_role() IN ('master_agent','field_agent')
    AND app_can_access_agent(source_agent_id)
  )
  WITH CHECK (
    app_role() IN ('master_agent','field_agent')
    AND app_can_access_agent(source_agent_id)
  );

DROP POLICY matches_scope ON matches;
CREATE POLICY matches_scope ON matches
  USING (
    app_is_staff()
    OR (
      app_role() IN ('master_agent','field_agent')
      AND EXISTS (
        SELECT 1 FROM job_requests r
        WHERE r.id = request_id
          AND app_can_access_agent(r.source_agent_id)
      )
    )
  )
  WITH CHECK (
    app_is_staff()
    OR (
      app_role() IN ('master_agent','field_agent')
      AND EXISTS (
        SELECT 1 FROM job_requests r
        WHERE r.id = request_id
          AND app_can_access_agent(r.source_agent_id)
      )
    )
  );
