import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { verifyInsuranceServiceAssertion } from '../src/insurance-service-gateway.js';

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
