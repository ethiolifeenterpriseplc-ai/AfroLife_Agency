ALTER TABLE users
  ADD COLUMN mfa_last_step bigint NOT NULL DEFAULT -1;
