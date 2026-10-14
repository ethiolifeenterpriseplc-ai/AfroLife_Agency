import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import express from 'express';
import {
  createInsuranceRequestsServiceGateway,
  createInsuranceServiceGateway,
  createMfiServiceGateway,
  createServiceGateway,
  verifyInsuranceServiceAssertion,
  type InsuranceServiceAssertion,
} from '../src/insurance-service-gateway.js';

const secret = 'synthetic-test-gateway-secret-at-least-thirty-two-characters';
const method = 'POST';
const path = '/api/v1/insurance/ledger/journals';
const body = { source_reference: 'synthetic-1', amount: '20.00' };
const assertion = Buffer.from(JSON.stringify({
  userId: '3cd21265-95d9-40a4-9e68-95538d8d6650',
  role: 'finance_manager',
  issuedAt: 1_000_000,
})).toString('base64url');

function sign(requestBody = body, requestMethod = method, requestPath = path, idempotencyKey?: string) {
  const bodyHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
  const canonical = `${assertion}\n${requestMethod}\n${requestPath}\n${bodyHash}`;
  return createHmac('sha256', secret)
    .update(idempotencyKey ? `${canonical}\nidempotency-key:${idempotencyKey}` : canonical)
    .digest('hex');
}

test('insurance gateway assertion accepts a current signed identity and request', () => {
  assert.deepEqual(
    verifyInsuranceServiceAssertion(secret, assertion, sign(), method, path, body, 1_030_000),
    { userId: '3cd21265-95d9-40a4-9e68-95538d8d6650', role: 'finance_manager', issuedAt: 1_000_000 },
  );
});

test('insurance gateway assertion rejects tampering, replay, and weak secrets', () => {
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, sign(), 'GET', path, body, 1_030_000), null);
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, sign(), method, `${path}/changed`, body, 1_030_000), null);
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, sign(), method, path, { ...body, amount: '21.00' }, 1_030_000), null);
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, sign(), method, path, body, 1_061_000), null);
  assert.equal(verifyInsuranceServiceAssertion('weak', assertion, sign(), method, path, body, 1_030_000), null);
});

test('idempotency key is bound to the signed gateway request', () => {
  const key = '8f7dd367-3b74-4e8c-9c44-89f884979fb3';
  const signed = sign(body, method, path, key);
  assert.ok(verifyInsuranceServiceAssertion(secret, assertion, signed, method, path, body, 1_030_000, key));
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, signed, method, path, body, 1_030_000, '91af9759-4fc7-4cbd-8bab-b6d8f2ffef7e'), null);
  assert.equal(verifyInsuranceServiceAssertion(secret, assertion, signed, method, path, body, 1_030_000), null);
});

test('insurance gateway forwards a signed identity and relays the service response', async (context) => {
  const service = express();
  service.use(express.json());
  service.post('/api/v1/insurance/ledger/journals', (req, res) => {
    const identity = verifyInsuranceServiceAssertion(
      secret,
      req.get('x-afrolife-identity') ?? '',
      req.get('x-afrolife-signature') ?? '',
      req.method,
      req.originalUrl,
      req.body,
      Date.now(),
      req.get('idempotency-key') ?? null,
    );
    res.status(identity ? 201 : 401).json({ identity, received: req.body });
  });
  const serviceServer = service.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => serviceServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    serviceServer.close((error) => error ? reject(error) : resolve());
  }));

  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => {
    req.user = {
      id: '3cd21265-95d9-40a4-9e68-95538d8d6650',
      role: 'finance_manager',
      sessionId: '58de121e-43a0-48b0-817a-021d5aa00002',
      legal_name: 'Synthetic Edir Member',
      phone: '+251900000000',
      email: 'edir-member@example.invalid',
    };
    next();
  });
  const port = (serviceServer.address() as import('node:net').AddressInfo).port;
  api.use('/insurance/ledger', createInsuranceServiceGateway({
    baseUrl: `http://127.0.0.1:${port}`,
    secret,
  }));
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    apiServer.close((error) => error ? reject(error) : resolve());
  }));

  const apiPort = (apiServer.address() as import('node:net').AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${apiPort}/insurance/ledger/journals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': '8f7dd367-3b74-4e8c-9c44-89f884979fb3' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  const result = await response.json() as {
    identity: InsuranceServiceAssertion | null;
    received: typeof body;
  };
  assert.equal(result.identity?.userId, '3cd21265-95d9-40a4-9e68-95538d8d6650');
  assert.equal(result.identity?.role, 'finance_manager');
  assert.equal(result.identity?.legalName, 'Synthetic Edir Member');
  assert.equal(result.identity?.phone, '+251900000000');
  assert.equal(result.identity?.email, 'edir-member@example.invalid');
  assert.ok(result.identity && Math.abs(Date.now() - result.identity.issuedAt) < 60_000);
  assert.deepEqual(result.received, body);
});

test('Insurance information-request path is forwarded through its own signed service route', async (context) => {
  const requestPath = '/api/v1/insurance/requests/me';
  const service = express();
  service.get(requestPath, (req, res) => {
    const identity = verifyInsuranceServiceAssertion(
      secret,
      req.get('x-afrolife-identity') ?? '',
      req.get('x-afrolife-signature') ?? '',
      req.method,
      req.originalUrl,
      req.body,
    );
    res.status(identity ? 200 : 401).json({ identity: identity?.userId ?? null });
  });
  const serviceServer = service.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => serviceServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    serviceServer.close((error) => error ? reject(error) : resolve());
  }));

  const api = express();
  api.use((req, _res, next) => {
    req.user = { id: '3cd21265-95d9-40a4-9e68-95538d8d6650', role: 'customer' };
    next();
  });
  const servicePort = (serviceServer.address() as import('node:net').AddressInfo).port;
  api.use('/insurance/requests', createInsuranceRequestsServiceGateway({
    baseUrl: `http://127.0.0.1:${servicePort}`,
    secret,
  }));
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    apiServer.close((error) => error ? reject(error) : resolve());
  }));

  const apiPort = (apiServer.address() as import('node:net').AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${apiPort}/insurance/requests/me`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { identity: '3cd21265-95d9-40a4-9e68-95538d8d6650' });
});

test('SACCO/MFI gateway signs and forwards requests to the isolated service API', async (context) => {
  const service = express();
  service.use(express.json());
  service.post('/api/v1/mfi/member-portal', (req, res) => {
    const identity = verifyInsuranceServiceAssertion(
      secret,
      req.get('x-afrolife-identity') ?? '',
      req.get('x-afrolife-signature') ?? '',
      req.method,
      req.originalUrl,
      req.body,
    );
    res.status(identity ? 200 : 401).json({ identity, received: req.body });
  });
  const serviceServer = service.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => serviceServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    serviceServer.close((error) => error ? reject(error) : resolve());
  }));

  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => {
    req.user = {
      id: '3cd21265-95d9-40a4-9e68-95538d8d6650',
      role: 'finance_manager',
      sessionId: '58de121e-43a0-48b0-817a-021d5aa00002',
    };
    next();
  });
  const port = (serviceServer.address() as import('node:net').AddressInfo).port;
  api.use('/mfi', createMfiServiceGateway({ baseUrl: `http://127.0.0.1:${port}`, secret }));
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    apiServer.close((error) => error ? reject(error) : resolve());
  }));

  const apiPort = (apiServer.address() as import('node:net').AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${apiPort}/mfi/member-portal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as {
    identity: InsuranceServiceAssertion | null;
    received: typeof body;
  };
  assert.equal(result.identity?.userId, '3cd21265-95d9-40a4-9e68-95538d8d6650');
  assert.equal(result.identity?.role, 'finance_manager');
  assert.deepEqual(result.received, body);
});

test('domain gateway signs the original path under a mounted service prefix', async (context) => {
  const service = express();
  service.use(express.json());
  service.post('/api/v1/workers/:id', (req, res) => {
    const identity = verifyInsuranceServiceAssertion(
      secret,
      req.get('x-afrolife-identity') ?? '',
      req.get('x-afrolife-signature') ?? '',
      req.method,
      req.originalUrl,
      req.body,
    );
    res.status(identity ? 200 : 401).json({ identity, path: req.originalUrl });
  });
  const serviceServer = service.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => serviceServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    serviceServer.close((error) => error ? reject(error) : resolve());
  }));

  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => {
    req.user = {
      id: '3cd21265-95d9-40a4-9e68-95538d8d6650',
      role: 'field_agent',
    };
    next();
  });
  const port = (serviceServer.address() as import('node:net').AddressInfo).port;
  api.use('/workers', createServiceGateway({
    baseUrl: `http://127.0.0.1:${port}`,
    secret,
    servicePath: '/api/v1',
    serviceName: 'Workforce Management service',
    includeBaseUrl: true,
  }));
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    apiServer.close((error) => error ? reject(error) : resolve());
  }));

  const apiPort = (apiServer.address() as import('node:net').AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${apiPort}/workers/123?view=summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { identity: InsuranceServiceAssertion | null; path: string };
  assert.equal(result.identity?.userId, '3cd21265-95d9-40a4-9e68-95538d8d6650');
  assert.equal(result.path, '/api/v1/workers/123?view=summary');
});

test('SACCO/MFI gateway signs and preserves private document upload bytes', async (context) => {
  const document = Buffer.from('%PDF-1.7 synthetic fixture');
  const service = express();
  service.use(express.json());
  service.post('/api/v1/mfi/documents', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
    const identity = verifyInsuranceServiceAssertion(
      secret,
      req.get('x-afrolife-identity') ?? '',
      req.get('x-afrolife-signature') ?? '',
      req.method,
      req.originalUrl,
      req.body,
    );
    res.status(identity ? 201 : 401).json({
      identity,
      document: Buffer.isBuffer(req.body) ? req.body.toString('base64') : null,
    });
  });
  const serviceServer = service.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => serviceServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    serviceServer.close((error) => error ? reject(error) : resolve());
  }));

  const api = express();
  api.post('/mfi/documents', express.raw({ type: () => true, limit: '10mb' }));
  api.use((req, _res, next) => {
    req.user = {
      id: '3cd21265-95d9-40a4-9e68-95538d8d6650',
      role: 'compliance',
    };
    next();
  });
  const port = (serviceServer.address() as import('node:net').AddressInfo).port;
  api.use('/mfi', createMfiServiceGateway({ baseUrl: `http://127.0.0.1:${port}`, secret }));
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    apiServer.close((error) => error ? reject(error) : resolve());
  }));

  const apiPort = (apiServer.address() as import('node:net').AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${apiPort}/mfi/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: new Uint8Array(document),
  });
  assert.equal(response.status, 201);
  const result = await response.json() as { identity: InsuranceServiceAssertion | null; document: string | null };
  assert.equal(result.identity?.role, 'compliance');
  assert.equal(result.document, document.toString('base64'));
});
