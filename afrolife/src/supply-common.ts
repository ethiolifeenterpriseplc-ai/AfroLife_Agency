import { type Request, type Response, type RequestHandler } from 'express';
import { pool, HttpError, isPlatformAdminRole } from './core.js';

export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
export const AGENT = ['master_agent', 'field_agent'];
export const num = (x: unknown) => (x == null ? null : Number(x));
export const requireListingPlan: RequestHandler = (req, _res, next) => {
  if (isPlatformAdminRole(req.user?.role ?? '') || req.user?.role === 'customer') return next();
  if (req.user?.role === 'corporate_business_manager' || req.user?.role === 'property_owner') return next();
  if (AGENT.includes(req.user!.role)) return next();
  pool.query(
    `SELECT 1 FROM user_signups WHERE user_id = $1 AND status = 'approved' AND payment_status = 'paid'
       AND requested_plan IN ('pro','enterprise')`,
    [req.user!.id],
  ).then((result) => {
    if (!result.rowCount) return next(new HttpError(403, 'Property listing tools need an activated Pro or Enterprise plan.'));
    next();
  }, next);
};
