DROP POLICY personal_data_requests_read ON personal_data_requests;
CREATE POLICY personal_data_requests_read ON personal_data_requests FOR SELECT
  USING (requester_id=app_user_id() OR app_role() IN ('global_admin','super_admin','compliance'));

DROP POLICY personal_data_requests_update ON personal_data_requests;
CREATE POLICY personal_data_requests_update ON personal_data_requests FOR UPDATE
  USING (app_role() IN ('global_admin','super_admin','compliance'))
  WITH CHECK (app_role() IN ('global_admin','super_admin','compliance'));

DROP POLICY privacy_incidents_read ON privacy_incidents;
CREATE POLICY privacy_incidents_read ON privacy_incidents FOR SELECT
  USING (app_role() IN ('global_admin','super_admin','compliance'));

DROP POLICY privacy_incidents_create ON privacy_incidents;
CREATE POLICY privacy_incidents_create ON privacy_incidents FOR INSERT
  WITH CHECK (reported_by=app_user_id()
    AND app_role() IN ('global_admin','super_admin','compliance','finance','finance_manager'));

DROP POLICY privacy_incidents_update ON privacy_incidents;
CREATE POLICY privacy_incidents_update ON privacy_incidents FOR UPDATE
  USING (app_role() IN ('global_admin','super_admin','compliance'))
  WITH CHECK (app_role() IN ('global_admin','super_admin','compliance'));

DROP POLICY privacy_case_events_read ON privacy_case_events;
CREATE POLICY privacy_case_events_read ON privacy_case_events FOR SELECT
  USING (app_role() IN ('global_admin','super_admin','compliance') OR case_type='personal_data_request' AND case_id IN (
    SELECT id FROM personal_data_requests WHERE requester_id=app_user_id()
  ));

DROP POLICY privacy_case_events_create ON privacy_case_events;
CREATE POLICY privacy_case_events_create ON privacy_case_events FOR INSERT
  WITH CHECK (actor_id=app_user_id() AND (
    app_role() IN ('global_admin','super_admin','compliance','finance','finance_manager')
    OR case_type='personal_data_request' AND case_id IN (
      SELECT id FROM personal_data_requests WHERE requester_id=app_user_id()
    )
  ));
