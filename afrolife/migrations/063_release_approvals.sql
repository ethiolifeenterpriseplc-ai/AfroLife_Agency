-- 063_release_approvals.sql
CREATE TABLE release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_candidate text NOT NULL,
  approver_role text NOT NULL,
  approver_name text NOT NULL,
  approver_email text,
  decision text NOT NULL CHECK (decision IN ('approve','reject')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE release_approvals FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE release_approvals TO "{{role}}";

