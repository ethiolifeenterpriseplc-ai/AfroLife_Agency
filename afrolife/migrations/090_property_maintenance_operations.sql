ALTER TABLE maintenance_requests
  ADD COLUMN category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','plumbing','electrical','appliance','structural','cleaning','safety','other')),
  ADD COLUMN resolution_note text,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE maintenance_request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('opened','assigned','in_progress','completed','cancelled','note')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_request_events_timeline_idx
  ON maintenance_request_events (maintenance_request_id, created_at, id);

ALTER TABLE maintenance_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_request_events FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_events_read ON maintenance_request_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM maintenance_requests m
    WHERE m.id=maintenance_request_id
      AND app_has_permission('property.maintenance.manage')
      AND (app_can_access_agent(m.source_agent_id)
        OR EXISTS (SELECT 1 FROM properties p WHERE p.id=m.property_id AND p.owner_user_id=app_user_id())
        OR app_role() IN ('super_admin','global_admin','corporate_business_manager'))
  ));
CREATE POLICY maintenance_events_insert ON maintenance_request_events FOR INSERT
  WITH CHECK (
    actor_id=app_user_id()
    AND EXISTS (
      SELECT 1 FROM maintenance_requests m
      WHERE m.id=maintenance_request_id
        AND app_has_permission('property.maintenance.manage')
        AND (app_can_access_agent(m.source_agent_id)
          OR EXISTS (SELECT 1 FROM properties p WHERE p.id=m.property_id AND p.owner_user_id=app_user_id())
          OR app_role() IN ('super_admin','global_admin','corporate_business_manager'))
    )
  );
GRANT SELECT, INSERT ON maintenance_request_events TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE maintenance_request_events_id_seq TO "{{role}}";
