INSERT INTO platform_services(service_key,display_name,description)
VALUES('accounting','Accounting','Standalone multi-entity accounting, double-entry journals, reporting, and controlled source-service integration')
ON CONFLICT(service_key) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description;
