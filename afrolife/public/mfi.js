import { t } from './i18n.js';

const isPlatformAdmin = (role) => role === 'global_admin' || role === 'super_admin';

const $ = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = t(String(text));
  if (className) element.className = className;
  return element;
};

function input(labelText, name, type = 'text', options = {}) {
  const label = $('label', labelText);
  const control = $('input');
  control.name = name;
  control.type = type;
  control.required = options.required !== false;
  if (options.min !== undefined) control.min = options.min;
  if (options.max !== undefined) control.max = options.max;
  if (options.step !== undefined) control.step = options.step;
  if (options.maxLength !== undefined) control.maxLength = options.maxLength;
  label.append(control);
  return { label, control };
}

function select(labelText, name, choices, required = true) {
  const label = $('label', labelText);
  const control = $('select');
  control.name = name;
  control.required = required;
  for (const choice of choices) {
    const option = $('option', choice.label);
    option.value = choice.value;
    control.append(option);
  }
  label.append(control);
  return { label, control };
}

function form(className, ...children) {
  const element = $('form', undefined, `panel form-card ${className}`);
  for (const child of children) element.append(child);
  return element;
}

function submitButton(label) {
  const button = $('button', label, 'button button-primary');
  button.type = 'submit';
  return button;
}

function money(amount) {
  const [whole = '0', fraction = ''] = String(amount ?? '0').split('.');
  const parts = new Intl.NumberFormat(document.documentElement.lang).formatToParts(1000);
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = new Intl.NumberFormat(document.documentElement.lang).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `ETB ${grouped}${decimal}${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

const institutionRoleProfiles = {
  super_admin: {
    label: 'Platform Super Admin',
    responsibilities: 'Platform-wide authority across institutions and current MFI pilot operations. Every institution-scoped access is recorded in that institution audit trail.',
  },
  institution_admin: {
    label: 'Institution administrator',
    responsibilities: 'Manage institution staff, oversee member services, and review institution-wide financial and audit activity.',
  },
  finance_manager: {
    label: 'Finance manager',
    responsibilities: 'Monitor balances and journal activity, post financial events, and process eligible loan disbursements and reversals.',
  },
  credit_manager: {
    label: 'Credit manager',
    responsibilities: 'Review loan requests independently of their originators; financial posting and disbursement remain separate duties.',
  },
  loan_officer: {
    label: 'Loan officer',
    responsibilities: 'Register members, open accounts, and submit loan requests for independent review.',
  },
  teller: {
    label: 'Teller',
    responsibilities: 'Open accounts and record authorized deposits, withdrawals, and principal repayments.',
  },
  compliance: {
    label: 'Compliance reviewer',
    responsibilities: 'Register and independently review member onboarding, with access to the institution audit trail.',
  },
  auditor: {
    label: 'Auditor',
    responsibilities: 'Review institution records and the audit trail in read-only mode.',
  },
};

const institutionRoles = [...Object.keys(institutionRoleProfiles), 'super_admin'];
const mfiModules = [
  { id: 'overview', label: 'Overview', group: 'Workspace', status: 'pilot', roles: institutionRoles, summary: 'Institution balances, member activity, lending position, cash on hand, and posted event count.', requirements: ['Institution-scoped operational summary'] },
  { id: 'institution', label: 'Institution & governance', group: 'Workspace', status: 'partial', roles: ['institution_admin'], summary: 'Institution onboarding, legal identity, branches, governance, approval matrix, and cooperative voting.', requirements: ['Legal identity and registration validation', 'Branch and vault/till management', 'Governance resolutions and voting', 'Approval matrix configuration'] },
  { id: 'members', label: 'Members & KYC', group: 'Customer operations', status: 'partial', roles: ['institution_admin', 'loan_officer', 'compliance', 'finance_manager', 'credit_manager', 'teller', 'auditor'], summary: 'Member registration and review, with controlled suspension, reactivation, and closure checks.', requirements: ['Identity documents and KYC case workflow', 'Watchlist screening and risk rating', 'Dormancy automation, exit, and deceased settlement', 'Member groups and customer profile'] },
  { id: 'products', label: 'Products & configuration', group: 'Administration', status: 'partial', roles: ['institution_admin'], summary: 'View starter products used by current pilot workflows. Product setup, versioning, pricing, approvals, and accounting mappings are not yet live.', requirements: ['Versioned savings, share, credit, and IFB products', 'Rates, fees, limits, and effective dates', 'Maker-checker publication and retirement', 'Product-to-GL posting rules'] },
  { id: 'savings', label: 'Savings & deposits', group: 'Customer operations', status: 'partial', roles: ['institution_admin', 'finance_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'Open basic savings accounts and post deposits or withdrawals. Accruals, term deposits, goals, holds, and advanced transaction controls are not yet live.', requirements: ['Daily accrual, tax, and interest capitalisation', 'Savings goals and controlled allocations', 'Term, compulsory, and lien-linked savings', 'Transaction limits, receipts, and notifications'] },
  { id: 'shares', label: 'Shares & capital', group: 'Customer operations', status: 'partial', roles: ['institution_admin', 'finance_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'Open basic share accounts and post share contributions. Share classes, transfer, redemption, dividends, and patronage are not yet live.', requirements: ['Share classes, capital limits, and share register', 'Applications, allotments, transfers, and redemption', 'Dividend declaration, calculation, and settlement', 'Patronage and residual allocation'] },
  { id: 'credit', label: 'Credit & lending', group: 'Customer operations', status: 'partial', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'Configurable maker-checker credit policy, explainable affordability scoring, principal-only origination schedules, and loan servicing.', requirements: ['CRB, collateral valuation, guarantors, and affordability evidence', 'Interest, fees, amortisation, product versions, and member offer acceptance', 'Policy-based delinquency and accounting provisions'] },
  { id: 'ifb', label: 'Islamic finance (IFB)', group: 'Customer operations', status: 'planned', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'compliance', 'auditor'], summary: 'A separate IFB lifecycle is not implemented; no Sharia-compliance or IFB transaction is implied.', requirements: ['Sharia Supervisory Board approval and fund segregation', 'Wadiah, Mudarabah, Murabaha, Ijarah, Salam, and Istisna', 'Profit distribution and non-compliant income handling', 'Separate IFB financial statements'] },
  { id: 'payments', label: 'Payments & transfers', group: 'Money movement', status: 'planned', roles: institutionRoles, summary: 'External payment rails and member-to-member transfers are not connected.', requirements: ['Payment lifecycle, authorisation, settlement, and reversal', 'Own-account and external transfers', 'Mobile-money deposits, withdrawals, and loan repayments', 'Provider confirmation and real-time reconciliation'] },
  { id: 'wallet', label: 'Digital wallet', group: 'Money movement', status: 'planned', roles: institutionRoles, summary: 'No wallet balance, payment, or wallet lifecycle is currently available.', requirements: ['Wallet creation, KYC tiering, limits, freeze, and closure', 'Wallet-to-wallet, bank, QR, bill, and merchant payments', 'Standing instructions and bulk salary/benefit credits'] },
  { id: 'agent-field', label: 'Agent & field operations', group: 'Money movement', status: 'planned', roles: ['institution_admin', 'finance_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'The legacy EthioLife agency service remains separate; it is not SACCO agent banking or MFI field collections.', requirements: ['MFI agent onboarding, float, cash-in/out, and commissions', 'Field visits, receipts, portfolios, and offline capture', 'Group savings cycles, meetings, fines, and share-out'] },
  { id: 'collections', label: 'Collections & recovery', group: 'Money movement', status: 'partial', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'compliance', 'auditor'], summary: 'Servicing cases, assignment, contact history, promise-to-pay, next action, and independent case resolution.', requirements: ['Automated arrears queues and notices', 'Guarantor, collateral, legal recovery, and restructuring', 'Provisioned write-off and post-write-off recovery'] },
  { id: 'accounting', label: 'Accounting & journals', group: 'Financial control', status: 'partial', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'Pilot events post balanced, immutable journals with idempotency and controlled full reversals. Full GL operations and period controls are not yet live.', requirements: ['Configurable chart of accounts and accounting dimensions', 'Sub-ledger reconciliation and suspense lifecycle', 'Period close, lock, and approved reopening', 'FX revaluation, bank matching, and financial statements'] },
  { id: 'treasury', label: 'Treasury & liquidity', group: 'Financial control', status: 'planned', roles: ['institution_admin', 'finance_manager', 'compliance', 'auditor'], summary: 'Cash is checked for pilot loan disbursement; treasury, bank accounts, and liquidity forecasting are not implemented.', requirements: ['Cash/bank positions, accounts, and dual signatory controls', 'Liquidity forecasts, thresholds, and stress scenarios', 'Investments, maturities, and FX exposure'] },
  { id: 'reconciliation', label: 'Settlement & reconciliation', group: 'Financial control', status: 'planned', roles: ['institution_admin', 'finance_manager', 'compliance', 'auditor'], summary: 'Provider settlement and bank-statement reconciliation queues are not implemented.', requirements: ['Import or capture external statements and confirmations', 'Matching, exception ownership, investigation, and closure', 'Settlement state machine and aged exception reporting'] },
  { id: 'compliance', label: 'AML / CFT & compliance', group: 'Risk & assurance', status: 'partial', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'compliance', 'auditor'], summary: 'A limited member approval and audit view exists. AML/CFT screening, monitoring, case investigation, and filings are not implemented.', requirements: ['Watchlist, PEP, sanctions, and ongoing screening', 'Transaction monitoring, alerts, and investigations', 'CTR/STR preparation, approval, and filing evidence', 'Compliance decisions and regulatory-rule versioning'] },
  { id: 'risk-fraud', label: 'Credit policy & NPL', group: 'Risk & assurance', status: 'partial', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'compliance', 'auditor'], summary: 'Versioned credit and delinquency rules, maker-checker activation, risk classification events, and days-past-due visibility.', requirements: ['Provision calculation/posting and non-accrual accounting', 'Restructuring, write-off approval, and recoveries', 'CRB, fraud, concentration, and model governance'] },
  { id: 'regulatory', label: 'Regulatory reporting', group: 'Risk & assurance', status: 'planned', roles: ['institution_admin', 'finance_manager', 'compliance', 'auditor'], summary: 'No NBE regulatory returns or CTR/STR filing workflow is currently available.', requirements: ['Validated NBE regulatory returns', 'CTR/STR work queues and filing records', 'CRB enquiries/submissions and executive dashboards'] },
  { id: 'crm', label: 'CRM & member service', group: 'Member experience', status: 'planned', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'teller', 'compliance', 'auditor'], summary: 'Member complaints, assignment, service-level tracking, and communication history are not implemented.', requirements: ['Complaint/case capture, ownership, escalation, and closure', 'Member interaction history and consent preferences', 'Complaint analytics and controlled notifications'] },
  { id: 'digital', label: 'Digital channels', group: 'Member experience', status: 'planned', roles: institutionRoles, summary: 'The staff workspace is not a member self-service channel; no USSD, member login, or mobile transaction channel is enabled.', requirements: ['Member authentication, balance, and mini-statement', 'Own-account transfers and loan tracking', 'USSD session and transaction-rule parity', 'Continuous session and device risk checks'] },
  { id: 'analytics', label: 'Data & analytics', group: 'Member experience', status: 'planned', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'compliance', 'auditor'], summary: 'The current operational summary is limited; predictive, portfolio, liquidity, and social-impact analytics are not implemented.', requirements: ['Executive, portfolio-quality, and liquidity dashboards', 'Transparent early-warning scores and alerts', 'Impact indicators and model governance'] },
  { id: 'documents', label: 'Documents & communications', group: 'Administration', status: 'planned', roles: ['institution_admin', 'finance_manager', 'credit_manager', 'loan_officer', 'compliance', 'auditor'], summary: 'Formal MFI statements, share certificates, loan offers, and member e-signatures are not implemented.', requirements: ['Loan offer and contract generation', 'Statements, balance confirmations, and share certificates', 'Member acceptance/e-signature evidence', 'Consent-aware segmented messages and delivery tracking'] },
  { id: 'staff', label: 'Institution staff', group: 'Administration', status: 'partial', roles: ['institution_admin'], summary: 'Institution administrators provision existing EthioLife finance/compliance staff with one institution role.', requirements: ['Staff provisioning and role membership listing', 'Role/permission administration, session timeout, and sensitive-action MFA', 'Staff lending and incentive administration'] },
  { id: 'audit', label: 'Audit & security', group: 'Administration', status: 'partial', roles: ['institution_admin', 'finance_manager', 'compliance', 'auditor'], summary: 'Institution audit history and tenant-isolated data access are available. Full permission administration and event coverage remain incomplete.', requirements: ['Immutable privileged and financial-action audit', 'Role-specific access review and session controls', 'Institution-scoped audit search and export'] },
  { id: 'exceptions', label: 'Exceptions & suspense', group: 'Administration', status: 'planned', roles: ['institution_admin', 'finance_manager', 'compliance', 'auditor'], summary: 'A universal exception lifecycle and suspense work queue are not implemented.', requirements: ['Categorise, assign, investigate, escalate, and close exceptions', 'SLA timers, suspense ageing, and ownership reports', 'Bulk pre-validation, rollback, and per-item audit'] },
  { id: 'governance', label: 'Cooperative governance', group: 'Administration', status: 'planned', roles: ['institution_admin', 'compliance', 'auditor'], summary: 'Membership voting, meeting quorum, proxies, elections, and cooperative resolutions are not implemented.', requirements: ['Eligibility register, proxy validation, and quorum calculation', 'Auditable resolutions and member voting', 'Membership categories, transfers, and due-process changes'] },
];

// Service areas are decomposed into manageable units. This map only labels
// functions that exist today as pilot workflows; policy/pricing/legal settings
// remain institution-owned and are not represented as implemented by a card.
const mfiSubmodules = {
  overview: [
    { name: 'Institution dashboard', state: 'pilot', owner: 'Institution administrator / finance', description: 'Member, savings, share, loan, cash, and posted-event summary.' },
  ],
  institution: [
    { name: 'Institution registration', state: 'pilot', owner: 'Platform / institution administrator', description: 'Create a tenant workspace and initial administrator.' },
    { name: 'Staff assignments', state: 'pilot', owner: 'Institution administrator', description: 'Assign existing eligible EthioLife staff an institution role.', module: 'staff' },
    { name: 'Branches, approval matrix, governance', state: 'planned', owner: 'Institution governance', description: 'Branch/till setup, voting and configurable approval limits are not implemented.' },
  ],
  members: [
    { name: 'Member registry', state: 'pilot', owner: 'Loan officer / compliance', description: 'Register member identity and contact record.' },
    { name: 'Onboarding review', state: 'pilot', owner: 'Compliance / institution administrator', description: 'Independent activate or reject decision with reason.' },
    { name: 'Member lifecycle', state: 'pilot', owner: 'Institution administrator / compliance', description: 'Suspend, reactivate and close after balance checks.' },
    { name: 'Document KYC, screening and member groups', state: 'planned', owner: 'Compliance', description: 'Document verification, screening, risk rating and group profiles are not implemented.' },
  ],
  products: [
    { name: 'Starter product catalogue', state: 'pilot', owner: 'Finance / institution administrator', description: 'Read-only products consumed by current workflows.' },
    { name: 'Product setup and publication', state: 'planned', owner: 'Product owner / finance / compliance', description: 'Versioned terms, pricing, GL mapping, approval and effective dates are not implemented.' },
  ],
  savings: [
    { name: 'Savings account lifecycle', state: 'pilot', owner: 'Loan officer / teller', description: 'Open basic savings account for an active member.' },
    { name: 'Deposits and withdrawals', state: 'pilot', owner: 'Teller / finance', description: 'Post idempotent cash transactions with minimum-balance and reversal controls.' },
    { name: 'Term savings, holds and returns', state: 'planned', owner: 'Product owner / finance', description: 'Term rules, liens, accruals, tax and interest are not implemented.' },
  ],
  shares: [
    { name: 'Share account and contributions', state: 'pilot', owner: 'Teller / finance', description: 'Open basic share account and post contributions.' },
    { name: 'Share register, redemption and dividends', state: 'planned', owner: 'Finance / cooperative governance', description: 'Classes, allotments, transfers, redemption and dividend rules are not implemented.' },
  ],
  credit: [
    { name: 'Loan application and affordability assessment', state: 'pilot', owner: 'Loan officer / credit manager', description: 'Capture purpose and declared monthly income, expenses and debt; calculate transparent score.' },
    { name: 'Credit score and delinquency policy', state: 'configurable', owner: 'Credit manager / institution administrator', description: 'Versioned score weights, limits and DPD bands with independent approval.', target: 'mfi-credit-policy-settings' },
    { name: 'Underwriting and loan origination', state: 'pilot', owner: 'Credit manager / finance', description: 'Independent decision, cash-constrained disbursement and principal-only schedule.' },
    { name: 'Interest, collateral and offer acceptance', state: 'planned', owner: 'Credit / finance / legal', description: 'Pricing, collateral, guarantors, external bureau and member acceptance are not implemented.' },
  ],
  collections: [
    { name: 'Collections cases and promises', state: 'pilot', owner: 'Loan officer / collections', description: 'Assigned servicing case, contact history, promise-to-pay and next action.' },
    { name: 'Recovery, restructuring and write-off', state: 'planned', owner: 'Collections / credit / finance / legal', description: 'Recovery escalation, hardship/restructure, provisions and write-off are not implemented.' },
  ],
  'risk-fraud': [
    { name: 'Credit policy and NPL classification', state: 'configurable', owner: 'Institution administrator / credit', description: 'Approved score/DPD policies and independent risk classification.', target: 'mfi-credit-policy-settings' },
    { name: 'Provisions, fraud and model governance', state: 'planned', owner: 'Risk / finance / compliance', description: 'ECL, fraud monitoring, concentration controls and model validation are not implemented.' },
  ],
  compliance: [
    { name: 'Member onboarding decision', state: 'pilot', owner: 'Compliance reviewer', description: 'Separate-person member activation decision and institution audit access.' },
    { name: 'AML/CFT screening and investigations', state: 'planned', owner: 'Compliance', description: 'Risk assessment, sanctions/PEP screening, transaction monitoring and case handling are not implemented.' },
    { name: 'Regulatory filings', state: 'planned', owner: 'Compliance / institution leadership', description: 'Applicable return preparation, approval, submission and evidence are not implemented.' },
  ],
  analytics: [
    { name: 'Operational overview', state: 'pilot', owner: 'Institution administrator / finance', description: 'Basic counts and balances for the institution.' },
    { name: 'Portfolio, liquidity and impact analytics', state: 'planned', owner: 'Finance / risk / leadership', description: 'Governed reports, forecasting, alerts and validated indicators are not implemented.' },
  ],
  accounting: [
    { name: 'Balanced journals and transaction reversals', state: 'pilot', owner: 'Finance manager / auditor', description: 'Append-only postings, idempotency and authorized reversal workflows.' },
    { name: 'General ledger close and reconciliation', state: 'planned', owner: 'Finance / auditor', description: 'Period close, suspense, subledger reconciliation, statements and controlled reopening are not implemented.' },
  ],
  staff: [
    { name: 'Institution staff membership', state: 'configurable', owner: 'Institution administrator', description: 'Provision eligible users and assign institution roles.', target: 'mfi-staff-roles' },
    { name: 'Permission administration and access review', state: 'planned', owner: 'Institution administrator / auditor', description: 'Custom permissions, access recertification, session controls and step-up MFA are not implemented.' },
  ],
  audit: [
    { name: 'Institution audit history', state: 'pilot', owner: 'Compliance / auditor / finance', description: 'Review recorded operational and financial control events.' },
    { name: 'Audit export and security monitoring', state: 'planned', owner: 'Security / auditor', description: 'Search/export, complete event coverage, alerting and independent assessment remain release work.' },
  ],
};

const submoduleStateLabels = { pilot: 'Pilot workflow', configurable: 'Configurable', planned: 'Backlog' };

function renderSubmodulePanel(module, state, root) {
  let entries = mfiSubmodules[module.id] ?? module.requirements.map((name) => ({
    name,
    state: 'planned',
    owner: 'Institution owner to assign',
    description: 'This capability has no operational workflow in the current release.',
  }));
  if (state.membership?.role !== 'platform_super_admin' && state.membership?.role !== 'institution_admin') {
    entries = entries.filter((entry) => entry.state !== 'configurable' && !entry.module);
  }
  const area = $('section', undefined, 'mfi-submodule-area panel');
  area.setAttribute('aria-labelledby', `mfi-submodules-${module.id}`);
  area.append($('div', undefined, 'mfi-submodule-heading'));
  area.firstChild.append($('div', undefined, 'mfi-submodule-copy'));
  const heading = $('h2', 'Submodules & configuration');
  heading.id = `mfi-submodules-${module.id}`;
  area.firstChild.firstChild.append(heading,
    $('p', 'Manage this service as smaller workflows. Configuration is available only where a controlled settings workflow exists.'));
  const grid = $('div', undefined, 'mfi-submodule-grid');
  for (const entry of entries) {
    const card = $('article', undefined, 'mfi-submodule-card');
    const heading = $('div', undefined, 'mfi-submodule-card-heading');
    heading.append($('h3', entry.name), $('span', submoduleStateLabels[entry.state], `mfi-module-status status-${entry.state}`));
    card.append(heading, $('p', entry.description), $('p', `Owner: ${entry.owner}`, 'mfi-submodule-owner'));
    if (entry.module) {
      const action = $('button', 'Open staff administration', 'mfi-submodule-action');
      action.type = 'button'; action.dataset.mfiModule = entry.module;
      card.append(action);
    } else if (entry.target && entry.state === 'configurable'
        && (state.membership?.role === 'platform_super_admin' || state.membership?.role === 'institution_admin')) {
      const action = $('button', 'Open configuration', 'mfi-submodule-action');
      action.type = 'button';
      action.dataset.mfiFocusTarget = entry.target;
      card.append(action);
    }
    grid.append(card);
  }
  area.append(grid);
  root.append(area);
}

export function createMfiWorkspace(api, user) {
  const root = $('div', undefined, 'mfi-workspace');
  const state = { institutions: [], institutionId: '', membership: null, overview: null, members: [], accounts: [], products: [], loans: [], staff: [], audit: [], transactions: [], creditPolicy: null, collections: [], nplEvents: [], module: 'overview', moduleSearch: '', error: '', busy: false };
  const savedInstitution = localStorage.getItem('afrolife.mfi-institution');

  function hasRole(...roles) {
    return state.membership?.role === 'platform_super_admin' || roles.includes(state.membership?.role);
  }

  function section(title, description) {
    const element = $('section', undefined, 'mfi-section');
    const heading = $('div', undefined, 'section-heading');
    heading.append($('div', undefined, 'mfi-section-title'));
    heading.firstChild.append($('h2', title), $('p', description));
    element.append(heading);
    return element;
  }

  function renderInstitutionSetup() {
    const code = input('Institution code', 'institution_code', 'text', { maxLength: 12 });
    code.control.autocomplete = 'off';
    code.control.pattern = '[A-Za-z0-9]{2,12}';
    code.control.placeholder = 'e.g. AFRO01';
    const name = input('Institution name', 'name', 'text', { maxLength: 160 });
    const setup = form('mfi-institution-form', $('h3', 'Register an institution'), $('p', 'This creates an isolated SACCO/MFI workspace, starter products, and the initial institution administrator.'), code.label, name.label, submitButton('Create institution'));
    setup.dataset.mfiForm = 'create-institution';
    root.append(setup);
  }

  function renderNoInstitution() {
    if (isPlatformAdmin(user.role)) {
      renderInstitutionSetup();
    } else {
      root.append($('p', 'No SACCO/MFI institution has been assigned to your account. Ask a Super Admin to create one and provision your institution role.', 'empty-state'));
    }
  }

  function renderOverview() {
    const summary = state.overview ?? {};
    const panel = $('section', undefined, 'mfi-metrics');
    const cards = [
      ['Active members', summary.members?.active ?? 0],
      ['Pending member reviews', summary.members?.pending ?? 0],
      ['Savings deposits', money(summary.accounts?.savings?.balance)],
      ['Share capital', money(summary.accounts?.share?.balance)],
      ['Loan principal outstanding', money(summary.accounts?.loan?.balance)],
      ['Cash on hand', money(summary.cash_balance)],
      ['Posted financial events', summary.posted_transactions ?? 0],
    ];
    for (const [label, value] of cards) {
      const card = $('div', undefined, 'mfi-metric panel');
      card.append($('span', label), $('strong', value));
      panel.append(card);
    }
    root.append(panel);
  }

  function renderInstitution() {
    const institution = state.institutions.find((item) => item.id === state.institutionId);
    const area = section('Institution administration', 'Manage institution-level access separately from member servicing and financial operations.');
    area.append($('p', `${institution?.institution_code ?? ''} · ${institution?.name ?? ''}`, 'mfi-tenant-label'));
    const staff = $('button', 'Manage institution staff and roles', 'mfi-submodule-action');
    staff.type = 'button'; staff.dataset.mfiModule = 'staff';
    area.append(staff, $('p', 'Branch setup, approval matrices, voting, and legal identity validation are not yet available.', 'mfi-notice'));
    root.append(area);
  }

  function renderMembers() {
    const area = section('Members', 'Register members, record their contact details, and require a different staff member to review activation.');
    if (hasRole('institution_admin', 'loan_officer', 'compliance')) {
      const fullName = input('Full name', 'full_name', 'text', { maxLength: 160 });
      const phone = input('Phone number', 'phone', 'tel', { maxLength: 32 });
      const email = input('Email (optional)', 'email', 'email', { required: false, maxLength: 254 });
      const create = form('mfi-member-form', $('h3', 'Register member'), fullName.label, phone.label, email.label, submitButton('Submit for review'));
      create.dataset.mfiForm = 'create-member';
      area.append(create);
    }

    const list = $('div', undefined, 'mfi-record-list');
    for (const member of state.members) {
      const item = $('article', undefined, 'panel mfi-record');
      item.append($('div', undefined, 'mfi-record-heading'));
      item.firstChild.append($('div', undefined, 'mfi-record-title'));
      item.firstChild.firstChild.append($('h3', `${member.full_name} · ${member.member_number}`), $('p', `${member.phone}${member.email ? ` · ${member.email}` : ''}`));
      item.firstChild.append($('span', t(member.status), `mfi-status status-${member.status}`));
      if (member.status === 'pending' && hasRole('institution_admin', 'compliance')) {
        const reason = input('Review reason (required)', 'reason', 'text', { maxLength: 1000 });
        reason.control.minLength = 10;
        const decision = select('Decision', 'decision', [
          { value: 'activate', label: 'Activate member' },
          { value: 'reject', label: 'Reject registration' },
        ]);
        const review = form('mfi-inline-form', reason.label, decision.label, submitButton('Record member review'));
        review.dataset.mfiForm = 'review-member';
        review.dataset.memberId = member.id;
        item.append(review);
      }
      if (['active','suspended'].includes(member.status) && hasRole('institution_admin','compliance')
          && member.created_by !== state.userId && member.reviewed_by !== state.userId) {
        const reason = input('Lifecycle reason (required)', 'reason', 'text', { maxLength: 1000 });
        reason.control.minLength = 10;
        const action = select('Member status action', 'action', member.status === 'active'
          ? [{ value: 'suspend', label: 'Suspend membership' }, { value: 'close', label: 'Close membership' }]
          : [{ value: 'reactivate', label: 'Reactivate membership' }, { value: 'close', label: 'Close membership' }]);
        const lifecycle = form('mfi-inline-form', reason.label, action.label, submitButton('Update member status'));
        lifecycle.dataset.mfiForm = 'member-lifecycle';
        lifecycle.dataset.memberId = member.id;
        item.append(lifecycle);
      }
      list.append(item);
    }
    if (!state.members.length) list.append($('p', 'No members registered yet.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderAccounts() {
    const area = section('Savings & shares', 'Open accounts for active members and post deposits, withdrawals, or share contributions to the append-only balanced journal.');
    const activeMembers = state.members.filter((member) => member.status === 'active');
    const mayOpenAccounts = hasRole('institution_admin', 'loan_officer', 'teller');
    if (mayOpenAccounts) {
      const member = select('Member', 'member_id', activeMembers.map((row) => ({ value: row.id, label: `${row.member_number} · ${row.full_name}` })));
      const products = select('Product', 'product_id', state.products.filter((product) => ['savings', 'share'].includes(product.product_type)).map((row) => ({
        value: row.id, label: `${row.name} (${row.product_type})`,
      })));
      const open = form('mfi-account-open-form', $('h3', 'Open member account'), member.label, products.label, submitButton('Open account'));
      open.dataset.mfiForm = 'open-account';
      if (!activeMembers.length || !state.products.some((product) => ['savings', 'share'].includes(product.product_type))) {
        open.querySelector('button').disabled = true;
      }
      area.append(open);
    }

    const list = $('div', undefined, 'mfi-record-list');
    for (const account of state.accounts.filter((item) => item.account_type !== 'loan')) {
      const item = $('article', undefined, 'panel mfi-record');
      const heading = $('div', undefined, 'mfi-record-heading');
      const title = $('div', undefined, 'mfi-record-title');
      title.append($('h3', `${account.product_name} · ${account.account_number}`), $('p', `${account.member_number} · ${account.member_name} · ${account.status}`));
      heading.append(title, $('span', money(account.balance), 'mfi-balance'));
      item.append(heading);
      if (account.status === 'active' && hasRole('institution_admin', 'finance_manager', 'teller')) {
        const types = account.account_type === 'savings'
          ? [
            { value: 'savings_deposit', label: 'Deposit' },
            { value: 'savings_withdrawal', label: 'Withdraw' },
          ]
          : [{ value: 'share_contribution', label: 'Share contribution' }];
        const transactionType = select('Transaction', 'transaction_type', types);
        const amount = input('Amount (ETB)', 'amount', 'number', { min: '0.01', step: '0.01' });
        const formNode = form('mfi-inline-form', transactionType.label, amount.label, submitButton('Post transaction'));
        formNode.dataset.mfiForm = 'account-transaction';
        formNode.dataset.accountId = account.id;
        const key = $('input');
        key.type = 'hidden';
        key.name = 'idempotency_key';
        key.value = newIdempotencyKey();
        formNode.append(key);
        item.append(formNode);
      }
      list.append(item);
    }
    if (!state.accounts.some((account) => account.account_type !== 'loan')) list.append($('p', 'No savings or share accounts are open.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderLoans() {
    const area = section('Credit & lending', 'Capture purpose and affordability evidence, review a transparent score, approve independently, then disburse against a principal-only schedule.');
    area.id = 'mfi-credit-policy-settings';
    const activeMembers = state.members.filter((member) => member.status === 'active');
    renderCreditPolicy(area);
    if (hasRole('institution_admin', 'loan_officer')) {
      const member = select('Member', 'member_id', activeMembers.map((row) => ({ value: row.id, label: `${row.member_number} · ${row.full_name}` })));
      const product = select('Credit product', 'product_id', state.products.filter((item) => item.product_type === 'loan').map((row) => ({ value: row.id, label: row.name })));
      const principal = input('Principal requested (ETB)', 'principal_amount', 'number', { min: '0.01', step: '0.01' });
      const term = input('Term (months)', 'term_months', 'number', { min: '1', max: '360', step: '1' });
      const purpose = input('Loan purpose', 'purpose', 'text', { maxLength: 1000 }); purpose.control.minLength = 10;
      const income = input('Monthly income (ETB)', 'monthly_income', 'number', { min: '0.01', step: '0.01' });
      const expenses = input('Monthly expenses (ETB)', 'monthly_expenses', 'number', { min: '0', step: '0.01' }); expenses.control.value = '0';
      const debt = input('Other monthly debt payments (ETB)', 'monthly_debt', 'number', { min: '0', step: '0.01' }); debt.control.value = '0';
      const create = form('mfi-loan-form', $('h3', 'New loan application'), member.label, product.label, principal.label, term.label,
        purpose.label, income.label, expenses.label, debt.label, submitButton('Assess and submit for approval'));
      create.dataset.mfiForm = 'create-loan';
      if (!activeMembers.length || !state.products.some((item) => item.product_type === 'loan') || !state.creditPolicy?.active) create.querySelector('button').disabled = true;
      area.append(create);
    }
    area.append($('p', 'Interest, fees, collateral, and external credit bureau checks remain disabled. Generated schedules allocate principal only and must follow your approved credit policy.', 'mfi-notice'));

    const list = $('div', undefined, 'mfi-record-list');
    for (const loan of state.loans) {
      const item = $('article', undefined, 'panel mfi-record');
      const heading = $('div', undefined, 'mfi-record-heading');
      const title = $('div', undefined, 'mfi-record-title');
      const outstanding = loan.status === 'disbursed' || loan.status === 'repaid'
        ? ` · outstanding ${money(loan.outstanding_principal)}`
        : '';
      title.append($('h3', `${loan.member_name} · ${money(loan.principal_amount)}`), $('p', `${loan.member_number} · ${loan.term_months} months · ${loan.status}${outstanding}`));
      heading.append(title, $('span', t(loan.status), `mfi-status status-${loan.status}`));
      item.append(heading);
      item.append($('p', `Credit score: ${loan.credit_score ?? 'not assessed'} / 100`));
      if (loan.credit_score_factors) {
        const factors = loan.credit_score_factors;
        item.append($('p', `Score factors · affordability ${factors.affordability} · savings ${factors.savings} · tenure ${factors.tenure} · repayment history ${factors.repayment_history} · debt service ${factors.debt_service_pct}%`));
      }
      if (loan.purpose) item.append($('p', `Purpose · ${loan.purpose}`));
      if (loan.schedule?.length) {
        const schedule = $('details', undefined, 'mfi-schedule');
        schedule.append($('summary', `Principal schedule · ${loan.days_past_due ?? 0} days past due`));
        for (const installment of loan.schedule) {
          schedule.append($('p', `#${installment.installment_no} · due ${new Date(`${installment.due_on}T00:00:00`).toLocaleDateString(document.documentElement.lang)} · ${money(installment.principal_paid)} paid of ${money(installment.principal_due)} · ${installment.status}`));
        }
        item.append(schedule);
      }

      if (loan.status === 'pending' && hasRole('institution_admin', 'credit_manager') && loan.created_by !== state.userId) {
        const reason = input('Decision reason (required)', 'reason', 'text', { maxLength: 1000 });
        reason.control.minLength = 10;
        const decision = select('Decision', 'decision', [
          { value: 'approve', label: 'Approve loan' },
          { value: 'reject', label: 'Reject loan' },
        ]);
        const review = form('mfi-inline-form', reason.label, decision.label, submitButton('Record loan decision'));
        review.dataset.mfiForm = 'loan-decision';
        review.dataset.loanId = loan.id;
        item.append(review);
      }

      if (loan.status === 'approved' && hasRole('institution_admin', 'finance_manager')
          && loan.created_by !== state.userId && loan.checked_by !== state.userId) {
        const disburse = form('mfi-inline-form', $('p', 'Disbursement requires sufficient cash in the institution ledger.'), submitButton('Disburse loan'));
        disburse.dataset.mfiForm = 'disburse-loan';
        disburse.dataset.loanId = loan.id;
        const key = $('input');
        key.type = 'hidden';
        key.name = 'idempotency_key';
        key.value = newIdempotencyKey();
        disburse.append(key);
        item.append(disburse);
      }

      if (loan.status === 'disbursed' && hasRole('institution_admin', 'finance_manager', 'teller')) {
        const amount = input('Principal repayment (ETB)', 'amount', 'number', { min: '0.01', step: '0.01' });
        const repay = form('mfi-inline-form', amount.label, submitButton('Post principal repayment'));
        repay.dataset.mfiForm = 'repay-loan';
        repay.dataset.loanId = loan.id;
        const key = $('input');
        key.type = 'hidden';
        key.name = 'idempotency_key';
        key.value = newIdempotencyKey();
        repay.append(key);
        item.append(repay);
      }
      list.append(item);
    }
    if (!state.loans.length) list.append($('p', 'No loan requests yet.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderCollections() {
    const area = section('Loan collections', 'Record contact attempts, commitments, visits, escalations, and independently reviewed resolution. Promise records are separate from financial repayment postings.');
    const openLoans = state.loans.filter((loan) => loan.status === 'disbursed' && Number(loan.outstanding_principal) > 0);
    const casesByLoan = new Set(state.collections.filter((item) => !['resolved','closed'].includes(item.status)).map((item) => item.loan_id));
    const list = $('div', undefined, 'mfi-record-list');
    for (const loan of openLoans.filter((item) => !casesByLoan.has(item.id))) {
      const opener = form('mfi-inline-form', $('h3', `${loan.member_name} · ${money(loan.outstanding_principal)} outstanding`),
        $('p', `${loan.member_number} · ${loan.days_past_due ?? 0} days past due`));
      const reason = input('Collection case reason', 'reason', 'text', { maxLength: 1000 }); reason.control.minLength = 10;
      opener.append(reason.label, submitButton('Open servicing case'));
      opener.dataset.mfiForm = 'open-collection'; opener.dataset.loanId = loan.id;
      list.append(opener);
    }
    for (const record of state.collections) {
      const item = $('article', undefined, 'panel mfi-record');
      item.append($('h3', `${record.member_name} · ${money(record.scheduled_arrears)} scheduled arrears`),
        $('p', `${record.status} · ${record.days_past_due} days past due · opened ${new Date(record.opened_at).toLocaleDateString(document.documentElement.lang)}`));
      for (const event of record.events ?? []) item.append($('p', `${event.event_type.replaceAll('_',' ')} · ${event.outcome} · ${new Date(event.created_at).toLocaleString(document.documentElement.lang)}`));
      if (!['resolved','closed'].includes(record.status)) {
        const type = select('Follow-up type', 'event_type', [
          { value: 'contact', label: 'Contact attempt' }, { value: 'promise_to_pay', label: 'Promise to pay' },
          { value: 'visit', label: 'Member visit' }, { value: 'escalation', label: 'Escalate' }, { value: 'note', label: 'Case note' },
        ]);
        const outcome = input('Outcome', 'outcome', 'text', { maxLength: 1000 }); outcome.control.minLength = 2;
        const amount = input('Promised amount (ETB)', 'promised_amount', 'number', { min: '0.01', step: '0.01', required: false });
        const promised = input('Promised date', 'promised_on', 'date', { required: false });
        const next = input('Next follow-up', 'next_action_at', 'datetime-local', { required: false });
        const update = form('mfi-inline-form', type.label, outcome.label, amount.label, promised.label, next.label, submitButton('Record follow-up'));
        update.dataset.mfiForm = 'collection-event'; update.dataset.caseId = record.id;
        item.append(update);
        if (hasRole('institution_admin','finance_manager','credit_manager') && record.created_by !== state.userId) {
          const closeReason = input('Resolution reason', 'reason', 'text', { maxLength: 1000 }); closeReason.control.minLength = 10;
          const closeStatus = select('Case outcome', 'status', [{ value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed without recovery' }]);
          const close = form('mfi-inline-form', closeReason.label, closeStatus.label, submitButton('Close case'));
          close.dataset.mfiForm = 'close-collection'; close.dataset.caseId = record.id;
          item.append(close);
        }
      }
      list.append(item);
    }
    if (!list.childElementCount) list.append($('p', 'No collection cases or serviced loans are available.', 'empty-state'));
    area.append(list); root.append(area);
  }

  function renderRisk() {
    const area = section('Credit risk and NPL classification', 'Aging comes from unpaid principal installments. Classification thresholds come from the approved institution policy; accounting provisions and write-offs require a separate controlled GL workflow.');
    area.id = 'mfi-credit-policy-settings';
    renderCreditPolicy(area);
    for (const event of state.nplEvents.filter((item) => item.status === 'pending_approval')) {
      const pending = $('article', undefined, 'panel mfi-record');
      pending.append($('h3', `Pending ${event.next_status} classification · ${event.member_name}`),
        $('p', `${event.prior_status} → ${event.next_status} · proposed by ${event.proposer_name} · ${event.reason}`));
      if (hasRole('institution_admin','credit_manager') && event.proposed_by !== state.userId
          && event.created_by !== state.userId && event.disbursed_by !== state.userId) {
        const reason = input('Independent classification decision reason', 'reason', 'text', { maxLength: 1000 }); reason.control.minLength = 10;
        const decision = select('Decision', 'decision', [{ value: 'approve', label: 'Approve classification' }, { value: 'reject', label: 'Reject classification' }]);
        const review = form('mfi-inline-form', reason.label, decision.label, submitButton('Record classification decision'));
        review.dataset.mfiForm = 'npl-decision'; review.dataset.eventId = event.id; pending.append(review);
      }
      area.append(pending);
    }
    const list = $('div', undefined, 'mfi-record-list');
    for (const loan of state.loans.filter((item) => ['disbursed','repaid'].includes(item.status))) {
      const item = $('article', undefined, 'panel mfi-record');
      item.append($('h3', `${loan.member_name} · ${money(loan.outstanding_principal)} outstanding`),
        $('p', `${loan.member_number} · ${loan.days_past_due ?? 0} DPD · current classification: ${loan.npl_status}`));
      if (hasRole('institution_admin','credit_manager','compliance') && loan.created_by !== state.userId && loan.checked_by !== state.userId && loan.disbursed_by !== state.userId) {
        const status = select('Risk classification', 'status', ['performing','watch','substandard','doubtful','loss'].map((value) => ({ value, label: value.replaceAll('_',' ') })));
        const reason = input('Assessment reason', 'reason', 'text', { maxLength: 1000 }); reason.control.minLength = 10;
        const assess = form('mfi-inline-form', status.label, reason.label, submitButton('Record classification'));
        assess.dataset.mfiForm = 'npl-classification'; assess.dataset.loanId = loan.id;
        item.append(assess);
      }
      list.append(item);
    }
    if (!list.childElementCount) list.append($('p', 'No disbursed loan exposures are available.', 'empty-state'));
    area.append(list); root.append(area);
  }

  function renderCreditPolicy(container) {
    const policies = state.creditPolicy ?? {};
    if (policies.active) container.append($('p', `Active credit policy v${policies.active.version} Â· approval score ${policies.active.policy.scorecard.minimum_score} Â· maximum debt service ${policies.active.policy.scorecard.maximum_debt_service_pct}%`, 'mfi-notice'));
    if (policies.pending) {
      container.append($('p', `Credit policy v${policies.pending.version} awaits approval. ${policies.pending.change_reason}`, 'mfi-notice'));
      if (hasRole('institution_admin') && policies.pending.created_by !== state.userId) {
        const reason = input('Independent policy review reason', 'reason', 'text', { maxLength: 1000 }); reason.control.minLength = 10;
        const decision = select('Decision', 'decision', [{ value: 'approve', label: 'Approve policy' }, { value: 'reject', label: 'Reject policy' }]);
        const review = form('mfi-inline-form', reason.label, decision.label, submitButton('Record policy decision'));
        review.dataset.mfiForm = 'credit-policy-decision'; review.dataset.policyId = policies.pending.id;
        container.append(review);
      }
    }
    if (!hasRole('institution_admin') || policies.pending) return;
    const existing = policies.active?.policy;
    const definitions = [
      ['Minimum score', 'minimum_score', 0, 100, existing?.scorecard.minimum_score],
      ['Maximum debt service (%)', 'maximum_debt_service_pct', 1, 100, existing?.scorecard.maximum_debt_service_pct],
      ['Savings coverage target (%)', 'savings_coverage_target_pct', 0, 1000, existing?.scorecard.savings_coverage_target_pct],
      ['Membership tenure target (days)', 'membership_tenure_target_days', 0, 36500, existing?.scorecard.membership_tenure_target_days],
      ['First-time borrower score', 'new_borrower_score', 0, 100, existing?.scorecard.new_borrower_score],
      ['Weight: affordability (%)', 'weight_affordability', 0, 100, existing?.scorecard.weights.affordability],
      ['Weight: savings (%)', 'weight_savings', 0, 100, existing?.scorecard.weights.savings],
      ['Weight: tenure (%)', 'weight_tenure', 0, 100, existing?.scorecard.weights.tenure],
      ['Weight: repayment history (%)', 'weight_repayment_history', 0, 100, existing?.scorecard.weights.repayment_history],
      ['Watch days past due', 'watch_days', 1, 3650, existing?.delinquency.watch_days],
      ['Substandard days past due', 'substandard_days', 1, 3650, existing?.delinquency.substandard_days],
      ['Doubtful days past due', 'doubtful_days', 1, 3650, existing?.delinquency.doubtful_days],
      ['Loss days past due', 'loss_days', 1, 3650, existing?.delinquency.loss_days],
    ];
    const controls = definitions.map(([label, name, min, max, value]) => {
      const field = input(label, name, 'number', { min: String(min), max: String(max), step: '1' });
      if (value !== undefined) field.control.value = String(value);
      return field.label;
    });
    const reason = input('Policy change reason', 'change_reason', 'text', { maxLength: 1000 }); reason.control.minLength = 10;
    const editor = form('mfi-policy-form', $('h3', existing ? 'Propose revised credit policy' : 'Configure credit and delinquency rules'),
      ...controls, reason.label, $('p', 'Score weights must total 100. Policy changes require approval by a different institution administrator.'), submitButton('Submit policy for approval'));
    editor.dataset.mfiForm = 'credit-policy';
    container.append(editor);
  }

  function renderStaff() {
    if (!hasRole('institution_admin')) return;
    const area = section('Institution staff', 'Grant existing active EthioLife finance and compliance users a separate role in this institution.');
    area.id = 'mfi-staff-roles';
    if (hasRole('institution_admin')) {
      const phone = input('Existing staff phone number', 'phone', 'tel', { maxLength: 32 });
      const role = select('Institution role', 'role', [
        { value: 'institution_admin', label: 'Institution administrator' },
        { value: 'finance_manager', label: 'Finance manager' },
        { value: 'credit_manager', label: 'Credit manager' },
        { value: 'loan_officer', label: 'Loan officer' },
        { value: 'teller', label: 'Teller' },
        { value: 'compliance', label: 'Compliance reviewer' },
        { value: 'auditor', label: 'Auditor' },
      ]);
      const provision = form('mfi-staff-form', $('h3', 'Add institution staff'), phone.label, role.label, submitButton('Grant institution access'));
      provision.dataset.mfiForm = 'provision-staff';
      area.append(provision);
    }
    const list = $('div', undefined, 'mfi-record-list');
    for (const staff of state.staff) {
      const row = $('article', undefined, 'panel mfi-record');
      row.append($('h3', staff.legal_name), $('p', `${staff.phone} · ${staff.role}${staff.active ? '' : ' · inactive'}`));
      list.append(row);
    }
    area.append(list);
    root.append(area);
  }

  function renderActivity() {
    const area = section('Recent journal activity', 'Posted, balanced financial events from this institution; each shows the general-ledger lines and acting staff member.');
    const list = $('div', undefined, 'mfi-record-list');
    for (const entry of state.transactions) {
      const row = $('article', undefined, 'panel mfi-record');
      const header = $('div', undefined, 'mfi-record-heading');
      const title = $('div', undefined, 'mfi-record-title');
      title.append($('h3', `${entry.transaction_type.replaceAll('_', ' ')} · ${money(entry.amount)}`),
        $('p', `${new Date(entry.posted_at).toLocaleString(document.documentElement.lang)} · ${entry.posted_by}`));
      header.append(title, $('span', 'Posted', 'mfi-status status-active'));
      row.append(header);
      for (const line of entry.lines) {
        row.append($('p', `${line.account_code} ${line.account_name}${line.account_number ? ` · ${line.account_number}` : ''} · Dr ${money(line.debit)} · Cr ${money(line.credit)}`));
      }
      if (entry.reversal_of) row.append($('p', `Reversal of journal ${entry.reversal_of}${entry.reversal_reason ? ` · ${entry.reversal_reason}` : ''}`, 'mfi-notice'));
      if (entry.reversal_id) row.append($('p', `Reversed by journal ${entry.reversal_id}`, 'mfi-notice'));
      if (!entry.reversal_of && !entry.reversal_id
          && hasRole('institution_admin', 'finance_manager')
          && entry.created_by !== state.userId) {
        const reason = input('Reason for full reversal', 'reason', 'text', { maxLength: 1000 });
        reason.control.minLength = 10;
        const reverse = form('mfi-inline-form', reason.label, submitButton('Reverse full transaction'));
        reverse.dataset.mfiForm = 'reverse-journal';
        reverse.dataset.journalId = entry.id;
        const key = $('input');
        key.type = 'hidden';
        key.name = 'idempotency_key';
        key.value = newIdempotencyKey();
        reverse.append(key);
        row.append(reverse);
      }
      list.append(row);
    }
    if (!state.transactions.length) list.append($('p', 'No financial events have been posted.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderAudit() {
    if (!hasRole('institution_admin', 'finance_manager', 'compliance', 'auditor')) return;
    const area = section('Institution audit trail', 'Immutable record of controlled changes and the actor responsible.');
    const list = $('div', undefined, 'mfi-record-list');
    for (const entry of state.audit) {
      const row = $('article', undefined, 'panel mfi-record');
      row.append($('h3', `${entry.action.replaceAll('_', ' ')} · ${entry.entity}`),
        $('p', `${new Date(entry.created_at).toLocaleString(document.documentElement.lang)} · ${entry.actor_name} · ${entry.entity_id}`));
      list.append(row);
    }
    if (!state.audit.length) list.append($('p', 'No audited actions yet.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderProducts() {
    const area = section('Institution products', 'These starter products support only the currently implemented pilot workflows. Product configuration, versioning, pricing, and publication approvals are not available.');
    const list = $('div', undefined, 'mfi-record-list');
    for (const product of state.products) {
      const row = $('article', undefined, 'panel mfi-record');
      row.append($('div', `${product.product_code} · ${product.name}`, 'mfi-record-title'),
        $('p', `${product.product_type.replaceAll('_', ' ')} · ${product.active ? 'Active for pilot workflows' : 'Inactive'}${product.product_type === 'savings' ? ` · minimum balance ${money(product.minimum_balance)}` : ''}`));
      list.append(row);
    }
    if (!state.products.length) list.append($('p', 'No products are configured.', 'empty-state'));
    area.append(list);
    root.append(area);
  }

  function renderNotImplementedModule(module) {
    const area = section(module.label, module.summary);
    const notice = $('p', 'Not available in this release. No transactions or compliance decisions can be performed from this page. Do not record these activities outside approved institutional procedures.', 'mfi-notice');
    area.append(notice, $('h3', 'Baseline functions not yet available'), $('ul', undefined, 'mfi-requirement-list'));
    const list = area.querySelector('.mfi-requirement-list');
    for (const requirement of module.requirements) list.append($('li', requirement));
    root.append(area);
  }

  function renderSelectedModule() {
    const module = mfiModules.find((item) => item.id === state.module) ?? mfiModules[0];
    const canAccess = state.membership?.role === 'platform_super_admin' || module.roles.includes(state.membership?.role);
    const content = $('div', undefined, 'mfi-module-content');
    content.id = 'mfi-module-content';
    content.setAttribute('aria-live', 'polite');
    root.append(content);
    if (!canAccess) {
      content.append($('p', 'This module is outside your institution role. Contact your institution administrator if your responsibilities have changed.', 'empty-state'));
      return;
    }
    renderSubmodulePanel(module, state, root);

    const renderers = {
      overview: renderOverview,
      institution: renderInstitution,
      members: renderMembers,
      products: renderProducts,
      savings: renderAccounts,
      shares: renderAccounts,
      credit: renderLoans,
      collections: renderCollections,
      'risk-fraud': renderRisk,
      accounting: renderActivity,
      compliance: () => { renderMembers(); renderAudit(); },
      staff: renderStaff,
      audit: renderAudit,
    };
    if (renderers[module.id]) {
      renderers[module.id]();
      return;
    }
    renderNotImplementedModule(module);
  }

  function render() {
    root.replaceChildren();
    const header = section('SACCO / MFI operations', 'Member services and principal-only financial operations, kept separate from EthioLife Agency records.');
    root.append(header);
    if (state.error) root.append($('p', state.error, 'alert error'));
    if (!state.institutions.length) {
      renderNoInstitution();
      return;
    }

    if (state.institutions.length > 1) {
      const chooser = select('Institution', 'institution_id', state.institutions.map((item) => ({
        value: item.id, label: `${item.institution_code} · ${item.name}`,
      })));
      chooser.control.value = state.institutionId;
      chooser.control.dataset.mfiInstitution = 'true';
      root.append(chooser.label);
    }
    if (!state.institutionId || !state.overview) {
      root.append($('p', 'Loading institution records…', 'empty-state'));
      return;
    }
    const selected = state.institutions.find((item) => item.id === state.institutionId);
    state.membership = selected;
    const label = $('p', `${selected?.institution_code ?? ''} · ${selected?.name ?? ''}`, 'mfi-tenant-label');
    root.append(label);
    const profile = institutionRoleProfiles[selected?.role === 'platform_super_admin' ? 'super_admin' : selected?.role] ?? {
      label: selected?.role?.replaceAll('_', ' ') ?? 'Institution member',
      responsibilities: 'Your available actions are determined by your active institution role.',
    };
    const roleCard = $('section', undefined, 'mfi-role-card panel');
    const roleHeading = $('div', undefined, 'mfi-role-heading');
    roleHeading.append($('div', undefined, 'mfi-role-copy'));
    roleHeading.firstChild.append($('h3', `Welcome, ${user.legal_name}`), $('p', profile.responsibilities));
    roleHeading.append($('span', profile.label, 'mfi-role-badge'));
    roleCard.append(roleHeading);
    root.append(roleCard);

    const navigation = $('nav', undefined, 'mfi-module-nav');
    navigation.setAttribute('aria-label', 'SACCO / MFI services');
    const searchLabel = $('label', 'Find a service', 'mfi-service-search');
    const searchField = $('input');
    searchField.type = 'search';
    searchField.name = 'service_search';
    searchField.placeholder = 'Search service areas';
    searchField.autocomplete = 'off';
    searchField.value = state.moduleSearch;
    searchField.dataset.mfiServiceSearch = 'true';
    searchField.setAttribute('aria-describedby', 'mfi-service-search-status');
    searchLabel.append(searchField);
    navigation.append(searchLabel);
    const searchStatus = $('p', 'Browse all services or filter by name.', 'mfi-search-status');
    searchStatus.id = 'mfi-service-search-status';
    searchStatus.setAttribute('role', 'status');
    searchStatus.setAttribute('aria-live', 'polite');
    navigation.append(searchStatus);
    const visibleModules = mfiModules.filter((module) =>
      state.membership?.role === 'platform_super_admin' || module.roles.includes(state.membership?.role));
    const groupOrder = ['Workspace', 'Customer operations', 'Money movement', 'Financial control', 'Risk & assurance', 'Member experience', 'Administration'];
    for (const group of groupOrder) {
      const groupModules = visibleModules.filter((module) => module.group === group);
      if (!groupModules.length) continue;
      const groupHeading = $('h3', group, 'mfi-module-group');
      groupHeading.dataset.mfiNavGroup = group;
      navigation.append(groupHeading);
      for (const module of groupModules) {
        const link = $('button', undefined, `mfi-module-link${state.module === module.id ? ' active' : ''}`);
        link.type = 'button';
        link.dataset.mfiModule = module.id;
        link.dataset.moduleGroup = group;
        link.dataset.moduleSearch = `${group} ${module.label}`.toLocaleLowerCase();
        link.setAttribute('aria-current', state.module === module.id ? 'page' : 'false');
        link.append($('span', module.label, 'mfi-module-name'),
          $('span', module.status === 'pilot' ? 'Pilot' : module.status === 'partial' ? 'Partial' : 'Not live', `mfi-module-status status-${module.status}`));
        navigation.append(link);
      }
    }
    root.append(navigation);
    renderSelectedModule();
  }

  async function load() {
    state.error = '';
    state.overview = null;
    try {
      state.institutions = await api('/mfi/institutions');
      if (!state.institutions.some((item) => item.id === state.institutionId)) {
        state.institutionId = state.institutions.some((item) => item.id === savedInstitution)
          ? savedInstitution
          : state.institutions[0]?.id ?? '';
      }
      const savedModule = localStorage.getItem(`afrolife.mfi-module.${state.institutionId}`);
      if (savedModule && mfiModules.some((module) => module.id === savedModule)) state.module = savedModule;
      if (!state.institutionId) {
        render();
        return;
      }
      localStorage.setItem('afrolife.mfi-institution', state.institutionId);
      const id = encodeURIComponent(state.institutionId);
      const membership = state.institutions.find((item) => item.id === state.institutionId);
      const canManageStaff = isPlatformAdmin(user.role) || ['institution_admin', 'finance_manager'].includes(membership?.role);
      const canReadAudit = isPlatformAdmin(user.role) || ['institution_admin', 'finance_manager', 'compliance', 'auditor'].includes(membership?.role);
      const canReadCollections = isPlatformAdmin(user.role) || ['institution_admin','finance_manager','credit_manager','loan_officer','compliance','auditor'].includes(membership?.role);
      const canReadNpl = isPlatformAdmin(user.role) || ['institution_admin','finance_manager','credit_manager','compliance','auditor'].includes(membership?.role);
      const [overview, members, products, accounts, loans, staff, transactions, audit, creditPolicy, collections, nplEvents] = await Promise.all([
        api(`/mfi/institutions/${id}/overview`),
        api(`/mfi/institutions/${id}/members`),
        api(`/mfi/institutions/${id}/products`),
        api(`/mfi/institutions/${id}/accounts`),
        api(`/mfi/institutions/${id}/loans`),
        canManageStaff ? api(`/mfi/institutions/${id}/staff`) : Promise.resolve([]),
        api(`/mfi/institutions/${id}/transactions`),
        canReadAudit ? api(`/mfi/institutions/${id}/audit`) : Promise.resolve([]),
        api(`/mfi/institutions/${id}/credit-policy`),
        canReadCollections ? api(`/mfi/institutions/${id}/collections`) : Promise.resolve([]),
        canReadNpl ? api(`/mfi/institutions/${id}/npl-events`) : Promise.resolve([]),
      ]);
      Object.assign(state, { overview, members, products, accounts, loans, staff, transactions, audit, creditPolicy, collections, nplEvents });
    } catch (error) {
      state.error = error.message;
    }
    render();
  }

  async function submit(event) {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || !target.dataset.mfiForm) return;
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const values = Object.fromEntries(new FormData(target).entries());
    const id = encodeURIComponent(state.institutionId);
    try {
      let path;
      let method = 'POST';
      if (target.dataset.mfiForm === 'create-institution') {
        path = '/mfi/institutions';
        values.institution_code = values.institution_code.trim().toUpperCase();
      } else if (target.dataset.mfiForm === 'provision-staff') {
        path = `/mfi/institutions/${id}/staff`;
      } else if (target.dataset.mfiForm === 'create-member') {
        path = `/mfi/institutions/${id}/members`;
      } else if (target.dataset.mfiForm === 'review-member') {
        path = `/mfi/institutions/${id}/members/${encodeURIComponent(target.dataset.memberId)}/review`;
      } else if (target.dataset.mfiForm === 'member-lifecycle') {
        path = `/mfi/institutions/${id}/members/${encodeURIComponent(target.dataset.memberId)}/lifecycle`;
      } else if (target.dataset.mfiForm === 'open-account') {
        path = `/mfi/institutions/${id}/members/${encodeURIComponent(values.member_id)}/accounts`;
      } else if (target.dataset.mfiForm === 'account-transaction') {
        path = `/mfi/institutions/${id}/accounts/${encodeURIComponent(target.dataset.accountId)}/transactions`;
        values.idempotency_key = target.elements.idempotency_key.value;
        values.amount = values.amount.trim();
      } else if (target.dataset.mfiForm === 'create-loan') {
        path = `/mfi/institutions/${id}/loans`;
        values.principal_amount = values.principal_amount.trim();
        values.term_months = Number(values.term_months);
        values.monthly_income = values.monthly_income.trim();
        values.monthly_expenses = values.monthly_expenses.trim();
        values.monthly_debt = values.monthly_debt.trim();
      } else if (target.dataset.mfiForm === 'loan-decision') {
        path = `/mfi/institutions/${id}/loans/${encodeURIComponent(target.dataset.loanId)}/decision`;
      } else if (target.dataset.mfiForm === 'credit-policy') {
        path = `/mfi/institutions/${id}/credit-policy`;
        values.policy = {
          scorecard: {
            minimum_score: Number(values.minimum_score), maximum_debt_service_pct: Number(values.maximum_debt_service_pct),
            savings_coverage_target_pct: Number(values.savings_coverage_target_pct), membership_tenure_target_days: Number(values.membership_tenure_target_days),
            new_borrower_score: Number(values.new_borrower_score),
            weights: { affordability: Number(values.weight_affordability), savings: Number(values.weight_savings),
              tenure: Number(values.weight_tenure), repayment_history: Number(values.weight_repayment_history) },
          },
          delinquency: { watch_days: Number(values.watch_days), substandard_days: Number(values.substandard_days),
            doubtful_days: Number(values.doubtful_days), loss_days: Number(values.loss_days) },
        };
        delete values.minimum_score; delete values.maximum_debt_service_pct; delete values.savings_coverage_target_pct;
        delete values.membership_tenure_target_days; delete values.new_borrower_score;
        delete values.weight_affordability; delete values.weight_savings; delete values.weight_tenure; delete values.weight_repayment_history;
        delete values.watch_days; delete values.substandard_days; delete values.doubtful_days; delete values.loss_days;
      } else if (target.dataset.mfiForm === 'credit-policy-decision') {
        path = `/mfi/institutions/${id}/credit-policy/${encodeURIComponent(target.dataset.policyId)}/approve`;
      } else if (target.dataset.mfiForm === 'npl-classification') {
        path = `/mfi/institutions/${id}/loans/${encodeURIComponent(target.dataset.loanId)}/npl-classification`;
      } else if (target.dataset.mfiForm === 'npl-decision') {
        path = `/mfi/institutions/${id}/npl-events/${encodeURIComponent(target.dataset.eventId)}/decision`;
      } else if (target.dataset.mfiForm === 'open-collection') {
        path = `/mfi/institutions/${id}/loans/${encodeURIComponent(target.dataset.loanId)}/collections`;
      } else if (target.dataset.mfiForm === 'collection-event') {
        path = `/mfi/institutions/${id}/collections/${encodeURIComponent(target.dataset.caseId)}/events`;
        if (!values.promised_amount) delete values.promised_amount;
        if (!values.promised_on) delete values.promised_on;
        if (values.next_action_at) values.next_action_at = new Date(values.next_action_at).toISOString();
        else delete values.next_action_at;
        if (values.promised_amount) values.promised_amount = values.promised_amount.trim();
      } else if (target.dataset.mfiForm === 'close-collection') {
        path = `/mfi/institutions/${id}/collections/${encodeURIComponent(target.dataset.caseId)}/close`;
      } else if (target.dataset.mfiForm === 'disburse-loan') {
        path = `/mfi/institutions/${id}/loans/${encodeURIComponent(target.dataset.loanId)}/disburse`;
        values.idempotency_key = target.elements.idempotency_key.value;
      } else if (target.dataset.mfiForm === 'repay-loan') {
        path = `/mfi/institutions/${id}/loans/${encodeURIComponent(target.dataset.loanId)}/repay`;
        values.idempotency_key = target.elements.idempotency_key.value;
        values.amount = values.amount.trim();
      } else if (target.dataset.mfiForm === 'reverse-journal') {
        path = `/mfi/institutions/${id}/journals/${encodeURIComponent(target.dataset.journalId)}/reverse`;
        values.idempotency_key = target.elements.idempotency_key.value;
      }
      if (!path) return;
      const response = await api(path, { method, body: JSON.stringify(values) });
      state.error = response?.replayed ? 'This request was already posted; the original financial event was returned.' : 'Saved successfully.';
      await load();
    } catch (error) {
      state.error = error.message;
      const notice = root.querySelector('.mfi-error');
      if (notice) notice.textContent = error.message;
      else {
        const message = $('p', error.message, 'alert error mfi-error');
        root.prepend(message);
      }
    } finally {
      state.busy = false;
    }
  }

  root.addEventListener('submit', (event) => { submit(event).catch((error) => {
    state.error = error.message;
    render();
  }); });
  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-mfi-institution]')) {
      state.institutionId = event.target.value;
      localStorage.setItem('afrolife.mfi-institution', state.institutionId);
      load();
    }
  });
  root.addEventListener('click', (event) => {
    const focusButton = event.target.closest('[data-mfi-focus-target]');
    if (focusButton) {
      const target = root.querySelector(`#${CSS.escape(focusButton.dataset.mfiFocusTarget)}`);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
      return;
    }
    const button = event.target.closest('[data-mfi-module]');
    if (!button) return;
    state.module = button.dataset.mfiModule;
    localStorage.setItem(`afrolife.mfi-module.${state.institutionId}`, state.module);
    render();
    root.querySelector(`[data-mfi-module="${CSS.escape(state.module)}"]`)?.focus();
  });
  root.addEventListener('input', (event) => {
    const search = event.target.closest('[data-mfi-service-search]');
    if (!search) return;
    state.moduleSearch = search.value.trim().toLocaleLowerCase();
    const links = [...root.querySelectorAll('.mfi-module-link[data-mfi-module]')];
    let visibleCount = 0;
    for (const link of links) {
      link.hidden = !!state.moduleSearch && !link.dataset.moduleSearch.includes(state.moduleSearch);
      if (!link.hidden) visibleCount += 1;
    }
    for (const heading of root.querySelectorAll('[data-mfi-nav-group]')) {
      heading.hidden = !links.some((link) => link.dataset.moduleGroup === heading.dataset.mfiNavGroup && !link.hidden);
    }
    const status = root.querySelector('#mfi-service-search-status');
    if (status) status.textContent = state.moduleSearch
      ? `${visibleCount} service ${visibleCount === 1 ? 'area' : 'areas'} match “${search.value.trim()}”.`
      : 'Browse all services or filter by name.';
  });
  state.userId = user.id;
  load();
  return root;
}
