export function buildEdirServiceMigration(source: string, runtimeRole: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
    throw new Error('EDIR_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
  }
  if (!source.includes('"{{role}}"')) {
    throw new Error('Edir service migration is missing its runtime-role grant placeholder');
  }
  return source.replaceAll('"{{role}}"', `"${runtimeRole}"`);
}
