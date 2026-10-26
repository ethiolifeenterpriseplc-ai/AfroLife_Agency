INSERT INTO role_activity_defaults (role_name, activity_key, enabled)
VALUES ('property_vendor', 'learning.content.view', true)
ON CONFLICT (role_name, activity_key) DO NOTHING;
