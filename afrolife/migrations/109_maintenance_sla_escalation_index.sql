CREATE INDEX maintenance_requests_sla_escalation_idx
  ON maintenance_requests (sla_due_at, id)
  WHERE sla_due_at IS NOT NULL
    AND status NOT IN ('completed','done','cancelled');
