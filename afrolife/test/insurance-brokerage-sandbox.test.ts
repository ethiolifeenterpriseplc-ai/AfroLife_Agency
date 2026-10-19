import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  buildInsuranceBrokerageDemoWorkflow,
  createInsuranceBrokerageSandboxRouter,
  isInsuranceBrokerageSandboxEnabled,
} from '../src/insurance-brokerage-sandbox.js';

test('Insurance brokerage demo workflow contains only synthetic lifecycle events', () => {
  const workflow = buildInsuranceBrokerageDemoWorkflow();
  assert.equal(workflow.length, 22);
  assert.equal(workflow[0][0], 'synthetic_intake');
  assert.equal(workflow[0][1].customer_data, 'NONE');
  assert.equal(workflow.find(([type]) => type === 'policy_issuance_simulated')?.[1].policy_state, 'SYNTHETIC_NOT_IN_FORCE');
  assert.equal(workflow.find(([type]) => type === 'premium_receipt_simulated')?.[1].money_moved, false);
  assert.equal(workflow.find(([type]) => type === 'insurer_submission_simulated')?.[1].transmission, 'NOT_SENT');
});

test('Insurance brokerage sandbox enablement cannot be turned on in production', () => {
  assert.equal(isInsuranceBrokerageSandboxEnabled({ NODE_ENV: 'production', INSURANCE_BROKERAGE_MODE: 'sandbox' }), false);
  assert.equal(isInsuranceBrokerageSandboxEnabled({ NODE_ENV: 'development', INSURANCE_BROKERAGE_MODE: 'sandbox' }), true);
  assert.equal(isInsuranceBrokerageSandboxEnabled({ NODE_ENV: 'test', INSURANCE_BROKERAGE_MODE: 'production' }), false);
});

test('brokerage sandbox denies live or missing-mode access before database use', async () => {
  const originalEnvironment = { nodeEnv: process.env.NODE_ENV, mode: process.env.INSURANCE_BROKERAGE_MODE };
  delete process.env.INSURANCE_BROKERAGE_MODE;
  process.env.NODE_ENV = 'test';
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001', role: 'super_admin' };
    next();
  });
  app.use('/brokerage', createInsuranceBrokerageSandboxRouter(async () => {
    throw new Error('Database must not be called when sandbox is disabled');
  }));
  app.use((error: Error & { status?: number }, _req, res, _next) =>
    res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/brokerage/status`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Insurance brokerage sandbox is disabled' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment.nodeEnv;
    if (originalEnvironment.mode === undefined) delete process.env.INSURANCE_BROKERAGE_MODE;
    else process.env.INSURANCE_BROKERAGE_MODE = originalEnvironment.mode;
  }
});

test('brokerage sandbox rejects anonymous access before checking sandbox mode', async () => {
  const originalMode = process.env.INSURANCE_BROKERAGE_MODE;
  process.env.INSURANCE_BROKERAGE_MODE = 'sandbox';
  const app = express();
  app.use('/brokerage', createInsuranceBrokerageSandboxRouter(async () => {
    throw new Error('Database must not be called for anonymous users');
  }));
  app.use((error: Error & { status?: number }, _req, res, _next) =>
    res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/brokerage/status`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalMode === undefined) delete process.env.INSURANCE_BROKERAGE_MODE;
    else process.env.INSURANCE_BROKERAGE_MODE = originalMode;
  }
});
