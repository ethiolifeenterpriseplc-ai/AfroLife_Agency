CREATE TABLE signup_upload_tokens (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL
);

CREATE TABLE user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('national_id','police_clearance')),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  reviewer_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_type)
);

CREATE TABLE property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 300),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_photos_property_idx ON property_photos (property_id, created_at DESC);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_documents_scope ON user_documents
  USING (app_is_staff() OR user_id = app_user_id())
  WITH CHECK (app_is_staff() OR user_id = app_user_id());

CREATE POLICY property_photos_scope ON property_photos
  USING (
    app_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND app_can_access_agent(p.source_agent_id)
    )
  )
  WITH CHECK (
    app_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND app_can_access_agent(p.source_agent_id)
    )
  );
