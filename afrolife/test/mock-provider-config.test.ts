import test from 'node:test';
import assert from 'node:assert/strict';
import { nonProductionMockEnabled } from '../src/mock-provider-config.js';

test('mock financial providers require an explicit mock mode outside production', () => {
  for (const key of ['MARKETPLACE_PAYMENT_MODE','ACCOUNTING_TAX_PROVIDER_MODE','ACCOUNTING_BILLING_PROVIDER_MODE']) {
    assert.equal(nonProductionMockEnabled({ NODE_ENV: 'production', [key]: 'mock' }, key), false);
    assert.equal(nonProductionMockEnabled({ NODE_ENV: 'development', [key]: 'mock' }, key), true);
    assert.equal(nonProductionMockEnabled({ NODE_ENV: 'development', [key]: 'live' }, key), false);
    assert.equal(nonProductionMockEnabled({ NODE_ENV: 'development' }, key), false);
  }
});
