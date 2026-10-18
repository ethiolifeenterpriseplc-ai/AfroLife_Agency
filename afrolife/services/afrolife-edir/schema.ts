export function buildEdirServiceMigration(source: string, runtimeRole: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
    throw new Error('EDIR_RUNTIME_DB_ROLE must be set to the restricted service runtime role name');
  }
  return source.replaceAll('"{{role}}"', `"${runtimeRole}"`);
}
