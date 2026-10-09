import type { RequestHandler } from 'express';
import { verifyInsuranceServiceAssertion } from '../../src/insurance-service-gateway.js';

const secret = process.env.INSURANCE_GATEWAY_SECRET ?? '';
if (secret.length < 32) {
  throw new Error('INSURANCE_GATEWAY_SECRET must contain at least 32 characters for the insurance-ledger service');
}

export const authenticateGateway: RequestHandler = (req, res, next) => {
  const assertion = req.get('x-afrolife-identity') ?? '';
  const signature = req.get('x-afrolife-signature') ?? '';
  const user = verifyInsuranceServiceAssertion(
    secret, assertion, signature, req.method, req.originalUrl, req.body,
  );
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired gateway identity assertion' });
    return;
  }
  req.user = { id: user.userId, role: user.role };
  next();
};
