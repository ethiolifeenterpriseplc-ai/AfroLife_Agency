import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workforceDashboardMetrics,
  staffingDashboardMetrics,
  propertyDashboardMetrics,
} from '../public/dashboard-metrics.js';
import {
  canChangeServer,
  DEFAULT_NATIVE_API_ORIGIN,
  edirApplicationDocumentPath,
  missingSignupDocuments,
  signupRequiredDocuments,
} from '../public/registration-flows.js';
import {
  normalizeMySubscriptions,
  normalizeSubscriptionCatalog,
  PUBLIC_SUBSCRIPTION_SERVICES,
  subscriptionRequestPayload,
} from '../public/subscriptions.js';

test('signup uploads enforce configured KYC documents and limit server changes to super admins', () => {
  const options = { kyc_requirements: { customer: ['national_id'], worker: ['national_id', 'police_clearance'] } };
  assert.deepEqual(signupRequiredDocuments(options, 'worker'), ['national_id', 'police_clearance']);
  assert.equal(signupRequiredDocuments(options, 'unknown'), null);
  assert.deepEqual(missingSignupDocuments(['national_id', 'police_clearance'], (kind) =>
    kind === 'national_id' ? { name: 'id.png' } : null), ['police_clearance']);
  assert.equal(canChangeServer('super_admin'), true);
  assert.equal(canChangeServer('finance'), false);
  assert.equal(DEFAULT_NATIVE_API_ORIGIN, 'https://integrating-devices-executive-springs.trycloudflare.com');
  assert.equal(edirApplicationDocumentPath('application/1', 'legal_registration'),
    '/edir/public/registration-applications/application%2F1/documents/legal_registration');
});

test('mini-app dashboards summarize only supplied, authorized panel data', () => {
  assert.deepEqual(workforceDashboardMetrics([{ verification: 'verified' }, { verification: 'pending' }]), {
    total: 2,
    byVerification: [{ label: 'verified', count: 1 }, { label: 'pending', count: 1 }],
  });
  assert.deepEqual(staffingDashboardMetrics([{ status: 'open' }, { status: 'open' }]), {
    total: 2,
    byStatus: [{ label: 'open', count: 2 }],
  });
  assert.deepEqual(propertyDashboardMetrics([
    { status: 'active', units: [{}, {}] },
    { status: 'draft', units: [] },
  ]), {
    totalListings: 2,
    totalUnits: 2,
    byStatus: [{ label: 'active', count: 1 }, { label: 'draft', count: 1 }],
  });
});

test('public subscription catalog has only the eight approved ETB 1,000 services', () => {
  assert.deepEqual(PUBLIC_SUBSCRIPTION_SERVICES.map(({ key }) => key), [
    'property_management', 'workforce_management', 'super_agent', 'edir',
    'insurance_brokerage', 'agent', 'landlord', 'seller',
  ]);
  assert.ok(PUBLIC_SUBSCRIPTION_SERVICES.every(({ monthlyEtb }) => monthlyEtb === 1000));
  assert.equal(PUBLIC_SUBSCRIPTION_SERVICES.some(({ key }) => key === 'accounting'), false);
  assert.deepEqual(
    normalizeSubscriptionCatalog({ services: PUBLIC_SUBSCRIPTION_SERVICES }).map(({ key }) => key),
    PUBLIC_SUBSCRIPTION_SERVICES.map(({ key }) => key),
  );
  assert.deepEqual(normalizeMySubscriptions({ requests: [{ id: 'one' }] }), [{ id: 'one' }]);
  assert.deepEqual(subscriptionRequestPayload(['edir', 'edir', 'agent']), { services: ['edir', 'agent'] });
});
