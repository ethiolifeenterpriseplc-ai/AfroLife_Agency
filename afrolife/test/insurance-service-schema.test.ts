import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildInsuranceServiceMigration } from '../services/insurance-ledger/schema.js';

test('service migration isolates actor identity from the central users database', async () => {
  const source = await readFile(new URL('../migrations/026_insurance_ledger.sql', import.meta.url), 'utf8');
  const migration = buildInsuranceServiceMigration(source, 'insurance_runtime');
  assert.match(migration, /CREATE OR REPLACE FUNCTION app_user_id/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION app_role/);
  assert.match(migration, /ALTER TABLE insurance_ledger_journals FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_journals TO "insurance_runtime"/);
  assert.doesNotMatch(migration, /REFERENCES\s+users\s*\(/i);
});

test('hierarchical Insurance migration replaces runtime-role grants', async () => {
  const source = await readFile(new URL('../migrations/031_hierarchical_edir_insurance.sql', import.meta.url), 'utf8');
  const migration = buildInsuranceServiceMigration(source, 'insurance_runtime');
  assert.match(migration, /GRANT EXECUTE ON FUNCTION app_edir_id\(\) TO "insurance_runtime"/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_staff TO "insurance_runtime"/);
  assert.doesNotMatch(migration, /\{\{role\}\}/);
});

test('brokerage foundation migration is packaged by the Insurance service image', async () => {
  const source = await readFile(
    new URL('../services/insurance-ledger/033_brokerage_foundation.sql', import.meta.url),
    'utf8',
  );
  const migration = buildInsuranceServiceMigration(source, 'insurance_runtime');
  const dockerfile = await readFile(new URL('../services/insurance-ledger/Dockerfile', import.meta.url), 'utf8');
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON insurance_brokerage_tenants TO "insurance_runtime"/);
  assert.doesNotMatch(migration, /\{\{role\}\}/);
  assert.match(dockerfile, /COPY services\/insurance-ledger\/033_brokerage_foundation\.sql/);
  assert.match(dockerfile, /COPY --from=build .*services\/insurance-ledger\/033_brokerage_foundation\.sql/);
});

test('service migration rejects an unsafe runtime role identifier', () => {
  assert.throws(() => buildInsuranceServiceMigration('CREATE TABLE x (id int);', 'runtime; DROP TABLE users'));
});
