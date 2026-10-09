import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './http-error.js';

export interface InsuranceServiceAssertion {
  userId: string;
  role: string;
  issuedAt: number;
}

function requestBodyHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

function signature(secret: string, assertion: string, method: string, path: string, bodyHash: string): string {
  return createHmac('sha256', secret)
    .update(`${assertion}\n${method}\n${path}\n${bodyHash}`)
    .digest('hex');
}

export function verifyInsuranceServiceAssertion(
  secret: string,
  assertion: string,
  suppliedSignature: string,
  method: string,
  path: string,
  body: unknown,
  now = Date.now(),
): InsuranceServiceAssertion | null {
  if (secret.length < 32 || !/^[\da-f]{64}$/i.test(suppliedSignature)) return null;
  const expected = signature(secret, assertion, method, path, requestBodyHash(body));
  const actual = Buffer.from(suppliedSignature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return null;

  let decoded: InsuranceServiceAssertion;
  try {
    decoded = JSON.parse(Buffer.from(assertion, 'base64url').toString('utf8')) as InsuranceServiceAssertion;
  } catch {
    return null;
  }
  if (!decoded.userId || !decoded.role || !Number.isSafeInteger(decoded.issuedAt)
    || Math.abs(now - decoded.issuedAt) > 60_000) return null;
  return decoded;
}

export function createInsuranceServiceGateway(options: { baseUrl: string; secret: string }): RequestHandler {
  if (options.secret.length < 32) {
    throw new Error('INSURANCE_GATEWAY_SECRET must contain at least 32 characters when INSURANCE_SERVICE_URL is set');
  }
  const serviceUrl = new URL(options.baseUrl);
  if (serviceUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(serviceUrl.hostname)) {
    throw new Error('INSURANCE_SERVICE_URL must use HTTPS outside localhost');
  }

  return (req, res, next) => {
    const path = `/api/v1/insurance/ledger${req.url}`;
    const issuedAt = Date.now();
    const assertion = Buffer.from(JSON.stringify({
      userId: req.user!.id,
      role: req.user!.role,
      issuedAt,
    })).toString('base64url');
    const bodyHash = requestBodyHash(req.body);
    const signed = signature(options.secret, assertion, req.method, path, bodyHash);
    const headers = new Headers({
      'x-afrolife-identity': assertion,
      'x-afrolife-signature': signed,
      'content-type': 'application/json',
    });
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {});
    fetch(new URL(path, serviceUrl), {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    }).then(async (upstream) => {
      const responseBody = await upstream.arrayBuffer();
      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      res.send(Buffer.from(responseBody));
    }).catch((error: unknown) => {
      console.error('Insurance ledger service request failed', error);
      next(new HttpError(502, 'Insurance ledger service is unavailable'));
    });
  };
}
