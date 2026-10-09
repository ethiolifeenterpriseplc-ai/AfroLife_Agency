import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadRuntimeConfig } from '../src/runtime-config.js';

const safeProductionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://afrolife_app:runtime-secret@db.example.net:5432/afrolife?sslmode=verify-full',
  JWT_SECRET: 'j'.repeat(48),
  MFA_ENC_KEY: 'm'.repeat(48),
  REQUIRE_MFA_FOR_STAFF: '1',
  CORS_ORIGINS: 'https://afrolife.internal,https://localhost',
  FILE_STORAGE_DIR: '/var/lib/afrolife/private-files',
  TRUST_PROXY: '1',
};

test('production configuration enables the role-gated MFI workspace by default', () => {
  const config = loadRuntimeConfig(safeProductionEnvironment);
  assert.equal(config.isProduction, true);
  assert.equal(config.mfiPilotEnabled, true);
  assert.throws(
    () => loadRuntimeConfig({ ...safeProductionEnvironment, MFI_PILOT_ENABLED: 'yes' }),
    /MFI_PILOT_ENABLED must be 0 or 1/,
  );
  assert.equal(loadRuntimeConfig({ ...safeProductionEnvironment, MFI_PILOT_ENABLED: '0' }).mfiPilotEnabled, false);
});

test('production configuration requires separate strong JWT and MFA secrets', () => {
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, MFA_ENC_KEY: undefined }), /MFA_ENC_KEY/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, MFA_ENC_KEY: safeProductionEnvironment.JWT_SECRET }), /must be different/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, JWT_SECRET: 'REPLACE_WITH_A_RANDOM_SECRET_1234567890' }), /JWT_SECRET/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, REQUIRE_MFA_FOR_STAFF: '0' }), /REQUIRE_MFA_FOR_STAFF=1/);
});

test('production configuration requires TLS for remote PostgreSQL and private storage', () => {
  assert.throws(
    () => loadRuntimeConfig({ ...safeProductionEnvironment, DATABASE_URL: 'postgres://app:secret@db.example.net:5432/afrolife' }),
    /sslmode=verify-full/,
  );
  assert.throws(
    () => loadRuntimeConfig({ ...safeProductionEnvironment, FILE_STORAGE_DIR: 'public/uploads' }),
    /absolute, persistent/,
  );
  assert.throws(
    () => loadRuntimeConfig({ ...safeProductionEnvironment, FILE_STORAGE_DIR: resolve('public', 'uploads') }),
    /public web directory/,
  );
});

test('production configuration rejects unsafe origins and proxy trust', () => {
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, CORS_ORIGINS: '*' }), /exact HTTPS origins/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, CORS_ORIGINS: 'https://agency.example.org' }), /non-placeholder HTTPS origins/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, TRUST_PROXY: 'true' }), /actual trusted proxy/);
  assert.throws(() => loadRuntimeConfig({ ...safeProductionEnvironment, LOGIN_RATE_LIMIT: '0' }), /between 1 and 1000/);
});

test('development retains existing pilot behavior unless explicitly disabled', () => {
  assert.equal(loadRuntimeConfig({ NODE_ENV: 'development' }).mfiPilotEnabled, true);
  assert.equal(loadRuntimeConfig({ NODE_ENV: 'development', MFI_PILOT_ENABLED: '0' }).mfiPilotEnabled, false);
});
