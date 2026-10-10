CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

REVOKE ALL ON TABLE auth_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth_sessions TO "{{role}}";
