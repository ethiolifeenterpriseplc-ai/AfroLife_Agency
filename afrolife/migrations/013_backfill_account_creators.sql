UPDATE users u
SET created_by = (
  SELECT a.actor_id
  FROM audit_logs a
  WHERE a.action = 'user_created'
    AND a.entity = 'user'
    AND a.entity_id = u.id::text
  ORDER BY a.created_at, a.id
  LIMIT 1
)
WHERE u.created_by IS NULL
  AND EXISTS (
    SELECT 1 FROM audit_logs a
    WHERE a.action = 'user_created'
      AND a.entity = 'user'
      AND a.entity_id = u.id::text
  );
