export interface AuthUser {
  id: string;
  role: string;
  sessionId?: string;
  rst?: string;
  legal_name?: string;
  phone?: string;
  email?: string | null;
  kyc_status?: string;
  edir_id?: string;
}

export function isPlatformAdminRole(role: string): boolean {
  return role === 'super_admin' || role === 'global_admin';
}

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}
