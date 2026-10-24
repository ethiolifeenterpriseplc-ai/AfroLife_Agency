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

test('worker portal exposes workforce self-service and ordered offline clock sync', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const i18n = readFileSync(new URL('../public/i18n.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/workforce-operations.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../migrations/095_workforce_workflows.sql', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(app, /\/workforce\/shifts\/mine/);
  assert.match(app, /\/workforce\/leave\/mine/);
  assert.match(app, /workforce-clock-queue:/);
  assert.match(app, /Clock-event sync stopped to preserve event order/);
  assert.match(app, /body: JSON\.stringify\(\{\s*event_type: event\.event_type/);
  assert.match(app, /My shifts and attendance/);
  assert.match(app, /Leave and availability/);
  assert.match(i18n, /'My shifts and attendance',\s*'[^']+',\s*'[^']+',\s*'[^']+'/);
  assert.match(api, /workforceOperations\.post\('\/workforce\/shifts\/:id\/clock-events'/);
  assert.match(migration, /UNIQUE \(recorded_by, client_event_id\)/);
  assert.match(api, /workforceOperations\.post\('\/workforce\/shifts\/:id\/approve-time'/);
  assert.match(migration, /CREATE TABLE workforce_payroll_export_payloads/);
  assert.match(migration, /workforce_payroll_export_payloads_manager_all/);
  assert.match(migration, /workforce_clock_events_immutable/);
  const exportMetadata = migration.split('CREATE TABLE workforce_payroll_exports')[1]
    .split('CREATE TABLE workforce_payroll_export_items')[0];
  assert.doesNotMatch(exportMetadata, /encrypted_payload/);
  assert.match(migration, /UPDATE workforce_shifts SET status='cancelled'[\s\S]*?UPDATE staffing_engagements SET status='completed'/);
  assert.match(server, /api\.use\('\/workforce', requireMiniAppAccess\('workers'\)\)/);
  assert.match(server, /api\.use\('\/workforce', workerManagementGateway\)/);
});

test('account security exposes session listing and session revocation', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/admin.ts', import.meta.url), 'utf8');
  assert.match(app, /load\('authSessions', '\/auth\/sessions'\)/);
  assert.match(app, /Signed-in sessions/);
  assert.match(app, /data-action|revoke-session/);
  assert.match(admin, /adminRouter\.get\('\/auth\/sessions'/);
  assert.match(admin, /adminRouter\.delete\('\/auth\/sessions\/:sessionId'/);
  assert.match(admin, /WHERE id=\$1 AND user_id=\$2 AND revoked_at IS NULL AND expires_at>now\(\)/);
  assert.match(admin, /session_revoked/);
});

test('V11 support journey exposes case intake while protecting sensitive details with independent approval', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ops = readFileSync(new URL('../src/ops.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../migrations/097_support_cases.sql', import.meta.url), 'utf8');
  const appealMigration = readFileSync(new URL('../migrations/098_support_case_appeal_review.sql', import.meta.url), 'utf8');
  assert.match(html,/data-panel="support"/);
  assert.match(app,/support-case-create/);
  assert.match(app,/support-access-request/);
  assert.match(app,/support-access-decision/);
  assert.match(app,/support-case-resolve/);
  assert.match(app,/supportAppealQueue/);
  assert.match(app,/support-appeal-review/);
  assert.match(ops,/ops\.post\('\/support\/cases'/);
  assert.match(ops,/ops\.get\('\/support\/appeals\/queue'/);
  assert.match(ops,/ops\.post\('\/support\/cases\/:id\/appeal-review'/);
  assert.match(ops,/ops\.post\('\/support\/cases\/:id\/access-requests'/);
  assert.match(ops,/ops\.post\('\/support\/access-requests\/:id\/decision'/);
  assert.match(ops,/agent complaint/i);
  assert.match(ops,/Financial and legal corrections must reference their formal workflow/);
  assert.match(migration,/support_cases_owner_read/);
  assert.match(migration,/support_case_access_review/);
  assert.match(appealMigration,/support_case_appeal_reviews_immutable/);
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
    const workerPaymentText = { nodeValue: 'Worker payment records', parentElement: { tagName: 'H2' } };
    textNodes.push(workerPaymentText);
    translateContent(root);
    assert.equal(accountingText.nodeValue, 'የሂሳብ መዝገብ ዝርዝር');
    assert.equal(workerPaymentText.nodeValue, 'የሠራተኛ ክፍያ መዝገቦች');
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
