import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './http-error.js';

export interface InsuranceServiceAssertion {
  userId: string;
  role: string;
  legalName?: string;
  phone?: string;
  email?: string | null;
  kycStatus?: string;
  organizationId?: string;
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

export function verifyServiceAssertion(
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
  if (!decoded.userId || !decoded.role
    || (decoded.legalName !== undefined && typeof decoded.legalName !== 'string')
    || (decoded.phone !== undefined && typeof decoded.phone !== 'string')
    || (decoded.email !== undefined && decoded.email !== null && typeof decoded.email !== 'string')
    || (decoded.kycStatus !== undefined && !['uploaded', 'under_review', 'verified', 'rejected'].includes(decoded.kycStatus))
    || (decoded.organizationId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.organizationId))
    || !Number.isSafeInteger(decoded.issuedAt)
    || Math.abs(now - decoded.issuedAt) > 60_000) return null;
  return decoded;
}

export const verifyInsuranceServiceAssertion = verifyServiceAssertion;

export function createServiceGateway(options: {
  baseUrl: string;
  secret: string;
  servicePath: string;
  serviceName: string;
}): RequestHandler {
  if (options.secret.length < 32) {
    throw new Error(`Gateway secret must contain at least 32 characters for ${options.serviceName}`);
  }
  if (!options.servicePath.startsWith('/api/v1/') || options.servicePath.includes('..')
    || /[?#]/.test(options.servicePath)) {
    throw new Error(`Invalid service API path for ${options.serviceName}`);
  }
  const serviceUrl = new URL(options.baseUrl);
  if (serviceUrl.pathname !== '/' || serviceUrl.search || serviceUrl.hash
    || serviceUrl.username || serviceUrl.password) {
    throw new Error(`Service URL for ${options.serviceName} must be an origin without a path, query, credentials, or fragment`);
  }
  if (serviceUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(serviceUrl.hostname)) {
    throw new Error(`Service URL for ${options.serviceName} must use HTTPS outside localhost`);
  }

  return (req, res, next) => {
    const path = `${options.servicePath}${req.url}`;
    const issuedAt = Date.now();
    const assertion = Buffer.from(JSON.stringify({
      userId: req.user!.id,
      role: req.user!.role,
      ...(req.user!.legal_name ? { legalName: req.user!.legal_name } : {}),
      ...(req.user!.phone ? { phone: req.user!.phone } : {}),
      ...(req.user!.email !== undefined ? { email: req.user!.email } : {}),
      ...(req.user!.kyc_status ? { kycStatus: req.user!.kyc_status } : {}),
      ...(req.get('x-afrolife-edir-id') ? { organizationId: req.get('x-afrolife-edir-id') } : {}),
      issuedAt,
    })).toString('base64url');
    const bodyHash = requestBodyHash(req.body);
    const signed = signature(options.secret, assertion, req.method, path, bodyHash);
    const headers = new Headers({
      'x-afrolife-identity': assertion,
      'x-afrolife-signature': signed,
      'content-type': 'application/json',
    });
    const body = req.method === 'GET' || req.method === 'HEAD' || req.body === undefined
      ? undefined
      : JSON.stringify(req.body);
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
      console.error(`${options.serviceName} request failed`, error);
      next(new HttpError(502, `${options.serviceName} is unavailable`));
    });
  };
}

export function createInsuranceServiceGateway(options: { baseUrl: string; secret: string }): RequestHandler {
  return createServiceGateway({
    ...options,
    servicePath: '/api/v1/insurance/ledger',
    serviceName: 'Insurance ledger service',
  });
}

export function createPublicServiceGateway(options: {
  baseUrl: string;
  secret: string;
  servicePath: string;
  serviceName: string;
}): RequestHandler {
  if (options.secret.length < 32) throw new Error(`Gateway secret must contain at least 32 characters for ${options.serviceName}`);
  const serviceUrl = new URL(options.baseUrl);
  if (serviceUrl.pathname !== '/' || serviceUrl.search || serviceUrl.hash || serviceUrl.username || serviceUrl.password
    || (serviceUrl.protocol !== 'https:' && !['localhost','127.0.0.1','::1'].includes(serviceUrl.hostname))) {
    throw new Error(`Invalid service origin for ${options.serviceName}`);
  }
  return (req, res, next) => {
    const path = `${options.servicePath}/public/registration-applications`;
    const issuedAt = Date.now();
    const assertion = Buffer.from(JSON.stringify({
      userId: '00000000-0000-4000-8000-000000000000', role: 'public', issuedAt,
    })).toString('base64url');
    const bodyHash = requestBodyHash(req.body);
    const signed = signature(options.secret, assertion, req.method, path, bodyHash);
    fetch(new URL(path, serviceUrl), {
      method: 'POST',
      headers: {
        'x-afrolife-identity': assertion,
        'x-afrolife-signature': signed,
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10_000),
    }).then(async (upstream) => {
      const responseBody = await upstream.arrayBuffer();
      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      res.send(Buffer.from(responseBody));
    }).catch((error: unknown) => {
      console.error(`${options.serviceName} request failed`, error);
      next(new HttpError(502, `${options.serviceName} is unavailable`));
    });
  };
}
