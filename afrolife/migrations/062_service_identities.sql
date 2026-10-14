-- 062_service_identities.sql
CREATE TABLE service_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 200),
  owner_user_id uuid REFERENCES users(id),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 3 AND 1000),
  environment text NOT NULL CHECK (environment IN ('production','staging','development','sandbox')),
  expiry_date date,
  rotated_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotated','revoked','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Minimal runtime grants for the application runtime role; migration replaces "{{role}}" at runtime.
REVOKE ALL ON TABLE service_identities FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE service_identities TO "{{role}}";

