import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('distributed authentication rate limits grant the runtime role only required bucket operations', async () => {
  const schema = await readFile(new URL('../migrations/021_shared_auth_rate_limits.sql', import.meta.url), 'utf8');
  const access = await readFile(new URL('../migrations/036_auth_rate_limit_runtime_access.sql', import.meta.url), 'utf8');

  assert.match(schema, /CREATE TABLE auth_rate_limit_buckets/);
  assert.match(schema, /bucket_key text PRIMARY KEY/);
  assert.match(schema, /hit_count integer NOT NULL CHECK \(hit_count >= 0\)/);
  assert.match(access, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth_rate_limit_buckets TO "\{\{role\}\}"/);
});
