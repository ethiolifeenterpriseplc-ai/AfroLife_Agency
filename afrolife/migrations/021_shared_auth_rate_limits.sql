CREATE TABLE auth_rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  hit_count integer NOT NULL CHECK (hit_count >= 0),
  reset_at timestamptz NOT NULL
);

CREATE INDEX auth_rate_limit_buckets_expiry_idx
  ON auth_rate_limit_buckets (reset_at);
