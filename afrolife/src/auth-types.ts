export interface AuthUser { id: string; role: string; rst?: string }

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}
