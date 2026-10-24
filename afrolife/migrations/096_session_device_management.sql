ALTER TABLE auth_sessions
  ADD COLUMN user_agent text CHECK (user_agent IS NULL OR length(user_agent) <= 512);
