import { t } from './i18n.js';

const isPlatformAdmin = (role) => role === 'global_admin' || role === 'super_admin';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = t(String(text));
  if (className) element.className = className;
  return element;
}

function textInput(labelText, name, value = '', type = 'text') {
  const label = node('label', labelText);
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.required = true;
  input.value = value ?? '';
  label.append(input);
  return label;
}

function submitButton(labelText) {
  const button = node('button', labelText, 'button button-primary');
  button.type = 'submit';
  return button;
}

function card(title, description, status) {
  const element = node('article', undefined, 'list-card');
  element.append(node('h3', title), node('p', description));
  if (status) element.append(node('span', status, `status status-${status}`));
  return element;
}

function actionButton(label, action, id, decision) {
  const button = node('button', label, 'button button-outline');
  button.type = 'button';
  button.dataset.edirAction = action;
  button.dataset.id = id;
  if (decision) button.dataset.decision = decision;
  return button;
}

function storedIdempotencyKey(userId, transactionType, accountId, amount) {
  const storageKey = `afrolife.edir.${userId}.${transactionType}.${accountId}.${amount}`;
  let id = sessionStorage.getItem(storageKey);
  if (!id) {
    id = globalThis.crypto.randomUUID();
    sessionStorage.setItem(storageKey, id);
  }
  return { storageKey, id };
}

function percentageBps(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function formatBps(value) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}%`;
}

export function createEdirWorkspace(api, user, onOrganizationChange = () => {}) {
  const root = node('div', undefined, 'edir-workspace');
  const isAdmin = isPlatformAdmin(user.role);
  const canManage = () => isAdmin || me.staff_roles.includes('edir_admin');
  const isMaster = () => me.staff_roles.includes('edir_master_admin') || me.staff_roles.includes('org_onboarding_admin');
  const canViewRegistry = () => isAdmin || me.staff_roles.length > 0;
  const canViewAudit = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'compliance', 'auditor', 'finance_manager', 'treasurer', 'credit_manager'].includes(role));
  const canManageFinance = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'finance_manager', 'treasurer'].includes(role));
  const canReadFinance = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'finance_manager', 'treasurer', 'credit_officer', 'credit_manager', 'compliance', 'auditor'].includes(role));
  const canManageCredit = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'credit_manager'].includes(role));
  const canReadCredit = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'credit_officer', 'credit_manager', 'finance_manager', 'treasurer', 'compliance', 'auditor'].includes(role));
  const canManageLoanServicing = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'credit_manager', 'finance_manager', 'treasurer'].includes(role));
  const canAssessCredit = () => isAdmin
    || me.staff_roles.some((role) => ['edir_admin', 'credit_officer', 'credit_manager'].includes(role));
  let loading = true;
  let error = '';
  let notice = '';
  let me = { membership: null, groups: [], staff_roles: [] };
  let members = [];
  let groups = [];
  let audit = [];
  let staff = [];
  let finance = { membership: null, accounts: [], transactions: [] };
  let financialProducts = [];
  let financialAccounts = [];
  let financialTransactions = [];
  let credit = { membership: null, applications: [] };
  let creditPolicies = [];
  let creditApplications = [];
  let memberLoans = [];
  let servicingLoans = [];
  let organizations = [];
  let consolidatedSummary = [];
  let registrationApplications = [];
  let insuranceOrganizations = [];
  let insuranceSummary = [];
  let insuranceMasterAccess = false;

  async function load() {
    loading = true;
    error = '';
    try {
      [organizations, me] = await Promise.all([api('/edir/organizations'), api('/edir/me')]);
      members = [];
      groups = [];
      audit = [];
      staff = [];
      financialProducts = [];
      financialAccounts = [];
      financialTransactions = [];
      if (canViewRegistry()) {
        [members, groups] = await Promise.all([
          api('/edir/memberships'),
          api('/edir/groups'),
        ]);
      } else if (me.staff_roles.length || me.membership?.status === 'active') {
        groups = await api('/edir/groups');
      }
      if (canViewAudit()) audit = await api('/edir/audit');
      if (isAdmin || me.staff_roles.includes('edir_admin')) {
        staff = await api('/edir/staff');
      }
      if (isMaster() && user.edir_id === '00000000-0000-4000-8000-000000000001') {
        [staff, consolidatedSummary, registrationApplications] = await Promise.all([
          api('/edir/staff'), api('/edir/master/summary'), api('/edir/registration-applications'),
        ]);
        // Insurance has its own staff authority and ledger, even though it
        // follows the same organization hierarchy.
        insuranceMasterAccess = (await api('/insurance/ledger/master/access')).allowed;
        insuranceOrganizations = await api('/insurance/ledger/organizations');
        insuranceSummary = insuranceMasterAccess ? await api('/insurance/ledger/master/summary') : [];
      }
      [finance, financialProducts] = await Promise.all([
        api('/edir/finance/me'),
        api('/edir/finance/products'),
      ]);
      if (canReadFinance()) {
        [financialAccounts, financialTransactions] = await Promise.all([
          api('/edir/finance/accounts'),
          api('/edir/finance/transactions'),
        ]);
      }
      [credit, creditPolicies] = await Promise.all([
        api('/edir/credit/me'),
        api('/edir/credit/policies'),
      ]);
      creditApplications = canReadCredit() ? await api('/edir/credit/applications') : [];
      memberLoans = await api('/edir/credit/loans/me');
      servicingLoans = canReadCredit() ? await api('/edir/credit/loans') : [];
    } catch (reason) {
      error = reason.message;
    } finally {
      loading = false;
      render();
    }
  }

  function renderMasterDashboard() {
    const section = node('section', undefined, 'panel form-card');
    section.id = 'edir-master';
    section.append(node('h2', 'Umbrella Master Edir management'));
    section.append(node('p', 'Onboard independent Edirs and coordinate their operations. Each Edir keeps its own governance, member registry, staff assignments, financial products, and ledger. This dashboard contains cross-Edir totals only.'));
    const onboarding = node('form', undefined, 'inline-form');
    onboarding.id = 'edir-master-registration';
    onboarding.dataset.edirForm = 'organization';
    onboarding.append(node('h3', 'Onboard an independent Edir'));
    onboarding.append(textInput('Edir display name', 'display_name'));
    onboarding.append(textInput('Legal name', 'legal_name'));
    onboarding.append(textInput('Registration reference (optional)', 'registration_reference', '', 'text'));
    onboarding.append(textInput('Governance/bylaws reference (optional)', 'governance_reference', '', 'text'));
    onboarding.querySelectorAll('input[name="registration_reference"],input[name="governance_reference"]').forEach((input) => { input.required = false; });
    onboarding.append(submitButton('Submit Edir for onboarding review'));
    section.append(onboarding);
    const applicationsList = node('div', undefined, 'list');
    applicationsList.id = 'edir-master-applications';
    applicationsList.append(node('h3', `Edir registration applications (${registrationApplications.length})`));
    for (const application of registrationApplications) {
      const item = card(application.display_name,
        `${application.legal_name} · Contact ${application.contact_name}, ${application.contact_phone}${application.contact_email ? ` · ${application.contact_email}` : ''} · ${application.registration_reference ?? 'No registration reference'} · ${application.status}`,
        application.status);
      if (application.status === 'pending') {
        item.append(actionButton('Approve and activate', 'registration-decision', application.id, 'accepted'));
        item.append(actionButton('Reject application', 'registration-decision', application.id, 'rejected'));
      }
      applicationsList.append(item);
    }
    if (!registrationApplications.length) applicationsList.append(node('p', 'No public Edir registration applications have been received.'));
    section.append(applicationsList);
    const organizationsList = node('div', undefined, 'list');
    organizationsList.id = 'edir-master-organizations';
    organizationsList.append(node('h3', 'Independent Edirs'));
    for (const organization of organizations.filter((item) => item.organization_type !== 'umbrella_master')) {
      const item = card(organization.display_name, `${organization.legal_name} · ${organization.registration_reference ?? 'Registration reference not recorded'} · ${organization.onboarding_status}`, organization.onboarding_status);
      if (organization.onboarding_status === 'pending' || organization.onboarding_status === 'review') {
        item.append(actionButton('Activate Edir', 'org-decision', organization.id, 'active'));
        item.append(actionButton('Reject onboarding', 'org-decision', organization.id, 'rejected'));
      }
      if (organization.onboarding_status === 'active' && insuranceMasterAccess) {
        const staffForm = node('form', undefined, 'inline-form');
        staffForm.dataset.edirForm = 'organization-staff';
        staffForm.dataset.organizationId = organization.id;
        staffForm.append(textInput('AfroLife user ID', 'user_id'));
        const roleField = node('label', 'Local Edir role');
        const roleSelect = document.createElement('select');
        roleSelect.name = 'role';
        for (const role of ['edir_admin','member_support','compliance','auditor','finance_manager','treasurer','credit_officer','credit_manager']) {
          const option = node('option', role); option.value = role; roleSelect.append(option);
        }
        roleField.append(roleSelect);
        staffForm.append(roleField, submitButton('Assign local Edir staff'));
        item.append(staffForm);
      }
      organizationsList.append(item);
    }
    if (!organizationsList.querySelector('.list-card')) organizationsList.append(node('p', 'No affiliated independent Edirs are registered yet.'));
    section.append(organizationsList);
    const report = node('div', undefined, 'list');
    report.append(node('h3', 'Consolidated operating totals (no member-level details)'));
    for (const row of consolidatedSummary) {
      report.append(card(row.organization_name,
        `${row.onboarding_status} · ${row.active_members} active members · ${row.pending_members} pending · ${row.active_groups} groups · ${row.approved_transactions} approved transactions · ETB ${row.approved_volume}`));
    }
    if (!consolidatedSummary.length) report.append(node('p', 'No independent Edir totals are available yet.'));
    section.append(report);
    const staffSection = node('div', undefined, 'list');
    staffSection.id = 'edir-master-staff';
    staffSection.append(node('h3', 'Umbrella Master Edir staff'));
    for (const assignment of staff) {
      if (assignment.organization_id === '00000000-0000-4000-8000-000000000001') {
        staffSection.append(card(assignment.user_id, `${assignment.role} · ${assignment.active ? 'active' : 'inactive'}`));
      }
    }
    section.append(staffSection);
    const insurance = node('div', undefined, 'list');
    insurance.id = 'edir-master-insurance';
    insurance.append(node('h3', 'Separate Insurance Edir ledgers and reporting'));
    insurance.append(node('p', 'Insurance administration is independently assigned. Each insurance organization has its own account and journal books; this view reports only aggregate counts and totals.'));
    for (const organization of organizations.filter((item) => item.organization_type !== 'umbrella_master')) {
      const insuranceOrg = insuranceOrganizations.find((item) => item.id === organization.id);
      const item = card(organization.display_name,
        insuranceOrg ? `Insurance ledger ${insuranceOrg.status} Â· ${insuranceOrg.legal_name}` : 'Insurance ledger has not been registered for this Edir.',
        insuranceOrg?.status ?? 'not-configured');
      if (organization.onboarding_status === 'active') {
        if (!insuranceOrg) {
          const sync = node('form', undefined, 'inline-form');
          sync.dataset.edirForm = 'insurance-register';
          sync.dataset.organizationId = organization.id;
          sync.dataset.displayName = organization.display_name;
          sync.dataset.legalName = organization.legal_name;
          sync.append(submitButton('Create separate Insurance ledger'));
          item.append(sync);
        }
        const staffForm = node('form', undefined, 'inline-form');
        staffForm.dataset.edirForm = 'insurance-staff';
        staffForm.dataset.organizationId = organization.id;
        staffForm.append(textInput('AfroLife user ID', 'user_id'));
        const roleField = node('label', 'Insurance role');
        const roleSelect = document.createElement('select');
        roleSelect.name = 'role';
        for (const role of ['insurance_admin','finance','finance_manager','compliance','auditor']) {
          const option = node('option', role); option.value = role; roleSelect.append(option);
        }
        roleField.append(roleSelect);
        staffForm.append(roleField, submitButton('Assign Insurance staff'));
        item.append(staffForm);
      }
      insurance.append(item);
    }
    insurance.append(node('h3', 'Insurance consolidated totals'));
    if (!insuranceMasterAccess) insurance.append(node('p', 'An AfroLife platform administrator must assign a separate Insurance Master Edir administrator before these books can be configured or aggregated.'));
    for (const row of insuranceSummary) {
      insurance.append(card(row.organization_name, `${row.status} Â· ${row.ledger_accounts} accounts Â· ${row.posted_journals} posted journals Â· ETB ${row.posted_volume}`));
    }
    if (!insuranceSummary.length) insurance.append(node('p', 'No Insurance ledger totals are available yet. An independently authorized Insurance Master Edir operator must connect and manage these books.'));
    section.append(insurance);
    root.append(section);
  }

  function renderEnrollment() {
    if (user.kyc_status !== 'verified') {
      const reminder = node('section', undefined, 'panel form-card');
      reminder.append(node('h3', 'AfroLife Edir membership offer'));
      reminder.append(node('p', 'Edir membership is available to registered workers, employers, landlords, tenants, sellers, buyers, and other AfroLife users after KYC has been verified. Complete KYC review to request membership.'));
      root.append(reminder);
      return;
    }
    const form = node('form', undefined, 'panel form-card inline-form');
    form.id = 'edir-membership';
    form.dataset.edirForm = 'enroll';
    form.append(node('h3', 'Request AfroLife Edir membership'));
    const terms = node('label', undefined, 'span-2');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'accept_nonfinancial_terms';
    checkbox.required = true;
    const description = node('span', 'I understand this pilot records a membership request only. No dues, contributions, insurance, or payouts are collected or promised.');
    terms.append(checkbox, description);
    form.append(terms, submitButton('Submit membership request'));
    root.append(form);
  }

  function renderBenefits() {
    const benefits = node('section', undefined, 'panel form-card');
    benefits.append(node('h3', 'Available Edir benefits and services'));
    benefits.append(node('p', 'Membership includes a reviewed request to join the central Edir community. The active product options below are set by AfroLife Edir administrators and may be subject to product terms and approval.'));
    const activeProducts = financialProducts.filter((product) => product.status === 'active');
    if (activeProducts.length) {
      const productList = node('div', undefined, 'list');
      for (const product of activeProducts) {
        productList.append(card(product.name, `${product.product_type} · Minimum balance ETB ${product.minimum_balance}`, 'available'));
      }
      benefits.append(productList);
    } else {
      benefits.append(node('p', 'Community membership and group participation are available after review. No financial products are currently open for enrollment.'));
    }
    benefits.append(node('p', 'Insurance, lending, and benefit payouts are not currently available through this pilot. Product availability and terms can change as the program is configured.'));
    root.append(benefits);
  }

  function renderMember() {
    const membership = me.membership;
    if (!membership) {
      if (user.kyc_status === 'verified') renderBenefits();
      renderEnrollment();
      return;
    }
    const profile = card(
      membership.full_name,
      `Member number ${membership.member_number} · Request submitted ${new Date(membership.created_at).toLocaleDateString(document.documentElement.lang)}`,
      membership.status,
    );
    profile.id = 'edir-membership';
    if (membership.status === 'pending') {
      profile.append(node('p', 'Your membership is awaiting independent review. No financial activity is enabled.'));
    } else if (membership.status === 'rejected' || membership.status === 'suspended' || membership.status === 'closed') {
      profile.append(node('p', membership.review_reason ?? 'Contact AfroLife Edir administration for information.'));
    } else {
      profile.append(node('p', 'You are enrolled in the central AfroLife Edir registry. Your membership does not create a deposit or payment account.'));
    }
    root.append(profile);
    renderBenefits();

    if (membership.status === 'active') {
      const section = node('section', undefined, 'panel form-card');
      section.id = 'edir-member-groups';
      section.append(node('h3', 'Your Edir groups'));
      if (me.groups.length) {
        const list = node('div', undefined, 'list');
        for (const group of me.groups) list.append(card(group.name, `${group.group_code} · ${group.description}`));
        section.append(list);
      } else {
        section.append(node('p', 'You are not assigned to an Edir group yet. Contact an Edir administrator.'));
      }
      root.append(section);
    }
  }

  function renderAdmin() {
    const section = node('section', undefined, 'panel form-card');
    section.id = 'edir-governance';
    section.append(node('h2', 'Edir administration'));
    section.append(node('p', 'Review central membership requests, organize community groups, and inspect the append-only Edir audit trail. Money movement requires a separate approver and creates immutable double-entry ledger postings.'));

    const pending = members.filter((member) => member.status === 'pending');
    const memberList = node('div', undefined, 'list');
    memberList.append(node('h3', `Central member registry (${members.length})`));
    if (!members.length) memberList.append(node('p', 'No Edir membership requests have been submitted.'));
    for (const member of members) {
      const item = card(member.full_name, `${member.member_number} · ${member.phone} · ${member.status} · ${member.group_count} groups`, member.status);
      if (member.status === 'pending' && member.created_by !== user.id) {
        item.append(actionButton('Approve membership', 'review', member.id, 'active'));
        item.append(actionButton('Reject membership', 'review', member.id, 'rejected'));
      } else if (member.user_id !== user.id && member.status === 'active') {
        item.append(actionButton('Suspend membership', 'lifecycle', member.id, 'suspended'));
        item.append(actionButton('Close membership', 'lifecycle', member.id, 'closed'));
      } else if (member.user_id !== user.id && member.status === 'suspended') {
        item.append(actionButton('Reactivate membership', 'lifecycle', member.id, 'active'));
        item.append(actionButton('Close membership', 'lifecycle', member.id, 'closed'));
      }
      memberList.append(item);
    }
    section.append(memberList);

    const groupForm = node('form', undefined, 'inline-form');
    groupForm.dataset.edirForm = 'group';
    groupForm.append(node('h3', 'Create a central Edir group'));
    groupForm.append(textInput('Group code', 'group_code'));
    groupForm.append(textInput('Group name', 'name'));
    groupForm.append(textInput('Description', 'description'));
    groupForm.append(submitButton('Create group'));
    section.append(groupForm);

    const groupList = node('div', undefined, 'list');
    groupList.id = 'edir-group-management';
    groupList.append(node('h3', 'Central groups'));
    if (!groups.length) groupList.append(node('p', 'No groups have been created.'));
    for (const group of groups) {
      const item = card(group.name, `${group.group_code} · ${group.member_count} members · ${group.description}`, group.status);
      if (group.status === 'active') {
        const assignedMemberIds = group.member_ids ?? [];
        const eligible = members.filter((member) => member.status === 'active' && !assignedMemberIds.includes(member.id));
        if (eligible.length) {
          const form = node('form', undefined, 'inline-form');
          form.dataset.edirForm = 'assign';
          form.dataset.groupId = group.id;
          const label = node('label', 'Assign approved member');
          const select = document.createElement('select');
          select.name = 'membership_id';
          select.required = true;
          for (const member of eligible) {
            const option = node('option', `${member.full_name} · ${member.member_number}`);
            option.value = member.id;
            select.append(option);
          }
          label.append(select);
          form.append(label, submitButton('Add to group'));
          item.append(form);
        }
        item.append(actionButton('Archive group', 'archive-group', group.id));
      }
      groupList.append(item);
    }
    section.append(groupList);

    const auditSection = node('div', undefined, 'list');
    auditSection.append(node('h3', 'Recent Edir audit activity'));
    for (const event of audit.slice(0, 20)) {
      auditSection.append(card(event.action, `${event.entity} ${event.entity_id} · ${new Date(event.created_at).toLocaleString(document.documentElement.lang)}`));
    }
    if (!audit.length) auditSection.append(node('p', 'No Edir administrative actions are recorded.'));
    if (canViewAudit()) section.append(auditSection);
    if (canManage()) {
      const staffSection = node('div', undefined, 'list');
      staffSection.append(node('h3', 'Edir staff assignments'));
      for (const assignment of staff) {
        const item = card(assignment.user_id, `${assignment.role} · ${assignment.active ? 'active' : 'inactive'}`);
        if (assignment.active) item.append(actionButton('Deactivate staff', 'deactivate-staff', assignment.user_id));
        staffSection.append(item);
      }
      const staffForm = node('form', undefined, 'inline-form');
      staffForm.dataset.edirForm = 'staff';
      staffForm.append(node('h3', 'Assign Edir staff'));
      staffForm.append(textInput('AfroLife user ID', 'user_id'));
      const roleLabel = node('label', 'Edir role');
      const roleSelect = document.createElement('select');
      roleSelect.name = 'role';
      for (const role of [...(isAdmin ? ['edir_master_admin'] : []), 'edir_admin', 'member_support', 'finance_manager', 'treasurer', 'credit_officer', 'credit_manager', 'compliance', 'auditor']) {
        const option = node('option', role);
        option.value = role;
        roleSelect.append(option);
      }
      roleLabel.append(roleSelect);
      staffForm.append(roleLabel, submitButton('Save staff assignment'));
      staffSection.append(staffForm);
      if (isAdmin) {
        const insuranceMasterForm = node('form', undefined, 'inline-form');
        insuranceMasterForm.dataset.edirForm = 'insurance-master-staff';
        insuranceMasterForm.append(node('h3', 'Establish separate Insurance Master Edir access'));
        insuranceMasterForm.append(textInput('AfroLife user ID', 'user_id'));
        insuranceMasterForm.append(submitButton('Assign Insurance Master Edir administrator'));
        staffSection.append(insuranceMasterForm);
      }
      section.append(staffSection);
    }
    root.append(section);
  }

  function renderFinance() {
    const section = node('section', undefined, 'panel form-card');
    section.id = 'edir-finance';
    section.append(node('h2', 'Edir savings, shares, and contributions'));
    section.append(node('p', 'Financial products require independent approval before opening. Deposits and withdrawals post only after a second authorized person approves them. Amounts use ETB; lending and benefit payouts will be introduced as separately controlled stages.'));

    const productsList = node('div', undefined, 'list');
    productsList.append(node('h3', 'Financial products'));
    const openAccounts = finance.accounts.map((account) => account.product_code);
    const availableProducts = financialProducts.filter((product) =>
      product.status === 'active' && !openAccounts.includes(product.product_code));
    if (!financialProducts.length) productsList.append(node('p', 'No financial products are available yet. An authorized financial manager must propose a product and a different reviewer must approve it.'));
    for (const product of financialProducts) {
      const item = card(product.name, `${product.product_code} · ${product.product_type} · Minimum balance ETB ${product.minimum_balance} · Withdrawals ${product.withdrawals_allowed ? 'allowed' : 'disabled'} · ${product.status}`, product.status);
      if (canManageFinance() && product.status === 'pending' && product.created_by !== user.id) {
        item.append(actionButton('Approve product', 'finance-product-decision', product.id, 'active'));
        item.append(actionButton('Reject product', 'finance-product-decision', product.id, 'rejected'));
      }
      if (canManageFinance() && product.created_by !== user.id && ['active', 'paused'].includes(product.status)) {
        item.append(actionButton(product.status === 'active' ? 'Pause product' : 'Reactivate product',
          'finance-product-lifecycle', product.id, product.status === 'active' ? 'paused' : 'active'));
      }
      productsList.append(item);
    }
    section.append(productsList);

    if (finance.membership?.status === 'active' && availableProducts.length) {
      const openForm = node('form', undefined, 'inline-form');
      openForm.dataset.edirForm = 'finance-open-account';
      openForm.append(node('h3', 'Open a financial account'));
      const productLabel = node('label', 'Product');
      const productSelect = document.createElement('select');
      productSelect.name = 'product_id';
      productSelect.required = true;
      for (const product of availableProducts) {
        const option = node('option', `${product.name} · ${product.product_type}`);
        option.value = product.id;
        productSelect.append(option);
      }
      productLabel.append(productSelect);
      openForm.append(productLabel, submitButton('Open account'));
      section.append(openForm);
    }

    const accountsList = node('div', undefined, 'list');
    accountsList.append(node('h3', 'Your financial accounts'));
    if (!finance.accounts.length) accountsList.append(node('p', 'You have no Edir financial accounts.'));
    for (const account of finance.accounts) {
      const item = card(account.product_name, `${account.product_code} · ${account.product_type} · Balance ETB ${account.balance} · Minimum ETB ${account.minimum_balance}`, account.status);
      if (account.status === 'active' && account.withdrawals_allowed && ['savings', 'share'].includes(account.product_type)) {
        const withdrawForm = node('form', undefined, 'inline-form');
        withdrawForm.dataset.edirForm = 'finance-withdrawal';
        withdrawForm.dataset.accountId = account.id;
        withdrawForm.append(node('h4', 'Request a withdrawal'));
        withdrawForm.append(textInput('Amount in ETB', 'amount', '', 'number'));
        const amount = withdrawForm.querySelector('input[name="amount"]');
        amount.min = '0.01';
        amount.step = '0.01';
        withdrawForm.append(submitButton('Request withdrawal'));
        item.append(withdrawForm);
      }
      accountsList.append(item);
    }
    section.append(accountsList);

    if (canManageFinance()) {
      const productForm = node('form', undefined, 'inline-form');
      productForm.dataset.edirForm = 'finance-product';
      productForm.append(node('h3', 'Propose a financial product'));
      productForm.append(textInput('Product code', 'product_code'));
      productForm.append(textInput('Product name', 'name'));
      const typeLabel = node('label', 'Product type');
      const typeSelect = document.createElement('select');
      typeSelect.name = 'product_type';
      for (const type of ['savings', 'share', 'contribution']) {
        const option = node('option', type);
        option.value = type;
        typeSelect.append(option);
      }
      const withdrawalLabel = node('label', undefined, 'span-2');
      const withdrawalCheckbox = document.createElement('input');
      withdrawalCheckbox.type = 'checkbox';
      withdrawalCheckbox.name = 'withdrawals_allowed';
      const withdrawalDescription = node('span', 'Allow withdrawals from this product after independent approval.');
      withdrawalLabel.append(withdrawalCheckbox, withdrawalDescription);
      typeSelect.addEventListener('change', () => {
        withdrawalCheckbox.disabled = typeSelect.value === 'contribution';
        if (withdrawalCheckbox.disabled) withdrawalCheckbox.checked = false;
      });
      typeLabel.append(typeSelect);
      productForm.append(typeLabel);
      const minimumInput = textInput('Minimum balance (ETB)', 'minimum_balance', '0.00', 'number');
      const minField = minimumInput.querySelector('input');
      minField.min = '0';
      minField.step = '0.01';
      productForm.append(minimumInput, withdrawalLabel, submitButton('Submit for independent approval'));
      section.append(productForm);

      if (canReadFinance()) {
        const cashForm = node('form', undefined, 'inline-form');
        cashForm.dataset.edirForm = 'finance-cash-transaction';
        cashForm.append(node('h3', 'Record a deposit or contribution received'));
        const accountLabel = node('label', 'Member account');
        const accountSelect = document.createElement('select');
        accountSelect.name = 'account';
        accountSelect.required = true;
        for (const account of financialAccounts.filter((row) => row.status === 'active')) {
          const option = node('option', `${account.full_name} · ${account.member_number} · ${account.product_name} · ${account.balance} ETB`);
          option.value = `${account.id}|${account.product_type}`;
          accountSelect.append(option);
        }
        accountLabel.append(accountSelect);
        const cashAmount = textInput('Amount in ETB', 'amount', '', 'number');
        const cashAmountInput = cashAmount.querySelector('input');
        cashAmountInput.min = '0.01';
        cashAmountInput.step = '0.01';
        cashForm.append(accountLabel, cashAmount, submitButton('Submit for approval'));
        section.append(cashForm);
      }
    }

    if (canReadFinance()) {
      const activity = node('div', undefined, 'list');
      activity.append(node('h3', 'Financial transaction review'));
      for (const transaction of financialTransactions) {
        const item = card(
          `${transaction.direction} · ETB ${transaction.amount}`,
          `${transaction.full_name} · ${transaction.member_number} · ${transaction.product_name} · ${transaction.status} · ${new Date(transaction.created_at).toLocaleString(document.documentElement.lang)}`,
          transaction.status,
        );
        if (transaction.status === 'pending' && transaction.created_by !== user.id && canManageFinance()) {
          item.append(actionButton('Approve and post', 'finance-transaction-decision', transaction.id, 'approved'));
          item.append(actionButton('Reject', 'finance-transaction-decision', transaction.id, 'rejected'));
        }
        if (transaction.status === 'approved' && transaction.journal_id && !transaction.reversed
          && ['deposit', 'withdrawal'].includes(transaction.direction) && canManageFinance()
          && transaction.created_by !== user.id && transaction.reviewed_by !== user.id) {
          item.append(actionButton('Request reversal', 'finance-transaction-reversal', transaction.id));
        }
        activity.append(item);
      }
      if (!financialTransactions.length) activity.append(node('p', 'No Edir financial transactions are recorded.'));
      section.append(activity);
    }
    root.append(section);
  }

  function renderCredit() {
    const section = node('section', undefined, 'panel form-card');
    section.id = 'edir-credit';
    section.append(node('h2', 'Edir credit policy and loan requests'));
    section.append(node('p', 'Each Edir proposes and independently approves its own versioned credit policy. Loan offers are interest-free and fee-free; member acceptance selects an active savings account, followed by separately approved savings-account disbursement and savings-funded principal repayments. Cash, mobile-wallet, and third-party payouts are later stages and are not simulated.'));
    const activePolicy = creditPolicies.find((policy) => policy.status === 'active');
    const policyList = node('div', undefined, 'list');
    policyList.append(node('h3', 'Credit policy versions'));
    if (!creditPolicies.length) policyList.append(node('p', 'No policy is approved. Loan applications cannot be underwritten until this Edir approves its own policy.'));
    for (const version of creditPolicies) {
      const policy = version.policy;
      const item = card(`Policy v${version.version}`, `Maximum ETB ${policy.maximum_principal} · ${policy.maximum_tenor_months} months · Maximum debt service ${formatBps(policy.maximum_debt_service_bps)} · Minimum savings coverage ${formatBps(policy.minimum_savings_coverage_bps)} · ${version.change_reason}`, version.status);
      if (canManageCredit() && version.status === 'pending' && version.created_by !== user.id) {
        item.append(actionButton('Approve policy', 'credit-policy-decision', version.id, 'approve'));
        item.append(actionButton('Reject policy', 'credit-policy-decision', version.id, 'reject'));
      }
      policyList.append(item);
    }
    section.append(policyList);

    if (canManageCredit()) {
      const form = node('form', undefined, 'inline-form');
      form.dataset.edirForm = 'credit-policy';
      form.append(node('h3', 'Propose this Edir’s credit policy'));
      const fields = [
        ['Maximum principal (ETB)', 'maximum_principal', '', '0.01', '999999999999.99'],
        ['Maximum term (months)', 'maximum_tenor_months', '', '1', '360'],
        ['Maximum debt service (% of monthly income)', 'maximum_debt_service', '', '0.01', '100'],
        ['Minimum membership (days)', 'minimum_membership_days', '', '1', '36500'],
        ['Maximum concurrent applications per member', 'maximum_concurrent_applications', '', '1', '100'],
        ['Minimum savings coverage (% of requested principal)', 'minimum_savings_coverage', '', '0.01', '1000'],
        ['Minimum credit score (0-100)', 'minimum_score', '', '1', '100'],
        ['Affordability score weight (0-100)', 'weight_affordability', '', '1', '100'],
        ['Savings score weight (0-100)', 'weight_savings', '', '1', '100'],
        ['Membership score weight (0-100)', 'weight_membership_tenure', '', '1', '100'],
      ];
      for (const [labelText, name, value, step, max] of fields) {
        const label = textInput(labelText, name, value, 'number');
        const input = label.querySelector('input');
        input.min = name === 'maximum_principal' ? '0.01' : '0';
        input.step = step;
        input.max = max;
        form.append(label);
      }
      form.append(node('p', 'Weights must add up to 100. Interest and fees are locked at 0. Disbursement and repayment use the separately reviewed savings-account workflow.'));
      form.append(textInput('Policy change reason', 'change_reason'));
      form.append(submitButton('Submit policy for independent approval'));
      section.append(form);
    }

    if (credit.membership?.status === 'active') {
      const form = node('form', undefined, 'inline-form');
      form.dataset.edirForm = 'credit-application';
      form.append(node('h3', 'Request a loan assessment'));
      form.append(node('p', activePolicy
        ? 'Provide accurate monthly amounts. Your request will be assessed against the active policy and verified by staff before independent review.'
        : 'You may submit a request, but it will remain on hold until this Edir independently approves a credit policy.'));
      const fields = [
        ['Requested principal (ETB)', 'requested_principal', '0.01'],
        ['Requested term (months)', 'requested_term_months', '1'],
        ['Monthly income (ETB)', 'monthly_income', '0.01'],
        ['Monthly expenses (ETB)', 'monthly_expenses', '0.01'],
        ['Existing monthly debt service (ETB)', 'monthly_debt', '0.01'],
      ];
      for (const [labelText, name, step] of fields) {
        const label = textInput(labelText, name, name === 'monthly_expenses' || name === 'monthly_debt' ? '0.00' : '', 'number');
        const input = label.querySelector('input');
        input.min = name === 'monthly_expenses' || name === 'monthly_debt' ? '0' : '0.01';
        input.step = step;
        form.append(label);
      }
      form.append(textInput('Purpose', 'purpose'));
      form.append(submitButton('Submit loan request'));
      section.append(form);
    } else {
      section.append(node('p', 'Active Edir membership is required to request a loan assessment.'));
    }

    const memberRequests = node('div', undefined, 'list');
    memberRequests.append(node('h3', 'Your loan requests'));
    if (!credit.applications.length) memberRequests.append(node('p', 'You have no Edir credit requests.'));
    for (const application of credit.applications) {
      const item = card(`ETB ${application.requested_principal} · ${application.requested_term_months} months`,
        `${application.purpose} · ${application.status}${application.credit_score === null ? '' : ` · Score ${application.credit_score}`}`,
        application.status);
      if (application.status === 'approved') {
        const form = node('form', undefined, 'inline-form');
        form.dataset.edirForm = 'credit-accept';
        form.dataset.applicationId = application.id;
        const accountLabel = node('label', 'Savings account to receive proceeds');
        const accountSelect = document.createElement('select');
        accountSelect.name = 'savings_account_id';
        accountSelect.required = true;
        accountSelect.append(new Option(t('Select an active savings account'), ''));
        for (const account of finance.accounts.filter((entry) => entry.product_type === 'savings' && entry.status === 'active')) {
          accountSelect.append(new Option(`${account.product_name} · ETB ${account.balance}`, account.id));
        }
        accountLabel.append(accountSelect);
        form.append(accountLabel);
        const consentLabel = node('label', 'I accept the interest-free, fee-free principal-only loan and savings-account payout terms.');
        const consent = document.createElement('input');
        consent.type = 'checkbox';
        consent.name = 'accept';
        consent.required = true;
        consent.value = 'on';
        consentLabel.prepend(consent);
        form.append(consentLabel, submitButton('Accept offer'));
        item.append(form);
      }
      memberRequests.append(item);
    }
    section.append(memberRequests);

    if (canReadCredit()) {
      const reviewList = node('div', undefined, 'list');
      reviewList.append(node('h3', 'Edir credit applications'));
      if (!creditApplications.length) reviewList.append(node('p', 'No Edir credit applications are awaiting review.'));
      for (const application of creditApplications) {
        const item = card(`${application.member_name} · ETB ${application.requested_principal} · ${application.requested_term_months} months`,
          `${application.purpose} · ${application.status} · Income ETB ${application.monthly_income} · Expenses ETB ${application.monthly_expenses} · Existing debt ETB ${application.monthly_debt}${application.credit_score === null ? '' : ` · Score ${application.credit_score}`}`,
          application.status);
        if (canAssessCredit() && activePolicy && ['awaiting_policy', 'submitted'].includes(application.status)) {
          item.append(actionButton('Assess application', 'credit-assess', application.id));
        }
        if (canManageCredit() && application.status === 'scored'
          && application.created_by !== user.id && application.scored_by !== user.id) {
          item.append(actionButton('Approve loan offer', 'credit-loan-decision', application.id, 'approve'));
          item.append(actionButton('Reject application', 'credit-loan-decision', application.id, 'reject'));
        }
        reviewList.append(item);
      }
      section.append(reviewList);
    }

    const memberLoanList = node('div', undefined, 'list');
    memberLoanList.append(node('h3', 'Your Edir loans and principal schedule'));
    if (!memberLoans.length) memberLoanList.append(node('p', 'No accepted Edir loans.'));
    for (const loan of memberLoans) {
      const item = card(`ETB ${loan.principal_amount} · outstanding ETB ${loan.outstanding_principal}`,
        `${loan.savings_product_name} · ${loan.status}${loan.disbursed_at ? ` · disbursed ${new Date(loan.disbursed_at).toLocaleDateString()}` : ' · awaiting approved disbursement'}`,
        loan.status);
      for (const installment of loan.schedule) {
        item.append(node('p', `Installment ${installment.installment_no} · due ${installment.due_on} · ETB ${installment.principal_paid} / ${installment.principal_due} · ${installment.status}`));
      }
      for (const operation of loan.operations) {
        item.append(node('p', `${operation.operation_type} ETB ${operation.amount} · ${operation.status}${operation.review_reason ? ` · ${operation.review_reason}` : ''}`));
      }
      if (loan.status === 'disbursed') {
        const form = node('form', undefined, 'inline-form');
        form.dataset.edirForm = 'loan-repayment';
        form.dataset.loanId = loan.id;
        form.append(textInput('Repayment amount (ETB)', 'amount', '', 'number'));
        form.querySelector('input[name="amount"]').min = '0.01';
        form.querySelector('input[name="amount"]').step = '0.01';
        form.append(submitButton('Request savings-funded repayment'));
        item.append(form);
      }
      memberLoanList.append(item);
    }
    section.append(memberLoanList);

    if (canReadCredit()) {
      const servicing = node('div', undefined, 'list');
      servicing.append(node('h3', 'Loan servicing and maker-checker queue'));
      if (!servicingLoans.length) servicing.append(node('p', 'No Edir loans are available for servicing.'));
      for (const loan of servicingLoans) {
        const item = card(`${loan.member_name} · outstanding ETB ${loan.outstanding_principal}`,
          `ETB ${loan.principal_amount} · ${loan.term_months} months · ${loan.status}`, loan.status);
        if (canManageLoanServicing() && loan.status === 'accepted') {
          const form = node('form', undefined, 'inline-form');
          form.dataset.edirForm = 'loan-disbursement';
          form.dataset.loanId = loan.id;
          form.append(textInput('Disbursement amount (ETB)', 'amount', loan.principal_amount, 'number'));
          form.querySelector('input[name="amount"]').min = loan.principal_amount;
          form.querySelector('input[name="amount"]').max = loan.principal_amount;
          form.querySelector('input[name="amount"]').step = '0.01';
          form.append(submitButton('Request savings-account disbursement'));
          item.append(form);
        }
        for (const operation of loan.operations) {
          item.append(node('p', `${operation.operation_type} ETB ${operation.amount} · ${operation.status}`));
          if (canManageLoanServicing() && operation.status === 'pending' && operation.created_by !== user.id) {
            item.append(actionButton('Approve operation', 'loan-operation-decision', operation.id, 'approved'));
            item.append(actionButton('Reject operation', 'loan-operation-decision', operation.id, 'rejected'));
          }
        }
        servicing.append(item);
      }
      section.append(servicing);
    }
    root.append(section);
  }

  function render() {
    root.replaceChildren();
    const heading = node('section', undefined, 'panel form-card');
    heading.append(node('p', 'AFROLIFE_EDIR · CENTRAL COMMUNITY', 'eyebrow'));
    heading.append(node('h1', 'AfroLife Edir'));
    heading.append(node('p', 'One central Edir registry for AfroLife members, with member and administration workspaces.'));
    heading.append(node('p', 'Staged financial pilot: approved savings, share, and contribution products; member accounts; double-entry postings; and independent transaction approval. Lending, insurance, and benefit payouts require their own approved policies and controls.'));
    if (organizations.length) {
      const picker = node('label', 'Organization workspace');
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Edir organization workspace');
      const selectedId = user.edir_id ?? '00000000-0000-4000-8000-000000000002';
      for (const organization of organizations) {
        const option = node('option', `${organization.display_name} · ${organization.onboarding_status}`);
        option.value = organization.id;
        option.selected = organization.id === selectedId;
        select.append(option);
      }
      select.addEventListener('change', () => onOrganizationChange(select.value));
      picker.append(select);
      heading.append(picker);
    }
    root.append(heading);

    if (notice) {
      const message = node('p', notice, 'alert');
      message.setAttribute('role', 'status');
      root.append(message);
    }
    if (error) {
      const message = node('p', error, 'alert');
      message.setAttribute('role', 'alert');
      root.append(message);
    }
    if (loading) {
      root.append(node('p', 'Loading AfroLife Edir…'));
      return;
    }
    if (error) return;
    if (user.edir_id === '00000000-0000-4000-8000-000000000001' && isMaster()) {
      renderMasterDashboard();
      renderServiceNav();
      return;
    }
    renderMember();
    if (canManage()) renderAdmin();
    else if (me.staff_roles.length) {
      const staffWorkspace = node('section', undefined, 'panel form-card');
      staffWorkspace.id = 'edir-governance';
      staffWorkspace.append(node('h2', 'Edir staff workspace'));
      staffWorkspace.append(node('p', `Assigned access: ${me.staff_roles.join(', ')}`));
      staffWorkspace.append(node('p', 'This role has read-only group and membership visibility within the central Edir service.'));
      for (const member of members) {
        staffWorkspace.append(card(member.full_name, `${member.member_number} · ${member.phone} · ${member.status} · ${member.group_count} groups`, member.status));
      }
      for (const group of groups) {
        staffWorkspace.append(card(group.name, `${group.group_code} · ${group.member_count} members · ${group.description}`, group.status));
      }
      root.append(staffWorkspace);
    }
    renderFinance();
    renderCredit();

    const roadmap = node('section', undefined, 'panel form-card');
    roadmap.append(node('h2', 'Edir service map'));
    const list = node('div', undefined, 'list');
    for (const [label, status, detail] of [
      ['Central member registry and review', 'pilot', 'Member requests, identity-linked membership numbers, independent approval, and audit history.'],
      ['Community groups and circles', 'pilot', 'Central Edir groups with approved-member assignment.'],
      ['Savings, shares, contributions, and accounting', 'pilot', 'Product activation and cash transactions use distinct makers and checkers with immutable double-entry journal postings.'],
      ['Credit policy and loan applications', 'pilot', 'Edir supports approved interest-free offers, savings-account disbursement, equal-principal schedules, and independently reviewed savings-funded repayments; external payout rails remain later-stage.'],
      ['Loan disbursement, repayment, collections, insurance, and benefit payouts', 'not-live', 'Requires separate accounting, funding, recovery or claims rules, and independent transaction controls.'],
      ['Member self-service statements and notifications', 'not-live', 'Requires a reviewed member-data and communications design.'],
    ]) list.append(card(label, detail, status));
    roadmap.append(list);
    root.append(roadmap);
    renderServiceNav();
  }

  function renderServiceNav() {
    const services = [
      ['edir-membership', 'Membership', 'Your membership status and community benefits.'],
      ['edir-member-groups', 'My groups', 'Your community group participation.'],
      ['edir-group-management', 'Group management', 'Manage group assignments and group records.'],
      ['edir-governance', 'Membership & governance', 'Member review, audit, and staff controls when assigned.'],
      ['edir-finance', 'Savings & accounts', 'Approved products, accounts, deposits, and transaction review.'],
      ['edir-credit', 'Credit & loan servicing', 'Credit requests, policy review, and controlled loan operations.'],
      ['edir-master-registration', 'Register an Edir', 'Submit an independent organization for umbrella review.'],
      ['edir-master-applications', 'Registration review', 'Review pending independent Edir applications.'],
      ['edir-master-organizations', 'Edir network', 'Inspect independent Edir workspaces and assignments.'],
      ['edir-master-staff', 'Master staff', 'Review umbrella Edir staff assignments.'],
      ['edir-master-insurance', 'Insurance reporting', 'View separate Edir Insurance ledger registration and totals.'],
    ].filter(([target]) => root.querySelector(`#${target}`));
    if (!services.length) return;
    const nav = node('nav', undefined, 'edir-service-nav');
    nav.setAttribute('aria-label', 'AfroLife Edir mini-apps');
    nav.append(node('h2', 'Edir mini-apps'));
    nav.append(node('p', 'Jump directly to the service area you need.'));
    const grid = node('div', undefined, 'edir-service-grid');
    for (const [target, title, description] of services) {
      const item = node('article', undefined, 'edir-service-card');
      item.append(node('h3', title), node('p', description));
      const action = node('button', 'Open service', 'button button-outline');
      action.type = 'button';
      action.dataset.edirFocus = target;
      item.append(action);
      grid.append(item);
    }
    nav.append(grid);
    const firstTarget = root.querySelector(`#${services[0][0]}`);
    root.insertBefore(nav, firstTarget);
  }

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-edir-form]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    notice = '';
    error = '';
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      if (form.dataset.edirForm === 'enroll') {
        await api('/edir/memberships', {
          method: 'POST',
          body: JSON.stringify({
            accept_nonfinancial_terms: values.accept_nonfinancial_terms === 'on',
          }),
        });
        notice = 'Membership request submitted for independent review.';
      } else if (form.dataset.edirForm === 'credit-accept') {
        await api(`/edir/credit/applications/${form.dataset.applicationId}/accept`, {
          method: 'POST',
          body: JSON.stringify({ accept: values.accept === 'on', savings_account_id: values.savings_account_id }),
        });
        notice = 'Loan offer accepted with the selected savings account. A separate approved disbursement is required.';
      } else if (['loan-disbursement', 'loan-repayment'].includes(form.dataset.edirForm)) {
        const operationType = form.dataset.edirForm === 'loan-disbursement' ? 'disbursement' : 'repayment';
        const idempotency = storedIdempotencyKey(user.id, `loan-${operationType}`, form.dataset.loanId, values.amount);
        await api(`/edir/credit/loans/${form.dataset.loanId}/${operationType === 'disbursement' ? 'disbursements' : 'repayments'}`, {
          method: 'POST',
          body: JSON.stringify({ amount: values.amount, idempotency_key: idempotency.id }),
        });
        sessionStorage.removeItem(idempotency.storageKey);
        notice = operationType === 'disbursement'
          ? 'Loan disbursement request submitted for independent approval.'
          : 'Savings-funded principal repayment submitted for independent approval.';
      } else if (form.dataset.edirForm === 'organization') {
        const payload = { ...values };
        for (const key of ['registration_reference','governance_reference']) if (!payload[key]) delete payload[key];
        await api('/edir/organizations', { method: 'POST', body: JSON.stringify(payload) });
        notice = 'Independent Edir submitted for onboarding review.';
      } else if (form.dataset.edirForm === 'organization-staff') {
        await api(`/edir/organizations/${form.dataset.organizationId}/staff`, { method: 'POST', body: JSON.stringify(values) });
        notice = 'Local Edir staff assignment saved.';
      } else if (form.dataset.edirForm === 'insurance-register') {
        await api('/insurance/ledger/organizations', {
          method: 'POST', body: JSON.stringify({
            id: form.dataset.organizationId,
            display_name: form.dataset.displayName,
            legal_name: form.dataset.legalName,
          }),
        });
        notice = 'Separate Insurance ledger registered for this Edir.';
      } else if (form.dataset.edirForm === 'insurance-staff') {
        await api(`/insurance/ledger/organizations/${form.dataset.organizationId}/staff`, {
          method: 'POST', body: JSON.stringify(values),
        });
        notice = 'Insurance staff assignment saved.';
      } else if (form.dataset.edirForm === 'group') {
        await api('/edir/groups', { method: 'POST', body: JSON.stringify(values) });
        notice = 'Central Edir group created.';
      } else if (form.dataset.edirForm === 'assign') {
        await api(`/edir/groups/${form.dataset.groupId}/members`, {
          method: 'POST',
          body: JSON.stringify({ membership_id: values.membership_id }),
        });
        notice = 'Approved member added to the Edir group.';
      } else if (form.dataset.edirForm === 'staff') {
        await api('/edir/staff', { method: 'POST', body: JSON.stringify(values) });
        notice = 'Edir staff assignment saved.';
      } else if (form.dataset.edirForm === 'credit-policy') {
        await api('/edir/credit/policies', {
          method: 'POST',
          body: JSON.stringify({
            change_reason: values.change_reason,
            policy: {
              maximum_principal: values.maximum_principal,
              maximum_tenor_months: Number(values.maximum_tenor_months),
              maximum_debt_service_bps: percentageBps(values.maximum_debt_service),
              minimum_membership_days: Number(values.minimum_membership_days),
              maximum_concurrent_applications: Number(values.maximum_concurrent_applications),
              minimum_savings_coverage_bps: percentageBps(values.minimum_savings_coverage),
              amortization_method: 'equal_principal',
              interest_rate_bps: 0,
              fee_bps: 0,
              scorecard: {
                minimum_score: Number(values.minimum_score),
                weights: {
                  affordability: Number(values.weight_affordability),
                  savings: Number(values.weight_savings),
                  membership_tenure: Number(values.weight_membership_tenure),
                },
              },
            },
          }),
        });
        notice = 'Edir credit policy submitted for independent approval.';
      } else if (form.dataset.edirForm === 'credit-application') {
        const idempotency = storedIdempotencyKey(user.id, 'credit-application', 'edir', JSON.stringify(values));
        await api('/edir/credit/applications', {
          method: 'POST',
          body: JSON.stringify({
            requested_principal: values.requested_principal,
            requested_term_months: Number(values.requested_term_months),
            purpose: values.purpose,
            monthly_income: values.monthly_income,
            monthly_expenses: values.monthly_expenses,
            monthly_debt: values.monthly_debt,
            idempotency_key: idempotency.id,
          }),
        });
        sessionStorage.removeItem(idempotency.storageKey);
        notice = 'Edir loan assessment request submitted.';
      } else if (form.dataset.edirForm === 'insurance-master-staff') {
        await api('/insurance/ledger/master/staff', {
          method: 'POST', body: JSON.stringify({ ...values, role: 'insurance_master_admin' }),
        });
        notice = 'Insurance Master Edir administrator assigned separately.';
      } else if (form.dataset.edirForm === 'finance-product') {
        await api('/edir/finance/products', {
          method: 'POST',
          body: JSON.stringify({ ...values, withdrawals_allowed: values.withdrawals_allowed === 'on' }),
        });
        notice = 'Financial product submitted for independent approval.';
      } else if (form.dataset.edirForm === 'finance-open-account') {
        await api('/edir/finance/accounts', {
          method: 'POST',
          body: JSON.stringify({ product_id: values.product_id }),
        });
        notice = 'Edir financial account opened.';
      } else if (form.dataset.edirForm === 'finance-withdrawal') {
        const idempotency = storedIdempotencyKey(user.id, 'withdrawal', form.dataset.accountId, values.amount);
        await api('/edir/finance/transactions', {
          method: 'POST',
          body: JSON.stringify({
            member_account_id: form.dataset.accountId,
            direction: 'withdrawal',
            amount: values.amount,
            idempotency_key: idempotency.id,
          }),
        });
        sessionStorage.removeItem(idempotency.storageKey);
        notice = 'Withdrawal request submitted for independent approval.';
      } else if (form.dataset.edirForm === 'finance-cash-transaction') {
        const [memberAccountId, productType] = values.account.split('|');
        const direction = productType === 'contribution' ? 'contribution' : 'deposit';
        const idempotency = storedIdempotencyKey(user.id, direction, memberAccountId, values.amount);
        await api('/edir/finance/transactions', {
          method: 'POST',
          body: JSON.stringify({
            member_account_id: memberAccountId,
            direction,
            amount: values.amount,
            idempotency_key: idempotency.id,
          }),
        });
        sessionStorage.removeItem(idempotency.storageKey);
        notice = 'Cash transaction submitted for independent approval.';
      }
      await load();
      if (notice) render();
    } catch (reason) {
      error = reason.message;
      render();
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  root.addEventListener('click', async (event) => {
    const focusButton = event.target.closest('button[data-edir-focus]');
    if (focusButton) {
      const target = root.querySelector(`#${CSS.escape(focusButton.dataset.edirFocus)}`);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
      return;
    }
    const action = event.target.closest('button[data-edir-action]');
    if (!action) return;
    if (action.dataset.edirAction === 'org-decision') {
      action.disabled = true;
      try {
        await api(`/edir/organizations/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: action.dataset.decision === 'active'
            ? 'Governance and onboarding review completed.' : 'Onboarding requirements were not met.' }),
        });
        notice = action.dataset.decision === 'active' ? 'Independent Edir activated.' : 'Edir onboarding rejected.';
        await load(); render();
      } catch (reason) { error = reason.message; render(); }
      return;
    }
    if (action.dataset.edirAction === 'registration-decision') {
      action.disabled = true;
      try {
        await api(`/edir/registration-applications/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: action.dataset.decision === 'accepted'
            ? 'Organization registration and governance review completed.' : 'Organization registration requirements were not met.' }),
        });
        notice = action.dataset.decision === 'accepted' ? 'Edir registration approved and its independent organization workspace activated.' : 'Edir registration application rejected.';
        await load(); render();
      } catch (reason) { error = reason.message; render(); }
      return;
    }
    if (action.dataset.edirAction === 'archive-group') {
      if (!window.confirm(t('Archive this Edir group? Members will keep their historical assignments.'))) return;
      action.disabled = true;
      try {
        await api(`/edir/groups/${action.dataset.id}/archive`, { method: 'POST' });
        notice = 'Edir group archived.';
        await load();
        render();
      } catch (reason) {
        error = reason.message;
        render();
      }
      return;
    }
    if (action.dataset.edirAction === 'deactivate-staff') {
      if (!window.confirm(t('Deactivate this Edir staff assignment?'))) return;
      action.disabled = true;
      try {
        await api(`/edir/staff/${action.dataset.id}`, { method: 'DELETE' });
        notice = 'Edir staff assignment deactivated.';
        await load();
        render();
      } catch (reason) {
        error = reason.message;
        render();
      }
      return;
    }
    if (action.dataset.edirAction === 'finance-transaction-reversal') {
      const reason = window.prompt(t('Enter a reversal reason (at least 10 characters).'));
      if (!reason || reason.trim().length < 10) return;
      const transaction = financialTransactions.find((row) => row.id === action.dataset.id);
      if (!transaction) return;
      const idempotency = storedIdempotencyKey(
        user.id,
        'reversal',
        transaction.id,
        `${transaction.amount}.${reason.trim()}`,
      );
      action.disabled = true;
      try {
        await api(`/edir/finance/transactions/${transaction.id}/reversal`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim(), idempotency_key: idempotency.id }),
        });
        sessionStorage.removeItem(idempotency.storageKey);
        notice = 'Financial transaction reversal submitted for independent approval.';
        await load();
        render();
      } catch (reason) {
        error = reason.message;
        render();
      }
      return;
    }
    if (action.dataset.edirAction === 'credit-assess') {
      action.disabled = true;
      try {
        const result = await api(`/edir/credit/applications/${action.dataset.id}/assess`, { method: 'POST' });
        notice = `Credit assessment completed: score ${result.credit_score}; ${result.eligible ? 'eligible for independent decision' : 'outside current policy limits'}.`;
        await load();
        render();
      } catch (reason) {
        error = reason.message;
        render();
      }
      return;
    }
    const reason = window.prompt(t('Enter a decision reason (at least 10 characters).'));
    if (!reason || reason.trim().length < 10) return;
    action.disabled = true;
    try {
      const actionType = action.dataset.edirAction;
      if (actionType === 'finance-product-decision') {
        await api(`/edir/finance/products/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = 'Financial product decision recorded.';
      } else if (actionType === 'finance-product-lifecycle') {
        await api(`/edir/finance/products/${action.dataset.id}/lifecycle`, {
          method: 'POST',
          body: JSON.stringify({ status: action.dataset.decision, reason: reason.trim() }),
        });
        notice = 'Financial product status updated.';
      } else if (actionType === 'finance-transaction-decision') {
        await api(`/edir/finance/transactions/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = action.dataset.decision === 'approved'
          ? 'Financial transaction approved and posted.'
          : 'Financial transaction rejected.';
      } else if (actionType === 'credit-policy-decision') {
        await api(`/edir/credit/policies/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = `Edir credit policy ${action.dataset.decision === 'approve' ? 'approved' : 'rejected'}.`;
      } else if (actionType === 'credit-loan-decision') {
        await api(`/edir/credit/applications/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = action.dataset.decision === 'approve'
          ? 'Credit offer approved. The member may accept it and select an active savings account.'
          : 'Credit application rejected.';
      } else if (actionType === 'loan-operation-decision') {
        await api(`/edir/credit/operations/${action.dataset.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = action.dataset.decision === 'approved'
          ? 'Loan operation approved and posted to the Edir double-entry ledger.'
          : 'Loan operation rejected.';
      } else {
        const lifecycle = actionType === 'lifecycle';
        await api(`/edir/memberships/${action.dataset.id}/${lifecycle ? 'lifecycle' : 'review'}`, {
        method: 'POST',
        body: JSON.stringify(lifecycle
          ? { status: action.dataset.decision, reason: reason.trim() }
          : { decision: action.dataset.decision, reason: reason.trim() }),
        });
        notice = lifecycle ? 'Edir membership lifecycle updated.'
          : action.dataset.decision === 'active' ? 'Edir member approved.' : 'Edir membership request rejected.';
      }
      await load();
      render();
    } catch (reason) {
      error = reason.message;
      render();
    }
  });

  render();
  void load();
  return root;
}
