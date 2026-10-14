CREATE TABLE user_access_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  previous_role text,
  role_after text NOT NULL,
  previous_active boolean,
  current_active boolean NOT NULL,
  actor_id uuid REFERENCES users(id),
  reason text NOT NULL,
  baseline boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (baseline AND previous_role IS NULL AND previous_active IS NULL)
    OR (NOT baseline AND previous_role IS NOT NULL AND previous_active IS NOT NULL)
  )
);

CREATE INDEX user_access_history_user_time_idx
  ON user_access_history (user_id, changed_at DESC, id DESC);

INSERT INTO user_access_history
  (user_id, role_after, current_active, reason, baseline, changed_at)
SELECT id, role, active,
       'Initial access state captured when effective-dated history was enabled',
       true, now()
FROM users;

CREATE OR REPLACE FUNCTION record_user_access_history() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid;
  change_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_access_history
      (user_id, role_after, current_active, reason, baseline, changed_at)
    VALUES
      (NEW.id, NEW.role, NEW.active,
       'Initial access state captured when the account was created', true, now());
    RETURN NEW;
  ELSIF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.active IS NOT DISTINCT FROM OLD.active THEN
    RETURN NEW;
  END IF;

  actor := nullif(current_setting('app.user_id', true), '')::uuid;
  change_reason := nullif(trim(current_setting('app.access_change_reason', true)), '');

  INSERT INTO public.user_access_history
    (user_id, previous_role, role_after, previous_active, current_active,
     actor_id, reason)
  VALUES
    (NEW.id, OLD.role, NEW.role, OLD.active, NEW.active, actor,
     coalesce(change_reason, 'Account role or activation changed through an authorized workflow'));
  RETURN NEW;
END
$$;

CREATE TRIGGER users_capture_initial_access
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION record_user_access_history();

CREATE TRIGGER users_record_access_history
AFTER UPDATE OF role, active ON users
FOR EACH ROW EXECUTE FUNCTION record_user_access_history();

CREATE OR REPLACE FUNCTION prevent_user_access_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'User access history is append-only';
END
$$;

CREATE TRIGGER user_access_history_immutable
BEFORE UPDATE OR DELETE ON user_access_history
FOR EACH ROW EXECUTE FUNCTION prevent_user_access_history_mutation();

REVOKE ALL ON FUNCTION record_user_access_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_access_history() TO "{{role}}";

ALTER TABLE user_access_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_access_history FORCE ROW LEVEL SECURITY;
CREATE POLICY user_access_history_privileged_read ON user_access_history
  FOR SELECT USING (current_setting('app.role', true) IN ('super_admin','global_admin','compliance'));
CREATE POLICY user_access_history_owner_insert ON user_access_history
  FOR INSERT WITH CHECK (
    current_user = pg_get_userbyid(
      (SELECT relowner FROM pg_class WHERE oid = 'public.user_access_history'::regclass)
    )
  );

REVOKE ALL ON TABLE user_access_history FROM PUBLIC;
REVOKE ALL ON TABLE user_access_history FROM "{{role}}";
GRANT SELECT ON TABLE user_access_history TO "{{role}}";
