import '../src/env.js';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import pg from 'pg';
import { authenticateGateway } from '../services/afrolife-edir/auth.js';
import { verifyServiceAssertion } from '../src/insurance-service-gateway.js';
import { edirRouter } from '../services/afrolife-edir/router.js';
import { assertServiceDatabaseSafety, pool } from '../services/afrolife-edir/db.js';

const databaseUrl = new URL(process.env.EDIR_DATABASE_URL ?? '');
assert(['127.0.0.1','localhost','[::1]'].includes(databaseUrl.hostname), 'Edir UAT database must be local');
assert.equal(databaseUrl.port, '5433', 'Edir UAT must use the isolated local PostgreSQL port');
assert.equal(decodeURIComponent(databaseUrl.pathname.slice(1)), 'afrolife_edir_uat', 'Edir UAT must use its dedicated database');
assert.equal(decodeURIComponent(databaseUrl.username), 'afrolife_edir_uat_app', 'Edir UAT must use its restricted runtime role');
await assertServiceDatabaseSafety();

const secret = process.env.EDIR_GATEWAY_SECRET ?? '';
assert(secret.length >= 32, 'Local Edir gateway secret is missing');
const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch (error) { next(error); }
});
app.post('/api/v1/edir/credit/documents/:documentType', express.raw({ type: () => true, limit: '10mb' }));
app.use('/api/v1/edir', authenticateGateway, edirRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const candidate = error as { status?: number; message?: string; flatten?: () => unknown };
  const status = candidate.status ?? (typeof candidate.flatten === 'function' ? 400 : 500);
  if (status >= 500) console.error('Local Edir UAT request failed:', error);
  res.status(status).json({ error: status === 500 ? 'Internal error' : candidate.message, ...(typeof candidate.flatten === 'function' ? { details: candidate.flatten() } : {}) });
});

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/v1/edir`;
const memberId = randomUUID();
const outsiderId = randomUUID();
const adminId = randomUUID();
const tenantId = '00000000-0000-4000-8000-000000000002';

type Actor = { userId: string; role: string; legalName?: string; phone?: string; email?: string | null; kycStatus?: string; organizationId: string };
function sign(actor: Actor, method: string, path: string, body: unknown) {
  const assertion = Buffer.from(JSON.stringify({ ...actor, issuedAt: Date.now() })).toString('base64url');
  const signedBody = body === undefined ? {} : body;
  const bodyHash = createHash('sha256').update(JSON.stringify(signedBody ?? null)).digest('hex');
  const signature = createHmac('sha256', secret).update(`${assertion}\n${method}\n${path}\n${bodyHash}`).digest('hex');
  assert(verifyServiceAssertion(secret, assertion, signature, method, path, signedBody), 'Locally generated UAT gateway assertion is valid');
  return { 'x-afrolife-identity': assertion, 'x-afrolife-signature': signature, ...(body === undefined ? {} : { 'content-type': 'application/json' }) };
}

async function call<T>(actor: Actor, method: string, path: string, body?: unknown, expectedStatus = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: sign(actor, method, `/api/v1/edir${path}`, body),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) as T : null;
  assert.equal(response.status, expectedStatus, `${method} ${path}: expected ${expectedStatus}, got ${response.status}: ${text}`);
  return result as T;
}

async function uploadNationalId(actor: Actor, file: Buffer, expectedStatus = 201) {
  const path = '/credit/documents/national_id';
  const headers = sign(actor, 'POST', `/api/v1/edir${path}`, file);
  headers['content-type'] = 'application/octet-stream';
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: new Uint8Array(file) });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `POST ${path}: expected ${expectedStatus}, got ${response.status}: ${text}`);
  return text ? JSON.parse(text) as { id: string; status: string; mime: string; size_bytes: number } : null;
}

const member: Actor = { userId: memberId, role: 'worker', legalName: 'Synthetic UAT Member', phone: `+251900${memberId.replaceAll('-','').slice(0,6)}`, email: null, kycStatus: 'verified', organizationId: tenantId };
const outsider: Actor = { userId: outsiderId, role: 'worker', legalName: 'Synthetic UAT Outsider', phone: `+251901${outsiderId.replaceAll('-','').slice(0,6)}`, kycStatus: 'verified', organizationId: tenantId };
const admin: Actor = { userId: adminId, role: 'super_admin', legalName: 'Synthetic UAT Edir Admin', organizationId: tenantId };
const secondReviewer: Actor = { userId: randomUUID(), role: 'compliance', legalName: 'Synthetic UAT Independent Reviewer', organizationId: tenantId };
const kycReviewer: Actor = { userId: randomUUID(), role: 'compliance', legalName: 'Synthetic UAT Separate KYC Reviewer', organizationId: tenantId };
const creditOfficer: Actor = { userId: randomUUID(), role: 'credit_manager', legalName: 'Synthetic UAT Credit Assessor', organizationId: tenantId };
const creditManager: Actor = { userId: randomUUID(), role: 'credit_manager', legalName: 'Synthetic UAT Credit Approver', organizationId: tenantId };
const treasurer: Actor = { userId: randomUUID(), role: 'treasurer', legalName: 'Synthetic UAT Servicing Reviewer', organizationId: tenantId };
const passed: string[] = [];

try {
  const enrollment = await call<{ id: string; status: string }>(member, 'POST', '/memberships', { accept_nonfinancial_terms: true }, 201);
  assert.equal(enrollment.status, 'pending');
  passed.push('Edir membership enrollment creates a pending request after verified KYC');

  await call(member, 'POST', `/memberships/${enrollment.id}/review`, { decision: 'active', reason: 'Synthetic self-review must be denied' }, 403);
  const ownPending = await call<{ membership: { status: string } }>(member, 'GET', '/me');
  assert.equal(ownPending.membership.status, 'pending');
  passed.push('Member cannot self-approve and the rejected attempt leaves membership pending');

  const approval = await call<{ id: string; status: string }>(admin, 'POST', `/memberships/${enrollment.id}/review`, { decision: 'active', reason: 'Independent synthetic UAT approval' });
  assert.equal(approval.status, 'active');
  const activeProfile = await call<{ membership: { id: string; status: string } }>(member, 'GET', '/me');
  assert.equal(activeProfile.membership?.id, enrollment.id);
  assert.equal(activeProfile.membership?.status, 'active');
  passed.push('Different authorized administrator activates the synthetic membership');

  await call(admin, 'POST', '/staff', { user_id: secondReviewer.userId, role: 'compliance' }, 201);
  await call(admin, 'POST', '/staff', { user_id: kycReviewer.userId, role: 'compliance' }, 201);
  await call(admin, 'POST', '/staff', { user_id: creditOfficer.userId, role: 'credit_manager' }, 201);
  await call(admin, 'POST', '/staff', { user_id: creditManager.userId, role: 'credit_manager' }, 201);
  await call(admin, 'POST', '/staff', { user_id: treasurer.userId, role: 'treasurer' }, 201);
  await call(member, 'POST', '/credit/applications', {
    requested_principal: '1000', requested_term_months: 2, purpose: 'Synthetic UAT pending KYC gate',
    monthly_income: '20000', monthly_expenses: '1000', monthly_debt: '0', idempotency_key: randomUUID(),
  }, 409);
  passed.push('Credit request is blocked while member KYC is pending');

  await call(member, 'POST', '/credit/applications', {
    requested_principal: '1000', requested_term_months: 2, purpose: 'Synthetic UAT pending KYC gate',
    monthly_income: '20000', monthly_expenses: '1000', monthly_debt: '0', idempotency_key: randomUUID(),
  }, 409);
  passed.push('Loan application is blocked while member KYC is pending');

  const invalidDocument = Buffer.from('not a real identity document');
  await uploadNationalId(member, invalidDocument, 415);
  const minimalPdf = Buffer.from('%PDF-1.4\n% Synthetic UAT document\n%%EOF\n');
  const uploadedDocument = await uploadNationalId(member, minimalPdf);
  assert.equal(uploadedDocument?.status, 'uploaded');
  assert.equal(uploadedDocument?.mime, 'application/pdf');
  await call(member, 'POST', `/credit/members/${enrollment.id}/documents/${uploadedDocument!.id}/review`, {
    decision: 'verified', reason: 'Uploader must not approve their own synthetic document',
  }, 403);
  const verifiedDocument = await call<{ id: string; status: string; reviewed_by: string }>(secondReviewer,
    'POST', `/credit/members/${enrollment.id}/documents/${uploadedDocument!.id}/review`, {
      decision: 'verified', reason: 'Synthetic UAT document review by independent compliance actor',
    });
  assert.equal(verifiedDocument.status, 'verified');
  assert.equal(verifiedDocument.reviewed_by, secondReviewer.userId);
  await call(secondReviewer, 'POST', `/credit/members/${enrollment.id}/kyc-review`, {
    decision: 'verified', reason: 'This reviewer also reviewed the ID and must be rejected',
  }, 409);
  const verifiedKyc = await call<{ kyc_status: string; kyc_reviewed_by: string }>(kycReviewer,
    'POST', `/credit/members/${enrollment.id}/kyc-review`, {
      decision: 'verified', reason: 'Synthetic UAT KYC approved after independently verified national ID',
    });
  assert.equal(verifiedKyc.kyc_status, 'verified');
  assert.equal(verifiedKyc.kyc_reviewed_by, kycReviewer.userId);
  passed.push('Private national-ID upload rejects invalid content, prevents self-review, and requires an independent KYC decision');
  const portfolioBefore = await call<{ disbursed_loans: number }>(admin, 'GET', '/credit/reports/portfolio');
  const reconciliationBefore = await call<{ disbursed: string; repaid: string }>(admin, 'GET', '/credit/reports/disbursement-reconciliation');

  const savingsProduct = await call<{ id: string }>(admin, 'POST', '/finance/products', {
    product_code: `UAT-${memberId.slice(0, 8)}`, name: 'Synthetic UAT loan savings', product_type: 'savings',
    minimum_balance: '0', withdrawals_allowed: true,
  }, 201);
  await call(admin, 'POST', `/finance/products/${savingsProduct.id}/decision`, {
    decision: 'active', reason: 'Independent activation of synthetic savings product',
  }, 403);
  const activatedSavings = await call<{ status: string }>(treasurer, 'POST', `/finance/products/${savingsProduct.id}/decision`, {
    decision: 'active', reason: 'Independent activation of synthetic savings product',
  });
  assert.equal(activatedSavings.status, 'active');
  const savingsAccount = await call<{ id: string }>(member, 'POST', '/finance/accounts', { product_id: savingsProduct.id }, 201);
  const savingsDeposit = await call<{ id: string }>(admin, 'POST', '/finance/transactions', {
    member_account_id: savingsAccount.id, direction: 'deposit', amount: '500', idempotency_key: randomUUID(),
  }, 201);
  const postedSavingsDeposit = await call<{ status: string; journal_id: string }>(treasurer,
    'POST', `/finance/transactions/${savingsDeposit.id}/decision`, {
      decision: 'approved', reason: 'Independent posting of synthetic member savings for repayment UAT',
    });
  assert.equal(postedSavingsDeposit.status, 'approved');
  assert.ok(postedSavingsDeposit.journal_id);

  const policyDraft = await call<{ id: string }>(admin, 'POST', '/credit/policies', {
    policy: {
      maximum_principal: '10000', maximum_tenor_months: 12, maximum_debt_service_bps: 5000,
      minimum_membership_days: 0, maximum_concurrent_applications: 2, minimum_savings_coverage_bps: 0,
      amortization_method: 'equal_principal', interest_rate_bps: 0, fee_bps: 0,
      scorecard: { minimum_score: 50, weights: { affordability: 40, savings: 40, membership_tenure: 20 } },
    }, change_reason: 'Synthetic local UAT policy for principal-only lifecycle validation',
  }, 201);
  await call(admin, 'POST', `/credit/policies/${policyDraft.id}/decision`, {
    decision: 'approve', reason: 'Policy author cannot approve the synthetic policy',
  }, 403);
  await call(creditManager, 'POST', `/credit/policies/${policyDraft.id}/decision`, {
    decision: 'approve', reason: 'Independent UAT approval of principal-only policy',
  });

  const productCode = `UAT-${memberId.slice(0, 8)}`.toUpperCase();
  const productDraft = await call<{ id: string }>(admin, 'POST', '/credit/products', {
    change_reason: 'Synthetic local UAT principal-only product',
    terms: {
      product_code: productCode, name: 'Synthetic UAT Principal Loan', customer_categories: ['individual'],
      minimum_principal: '100', maximum_principal: '10000', minimum_tenor_months: 1, maximum_tenor_months: 12,
      repayment_frequency: 'monthly', annual_interest_rate_bps: 0, interest_method: 'none', origination_fee_bps: 0,
      late_penalty_bps: 0, grace_days: 0, repayment_priority: ['penalty', 'fee', 'interest', 'principal'],
      maximum_debt_service_bps: 5000, minimum_membership_days: 0, minimum_savings_coverage_bps: 0,
      maximum_concurrent_loans: 1, rejection_cooldown_days: 0, settlement_cooldown_days: 0,
      minimum_equity_bps: 0, required_documents: [], required_fields: [], collateral_required: false,
      maximum_loan_to_value_bps: 0, manual_review_required: false,
    },
  }, 201);
  await call(admin, 'POST', `/credit/products/${productDraft.id}/decision`, {
    decision: 'approve', reason: 'The product maker cannot approve its own version',
  }, 403);
  await call(creditManager, 'POST', `/credit/products/${productDraft.id}/decision`, {
    decision: 'approve', reason: 'Independent UAT activation of principal-only product',
  });

  const applicationBody = {
    requested_principal: '1000', requested_term_months: 2, purpose: 'Synthetic Edir loan lifecycle UAT',
    monthly_income: '20000', monthly_expenses: '1000', monthly_debt: '0', product_code: productCode,
    customer_category: 'individual', age: 35, equity_amount: '0', documents: [], supplied_fields: [], idempotency_key: randomUUID(),
  };
  const application = await call<{ id: string; status: string }>(member, 'POST', '/credit/applications', applicationBody, 201);
  assert.equal(application.status, 'submitted');
  const replay = await call<{ id: string }>(member, 'POST', '/credit/applications', applicationBody, 200);
  assert.equal(replay.id, application.id);
  await call(member, 'POST', '/credit/applications', { ...applicationBody, requested_principal: '1001' }, 409);
  const assessment = await call<{ status: string; eligible: boolean }>(creditOfficer, 'POST', `/credit/applications/${application.id}/assess`);
  assert.equal(assessment.status, 'scored');
  assert.equal(assessment.eligible, true);
  await call(creditOfficer, 'POST', `/credit/applications/${application.id}/decision`, {
    decision: 'approve', reason: 'The credit assessor cannot decide the same application',
  }, 403);
  const approved = await call<{ status: string }>(creditManager, 'POST', `/credit/applications/${application.id}/decision`, {
    decision: 'approve', reason: 'Independent UAT credit decision following successful assessment',
  });
  assert.equal(approved.status, 'approved');
  const acceptance = await call<{ loan: { id: string; status: string }; agreement_hash: string }>(member,
    'POST', `/credit/applications/${application.id}/accept`, { accept: true, savings_account_id: savingsAccount.id }, 201);
  assert.equal(acceptance.loan.status, 'accepted');
  assert.match(acceptance.agreement_hash, /^[a-f0-9]{64}$/);
  passed.push('Maker-checker product and policy approval, scored application, idempotency, independent decision, and bound loan consent');

  const lowCap = await call<{ id: string }>(admin, 'POST', '/credit/disbursement-limits', {
    daily_limit: '900', change_reason: 'Synthetic cap boundary test for ETB 1000 disbursement',
  }, 201);
  await call(creditManager, 'POST', `/credit/disbursement-limits/${lowCap.id}/decision`, {
    decision: 'approve', reason: 'Independent approval of the initial UAT disbursement cap',
  });
  const disbursement = await call<{ id: string }>(admin, 'POST', `/credit/loans/${acceptance.loan.id}/disbursements`, {
    amount: '1000', idempotency_key: randomUUID(),
  }, 201);
  await call(treasurer, 'POST', `/credit/operations/${disbursement.id}/decision`, {
    decision: 'approved', reason: 'The ETB 1000 UAT disbursement exceeds its active ETB 900 daily limit',
  }, 409);
  const raisedCap = await call<{ id: string }>(admin, 'POST', '/credit/disbursement-limits', {
    daily_limit: '100000', change_reason: 'Synthetic UAT cap raised for the approved test disbursement',
  }, 201);
  await call(creditManager, 'POST', `/credit/disbursement-limits/${raisedCap.id}/decision`, {
    decision: 'approve', reason: 'Independent approval of the revised UAT disbursement cap',
  });
  const postedDisbursement = await call<{ status: string; journal_id: string }>(treasurer,
    'POST', `/credit/operations/${disbursement.id}/decision`, {
      decision: 'approved', reason: 'Independent posting of the synthetic loan disbursement',
    });
  assert.equal(postedDisbursement.status, 'approved');
  assert.ok(postedDisbursement.journal_id);
  passed.push('Daily disbursement limit rejects an over-cap posting; revised approved cap allows one balanced disbursement');

  const repayment = await call<{ id: string }>(member, 'POST', `/credit/loans/${acceptance.loan.id}/repayments`, {
    amount: '250', idempotency_key: randomUUID(),
  }, 201);
  const postedRepayment = await call<{ status: string; journal_id: string }>(treasurer,
    'POST', `/credit/operations/${repayment.id}/decision`, {
      decision: 'approved', reason: 'Independent approval and posting of synthetic partial principal repayment',
    });
  assert.equal(postedRepayment.status, 'approved');
  assert.ok(postedRepayment.journal_id);
  const writeoff = await call<{ id: string; amount: string }>(admin, 'POST', `/credit/loans/${acceptance.loan.id}/writeoffs`, {
    idempotency_key: randomUUID(), reason: 'Synthetic UAT write-off of the remaining principal balance',
  }, 201);
  assert.equal(writeoff.amount, '750.00');
  const postedWriteoff = await call<{ status: string; journal_id: string }>(treasurer,
    'POST', `/credit/operations/${writeoff.id}/decision`, {
      decision: 'approved', reason: 'Independent UAT write-off approval and loss journal posting',
    });
  assert.equal(postedWriteoff.status, 'approved');
  assert.ok(postedWriteoff.journal_id);
  const memberLoans = await call<Array<{ id: string; status: string; outstanding_principal: string; schedule: Array<{ status: string }> }>>(member, 'GET', '/credit/loans/me');
  const writtenOffLoan = memberLoans.find((loan) => loan.id === acceptance.loan.id);
  assert.equal(writtenOffLoan?.status, 'written_off');
  assert.equal(writtenOffLoan?.outstanding_principal, '750.00');
  assert(writtenOffLoan?.schedule.every((installment) => ['paid', 'waived'].includes(installment.status)));
  const portfolio = await call<{ disbursed_loans: number }>(admin, 'GET', '/credit/reports/portfolio');
  const trialBalance = await call<{ balanced: boolean; total_debits: string; total_credits: string }>(admin, 'GET', '/credit/reports/trial-balance');
  const reconciliation = await call<{ missing_posted_journals: number; disbursed: string; repaid: string }>(admin, 'GET', '/credit/reports/disbursement-reconciliation');
  assert.equal(portfolio.disbursed_loans, portfolioBefore.disbursed_loans);
  assert.equal(trialBalance.balanced, true);
  assert.equal(trialBalance.total_debits, trialBalance.total_credits);
  assert.equal(reconciliation.missing_posted_journals, 0);
  assert.equal(Number(reconciliation.disbursed) - Number(reconciliationBefore.disbursed), 1000);
  assert.equal(Number(reconciliation.repaid) - Number(reconciliationBefore.repaid), 250);
  passed.push('Partial repayment, remaining-principal write-off, schedule waiver, loss journal, portfolio, balanced trial balance, and reconciliation reports');

  const complaint = await call<{ id: string; reference: string; status: string; resolution_due_at: string }>(member, 'POST', '/credit/complaints', {
    category: 'service', subject: 'Synthetic UAT complaint', description: 'Synthetic complaint used to validate Edir complaint intake and resolution.',
  }, 201);
  assert.equal(complaint.status, 'open');
  assert.match(complaint.reference, /^EDR-[A-F0-9]{12}$/);
  assert.ok(Date.parse(complaint.resolution_due_at) > Date.now());
  passed.push('Active member can create a tracked complaint with a future resolution target');

  const hiddenFromOutsider = await call<Array<{ id: string }>>(outsider, 'GET', '/credit/complaints');
  assert.equal(hiddenFromOutsider.some((row) => row.id === complaint.id), false);
  await call(outsider, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'investigating' }, 403);
  passed.push('Complaint is private to its member, and an unrelated member cannot manage it');

  await call(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'resolved' }, 422);
  const investigating = await call<{ status: string }>(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, { status: 'investigating', priority: 'high' });
  assert.equal(investigating.status, 'investigating');
  const resolved = await call<{ status: string; resolution: string; resolved_by: string }>(admin, 'POST', `/credit/complaints/${complaint.id}/decision`, {
    status: 'resolved', resolution: 'Synthetic UAT resolution; no real member complaint exists.',
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolved_by, adminId);
  const finalComplaints = await call<Array<{ id: string; status: string; resolution: string }>>(member, 'GET', '/credit/complaints');
  assert.equal(finalComplaints.find((row) => row.id === complaint.id)?.status, 'resolved');
  passed.push('Staff tracks a complaint through investigation and requires a resolution summary to close it');

  const audit = await call<Array<{ action: string; entity_id: string }>>(admin, 'GET', '/audit');
  assert(audit.some((event) => event.action === 'edir_complaint_opened' && event.entity_id === complaint.id));
  assert(audit.some((event) => event.action === 'edir_complaint_updated' && event.entity_id === complaint.id));
  passed.push('Complaint intake and resolution both create audit records');

  console.log(JSON.stringify({ result: 'PASS', environment: 'isolated local Edir UAT database', cases: passed, synthetic_ids: { member_id: memberId, outsider_id: outsiderId, admin_id: adminId, membership_id: enrollment.id, complaint_id: complaint.id, application_id: application.id, loan_id: acceptance.loan.id }, report_checks: { portfolio_disbursed_loans: portfolio.disbursed_loans, trial_balance_debits: trialBalance.total_debits, trial_balance_credits: trialBalance.total_credits, reconciliation_missing_journals: reconciliation.missing_posted_journals }, note: 'Synthetic-only test data; no production or customer records used.' }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}
