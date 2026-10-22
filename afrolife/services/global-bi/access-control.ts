import { HttpError } from '../../src/http-error.js';

export function assertGlobalBiAccess(role: string): void {
  if (role !== 'global_admin') throw new HttpError(403, 'Global BI is restricted to Global Admin.');
}
