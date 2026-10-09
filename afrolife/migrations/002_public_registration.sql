CREATE TABLE user_signups (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('worker','customer','agent')),
  requested_plan text CHECK (requested_plan IS NULL OR requested_plan IN ('free','pro','enterprise')),
  payment_status text NOT NULL CHECK (payment_status IN ('not_required','not_configured')),
  agent_type text CHECK (agent_type IS NULL OR agent_type IN ('master','field')),
  territory_id integer REFERENCES territories(id),
  parent_agent_id uuid REFERENCES agents(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (account_type = 'agent' AND requested_plan IS NOT NULL AND agent_type IS NOT NULL AND territory_id IS NOT NULL)
    OR
    (account_type <> 'agent' AND requested_plan IS NULL AND agent_type IS NULL AND territory_id IS NULL AND parent_agent_id IS NULL)
  ),
  CHECK ((agent_type = 'field' AND parent_agent_id IS NOT NULL) OR (agent_type IS DISTINCT FROM 'field' AND parent_agent_id IS NULL))
);

CREATE INDEX user_signups_pending_idx ON user_signups (created_at) WHERE status = 'pending';
