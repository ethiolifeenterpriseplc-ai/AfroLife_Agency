export function buildInsuranceServiceMigration(source: string, runtimeRole: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
    throw new Error('INSURANCE_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
  }
  const migration = source.replaceAll(' REFERENCES users(id)', '');
  if (/REFERENCES\s+users\s*\(/i.test(migration)) {
    throw new Error('Insurance ledger migration could not be isolated from the central users table');
  }
  const helpers = `
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN nullif(current_setting('app.role', true), '') = 'global_admin' THEN 'super_admin'
    ELSE coalesce(nullif(current_setting('app.role', true), ''), '')
  END
$$;
`;
  const grants = [
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_accounts TO "{{role}}"',
    'GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_journals TO "{{role}}"',
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_lines TO "{{role}}"',
    'GRANT SELECT, INSERT ON TABLE insurance_ledger_audit TO "{{role}}"',
    'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_lines_id_seq TO "{{role}}"',
    'GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_audit_id_seq TO "{{role}}"',
  ].map((grant) => grant.replaceAll('{{role}}', runtimeRole)).join(';\n');
  const hierarchyMigration = migration
    .replaceAll('"{{role}}"', `"${runtimeRole}"`);
  return `${helpers}\n${hierarchyMigration}\n${grants}`;
}
