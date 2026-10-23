import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  workforceDashboardMetrics,
  staffingDashboardMetrics,
  propertyDashboardMetrics,
  propertyOwnerDashboardMetrics,
  agentDashboardMetrics,
} from '../public/dashboard-metrics.js';
import {
  canChangeServer,
  DEFAULT_NATIVE_API_ORIGIN,
  edirApplicationDocumentPath,
  missingSignupDocuments,
  nativeApiOrigin,
  signupRequiredDocuments,
} from '../public/registration-flows.js';
import {
  normalizeMySubscriptions,
  normalizeSubscriptionCatalog,
  PUBLIC_SUBSCRIPTION_SERVICES,
  subscriptionRequestPayload,
} from '../public/subscriptions.js';
import { propertyOfferTerms } from '../public/property-offers.js';
import { marketplaceListingPayload } from '../public/marketplace-form.js';

test('signup uploads enforce configured KYC documents and limit server changes to super admins', () => {
  const options = { kyc_requirements: { customer: ['national_id'], worker: ['national_id', 'police_clearance'] } };
  assert.deepEqual(signupRequiredDocuments(options, 'worker'), ['national_id', 'police_clearance']);
  assert.equal(signupRequiredDocuments(options, 'unknown'), null);
  assert.deepEqual(missingSignupDocuments(['national_id', 'police_clearance'], (kind) =>
    kind === 'national_id' ? { name: 'id.png' } : null), ['police_clearance']);
  assert.equal(canChangeServer('super_admin'), true);
  assert.equal(canChangeServer('finance'), false);
  assert.equal(DEFAULT_NATIVE_API_ORIGIN, 'https://integrating-devices-executive-springs.trycloudflare.com');
  assert.equal(nativeApiOrigin(null), DEFAULT_NATIVE_API_ORIGIN);
  assert.equal(nativeApiOrigin(' https://api.example.com '), 'https://api.example.com');
  assert.equal(nativeApiOrigin(' '), DEFAULT_NATIVE_API_ORIGIN);
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
  assert.deepEqual(propertyOwnerDashboardMetrics(
    [{ units: [{ occupancy: 'occupied' }, { occupancy: 'vacant' }] }],
    [{ status: 'active', rent_reconciled: '1200.00', rent_pending_reconciliation: '200.00' }],
    [{ status: 'open' }, { status: 'done' }],
  ), {
    properties: 1,
    units: 2,
    occupiedUnits: 1,
    vacantUnits: 1,
    activeLeases: 1,
    rentReconciled: 1200,
    rentPendingReconciliation: 200,
    openMaintenance: 1,
  });
  assert.deepEqual(agentDashboardMetrics(
    [{ status: 'new' }, { status: 'converted' }],
    [{ verification: 'pending' }, { verification: 'verified' }],
    [{ status: 'open' }, { status: 'matched' }],
    [
      { status: 'qualified', amount: '50' },
      { status: 'approved', amount: '125.25', held_status: 'held', held_amount: '25.25' },
    ],
  ), {
    leads: 2,
    followUpLeads: 1,
    workers: 2,
    workersAwaitingVerification: 1,
    openStaffingRequests: 1,
    commissionsAwaitingReview: 1,
    approvedCommissionAmount: 125.25,
    heldCommissionAmount: 25.25,
  });
});

test('property listing terms expose sale prices and the lowest available unit rent', () => {
  assert.deepEqual(propertyOfferTerms({
    listing_mode: 'sale',
    sale_price: '2500000',
    units: [{ rent: 12000 }],
  }), [{ type: 'sale', amount: 2500000 }]);
  assert.deepEqual(propertyOfferTerms({
    listing_mode: 'rent',
    rent_period: 'month',
    units: [{ rent: 18000 }, { rent: 12500 }, { rent: null }],
  }), [{ type: 'rent', amount: 12500, period: 'month' }]);
  assert.deepEqual(propertyOfferTerms({
    listing_mode: 'sale_or_rent',
    sale_price: 3000000,
    units: [{ rent: 15000 }],
  }), [
    { type: 'sale', amount: 3000000 },
    { type: 'rent', amount: 15000, period: 'month' },
  ]);
});

test('marketplace payloads omit rental periods unless the listing is a rental', () => {
  const sale = marketplaceListingPayload({
    domain: 'products',
    category_key: 'electronics',
    title: 'Phone',
    description: 'A working phone for sale.',
    transaction_mode: 'sale',
    price: '12000',
    rent_period: 'month',
    condition: 'good',
    territory_id: '4',
    seller_user_id: '',
  });
  assert.equal(sale.price, 12000);
  assert.equal(sale.territory_id, 4);
  assert.equal('rent_period' in sale, false);
  assert.equal('seller_user_id' in sale, false);
  const rental = marketplaceListingPayload({
    domain: 'equipment',
    category_key: 'tools',
    title: 'Generator',
    description: 'Generator available for rent.',
    transaction_mode: 'rental',
    rent_period: 'week',
    territory_id: '7',
  });
  assert.equal(rental.rent_period, 'week');
});

test('checkboxes and radios override full-width text-field sizing', () => {
  const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /input\[type="checkbox"\][\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;[\s\S]*?min-height:\s*18px;[\s\S]*?padding:\s*0;/);
  assert.match(styles, /input\[type="radio"\]\s*\{\s*border-radius:\s*50%;\s*\}/);
});

test('dynamically created labels retain their source text when the locale changes', async () => {
  const descriptors = new Map(['localStorage', 'navigator', 'NodeFilter', 'document'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  let changeLocale;
  const selector = {
    value: 'en',
    addEventListener(_event, callback) { changeLocale = callback; },
  };
  const textNode = { nodeValue: '', parentElement: { tagName: 'SPAN' } };
  const textNodes = [textNode];
  const root = { querySelectorAll: () => [] };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'en', setItem: () => {} } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'] } });
  Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: { SHOW_TEXT: 4 } });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: root,
      documentElement: {},
      querySelector: () => selector,
      createTreeWalker: () => {
        let index = 0;
        return { nextNode: () => textNodes[index++] ?? null };
      },
    },
  });
  try {
    const { initializeLocale, setLocalizedNodeText, translateContent } = await import(`../public/i18n.js?locale-test=${Date.now()}`);
    setLocalizedNodeText(textNode, 'Create a listing');
    initializeLocale(() => {});
    selector.value = 'am';
    changeLocale();
    assert.equal(textNode.nodeValue, 'ዝርዝር ይፍጠሩ');
    const accountingText = { nodeValue: 'Chart of accounts', parentElement: { tagName: 'H2' } };
    textNodes.push(accountingText);
    translateContent(root);
    assert.equal(accountingText.nodeValue, 'የሂሳብ መዝገብ ዝርዝር');
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
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
