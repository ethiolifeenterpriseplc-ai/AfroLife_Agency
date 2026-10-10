import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import express from 'express';
import {
  createInsuranceServiceGateway,
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

function sign(requestBody = body, requestMethod = method, requestPath = path) {
  const bodyHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
  return createHmac('sha256', secret)
    .update(`${assertion}\n${requestMethod}\n${requestPath}\n${bodyHash}`)
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
    headers: { 'content-type': 'application/json' },
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
