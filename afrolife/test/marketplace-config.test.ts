import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_KYC_REQUIREMENTS,
  getKycRequirements,
  requiredKycDocuments,
  validateMarketplaceConfig,
} from '../src/marketplace-config.js';

test('every public account type has mandatory National ID KYC and workers also require police clearance', () => {
  const requirements = getKycRequirements(undefined);
  assert.deepEqual(requirements, DEFAULT_KYC_REQUIREMENTS);
  for (const accountType of ['worker', 'customer', 'agent', 'property_owner', 'property_vendor']) {
    assert.ok(requiredKycDocuments(requirements, accountType).includes('national_id'));
  }
  assert.ok(requiredKycDocuments(requirements, 'worker').includes('police_clearance'));
});

test('KYC configuration rejects missing account types, empty requirements, and missing required identity documents', () => {
  assert.throws(() => validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id', 'police_clearance'],
  }));
  assert.throws(() => validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id', 'police_clearance'],
    customer: ['national_id'],
    agent: ['national_id'],
    property_owner: ['national_id'],
    property_vendor: ['national_id', 'police_clearance'],
  }));
  assert.throws(() => validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id', 'police_clearance'],
    customer: [],
    agent: ['national_id'],
    property_owner: ['national_id'],
    property_vendor: ['national_id'],
  }));
  assert.throws(() => validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id', 'police_clearance'],
    customer: ['police_clearance'],
    agent: ['national_id'],
    property_owner: ['national_id'],
    property_vendor: ['national_id'],
  }));
  assert.throws(() => validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id'],
    customer: ['national_id'],
    agent: ['national_id'],
    property_owner: ['national_id'],
    property_vendor: ['national_id'],
  }));
});

test('admin configuration can add required documents and signup review uses the same validated list', () => {
  const requirements = validateMarketplaceConfig('users', 'kyc_requirements', {
    worker: ['national_id', 'police_clearance'],
    customer: ['national_id', 'police_clearance'],
    agent: ['national_id'],
    property_owner: ['national_id'],
    property_vendor: ['national_id'],
  });
  assert.deepEqual(requiredKycDocuments(requirements, 'customer'), ['national_id', 'police_clearance']);
  assert.deepEqual(requiredKycDocuments(requirements, 'property_vendor'), ['national_id']);
  assert.throws(() => requiredKycDocuments(requirements, 'unexpected'));
});
