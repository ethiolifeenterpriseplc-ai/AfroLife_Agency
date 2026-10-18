CREATE TABLE user_app_access_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode = 'custom'),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_app_access_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN (
    'leads','workers','requests','learning','properties','marketplace',
    'contracts','commissions','agents','rent','mfi','accounting','edir',
    'insurance','privacy','global-bi'
  )),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module_key)
);

CREATE TABLE user_app_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  previous_mode text NOT NULL CHECK (previous_mode IN ('role_default','custom')),
  new_mode text NOT NULL CHECK (new_mode IN ('role_default','custom')),
  previous_modules jsonb NOT NULL CHECK (jsonb_typeof(previous_modules) = 'array'),
  new_modules jsonb NOT NULL CHECK (jsonb_typeof(new_modules) = 'array'),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_user_app_access_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'User mini-app access audit history is append-only';
END
$$;

CREATE TRIGGER user_app_access_audit_immutable
  BEFORE UPDATE OR DELETE ON user_app_access_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_user_app_access_audit_mutation();

ALTER TABLE user_app_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_access_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_app_access_profiles_runtime_read ON user_app_access_profiles
  FOR SELECT USING (true);
CREATE POLICY user_app_access_profiles_platform_admin_write ON user_app_access_profiles
  FOR ALL USING (current_setting('app.role', true) IN ('super_admin','global_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('super_admin','global_admin'));

ALTER TABLE user_app_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_access_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY user_app_access_grants_runtime_read ON user_app_access_grants
  FOR SELECT USING (true);
CREATE POLICY user_app_access_grants_platform_admin_write ON user_app_access_grants
  FOR ALL USING (current_setting('app.role', true) IN ('super_admin','global_admin'))
  WITH CHECK (current_setting('app.role', true) IN ('super_admin','global_admin'));

ALTER TABLE user_app_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_access_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY user_app_access_audit_platform_admin_read ON user_app_access_audit
  FOR SELECT USING (current_setting('app.role', true) IN ('super_admin','global_admin'));
CREATE POLICY user_app_access_audit_platform_admin_insert ON user_app_access_audit
  FOR INSERT WITH CHECK (current_setting('app.role', true) IN ('super_admin','global_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_app_access_profiles TO "{{role}}";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_app_access_grants TO "{{role}}";
GRANT SELECT, INSERT ON TABLE user_app_access_audit TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE user_app_access_audit_id_seq TO "{{role}}";
