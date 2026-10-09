ALTER TABLE users
  ADD COLUMN created_by uuid REFERENCES users(id);
