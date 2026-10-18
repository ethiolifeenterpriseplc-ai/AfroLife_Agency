import type { RequestHandler } from 'express';
import { verifyServiceAssertion } from '../../src/insurance-service-gateway.js';

const gatewaySecret = process.env.GLOBAL_BI_GATEWAY_SECRET ?? '';
if (gatewaySecret.length < 32) throw new Error('GLOBAL_BI_GATEWAY_SECRET must contain at least 32 characters');

export const authenticateGlobalBi: RequestHandler = (req, res, next) => {
  const assertion = req.get('x-afrolife-identity') ?? '';
  const signature = req.get('x-afrolife-signature') ?? '';
  const identity = verifyServiceAssertion(
    gatewaySecret,
    assertion,
    signature,
    req.method,
    req.originalUrl,
    req.body,
    Date.now(),
    req.get('idempotency-key') ?? null,
  );
  if (!identity) {
    res.status(401).json({ error: 'Invalid or expired Global BI gateway identity' });
    return;
  }
  req.user = { id: identity.userId, role: identity.role };
  next();
};
