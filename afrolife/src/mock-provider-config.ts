export function nonProductionMockEnabled(env: Record<string, string | undefined>, key: string): boolean {
  return env.NODE_ENV !== 'production' && env[key] === 'mock';
}
