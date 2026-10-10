import { initializeLocale, t } from './i18n.js';
import { ApiError, optionalApiFallback } from './api-errors.js';
import { createMfiWorkspace } from './mfi.js';
import { createEdirWorkspace } from './edir.js';
import { createPrivacyWorkspace } from './privacy.js';

const WEB_API_ROOT = '/api/v1';
let API_ROOT = WEB_API_ROOT;
const TOKEN_KEY = 'afrolife.session';
const API_URL_KEY = 'afrolife.api-base';
const SIGNUP_UPLOAD_KEY = 'afrolife.signup-upload';
const SIGNUP_DONE_KEY = 'afrolife.signup-upload-complete';
const EDIR_ORGANIZATION_KEY = 'afrolife.edir-organization';
const DEFAULT_EDIR_ORGANIZATION = '00000000-0000-4000-8000-000000000002';
const STAFF = new Set(['global_admin', 'super_admin', 'compliance', 'finance', 'finance_manager']);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, features: { mfiPilotEnabled: false, edirEnabled: false }, edirMe: null, edirOrganizationId: localStorage.getItem(EDIR_ORGANIZATION_KEY) ?? DEFAULT_EDIR_ORGANIZATION, panel: 'overview', mfaRequired: false, mfaSetup: null, leads: [], workers: [], requests: [], properties: [], ownerStatements: [], territories: [], commissions: [], summary: null, users: [], team: [], globalAdminPromotions: [], businessRules: [], signupOptions: null, contracts: [], leases: [], tenants: [], pendingRent: [], marketplaceConfig: {}, marketplaceListings: [], marketplaceSellers: [] };
let deferredInstallPrompt = null;
const propertyPhotoUrls = new Set();
let sessionIdleTimer = null;
let sessionHeartbeatTimer = null;
let sessionActivityHandler = null;
let sessionIdleTimeoutMs = 30 * 60 * 1000;
let lastSessionActivityAt = Date.now();
const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.())
  || (window.location.protocol === 'https:' && window.location.hostname === 'localhost');

function apiRoot() {
  if (!isNativeApp) {
    API_ROOT = window.AFROLIFE_API_URL ? `${window.AFROLIFE_API_URL.replace(/\/+$/, '')}/api/v1` : WEB_API_ROOT;
    return API_ROOT;
  }
  const base = localStorage.getItem(API_URL_KEY);
  if (!base) throw new Error(t('Enter the API server address first.'));
  API_ROOT = `${base}/api/v1`;
  return API_ROOT;
}

function roleLabel(role) {
  const labels = {
    global_admin: 'Global Admin',
    super_admin: 'Super Agent / Super Admin',
    compliance: 'Compliance',
    finance: 'Finance',
    finance_manager: 'Finance manager',
    corporate_business_manager: 'Corporate Business Manager',
    master_agent: 'Master agent',
    field_agent: 'Field agent',
    customer: 'Buyer / customer',
    worker: 'Worker',
    property_owner: 'Property owner',
  };
  return t(labels[role] ?? role.replaceAll('_', ' '));
}

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = t(String(text));
  if (className) item.className = className;
  return item;
}

function setLocalizedText(element, message, values = {}) {
  element.dataset.i18nSource = message;
  element.dataset.i18nValues = JSON.stringify(values);
  element.textContent = t(message, values);
}

function isPlatformAdmin(role = state.user?.role) {
  return role === 'global_admin' || role === 'super_admin';
}

function showAlert(message, error = false, values = {}) {
  const box = $('#alert');
  setLocalizedText(box, message, values);
  box.classList.toggle('error', error);
  box.hidden = !message;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('x-afrolife-edir-id', state.edirOrganizationId);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof Blob)) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiRoot()}${path}`, { ...options, headers });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) signOut({ revoke: false, message: 'Your session expired or is no longer active. Please sign in again.' });
    const retryAfter = Number(result?.retry_after_seconds ?? response.headers.get('retry-after'));
    if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      throw new Error(t(result?.error ?? 'Too many requests. Please try again in {{seconds}} seconds.', { seconds: Math.ceil(retryAfter) }));
    }
    throw new ApiError(t(result?.error ?? 'Request failed ({{status}})', { status: response.status }), response.status);
  }
  return result;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(t('Enter a valid number.'));
  return parsed;
}

function button(label, action, className = 'button button-outline', data = {}) {
  const result = node('button', label, className);
  result.type = action === 'submit' ? 'submit' : 'button';
  result.dataset.action = action;
  for (const [key, value] of Object.entries(data)) result.dataset[key] = value;
  return result;
}

function empty(message) {
  return node('div', message, 'empty-state');
}

function sectionHeading(title, subtitle) {
  const wrapper = node('div', undefined, 'section-heading');
  const copy = node('div');
  copy.append(node('h2', title), node('p', subtitle));
  wrapper.append(copy);
  return wrapper;
}

function field(labelText, name, type = 'text', required = true, extra = {}) {
  const label = node('label', labelText);
  const input = node(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  input.name = name;
  input.required = required;
  if (type !== 'select' && type !== 'textarea') input.type = type;
  for (const [key, value] of Object.entries(extra)) input[key] = key === 'placeholder' ? t(value) : value;
  label.append(input);
  return { label, input };
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  const error = $('#login-error');
  setLocalizedText(error, '');
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(values) });
    if (result.mfa_required) {
      $('#mfa-field').hidden = false;
      setLocalizedText(error, 'Enter the six-digit code from your authenticator app.');
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, result.token);
    state.mfaRequired = result.restrict === 'mfa';
    await loadWorkspace();
  } catch (reason) {
    setLocalizedText(error, reason.message);
  }
}

function territoryLabel(area) {
  const levels = { region: 'Region', city: 'City', sub_city: 'Sub-city', woreda: 'Woreda', kebele: 'Kebele' };
  const ancestors = String(area.path ?? '').split(' · ').slice(0, -1).reverse();
  return `${area.name} (${t(levels[area.level] ?? 'Territory')})${ancestors.length ? ` — ${ancestors.join(' · ')}` : ''}`;
}

function renderSignupTerritoryOptions() {
  if (!state.signupOptions) return;
  const search = $('#signup-territory-search');
  const territory = $('#signup-territory');
  const list = $('#signup-territory-options');
  const selectedId = territory.value;
  const selectedArea = state.signupOptions.territories.find((area) => String(area.id) === selectedId);
  territory.replaceChildren(new Option('', ''));
  list.replaceChildren();
  for (const area of state.signupOptions.territories) {
    const label = territoryLabel(area);
    territory.add(new Option(label, area.id));
    const suggestion = document.createElement('option');
    suggestion.value = label;
    list.append(suggestion);
  }
  if (selectedArea) {
    territory.value = String(selectedArea.id);
    search.value = territoryLabel(selectedArea);
  }
}

async function loadSignupOptions() {
  if (!state.signupOptions) state.signupOptions = await api('/auth/signup/options');
  const accountSelect=$('#signup-account-type');
  const previous=accountSelect.value;
  accountSelect.replaceChildren(new Option('Select an account type',''));
  for(const item of state.signupOptions.account_types??[]){if(!item.enabled)continue;const option=new Option(item.label,item.key);accountSelect.add(option);}
  if((state.signupOptions.account_types??[]).some((item)=>item.key===previous&&item.enabled))accountSelect.value=previous;
  const kyc=state.signupOptions.kyc_requirements??{};
  const refreshKyc=()=>{
    const docs=kyc[accountSelect.value]??[];
    const national=docs.includes('national_id');$('#signup-national-id').required=national;$('#signup-national-id').closest('label').hidden=!national;
    const police=docs.includes('police_clearance');$('#signup-police-clearance-field').hidden=!police;$('#signup-police-clearance').required=police;
  };
  accountSelect.addEventListener('change',refreshKyc);refreshKyc();
  renderSignupTerritoryOptions();
  updatePlanLabels();
}

function syncSignupTerritory() {
  const search = $('#signup-territory-search');
  const selected = state.signupOptions?.territories.find((area) => territoryLabel(area).localeCompare(search.value.trim(), undefined, { sensitivity: 'accent' }) === 0);
  $('#signup-territory').value = selected ? String(selected.id) : '';
  const isAgent = $('#signup-account-type').value === 'agent';
  search.setCustomValidity(isAgent && search.value.trim() && !selected ? t('Choose a territory from the suggestions.') : '');
  return selected;
}
function updatePlanLabels() {
  if (state.signupOptions?.plans) {
    const plans = state.signupOptions.plans;
    $('#signup-plan option[value="pro"]').textContent = t('Pro plan — ETB {{amount}} per month', { amount: plans.agent_pro_monthly_etb });
    $('#signup-plan option[value="enterprise"]').textContent = t('Enterprise plan — ETB {{amount}} per month', { amount: plans.agent_enterprise_monthly_etb });
  }
  const descriptions = {
    free: ['Free service', 'Core EthioLife tools for your role, including lead, worker, request, contract and listing workflows.'],
    pro: ['Pro service', 'Pro is a plan request only. Future paid features require billing and activation.'],
    enterprise: ['Enterprise service', 'Enterprise is a plan request only. Team reporting is not active until billing and activation are configured.'],
  };
  const [title, description] = descriptions[$('#signup-plan').value] ?? descriptions.free;
  $('#signup-plan-title').textContent = t(title);
  $('#signup-plan-description').textContent = t(description);
}

function updateSignupFields() {
  const isAgent = $('#signup-account-type').value === 'agent';
  const isSeller = $('#signup-account-type').value === 'property_owner';
  const isFieldAgent = isAgent && $('#signup-agent-type').value === 'field';
  const isWorker = $('#signup-account-type').value === 'worker';
  $('#pension-interest-field').hidden = !isWorker;
  $('#worker-enterprise-field').hidden = !isWorker;
  $('#worker-document-consent-field').hidden = !isWorker;
  $('#worker-document-consent').required = isWorker;
  $('#agent-fields').hidden = !isAgent;
  $('#service-plan-fields').hidden = !(isAgent || isSeller);
  $('#parent-agent-field').hidden = !isFieldAgent;
  $('#signup-police-clearance-field').hidden = !isWorker;
  $('#signup-police-clearance').required = isWorker;
  $('#worker-date-of-birth-field').hidden = !isWorker;
  $('#worker-date-of-birth').required = isWorker;
  $('#signup-agent-type').required = isAgent;
  $('#signup-territory-search').required = isAgent;
  if (!isAgent) $('#signup-territory-search').setCustomValidity('');
  $('#signup-plan').required = isAgent || isSeller;
  $('#parent-agent-field input').required = isFieldAgent;
  updatePlanLabels();
}

function openSignup(agentPlans = false) {
  $('#login-form').hidden = true;
  $('#signup-form').hidden = false;
  $('#signup-success').hidden = true;
  if (sessionStorage.getItem(SIGNUP_UPLOAD_KEY)) {
    if (sessionStorage.getItem(SIGNUP_DONE_KEY) === 'true') {
      showSignupFollowupMode();
      void loadSignupFollowup();
    } else {
      $('#signup-form').dataset.signupCreated = 'true';
      setLocalizedText($('#signup-error'), 'A registration is already pending. Upload the required documents to finish it.');
    }
  }
  if (agentPlans) {
    $('#signup-account-type').value = 'agent';
    updateSignupFields();
  }
  loadSignupOptions().catch((error) => {
    setLocalizedText($('#signup-error'), error.message);
  });
}

function showSignupFollowupMode() {
  const form = $('#signup-form');
  form.dataset.signupCreated = 'true';
  $('#signup-followup').hidden = false;
  $('#signup-success').hidden = false;
  setLocalizedText($('#signup-success'), 'Your registration is pending review. Check document decisions below and replace any document returned by Compliance.');
  for (const child of form.children) {
    child.hidden = !['signup-followup', 'signup-success', 'show-login'].includes(child.id)
      && !['H2', 'P'].includes(child.tagName);
  }
  $('#signup-followup').hidden = false;
  $('#signup-success').hidden = false;
}

async function loadSignupFollowup() {
  const token = sessionStorage.getItem(SIGNUP_UPLOAD_KEY);
  if (!token) return;
  const list = $('#signup-followup-documents');
  const select = $('#signup-followup-type');
  list.replaceChildren();
  select.replaceChildren();
  try {
    const response = await fetch(`${apiRoot()}/auth/signup/documents`, { headers: { authorization: `Signup ${token}` } });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? `Could not load document review (${response.status}).`);
    const byType = new Map(result.documents.map((document) => [document.doc_type, document]));
    for (const docType of result.required) {
      const document = byType.get(docType);
      const label = docType.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
      const item = card(label, document?.review_note ?? (document ? 'Received and awaiting compliance decision.' : 'Required document is missing.'), document?.status ?? 'missing');
      list.append(item);
      if (!document || document.status === 'rejected') {
        const option = node('option', document?.status === 'rejected' ? `Replace ${label} (returned)` : `Upload ${label}`);
        option.value = docType;
        select.append(option);
      }
    }
    $('#signup-followup-form').hidden = !select.options.length;
    if (!select.options.length) list.append(node('p', 'All required documents are received. Compliance will review them before account activation.', 'muted'));
  } catch (error) {
    list.append(empty(error.message));
    $('#signup-followup-form').hidden = true;
  }
}

async function uploadSignupReplacement() {
  const token = sessionStorage.getItem(SIGNUP_UPLOAD_KEY);
  const docType = $('#signup-followup-type').value;
  const file = $('#signup-followup-form [name="file"]').files[0];
  if (!token || !docType || !file) throw new Error(t('Choose a returned or missing document and select a replacement file.'));
  if (file.size > 10 * 1024 * 1024) throw new Error(t('This file exceeds the 10 MB upload limit.'));
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error(t('Choose a PDF, JPEG or PNG document.'));
  const response = await fetch(`${apiRoot()}/auth/signup/documents?${new URLSearchParams({ doc_type: docType })}`, {
    method: 'POST', headers: { authorization: `Signup ${token}`, 'content-type': file.type }, body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? `Replacement upload failed (${response.status}).`);
  $('#signup-followup-form [name="file"]').value = '';
  await loadSignupFollowup();
  showAlert(t('Replacement document uploaded securely for compliance review.'));
}

function initializeNativeServer() {
  if (!isNativeApp) return;
  $('#change-server').hidden = false;
  const saved = localStorage.getItem(API_URL_KEY);
  $('#api-server-url').value = saved ?? '';
  $('#server-setup').hidden = Boolean(saved);
  $('#login-form').hidden = !saved;
  $('#signup-form').hidden = true;
  $('#show-signup').hidden = !saved;
  $('#show-agent-plans').hidden = !saved;
  if (saved) apiRoot();
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  const error = $('#signup-error');
  setLocalizedText(error, '');
  if (values.password !== values.password_confirmation) {
    setLocalizedText(error, 'Password confirmation does not match.');
    return;
  }
  const payload = {
    legal_name: values.legal_name,
    phone: values.phone,
    email: values.email,
    password: values.password,
    password_confirmation: values.password_confirmation,
    account_type: values.account_type,
    ...(values.account_type === 'worker' ? { date_of_birth: values.date_of_birth } : {}),
    worker_document_consent: values.worker_document_consent === 'on',
    pension_match_interest: values.pension_match_interest === 'on',
    edir_member_interest: values.edir_member_interest === 'on',
    edir_life_interest: values.edir_life_interest === 'on',
    household_cover_interest: values.household_cover_interest === 'on',
    option_a_enterprise_interest: values.option_a_enterprise_interest === 'on',
  };
  if (values.account_type === 'agent' || values.account_type === 'property_owner') {
    payload.requested_plan = values.requested_plan;
  }
  if (values.account_type === 'agent') {
    const selectedTerritory = syncSignupTerritory();
    if (!selectedTerritory) {
      $('#signup-territory-search').setCustomValidity(t('Choose a territory from the suggestions.'));
      $('#signup-territory-search').reportValidity();
      return;
    }
    Object.assign(payload, {
      agent_type: values.agent_type,
      territory_id: Number(selectedTerritory.id),
      requested_plan: values.requested_plan,
    });
    if (values.agent_type === 'field') payload.parent_agent_phone = values.parent_agent_phone;
  }
  try {
    let uploadToken = sessionStorage.getItem(SIGNUP_UPLOAD_KEY);
    if (!form.dataset.signupCreated) {
      const signup = await api('/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      uploadToken = signup.upload_token;
      if (!uploadToken) throw new Error(t('Registration succeeded but a secure document-upload token was not issued. Contact EthioLife support.'));
      sessionStorage.setItem(SIGNUP_UPLOAD_KEY, uploadToken);
      form.dataset.signupCreated = 'true';
    }
    const requiredDocs=state.signupOptions?.kyc_requirements?.[values.account_type]??['national_id'];
    const uploads=requiredDocs.map((docType)=>[docType,docType==='national_id'?$('#signup-national-id').files[0]:$('#signup-police-clearance').files[0]]);
    for (const [docType, file] of uploads) {
      if (!file) throw new Error(t('Select each required KYC document before submitting.'));
      const query = new URLSearchParams({ doc_type: docType });
      const response = await fetch(`${apiRoot()}/auth/signup/documents?${query}`, {
        method: 'POST',
        headers: {
          authorization: `Signup ${uploadToken}`,
          'content-type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(t(result?.error ?? 'Document upload failed ({{status}})', { status: response.status }));
    }
    sessionStorage.setItem(SIGNUP_DONE_KEY, 'true');
    form.reset();
    updateSignupFields();
    showSignupFollowupMode();
    await loadSignupFollowup();
  } catch (reason) {
    setLocalizedText(error, form.dataset.signupCreated
      ? `Your registration is saved, but document upload needs attention: ${reason.message} Select the required files and submit again to retry.`
      : reason.message);
  }
}

function saveNativeServer() {
  const error = $('#server-error');
  setLocalizedText(error, '');
  try {
    const parsed = new URL($('#api-server-url').value.trim());
    const localDevelopmentHost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localDevelopmentHost))
      || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(t('Use a valid HTTPS server URL. HTTP is allowed only for localhost development.'));
    }
    localStorage.setItem(API_URL_KEY, parsed.origin);
    apiRoot();
    $('#server-setup').hidden = true;
    $('#login-form').hidden = false;
    $('#show-signup').hidden = false;
    $('#show-agent-plans').hidden = false;
    $('#login-error').textContent = '';
  } catch (reason) {
    setLocalizedText(error, reason instanceof TypeError
      ? 'Use a valid HTTPS server URL. HTTP is allowed only for localhost development.'
      : reason.message);
  }
}

function stopSessionActivity() {
  clearTimeout(sessionIdleTimer);
  clearInterval(sessionHeartbeatTimer);
  sessionIdleTimer = null;
  sessionHeartbeatTimer = null;
  if (sessionActivityHandler) {
    for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'focus']) {
      document.removeEventListener(eventName, sessionActivityHandler);
    }
    sessionActivityHandler = null;
  }
}

function scheduleSessionExpiry() {
  clearTimeout(sessionIdleTimer);
  const remaining = sessionIdleTimeoutMs - (Date.now() - lastSessionActivityAt);
  sessionIdleTimer = setTimeout(() => {
    if (Date.now() - lastSessionActivityAt >= sessionIdleTimeoutMs) {
      signOut({ message: 'Your session ended after inactivity. Please sign in again.' });
    } else {
      scheduleSessionExpiry();
    }
  }, Math.max(remaining, 0));
}

function startSessionActivity(idleTimeoutMinutes) {
  stopSessionActivity();
  sessionIdleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
  lastSessionActivityAt = Date.now();
  sessionActivityHandler = (event) => {
    if (!event.isTrusted) return;
    lastSessionActivityAt = Date.now();
    scheduleSessionExpiry();
  };
  for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'focus']) {
    document.addEventListener(eventName, sessionActivityHandler, { passive: true });
  }
  scheduleSessionExpiry();
  sessionHeartbeatTimer = setInterval(() => {
    if (sessionStorage.getItem(TOKEN_KEY) && Date.now() - lastSessionActivityAt < 60_000) {
      api('/auth/session').catch((error) => {
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error('The active EthioLife session could not be refreshed.', error);
        }
      });
    }
  }, 60_000);
}

function signOut({ revoke = true, message = '' } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (revoke && token) {
    let endpoint;
    try {
      endpoint = `${apiRoot()}/auth/logout`;
      const headers = new Headers();
      headers.set('authorization', ['Bearer', token].join(' '));
      void fetch(endpoint, { method: 'POST', headers })
        .then((response) => {
          if (!response.ok && response.status !== 401) console.warn('EthioLife could not revoke the signed-out server session.', response.status);
        })
        .catch((error) => console.warn('EthioLife could not reach the server to revoke the signed-out session.', error));
    } catch (error) {
      console.warn('EthioLife could not resolve the server to revoke the signed-out session.', error);
    }
  }
  stopSessionActivity();
  sessionStorage.removeItem(TOKEN_KEY);
  state.user = null;
  $('#app-view').hidden = true;
  $('#mobile-workspace-nav').hidden = true;
  if ($('#workspace-more-dialog').open) $('#workspace-more-dialog').close();
  $('#account-tools').hidden = true;
  $('#login-view').hidden = false;
  $('#public-hub').hidden = false;
  $('#login-form').reset();
  $('#mfa-field').hidden = true;
  $('#retry-session').hidden = true;
  $('#login-error').textContent = message;
  showAlert('');
}

async function loadWorkspace() {
  state.user = await api('/auth/me');
  startSessionActivity(state.user.session_idle_timeout_minutes ?? 30);
  state.features = await getOptional('/features', { mfiPilotEnabled: false, edirEnabled: false });
  state.edirMe = state.features.edirEnabled && state.user.kyc_status === 'verified'
    ? await getOptional('/edir/me', null) : null;
  $('#login-view').hidden = true;
  $('#public-hub').hidden = true;
  $('#app-view').hidden = false;
  $('#mobile-workspace-nav').hidden = false;
  $('#account-tools').hidden = false;
  $('#login-error').textContent = '';
  $('#retry-session').hidden = true;
  $('#account-name').textContent = `${state.user.legal_name} · ${roleLabel(state.user.role)}`;
  $('#page-subtitle').textContent = t('Signed in as {{role}}. Your access is limited to your assigned role and territory.', { role: roleLabel(state.user.role) });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.hidden = false;
  });
  $('#admin-tab').hidden = !['global_admin', 'super_admin', 'compliance', 'corporate_business_manager'].includes(state.user.role);
  const canUseListings = ['global_admin', 'super_admin', 'corporate_business_manager', 'customer', 'master_agent', 'field_agent', 'property_owner'].includes(state.user.role);
  $('#properties-tab').hidden = !canUseListings;
  const canUseMarketplace = canUseListings;
  $('#marketplace-tab').hidden = !canUseMarketplace;
  if (!canUseListings && state.panel === 'properties') state.panel = 'overview';
  if (!canUseMarketplace && state.panel === 'marketplace') state.panel = 'overview';
  $('#contracts-tab').hidden = ['customer', 'worker', 'property_owner'].includes(state.user.role);
  const canUseCommissions = ['global_admin','super_admin','finance','finance_manager','master_agent','field_agent'].includes(state.user.role);
  $('#commissions-tab').hidden = !canUseCommissions;
  if (!canUseCommissions && state.panel === 'commissions') state.panel = 'overview';
  $('#agents-tab').hidden = !['global_admin', 'super_admin', 'master_agent'].includes(state.user.role);
  $('#rent-tab').hidden = ['customer', 'worker', 'property_owner', 'compliance'].includes(state.user.role);
  $('#mfi-tab').hidden = !STAFF.has(state.user.role) || !state.features.mfiPilotEnabled;
  $('#edir-tab').hidden = !state.features.edirEnabled;
  if ($('#mfi-tab').hidden && state.panel === 'mfi') state.panel = 'overview';
  if ($('#edir-tab').hidden && state.panel === 'edir') state.panel = 'overview';
  document.querySelectorAll('.tab').forEach((tab) => {
    if (['property_owner', 'customer'].includes(state.user.role)) {
      tab.hidden = !['overview', 'properties', 'marketplace', 'security', 'edir', 'privacy'].includes(tab.dataset.panel);
    } else if (['worker', 'corporate_business_manager', 'master_agent', 'field_agent'].includes(state.user.role)) {
      tab.hidden = !['overview', 'leads', 'workers', 'requests', 'contracts', 'commissions', 'agents', 'security', 'edir', 'privacy'].includes(tab.dataset.panel);
    }
  });
  renderMobileWorkspaceNav();
  if (state.user.must_change_password) {
    state.panel = 'password';
    renderPanel();
    return;
  }
  if (state.mfaRequired) {
    state.panel = 'security';
    renderPanel();
    return;
  }
  await refresh();
}

async function getOptional(path, fallback) {
  try {
    return await api(path);
  } catch (error) {
    return optionalApiFallback(error, fallback);
  }
}

async function refresh() {
  showAlert('');
  try {
    for (const url of propertyPhotoUrls) URL.revokeObjectURL(url);
    propertyPhotoUrls.clear();
    const [leads, workers, requests, territories, commissions, contracts, leases, tenants, pendingRent] = await Promise.all([
      getOptional('/leads', []), getOptional('/workers', []), getOptional('/requests', []),
      getOptional('/territories', []), getOptional('/commissions', []), getOptional('/contracts', []),
      getOptional('/leases', []), getOptional('/tenants', []), getOptional('/rent-transactions/pending', []),
    ]);
    state.leads = leads;
    state.workers = workers;
    state.requests = requests;
    const canUseListings = ['global_admin','super_admin','corporate_business_manager','customer','master_agent','field_agent','property_owner'].includes(state.user.role);
    state.properties = canUseListings
      ? await api('/properties')
      : [];
    state.ownerStatements = state.user.role === 'property_owner'
      ? (await getOptional('/owner/statements', { statements: [] })).statements ?? []
      : [];
    state.territories = territories;
    state.commissions = commissions;
    state.contracts = contracts;
    state.leases = leases;
    state.tenants = tenants;
    state.pendingRent = pendingRent;
    state.summary = STAFF.has(state.user.role) && state.user.role !== 'compliance'
      ? await getOptional('/reports/summary', null)
      : state.user.enterprise_features_enabled ? await getOptional('/reports/me', null) : null;
    state.users = ['global_admin', 'super_admin', 'compliance'].includes(state.user.role) ? await getOptional('/users', []) : [];
    state.team = ['global_admin', 'super_admin', 'master_agent'].includes(state.user.role) ? await getOptional('/agents/team', []) : [];
    state.businessRules = state.user.role === 'global_admin' ? await api('/business-rules') : [];
    state.globalAdminPromotions = isPlatformAdmin() ? await api('/global-admin-promotions') : [];
    if (canUseListings) {
      [state.marketplaceConfig, state.marketplaceListings] = await Promise.all([
        getOptional('/marketplace/config', {}), getOptional('/marketplace/listings', []),
      ]);
      state.marketplaceSellers = ['global_admin','super_admin','corporate_business_manager'].includes(state.user.role)
        ? await getOptional('/marketplace/sellers', []) : [];
    }
    if (state.panel === 'password') state.panel = 'overview';
    renderStats();
    renderPanel();
  } catch (error) {
    showAlert(error.message, true);
  }
}

function renderStats() {
  const grid = $('#stat-grid');
  grid.replaceChildren();
  const stats = [
    ['My leads', state.leads.length],
    ['Workers', state.workers.length],
    ['Open requests', state.requests.filter((item) => item.status === 'open').length],
    ['Commission events', state.commissions.length],
  ];
  for (const [label, value] of stats) {
    const card = node('article', undefined, 'stat-card');
    card.append(node('span', label), node('strong', value));
    grid.append(card);
  }
}

function card(title, details, status) {
  const wrapper = node('article', undefined, 'list-card');
  const copy = node('div');
  copy.append(node('h3', title), node('p', details));
  wrapper.append(copy);
  const badge = node('span', status ?? 'active', 'pill');
  if (['rejected', 'unavailable', 'cancelled', 'void'].includes(status)) badge.classList.add('warning');
  wrapper.append(badge);
  return wrapper;
}

function renderOverview() {
  const wrap = node('div');
  wrap.append(sectionHeading('Your activity', 'Your latest records and work in progress.'));
  wrap.append(renderServiceLauncher());
  if (state.user.kyc_status === 'verified' && state.features.edirEnabled && !state.edirMe?.membership) {
    const offer = node('section', undefined, 'panel form-card edir-offer');
    offer.append(node('p', 'ETHIOLIFE EDIR · MEMBERSHIP OFFER', 'eyebrow'));
    offer.append(node('h2', 'Explore Edir membership and available benefits'));
    offer.append(node('p', 'Open to verified EthioLife users across worker, employer, landlord, tenant, seller, and buyer services. Review active community, savings, share, and contribution options before requesting membership. Lending, insurance, and benefit payouts are not live in this pilot.'));
    const action = button('View Edir offer', 'open-edir-offer', 'button button-primary');
    action.addEventListener('click', () => { state.panel = 'edir'; renderPanel(); });
    offer.append(action);
    wrap.append(offer);
  }
  if (state.user.enterprise_features_enabled && state.summary) {
    const portfolio = node('section', undefined, 'panel form-card enterprise-snapshot');
    portfolio.append(node('h3', 'Enterprise team and portfolio insights'));
    const total = (rows) => Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number(row.n ?? 0), 0) : 0;
    const snapshot = node('div', undefined, 'enterprise-metrics');
    for (const [label, value] of [
      ['Team leads', total(state.summary.leads)],
      ['Team workers', state.summary.workers ?? 0],
      ['Active contracts', state.summary.active_contracts ?? 0],
      ['Property listings', state.summary.properties ?? 0],
    ]) {
      const metric = node('div', undefined, 'enterprise-metric');
      metric.append(node('span', label), node('strong', value));
      snapshot.append(metric);
    }
    portfolio.append(snapshot);
    wrap.append(portfolio);
  }
  const recent = node('div', undefined, 'list');
  const items = [
    ...state.leads.slice(0, 3).map((item) => card(item.name, t('{{phone}} · Lead · {{date}}', { phone: item.phone, date: new Date(item.created_at).toLocaleDateString(document.documentElement.lang) }), item.status)),
    ...state.workers.slice(0, 3).map((item) => card(item.name, t('{{sector}} · {{years}} years experience', { sector: item.sector, years: item.experience_years }), item.verification)),
    ...state.requests.slice(0, 3).map((item) => card(item.sector, t('Rate ETB {{rate}} · Request', { rate: Number(item.rate_offered).toLocaleString(document.documentElement.lang) }), item.status)),
  ];
  if (!items.length) recent.append(empty('No activity yet. Start by registering a lead or worker.'));
  else recent.append(...items);
  wrap.append(recent);
  return wrap;
}

const serviceDescriptions = {
  leads: 'Register and follow up on customer and business opportunities.',
  workers: 'Review workforce profiles and service readiness.',
  requests: 'Match service requests with available providers.',
  properties: 'Manage property listings, units, and availability.',
  marketplace: 'Discover and manage marketplace activity.',
  contracts: 'Prepare, review, and track service agreements.',
  commissions: 'Review earned commissions and payment status.',
  agents: 'Oversee agent teams and service specialization.',
  rent: 'Manage leases, rent receipts, and deposit workflows.',
  edir: 'Open the central community membership and financial pilot.',
  mfi: 'Open institution-scoped SACCO and MFI pilot operations.',
};

function renderServiceLauncher(panelNames) {
  const allowed = new Set(panelNames ?? [...document.querySelectorAll('.tab:not([hidden])')]
    .map((tab) => tab.dataset.panel)
    .filter((panel) => panel && !['overview', 'privacy', 'security', 'admin'].includes(panel)));
  const tabs = [...document.querySelectorAll('.tab:not([hidden])')]
    .filter((tab) => allowed.has(tab.dataset.panel));
  if (!tabs.length) return node('div');
  const section = node('section', undefined, 'service-launcher');
  section.setAttribute('aria-labelledby', 'service-launcher-title');
  section.append(node('div', undefined, 'service-launcher-heading'));
  section.firstChild.append(node('h2', 'Your service mini-apps'), node('p', 'Open an available service directly. Access is based on your role and enabled features.'));
  section.firstChild.firstChild.id = 'service-launcher-title';
  const grid = node('div', undefined, 'service-launcher-grid');
  for (const tab of tabs) {
    const panel = tab.dataset.panel;
    const card = node('article', undefined, 'service-launcher-card');
    card.append(node('h3', tab.textContent.trim()), node('p', serviceDescriptions[panel] ?? 'Open this role-based service workspace.'));
    const open = button('Open mini app', 'open-panel', 'button button-outline', { panel });
    card.append(open);
    grid.append(card);
  }
  section.append(grid);
  return section;
}

const workspaceNavIcons = {
  overview: '⌂',
  leads: '＋',
  workers: '◎',
  requests: '↔',
  properties: '⌂',
  marketplace: '▦',
  contracts: '▤',
  commissions: '◈',
  agents: '♧',
  rent: '▣',
  mfi: '◉',
  edir: '◇',
  privacy: '⬡',
  security: '⌑',
  admin: '⚙',
};

function createWorkspaceNavLink(tab, className = 'workspace-nav-link') {
  const panel = tab.dataset.panel;
  const link = node('button', undefined, className);
  link.type = 'button';
  link.dataset.panel = panel;
  link.setAttribute('aria-label', tab.textContent.trim());
  const icon = node('span', workspaceNavIcons[panel] ?? '•', 'workspace-nav-icon');
  icon.setAttribute('aria-hidden', 'true');
  const label = node('span', tab.textContent.trim(), 'workspace-nav-label');
  link.append(icon, label);
  return link;
}

function renderMobileWorkspaceNav() {
  const nav = $('#mobile-workspace-nav');
  const moreNav = $('#workspace-more-nav');
  const tabs = [...document.querySelectorAll('#app-view .tabs .tab:not([hidden])')];
  const overview = tabs.find((tab) => tab.dataset.panel === 'overview');
  const primary = [
    overview,
    ...tabs.filter((tab) => tab !== overview && !['privacy', 'security', 'admin'].includes(tab.dataset.panel)).slice(0, 2),
  ].filter(Boolean);
  const primaryPanels = new Set(primary.map((tab) => tab.dataset.panel));
  nav.replaceChildren(...primary.map((tab) => createWorkspaceNavLink(tab)));
  moreNav.replaceChildren(...tabs
    .filter((tab) => !primaryPanels.has(tab.dataset.panel))
    .map((tab) => createWorkspaceNavLink(tab, 'workspace-nav-link workspace-more-link')));
  const moreButton = node('button', undefined, 'workspace-nav-link mobile-nav-more');
  moreButton.type = 'button';
  moreButton.id = 'mobile-workspace-more';
  moreButton.hidden = moreNav.childElementCount === 0;
  moreButton.setAttribute('aria-label', t('More workspace sections'));
  moreButton.setAttribute('aria-haspopup', 'dialog');
  moreButton.setAttribute('aria-controls', 'workspace-more-dialog');
  const moreIcon = node('span', '⋯', 'workspace-nav-icon');
  moreIcon.setAttribute('aria-hidden', 'true');
  moreButton.append(moreIcon, node('span', 'More', 'workspace-nav-label'));
  nav.append(moreButton);
}

function renderLeads() {
  const wrap = node('div');
  wrap.append(sectionHeading('Lead book', 'Every opportunity stays attributed to the agent who sourced it.'));
  const columns = node('div', undefined, 'columns');
  const form = node('form', undefined, 'panel form-card');
  form.dataset.form = 'lead';
  form.append(node('h3', 'Add a lead'));
  const type = field('Lead type', 'lead_type', 'select');
  for (const [value, label] of [['household','Household'],['business','Business'],['worker','Worker'],['property','Property']]) {
    const option = node('option', label); option.value = value; type.input.append(option);
  }
  form.append(type.label, field('Name', 'name').label, field('Phone', 'phone', 'tel', true, { placeholder: '0911 234 567' }).label);
  form.append(button('Save lead', 'submit', 'button button-primary'));
  const list = node('div', undefined, 'list');
  if (!state.leads.length) list.append(empty('Leads you create will appear here.'));
  for (const lead of state.leads) list.append(card(lead.name, t('{{phone}} · {{type}}', { phone: lead.phone, type: t(lead.lead_type[0].toUpperCase() + lead.lead_type.slice(1)) }), lead.status));
  columns.append(form, list);
  wrap.append(columns);
  return wrap;
}

function renderWorkers() {
  const wrap = node('div');
  wrap.append(sectionHeading('Worker directory', 'Register potential workers. Compliance must verify required documents before matching.'));
  const columns = node('div', undefined, 'columns');
  const form = node('form', undefined, 'panel form-card inline-form');
  form.dataset.form = 'worker';
  const title = node('h3', 'Add a worker');
  title.className = 'span-2';
  form.append(title);
  form.append(field('Full name', 'name').label, field('Phone', 'phone', 'tel', true, { placeholder: '0911 234 567' }).label);
  form.append(field('Service sector', 'sector').label, field('Expected monthly rate (ETB)', 'rate_expected', 'number', true, { min: '0', step: '0.01' }).label);
  form.append(field('Experience (years)', 'experience_years', 'number', false, { min: '0', step: '1', value: '0' }).label);
  const territory = field('Territory', 'territory_id', 'select');
  const emptyOption = node('option', 'Choose an area'); emptyOption.value = ''; emptyOption.disabled = true; emptyOption.selected = true; territory.input.append(emptyOption);
  for (const area of state.territories) {
    const option = node('option', area.name); option.value = area.id; territory.input.append(option);
  }
  form.append(territory.label);
  const skills = field('Skills (comma-separated)', 'skills', 'text', false, { placeholder: 'Cooking, cleaning' });
  form.append(skills.label);
  const languages = field('Languages (comma-separated)', 'languages', 'text', false, { placeholder: 'Amharic, English' });
  form.append(languages.label);
  const submit = button('Register worker', 'submit', 'button button-primary span-2');
  form.append(submit);
  const list = node('div', undefined, 'list');
  if (!state.workers.length) list.append(empty('Workers you register will appear here.'));
  for (const worker of state.workers) {
    const item = card(worker.name, t('{{sector}} · ETB {{rate}} · {{territory}}', {
      sector: worker.sector,
      rate: Number(worker.rate_expected).toLocaleString(document.documentElement.lang),
      territory: state.territories.find((area) => area.id === worker.territory_id)?.name ?? worker.territory_id,
    }), worker.verification);
    if (['master_agent','field_agent'].includes(state.user.role)) item.append(button('Upload documents', 'worker-upload', 'button button-outline', { id: worker.id }));
    if (['global_admin','super_admin','compliance'].includes(state.user.role)) {
      item.append(button('Documents', 'worker-documents', 'button button-outline', { id: worker.id }));
      if (worker.verification !== 'verified' && state.user.role === 'compliance') item.append(button('Verify worker', 'worker-verify', 'button button-primary', { id: worker.id }));
    }
    list.append(item);
  }
  columns.append(form, list);
  wrap.append(columns);
  return wrap;
}

function renderRequests() {
  const wrap = node('div');
  wrap.append(sectionHeading('Service requests & matching', 'Agents create demand; Super Admin reviews eligible, verified candidates and controls match decisions.'));
  const columns = node('div', undefined, 'columns');
  const form = node('form', undefined, 'panel form-card inline-form');
  form.dataset.form = 'request';
  const title = node('h3', 'Create a request'); title.className = 'span-2'; form.append(title);
  const leadField = field('Customer lead', 'lead_id', 'select');
  const optionEmpty = node('option', 'Choose a household or business lead'); optionEmpty.value = ''; optionEmpty.disabled = true; optionEmpty.selected = true; leadField.input.append(optionEmpty);
  for (const lead of state.leads.filter((item) => ['household','business'].includes(item.lead_type))) {
    const option = node('option', `${lead.name} · ${lead.phone}`); option.value = lead.id; leadField.input.append(option);
  }
  form.append(leadField.label, field('Service sector', 'sector').label);
  form.append(field('Skills to match', 'skills_required', 'text', false, { placeholder: 'Cooking, childcare' }).label, field('Languages to match', 'languages_required', 'text', false, { placeholder: 'Amharic' }).label);
  form.append(field('Minimum experience (years)', 'min_experience', 'number', false, { min: '0', value: '0' }).label, field('Monthly budget (ETB)', 'rate_offered', 'number', true, { min: '1', step: '0.01' }).label);
  const area = field('Territory', 'territory_id', 'select');
  const noArea = node('option', 'Choose an area'); noArea.value = ''; noArea.disabled = true; noArea.selected = true; area.input.append(noArea);
  for (const territory of state.territories) { const option = node('option', territory.name); option.value = territory.id; area.input.append(option); }
  form.append(area.label);
  const submit = button('Create request', 'submit', 'button button-primary span-2'); form.append(submit);
  const list = node('div', undefined, 'list');
  if (!state.requests.length) list.append(empty('No service requests yet.'));
  for (const request of state.requests) {
    const item = card(request.sector, t('ETB {{rate}} · {{skills}} · {{status}}', {
      rate: Number(request.rate_offered).toLocaleString(document.documentElement.lang),
      skills: request.skills_required?.join(', ') || t('Open skills'),
      status: t(request.status),
    }), request.status);
    item.dataset.request = request.id;
    if (isPlatformAdmin() && request.status === 'open') item.append(button('Find candidates', 'candidates', 'button button-outline', { id: request.id }));
    if (isPlatformAdmin()) item.append(button('Matches', 'matches', 'button button-outline', { id: request.id }));
    list.append(item);
  }
  columns.append(form, list);
  wrap.append(columns);
  return wrap;
}

function renderProperties() {
  const wrap = node('div');
  const buyer = state.user.role === 'customer';
  wrap.append(sectionHeading(
    buyer ? 'Available property listings' : 'Property listings',
    buyer ? 'Browse available properties and view their pictures.' : 'Create and manage property records, units, rent details, and private listing pictures.',
  ));
  const columns = node('div', undefined, 'columns');
  if (!buyer) {
    const form = node('form', undefined, 'panel form-card inline-form');
    form.dataset.form = 'property';
    const title = node('h3', 'Add a property listing');
    title.className = 'span-2';
    form.append(title);
    form.append(field('Street address', 'address', 'text', true, { minlength: '5' }).label);
    const type = field('Property type', 'ptype', 'select');
    for (const item of state.marketplaceConfig.properties?.property_types ?? [{key:'apartment_building',label:'Apartment building',enabled:true},{key:'house',label:'House',enabled:true},{key:'commercial',label:'Commercial',enabled:true},{key:'land',label:'Land',enabled:true}]) if(item.enabled) { const option=node('option',item.label);option.value=item.key;type.input.append(option); }
    form.append(type.label);
    const territory = field('Territory', 'territory_id', 'select');
    const choose = node('option', 'Choose an area');
    choose.value = '';
    choose.disabled = true;
    choose.selected = true;
    territory.input.append(choose);
    for (const area of state.territories) {
      const option = node('option', area.name);
      option.value = area.id;
      territory.input.append(option);
    }
    form.append(territory.label);
    if(['global_admin','super_admin','corporate_business_manager'].includes(state.user.role)){
      const seller=field('Seller / agent represented','owner_user_id','select',false);const none=node('option','EthioLife managed listing');none.value='';seller.input.append(none);for(const user of state.marketplaceSellers){const option=node('option',`${user.legal_name} · ${roleLabel(user.role)}`);option.value=user.id;seller.input.append(option);}form.append(seller.label);
    }
    form.append(field('Description','description','textarea',false,{maxlength:5000,rows:3}).label);
    const listingMode=field('Listing transaction','listing_mode','select');for(const [value,label] of [['sale','For sale'],['rent','For rent'],['sale_or_rent','Sale or rent']]){const option=node('option',label);option.value=value;listingMode.input.append(option);}form.append(listingMode.label);
    form.append(field('Sale price (ETB)','sale_price','number',false,{min:0.01,step:'0.01'}).label);
    const rentPeriod=field('Rental period','rent_period','select',false);for(const item of state.marketplaceConfig.rentals?.periods??[{key:'month',label:'Monthly',enabled:true}])if(item.enabled){const option=node('option',item.label);option.value=item.key;rentPeriod.input.append(option);}form.append(rentPeriod.label);
    form.append(field('First unit number', 'unit_no', 'text', false).label);
    form.append(field('Floor (optional)', 'floor', 'number', false, { step: '1' }).label);
    form.append(field('Monthly rent (ETB, optional)', 'rent', 'number', false, { min: '0', step: '0.01' }).label);
    const pictureLabel = field('Listing pictures or video (JPEG, PNG, MP4 or WebM)', 'photos', 'file', false, { accept: 'image/jpeg,image/png,video/mp4,video/webm', multiple: true }).label;
    pictureLabel.className = 'span-2';
    form.append(pictureLabel);
    const hint = node('p', 'On Android, take or choose photos and videos. Media stays private and is shown only to authorized users.');
    hint.className = 'muted span-2 upload-help';
    form.append(hint);
    form.append(button('Save property listing', 'submit', 'button button-primary span-2'));
    columns.append(form);
  }

  const listings = node('div', undefined, 'list property-list');
  if (!state.properties.length) listings.append(empty('No property listings yet. Add a property to start the listing.'));
  for (const property of state.properties) {
    const item = card(
      property.address,
      t('{{type}} · {{territory}} · {{units}} units', {
        type: t(property.ptype.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')),
        territory: state.territories.find((area) => area.id === property.territory_id)?.name ?? property.territory_id,
        units: property.units?.length ?? 0,
      }),
      property.status,
    );
    item.classList.add('property-card');
    item.dataset.property = property.id;
    if (property.units?.length) {
      const unitSummary = node('p', property.units.map((unit) => `${unit.unit_no}${unit.rent == null ? '' : ` · ETB ${Number(unit.rent).toLocaleString(document.documentElement.lang)}`}`).join('  |  '));
      unitSummary.className = 'property-unit-summary';
      item.append(unitSummary);
    }
    const actions = node('div', undefined, 'property-actions');
    actions.append(button('Photos & video', 'property-photos', 'button button-outline', { id: property.id }));
    if (!buyer) actions.append(button('Add media', 'property-upload', 'button button-outline', { id: property.id }));
    item.append(actions);
    listings.append(item);
  }
  columns.append(listings);
  wrap.append(columns);
  if (state.user.role === 'property_owner') {
    const statements = node('section', undefined, 'panel form-card');
    statements.append(node('h2','Owner rent & deposit statements'));
    statements.append(node('p','These read-only records show lease charges and reconciled rent/deposit receipts. They do not initiate or confirm a payout to you.'));
    if (!state.ownerStatements.length) statements.append(empty('No lease statements are available for your listings yet.'));
    for (const item of state.ownerStatements) {
      const statement = card(`${item.address} · ${item.unit_no}`, `Lease ${item.start_date} to ${item.end_date} · ${item.status}`);
      statement.append(node('p',`Rent charged ETB ${item.rent_charged} · reconciled ETB ${item.rent_reconciled} · pending reconciliation ETB ${item.rent_pending_reconciliation}`));
      statement.append(node('p',`Deposit received ETB ${item.deposit_reconciled} · refunded ETB ${item.deposit_refunded} · agreed deposit ETB ${item.agreed_deposit}`));
      statements.append(statement);
    }
    wrap.append(statements);
  }
  return wrap;
}

function renderMarketplace() {
  const wrap = node('div');
  const manager = ['global_admin','super_admin','corporate_business_manager'].includes(state.user.role);
  const config = state.marketplaceConfig ?? {};
  const enabled = config.system?.enabled_domains ?? ['products','services','equipment','properties'];
  wrap.append(sectionHeading('Marketplace', 'Post and discover products, services, equipment and property with private photo and video uploads.'));
  const columns = node('div', undefined, 'columns');
  if (state.user.role !== 'customer') {
    const form = node('form', undefined, 'panel form-card inline-form marketplace-form');
    form.dataset.form = 'marketplace';
    form.append(node('h3', 'Create a listing'));
    if (manager) {
      const seller = field('Seller / agent represented', 'seller_user_id', 'select');
      const emptyOption = node('option', 'Choose an active seller'); emptyOption.value = ''; emptyOption.disabled = true; emptyOption.selected = true; seller.input.append(emptyOption);
      for (const person of state.marketplaceSellers) { const option = node('option', `${person.legal_name} · ${roleLabel(person.role)}`); option.value = person.id; seller.input.append(option); }
      form.append(seller.label);
    }
    const domain = field('Listing domain', 'domain', 'select');
    for (const [value,label] of [['products','Products'],['services','Services'],['equipment','Equipment']]) if (enabled.includes(value)) { const option=node('option',label); option.value=value; domain.input.append(option); }
    form.append(domain.label);
    const catalog = node('label','Category'); const categories = document.createElement('select'); categories.name='category_key'; categories.required=true; catalog.append(categories);
    const fillCategories = () => { categories.replaceChildren(); const scope=domain.input.value==='services'?'services':'products'; for (const item of config[scope]?.categories ?? []) if (item.enabled) { const option=node('option',item.label); option.value=item.key; categories.append(option); } };
    domain.input.addEventListener('change', fillCategories); fillCategories(); form.append(catalog);
    form.append(field('Title','title','text',true,{minlength:3,maxlength:140}).label);
    form.append(field('Price (ETB)','price','number',false,{min:0.01,step:'0.01'}).label);
    const mode=field('Offer type','transaction_mode','select');
    for(const [value,label] of [['sale','For sale'],['rental','For rent / hire'],['service','Service']]) { const option=node('option',label); option.value=value; mode.input.append(option); }
    mode.input.value=domain.input.value==='services'?'service':'sale';
    domain.input.addEventListener('change',()=>{ mode.input.value=domain.input.value==='services'?'service':'sale'; });
    form.append(mode.label);
    const period=field('Rental period','rent_period','select',false); for(const item of config.rentals?.periods??[]) if(item.enabled){const option=node('option',item.label);option.value=item.key;period.input.append(option);} form.append(period.label);
    const condition=field('Condition','condition','select',false); for(const [value,label] of [['new','New'],['like_new','Like new'],['good','Good'],['fair','Fair'],['not_applicable','Not applicable']]){const option=node('option',label);option.value=value;condition.input.append(option);} form.append(condition.label);
    const area=field('Territory','territory_id','select'); const choose=node('option','Choose an area');choose.value='';choose.disabled=true;choose.selected=true;area.input.append(choose);for(const territory of state.territories){const option=node('option',territory.name);option.value=territory.id;area.input.append(option);}form.append(area.label);
    form.append(field('Description','description','textarea',true,{minlength:10,maxlength:5000}).label);
    const media=field('Photos and videos (add at least one photo to post)','media','file',true,{accept:'image/jpeg,image/png,video/mp4,video/webm',multiple:true}).label; media.className='span-2';form.append(media);
    const hint=node('p',`Private uploads · max ${Math.round(Number(config.system?.image_max_bytes??10485760)/1048576)} MB/photo · ${Math.round(Number(config.system?.video_max_bytes??52428800)/1048576)} MB/video · ${config.system?.max_media_per_listing??10} files/listing`,'muted span-2 upload-help');form.append(hint);
    form.append(button('Post listing','submit','button button-primary span-2'));
    columns.append(form);
  }
  const listingList=node('div',undefined,'list marketplace-list');
  if(!state.marketplaceListings.length) listingList.append(empty('No listings are available yet.'));
  for(const listing of state.marketplaceListings){
    const item=card(listing.title,`${listing.seller_name} · ${listing.domain} · ${listing.transaction_mode}${listing.price?` · ETB ${Number(listing.price).toLocaleString()}`:''}`,listing.status);
    item.classList.add('marketplace-card');
    item.append(node('p',listing.description,'marketplace-description'));
    if(listing.review_note) item.append(node('p',`Review note: ${listing.review_note}`,'form-error'));
    if(listing.media?.length){const gallery=node('div',undefined,'marketplace-gallery'); for(const media of listing.media){const figure=node('figure',undefined,'property-photo');const buttonEl=button(media.mime.startsWith('video/')?'Play video':'View photo','marketplace-media','button button-outline',{id:media.id,mime:media.mime});figure.append(buttonEl);if(media.caption)figure.append(node('figcaption',media.caption));gallery.append(figure);}item.append(gallery);}
    if(['draft','rejected'].includes(listing.status)&&listing.created_by===state.user.id){
      const form=document.createElement('form');form.className='inline-form marketplace-resume';form.dataset.form='marketplace-existing-media';form.dataset.listing=listing.id;
      form.append(field('Add photos or video','media','file',true,{accept:'image/jpeg,image/png,video/mp4,video/webm',multiple:true}).label);
      form.append(button('Upload & post','submit','button button-primary'));
      item.append(form);
    }
    if(listing.status==='pending_review'&&manager&&listing.created_by!==state.user.id){item.append(button('Publish','marketplace-review','button button-primary',{id:listing.id,decision:'publish'}),button('Return for changes','marketplace-review','button button-outline',{id:listing.id,decision:'reject'}));}
    listingList.append(item);
  }
  columns.append(listingList); wrap.append(columns);
  if(manager) wrap.append(renderMarketplaceConfig());
  return wrap;
}

function renderMarketplaceConfig() {
  const panel=node('section',undefined,'panel form-card marketplace-config');
  panel.append(node('h3','Marketplace configuration'),node('p','Manage domain availability, approval rules, media limits and listing categories. Changes apply to new submissions immediately.','muted'));
  const form=node('form',undefined,'inline-form');form.dataset.form='marketplace-config';
  const cfg=state.marketplaceConfig??{};
  const domains=['products','services','equipment','properties'];
  const domainsWrap=node('fieldset',undefined,'span-2');domainsWrap.append(node('legend','Enabled domains'));
  for(const domain of domains){const label=node('label',domain);const input=document.createElement('input');input.type='checkbox';input.name=`domain:${domain}`;input.checked=(cfg.system?.enabled_domains??[]).includes(domain);label.prepend(input);domainsWrap.append(label);}form.append(domainsWrap);
  if(state.user.role==='global_admin'){
    const moderation=node('label','Require staff review before publishing');const check=document.createElement('input');check.type='checkbox';check.name='moderation_required';check.checked=cfg.system?.moderation_required!==false;moderation.prepend(check);form.append(moderation);
    form.append(field('Max photo size (MB)','image_max_mb','number',true,{min:0.25,max:20,step:0.25}).label,field('Max video size (MB)','video_max_mb','number',true,{min:1,max:100,step:1}).label,field('Max media per listing','max_media_per_listing','number',true,{min:1,max:30,step:1}).label);
  }
  for(const scope of ['products','services']){const area=field(`${scope[0].toUpperCase()+scope.slice(1)} categories (one key | label per line)`,`${scope}_categories`,'textarea',true,{rows:5});area.input.value=(cfg[scope]?.categories??[]).map((item)=>`${item.key} | ${item.label}`).join('\n');area.label.className='span-2';form.append(area.label);}
  const propertyTypes=field('Property types (one key | label per line)','property_types','textarea',true,{rows:3});propertyTypes.input.value=(cfg.properties?.property_types??[]).map((item)=>`${item.key} | ${item.label}`).join('\n');propertyTypes.label.className='span-2';form.append(propertyTypes.label);
  const rentalPeriods=field('Rental periods (one key | label per line)','rental_periods','textarea',true,{rows:2});rentalPeriods.input.value=(cfg.rentals?.periods??[]).map((item)=>`${item.key} | ${item.label}`).join('\n');rentalPeriods.label.className='span-2';form.append(rentalPeriods.label);
  if(state.user.role==='global_admin'){
    const users=node('div',undefined,'span-2');users.append(node('h4','Self-registration account types and KYC'));
    const types=cfg.users?.account_types??[];for(const item of types){const label=node('label',item.label);const input=document.createElement('input');input.type='checkbox';input.name=`account:${item.key}`;input.checked=item.enabled;label.prepend(input);users.append(label);}
    users.append(node('h4','Required registration documents'));
    for(const role of ['worker','customer','agent','property_owner']) for(const doc of ['national_id','police_clearance']){const label=node('label',`${roleLabel(role)} · ${doc==='national_id'?'National ID':'Police clearance'}`);const input=document.createElement('input');input.type='checkbox';input.name=`kyc:${role}:${doc}`;input.checked=(cfg.users?.kyc_requirements?.[role]??[]).includes(doc);if(role==='worker')input.disabled=true;label.prepend(input);users.append(label);}
    form.append(users);
  }
  form.append(button('Save configuration','submit','button button-primary span-2'));panel.append(form);return panel;
}

function renderContracts() {
  const wrap = node('div');
  wrap.append(sectionHeading('Contracts', 'Move each contract through review, approval, signature, and two-person payment reconciliation.'));
  const columns = node('div', undefined, 'columns');
  if (['global_admin', 'super_admin', 'master_agent', 'field_agent'].includes(state.user.role)) {
    const form = node('form', undefined, 'panel form-card inline-form');
    form.dataset.form = 'contract';
    form.append(node('h3', 'Create a contract'));
    const lead = field('Customer lead', 'lead_id', 'select');
    const emptyOption = node('option', 'Choose an eligible lead'); emptyOption.value = ''; emptyOption.disabled = true; emptyOption.selected = true; lead.input.append(emptyOption);
    for (const item of state.leads.filter((x) => ['household', 'business'].includes(x.lead_type) && ['new', 'qualified'].includes(x.status))) {
      const option = node('option', `${item.name} · ${item.phone}`); option.value = item.id; lead.input.append(option);
    }
    const track = field('Contract track', 'track', 'select');
    for (const [value, label] of [['A', 'Track A'], ['B', 'Track B']]) { const option = node('option', label); option.value = value; track.input.append(option); }
    form.append(lead.label, track.label, field('Base value (ETB)', 'base_value', 'number', true, { min: '0.01', step: '0.01' }).label, button('Create contract', 'submit', 'button button-primary'));
    columns.append(form);
  }
  const list = node('div', undefined, 'list');
  if (!state.contracts.length) list.append(empty('No contracts are available for your account.'));
  for (const contract of state.contracts) {
    const fees = ['onboarding_amt', 'guarantee_amt', 'monthly_mgmt_amt', 'employer_fee_amt', 'other_fee_amt'].reduce((sum, key) => sum + Number(contract[key] ?? 0), 0);
    const item = card(contract.contract_no, t('Track {{track}} · ETB {{amount}} · {{state}}', { track: contract.track, amount: fees.toLocaleString(document.documentElement.lang), state: t(contract.state) }), contract.state);
    const steps = {
      draft: [['submit', 'Submit for review', ['super_admin', 'master_agent', 'field_agent']],
        ['cancel', 'Cancel contract', ['super_admin', 'master_agent', 'field_agent']]],
      compliance_review: [['verify_kyc', 'Verify contract KYC', ['compliance']],
        ['reject', 'Reject contract', ['compliance']], ['cancel', 'Cancel contract', ['super_admin', 'master_agent', 'field_agent']]],
      approval_pending: [['approve', 'Approve contract', ['super_admin']], ['cancel', 'Cancel contract', ['super_admin', 'master_agent', 'field_agent']]],
      signature_pending: [['sign', 'Sign contract', ['super_admin', 'corporate_business_manager']], ['cancel', 'Cancel contract', ['super_admin', 'master_agent', 'field_agent']]],
      payment_pending: [['record_payment', 'Record payment', ['finance']], ['cancel', 'Cancel contract', ['super_admin', 'master_agent', 'field_agent']]],
      payment_received: [['reconcile', 'Reconcile payment', ['finance', 'finance_manager']]],
    }[contract.state] ?? [];
    for (const [action, label, roles] of steps) {
      if (roles.includes(state.user.role) || (state.user.role === 'global_admin' && roles.includes('super_admin'))) {
        const actionButton = button(label, 'contract-step', 'button button-outline', { id: contract.id, step: action });
        if (action === 'sign' && !(contract.documents ?? []).some((doc) => doc.document_stage === 'company_countersigned' && doc.uploaded_by === state.user.id)
          || action === 'sign' && !(contract.documents ?? []).some((doc) => doc.document_stage === 'party_signed')) actionButton.disabled = true;
        item.append(actionButton);
      }
    }
    for (const doc of contract.documents ?? []) {
      const download = button(doc.document_stage === 'company_countersigned' ? 'Download company-countersigned contract' : 'Download party-signed contract', 'contract-document-download', 'button button-outline', { id: doc.id });
      item.append(download);
    }
    if (contract.signature) item.append(node('p', `Company signature recorded by ${contract.signature.signer_name} (${roleLabel(contract.signature.signer_role)}).`));
    if (contract.state === 'signature_pending' && ['master_agent', 'field_agent', 'global_admin', 'super_admin', 'corporate_business_manager'].includes(state.user.role)) {
      const file = document.createElement('input');
      file.type = 'file'; file.accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
      const isAgent = ['master_agent', 'field_agent'].includes(state.user.role);
      file.setAttribute('aria-label', t(isAgent ? 'Party-signed contract document (PDF, JPEG or PNG, up to 10 MB)' : 'Company-countersigned contract document (PDF, JPEG or PNG, up to 10 MB)'));
      const upload = button(isAgent ? 'Upload party-signed contract' : 'Upload company-countersigned contract', 'contract-document-upload', 'button button-outline', { id: contract.id, stage: isAgent ? 'party_signed' : 'company_countersigned' });
      item.append(file, upload);
    }
    list.append(item);
  }
  columns.append(list);
  wrap.append(columns);
  return wrap;
}

function renderCommissions() {
  const wrap = node('div');
  wrap.append(sectionHeading('Commissions', 'Review earned commissions, current holdbacks, and eligible releases.'));
  const list = node('div', undefined, 'list');
  if (!state.commissions.length) list.append(empty('No commission events are available for your account.'));
  for (const commission of state.commissions) {
    const total = Number(commission.amount);
    const held = Number(commission.held_amount ?? 0);
    const immediate = Math.round((total - held) * 100) / 100;
    let details = t('Contract {{contract}} · Total ETB {{total}} · First payment ETB {{immediate}} · Held ETB {{held}}', {
      contract: commission.contract_no ?? commission.contract_id,
      total: total.toLocaleString(document.documentElement.lang),
      immediate: immediate.toLocaleString(document.documentElement.lang),
      held: held.toLocaleString(document.documentElement.lang),
    });
    if (held) details += ` · ${t('Release date {{date}}', { date: commission.holdback_release_on })}`;
    const item = card(commission.agent_name ?? commission.agent_id, details, commission.held_status === 'held' ? 'held' : commission.status);
    if (commission.status === 'qualified' && ['finance','finance_manager'].includes(state.user.role)) {
      item.append(button('Approve commission', 'commission-approve', 'button button-outline', { id: commission.id }));
    }
    if (commission.status === 'approved' && immediate > 0 && ['global_admin','super_admin'].includes(state.user.role)) {
      item.append(button('Pay first installment', 'commission-pay', 'button button-outline', { id: commission.id }));
    }
    if (commission.held_status === 'held' && ['global_admin','super_admin'].includes(state.user.role)) {
      item.append(button('Release eligible holdback', 'commission-release-held', 'button button-outline', { id: commission.id }));
    }
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderAgents() {
  const wrap = node('div');
  wrap.append(sectionHeading('Agent management', 'Review agent activity and assign specialist agency services across the Super Agent and Master Agent network.'));
  wrap.append(renderServiceLauncher(['leads', 'workers', 'requests', 'properties', 'marketplace', 'contracts', 'commissions', 'rent']));
  const list = node('div', undefined, 'list');
  const services = {
    financial_service: 'Financial Service Agent',
    growth_partnership: 'Growth & Partnership Agent',
    workforce_property: 'Workforce & Property Management Agent',
  };
  if (!state.team.length) list.append(empty('No agents are available in this management scope.'));
  for (const agent of state.team) {
    const item = card(agent.legal_name, `${roleLabel(agent.role)} · ${agent.active ? 'active' : 'inactive'} · Leads ${agent.lead_count} · Contracts ${agent.contract_count} · Listings ${agent.property_count}`, services[agent.service_specialization] ?? 'General agent');
    if (agent.id !== state.user.id && (isPlatformAdmin() || agent.parent_id === state.user.id)) {
      const select = document.createElement('select');
      select.dataset.agentSpecialization = agent.id;
      for (const [value, label] of [['', 'General agent'], ...Object.entries(services)]) {
        const option = node('option', label); option.value = value;
        option.selected = (agent.service_specialization ?? '') === value;
        select.append(option);
      }
      item.append(select, button('Save service assignment', 'agent-specialization', 'button button-outline', { id: agent.id }));
    }
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderRent() {
  const wrap = node('div');
  wrap.append(sectionHeading('Rent & deposits', 'Record payments first. A different finance officer reconciles them into the ledger.'));
  const columns = node('div', undefined, 'columns');
  if (['global_admin', 'super_admin', 'master_agent', 'field_agent'].includes(state.user.role)) {
    const tenantForm = node('form', undefined, 'panel form-card inline-form');
    tenantForm.dataset.form = 'tenant';
    tenantForm.append(node('h3', 'Register a tenant'), field('Full name', 'name').label, field('Phone', 'phone', 'tel').label, field('National ID (optional)', 'national_id', 'text', false).label, button('Save tenant', 'submit', 'button button-primary'));
    columns.append(tenantForm);
    const leaseForm = node('form', undefined, 'panel form-card inline-form');
    leaseForm.dataset.form = 'lease';
    leaseForm.append(node('h3', 'Create a lease'));
    const unit = field('Vacant unit', 'unit_id', 'select');
    const unitEmpty = node('option', 'Choose a unit'); unitEmpty.value = ''; unitEmpty.disabled = true; unitEmpty.selected = true; unit.input.append(unitEmpty);
    for (const property of state.properties) for (const entry of property.units ?? []) if (entry.occupancy === 'vacant') {
      const option = node('option', `${property.address} · ${entry.unit_no}`); option.value = entry.id; unit.input.append(option);
    }
    const tenant = field('Tenant', 'tenant_id', 'select');
    const tenantEmpty = node('option', 'Choose a tenant'); tenantEmpty.value = ''; tenantEmpty.disabled = true; tenantEmpty.selected = true; tenant.input.append(tenantEmpty);
    for (const entry of state.tenants) { const option = node('option', `${entry.name} · ${entry.phone}`); option.value = entry.id; tenant.input.append(option); }
    leaseForm.append(unit.label, tenant.label, field('Monthly rent (ETB)', 'rent', 'number', true, { min: '0.01', step: '0.01' }).label, field('Deposit (ETB)', 'deposit', 'number', false, { min: '0', step: '0.01', value: '0' }).label, field('Start date', 'start_date', 'date').label, field('Term (months)', 'months', 'number', true, { min: '1', max: '120', value: '12' }).label, button('Create lease', 'submit', 'button button-primary'));
    columns.append(leaseForm);
  }
  if (['global_admin', 'super_admin', 'finance_manager'].includes(state.user.role)) {
    const pending = node('section', undefined, 'panel form-card');
    pending.append(node('h3', 'Payments awaiting reconciliation'));
    if (!state.pendingRent.length) pending.append(empty('No rent or deposit payments are awaiting reconciliation.'));
    for (const payment of state.pendingRent) {
      const item = card(t(payment.kind), `${payment.reference} · ETB ${Number(payment.amount).toLocaleString(document.documentElement.lang)}`, payment.status);
      item.append(button('Reconcile payment', 'rent-reconcile', 'button button-primary', { id: payment.id })); pending.append(item);
      item.append(button('Void receipt', 'rent-void', 'button button-outline', { id: payment.id }));
    }
    columns.append(pending);
  }
  const leases = node('div', undefined, 'list');
  if (!state.leases.length) leases.append(empty('No leases are available for your account.'));
  for (const lease of state.leases) {
    const item = card(`${lease.address} · ${lease.unit_no}`, t('{{tenant}} · ETB {{rent}} monthly · {{status}}', { tenant: lease.tenant_name, rent: Number(lease.rent).toLocaleString(document.documentElement.lang), status: t(lease.status) }), lease.status);
    item.dataset.lease = lease.id;
    item.append(button('View charges & payments', 'lease-payments', 'button button-outline', { id: lease.id }));
    if (['global_admin', 'super_admin', 'master_agent', 'field_agent'].includes(state.user.role) && lease.status === 'active') item.append(button('End lease', 'lease-end', 'button button-outline', { id: lease.id }));
    if (['finance', 'finance_manager', 'global_admin', 'super_admin'].includes(state.user.role) && lease.status === 'active' && Number(lease.deposit) > 0) item.append(button('Record deposit', 'deposit-pay', 'button button-outline', { id: lease.id }));
    if (['finance', 'finance_manager', 'global_admin', 'super_admin'].includes(state.user.role) && lease.status === 'ended' && Number(lease.deposit) > 0) item.append(button('Return deposit', 'deposit-refund', 'button button-outline', { id: lease.id }));
    leases.append(item);
  }
  columns.append(leases); wrap.append(columns); return wrap;
}

function renderBusinessRules() {
  const panel = node('section', undefined, 'panel form-card');
  panel.append(
    node('h3', 'Business rules'),
    node('p', 'Changes apply to new calculations immediately. Unsigned contracts are repriced; signed contracts, recorded payments, and ledger entries are not rewritten.'),
    node('p', 'Required identity and police-clearance checks, role permissions, and separate payment approvals cannot be disabled here.'),
  );
  const form = node('form', undefined, 'inline-form business-rules-form');
  form.dataset.form = 'business-rules';
  let group = '';
  for (const rule of state.businessRules) {
    if (rule.group !== group) {
      group = rule.group;
      const heading = node('h4', group);
      heading.className = 'span-2';
      form.append(heading);
    }
    const input = document.createElement('input');
    input.name = rule.key;
    input.type = rule.step === 1 && rule.max === 1 ? 'checkbox' : 'number';
    if (input.type === 'checkbox') {
      input.checked = Number(rule.value) === 1;
    } else {
      input.min = String(rule.min);
      input.max = String(rule.max);
      input.step = String(rule.step);
      input.value = String(rule.value);
      input.required = true;
    }
    const label = node('label', rule.label);
    if (input.type === 'checkbox') label.className = 'business-rule-toggle';
    label.append(input);
    form.append(label);
  }
  form.append(button('Save business rules', 'submit', 'button button-primary span-2'));
  panel.append(form);
  return panel;
}

function renderGlobalAdminPromotions() {
  const section = node('section', undefined, 'panel form-card');
  section.style.marginTop = '20px';
  section.append(node('h3', 'Global Admin governance'));
  section.append(node('p', 'Promotion requires two different active, MFA-enabled Super Admins. Global Admin access does not bypass financial maker-checker approvals.'));
  if (state.user.role === 'super_admin') {
    const candidates = state.users.filter((user) =>
      user.id !== state.user.id && user.active && user.mfa_enabled && user.role === 'super_admin');
    if (candidates.length) {
      const form = node('form', undefined, 'inline-form');
      form.dataset.form = 'global-admin-promotion';
      const target = field('Nominate an eligible Super Admin', 'target_user_id', 'select');
      const placeholder = node('option', 'Choose a Super Admin'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
      target.input.append(placeholder);
      for (const candidate of candidates) {
        const option = node('option', `${candidate.legal_name} · ${candidate.phone}`);
        option.value = candidate.id;
        target.input.append(option);
      }
      form.append(target.label, button('Request Global Admin promotion', 'submit', 'button button-primary'));
      section.append(form);
    } else {
      section.append(node('p', 'No other active, MFA-enabled Super Admin is currently eligible for nomination.'));
    }
  }

  const history = node('div', undefined, 'list');
  history.append(node('h4', 'Promotion requests'));
  if (!state.globalAdminPromotions.length) {
    history.append(empty('No Global Admin promotion requests have been submitted.'));
  } else {
    for (const request of state.globalAdminPromotions) {
      const item = card(request.target_name, `${request.status} · Requested by ${request.requester_name} · ${request.created_at}`, request.status);
      if (request.approver_name) item.append(node('p', `Decision by ${request.approver_name}: ${request.decision_reason}`));
      const canDecide = state.user.role === 'super_admin'
        && request.status === 'pending'
        && request.requested_by !== state.user.id
        && request.target_user_id !== state.user.id;
      if (canDecide) {
        item.append(button('Approve promotion', 'global-promotion-approve', 'button button-primary', { id: request.id }));
        item.append(button('Reject promotion', 'global-promotion-reject', 'button button-outline', { id: request.id }));
      }
      history.append(item);
    }
  }
  section.append(history);
  return section;
}

function renderAdmin() {
  const wrap = node('div');
  const isAdmin = isPlatformAdmin();
  const isGlobalAdmin = state.user.role === 'global_admin';
  const isBusinessManager=state.user.role==='corporate_business_manager';
  wrap.append(sectionHeading(isAdmin ? isGlobalAdmin ? 'Global administration' : 'Administration' : isBusinessManager ? 'Business manager workspace' : 'Compliance review', isAdmin ? isGlobalAdmin ? 'Manage system-wide configuration and review cross-module operations.' : 'Provision accounts and review the operational summary.' : isBusinessManager ? 'Manage business operations and review marketplace submissions.' : 'Review account verification before activation.'));
  const columns = node('div', undefined, 'columns');
  if (isGlobalAdmin) wrap.append(renderBusinessRules());
  if (isAdmin) wrap.append(renderGlobalAdminPromotions());
  if (isAdmin) {
    const form = node('form', undefined, 'panel form-card inline-form');
    form.dataset.form = 'user';
    const title = node('h3', 'Create an account'); title.className = 'span-2'; form.append(title);
    form.append(field('Legal name', 'legal_name').label, field('Phone', 'phone', 'tel', true, { placeholder: '0911 234 567' }).label);
    const role = field('Role', 'role', 'select');
    for (const [value, label] of [['super_admin','Super Agent / Super Admin'],['corporate_business_manager','Corporate Business Manager'],['master_agent','Master agent'],['field_agent','Field agent'],['compliance','Compliance'],['finance','Finance'],['finance_manager','Finance manager'],['customer','Customer'],['worker','Worker'],['property_owner','Property owner']]) {
      const option = node('option', label); option.value = value; role.input.append(option);
    }
    form.append(role.label);
    const specialization = field('Specialist agency service (optional)', 'service_specialization', 'select', false);
    for (const [value, label] of [['', 'General agent'], ['financial_service', 'Financial Service Agent'], ['growth_partnership', 'Growth & Partnership Agent'], ['workforce_property', 'Workforce & Property Management Agent']]) {
      const option = node('option', label); option.value = value; specialization.input.append(option);
    }
    form.append(specialization.label);
    const area = field('Territory', 'territory_id', 'select', false);
    const none = node('option', 'No territory'); none.value = ''; area.input.append(none);
    for (const territory of state.territories) { const option = node('option', territory.name); option.value = territory.id; area.input.append(option); }
    form.append(area.label);
    const parent = field('Master agent (required for field agents)', 'parent_agent_id', 'select', false);
    const parentEmpty = node('option', 'Choose master agent'); parentEmpty.value = ''; parent.input.append(parentEmpty);
    for (const user of state.users.filter((item) => item.role === 'master_agent')) { const option = node('option', user.legal_name); option.value = user.id; parent.input.append(option); }
    form.append(parent.label);
    form.append(field('Email', 'email', 'email', false).label);
    form.append(button('Create account', 'submit', 'button button-primary span-2'));
    columns.append(form);
  }
  const users = node('div', undefined, 'list');
  if (!state.users.length) users.append(empty('No accounts to display.'));
  for (const user of state.users.slice(0, 25)) {
    const signupDetails = user.signup_account_type
      ? t('{{phone}} · {{role}} · {{plan}}', {
        phone: user.phone,
        role: roleLabel(user.role),
        plan: user.requested_plan
          ? `${t('Plan requested')}: ${t(user.requested_plan)} · ${user.signup_payment_status === 'not_configured' ? t('Payment not configured') : ''}`
          : roleLabel(user.role),
      })
      : `${user.phone} · ${roleLabel(user.role)}`;
    const requestedBenefits = [
      user.pension_match_interest && 'Pension match requested',
      user.edir_member_interest && 'EthioLife Edir requested',
      user.edir_life_interest && 'Life cover requested',
      user.household_cover_interest && 'Household cover requested',
    ].filter(Boolean).join(' · ');
    const item = card(user.legal_name, [signupDetails, requestedBenefits].filter(Boolean).join(' · '), user.active ? 'active' : user.kyc_status);
    if (user.signup_account_type && ['global_admin', 'super_admin', 'compliance'].includes(state.user.role)) {
      item.append(button(`KYC documents (${user.kyc_document_count ?? 0})`, 'user-documents', 'button button-outline', { id: user.id }));
    }
    if (state.user.role === 'compliance' && ['uploaded','under_review'].includes(user.kyc_status) && user.id !== state.user.id) {
      item.append(button('Verify KYC', 'user-kyc', 'button button-primary', { id: user.id, decision: 'verified' }));
      item.append(button('Reject', 'user-kyc', 'button button-outline', { id: user.id, decision: 'rejected' }));
    }
    if (isAdmin && !user.active && user.created_by !== state.user.id) item.append(button('Activate', 'user-activate', 'button button-primary', { id: user.id }));
    if (isAdmin && user.active && user.id !== state.user.id) item.append(button('Deactivate', 'user-deactivate', 'button button-outline', { id: user.id }));
    users.append(item);
  }
  columns.append(users);
  wrap.append(columns);
  if (isAdmin && state.summary) {
    const summary = node('section', undefined, 'panel form-card');
    summary.style.marginTop = '20px';
    summary.append(node('h3', 'Platform snapshot'));
    const count = (key) => Array.isArray(state.summary[key]) ? state.summary[key].reduce((total, row) => total + Number(row.n ?? 0), 0) : '—';
    summary.append(node('p', t('Leads {{leads}} · Workers {{workers}} · Open disputes {{disputes}}', {
      leads: count('leads'), workers: count('workers'), disputes: state.summary.open_disputes?.n ?? 0,
    })));
    wrap.append(summary);
  }
  return wrap;
}

function renderPasswordChange() {
  const form = node('form', undefined, 'panel form-card');
  form.style.maxWidth = '480px';
  form.dataset.form = 'password';
  form.append(node('h3', 'Set a new password'), node('p', 'Your account requires a password change before continuing.'));
  form.append(field('Temporary password', 'current', 'password').label, field('New password (12+ characters)', 'next', 'password', true, { minlength: '12', maxlength: '72' }).label);
  form.append(button('Update password', 'submit', 'button button-primary'));
  return form;
}

function renderSecurity() {
  const wrap = node('div');
  wrap.append(sectionHeading('Account security', 'Protect your account with an authenticator app.'));
  const panel = node('section', undefined, 'panel form-card');
  panel.style.maxWidth = '620px';
  panel.append(node('h3', state.user.mfa_enabled ? 'Two-step verification is enabled' : 'Two-step verification'));
  panel.append(node('p', state.user.mfa_enabled ? 'Your sign-in uses a password and authenticator code.' : 'Use an authenticator app to generate a one-time sign-in code.'));
  if (!state.user.mfa_enabled && !state.mfaSetup) {
    panel.append(button('Set up authenticator', 'mfa-setup', 'button button-primary'));
  } else if (state.mfaSetup && !state.user.mfa_enabled) {
    panel.append(node('p', 'Add this account in your authenticator app using the setup key below.'));
    const secret = node('code', state.mfaSetup.secret);
    secret.style.display = 'block';
    secret.style.padding = '14px';
    secret.style.margin = '10px 0 18px';
    secret.style.background = '#f3f5f1';
    secret.style.overflowWrap = 'anywhere';
    panel.append(secret);
    const uri = node('p', state.mfaSetup.uri, 'muted');
    uri.style.overflowWrap = 'anywhere';
    panel.append(uri);
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'mfa-enable';
    const code = field('Six-digit authenticator code', 'code', 'text', true, { inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6 });
    form.append(code.label, button('Verify and enable', 'submit', 'button button-primary'));
    panel.append(form);
  }
  wrap.append(panel);
  return wrap;
}

function renderPanel() {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === state.panel));
  document.querySelectorAll('.workspace-nav-link').forEach((link) => link.classList.toggle('active', link.dataset.panel === state.panel));
  const primaryPanels = new Set([...document.querySelectorAll('#mobile-workspace-nav [data-panel]')].map((link) => link.dataset.panel));
  $('#mobile-workspace-more')?.classList.toggle('active', !primaryPanels.has(state.panel));
  $('#page-title').textContent = t(state.panel === 'password' || state.panel === 'security' ? 'Account security' : state.panel === 'admin' ? 'Admin workspace' : state.panel === 'mfi' ? 'SACCO / MFI workspace' : 'Your workspace');
  if (state.panel === 'mfi') {
    $('#workspace').replaceChildren(createMfiWorkspace(api, state.user));
    return;
  }
  if (state.panel === 'edir') {
    $('#workspace').replaceChildren(createEdirWorkspace(api, state.user, (organizationId) => {
      state.edirOrganizationId = organizationId;
      state.user.edir_id = organizationId;
      localStorage.setItem(EDIR_ORGANIZATION_KEY, organizationId);
      renderPanel();
    }));
    return;
  }
  if (state.panel === 'privacy') {
    $('#workspace').replaceChildren(createPrivacyWorkspace(api, state.user));
    return;
  }
  const renderer = {
    overview: renderOverview,
    leads: renderLeads,
    workers: renderWorkers,
    requests: renderRequests,
    properties: renderProperties,
    marketplace: renderMarketplace,
    admin: renderAdmin,
    contracts: renderContracts,
    commissions: renderCommissions,
    agents: renderAgents,
    rent: renderRent,
    password: renderPasswordChange,
    security: renderSecurity,
  }[state.panel] ?? renderOverview;
  $('#workspace').replaceChildren(renderer());
}

async function submitForm(form) {
  const values = formData(form);
  if (form.dataset.form === 'password') {
    const result = await api('/auth/change-password', { method: 'POST', body: JSON.stringify(values) });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    state.user.must_change_password = false;
    state.mfaRequired = result.restrict === 'mfa';
    if (state.mfaRequired) {
      state.panel = 'security';
      await loadWorkspace();
    } else {
      state.panel = 'overview';
      await refresh();
    }
    showAlert('Password updated successfully.');
    return;
  }
  if (form.dataset.form === 'mfa-enable') {
    const result = await api('/auth/mfa/enable', { method: 'POST', body: JSON.stringify(values) });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    state.mfaRequired = false;
    state.mfaSetup = null;
    await loadWorkspace();
    showAlert('Two-step verification enabled.');
    return;
  }
  if (form.dataset.form === 'tenant') {
    const payload = { ...values };
    if (!payload.national_id) delete payload.national_id;
    await api('/tenants', { method: 'POST', body: JSON.stringify(payload) });
    await refresh(); showAlert('Tenant registered.'); return;
  }
  if (form.dataset.form === 'lease') {
    const payload = { ...values, rent: number(values.rent), deposit: number(values.deposit || '0'), months: number(values.months) };
    await api('/leases', { method: 'POST', body: JSON.stringify(payload) });
    await refresh(); showAlert('Lease created with calendar-day proration for the first month.'); return;
  }
  if (form.dataset.form === 'contract') {
    await api(`/leads/${values.lead_id}/contracts`, { method: 'POST', body: JSON.stringify({ track: values.track, base_value: number(values.base_value) }) });
    await refresh(); showAlert('Contract created.'); return;
  }
  if (form.dataset.form === 'business-rules') {
    const changed = {};
    for (const rule of state.businessRules) {
      const input = form.elements.namedItem(rule.key);
      const value = input.type === 'checkbox' ? Number(input.checked) : number(input.value);
      if (value !== Number(rule.value)) changed[rule.key] = value;
    }
    if (!Object.keys(changed).length) {
      showAlert('No business rule changes to save.');
      return;
    }
    const result = await api('/business-rules', { method: 'PATCH', body: JSON.stringify({ values: changed }) });
    state.businessRules = result.rules;
    await refresh();
    showAlert('Business rules saved. {{count}} unsigned contracts were repriced.', false, { count: result.repriced_contracts });
    return;
  }
  if (form.dataset.form === 'property') {
    const unit = {};
    if (values.unit_no.trim()) unit.unit_no = values.unit_no.trim();
    if (values.floor) unit.floor = number(values.floor);
    if (values.rent) unit.rent = number(values.rent);
    const payload = {
      address: values.address.trim(),
      ptype: values.ptype,
      description: values.description?.trim()||undefined,
      listing_mode: values.listing_mode,
      sale_price: values.sale_price?number(values.sale_price):undefined,
      rent_period: values.rent_period||undefined,
      owner_user_id: values.owner_user_id||undefined,
      territory_id: number(values.territory_id),
      ...(Object.keys(unit).length ? { units: [unit] } : {}),
    };
    const property = await api('/properties', { method: 'POST', body: JSON.stringify(payload) });
    const photos = form.querySelector('input[name="photos"]').files;
    try {
      await uploadPropertyPhotos(property.id, photos);
    } catch (error) {
      await refresh();
      showAlert(t('Property listing was saved, but picture upload failed: {{error}} Use Add pictures to retry.', { error: error.message }), true);
      return;
    }
    form.reset();
    await refresh();
    showAlert('Property listing saved successfully.');
    return;
  }
  if (form.dataset.form === 'property-photos') {
    const files = form.querySelector('input[name="photos"]').files;
    if (!files.length) throw new Error(t('Choose at least one picture to upload.'));
    await uploadPropertyPhotos(form.dataset.property, files, values.caption);
    await refresh();
    showAlert('Property pictures uploaded successfully.');
    return;
  }
  if (form.dataset.form === 'upload-document') {
    const file = form.querySelector('input[type="file"]').files[0];
    if (!file) throw new Error('Choose a document to upload.');
    const params = new URLSearchParams({ doc_type: values.doc_type });
    if (values.expires_on) params.set('expires_on', values.expires_on);
    await api(`/workers/${form.dataset.worker}/documents/upload?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    });
    await refresh();
    showAlert('Document uploaded for compliance review.');
    return;
  }
  if (form.dataset.form === 'lead') {
    await api('/leads', { method: 'POST', body: JSON.stringify(values) });
  } else if (form.dataset.form === 'worker') {
    await api('/workers', { method: 'POST', body: JSON.stringify({
      ...values,
      rate_expected: number(values.rate_expected),
      experience_years: Number(values.experience_years || 0),
      territory_id: number(values.territory_id),
      skills: values.skills.split(',').map((value) => value.trim()).filter(Boolean),
      languages: values.languages.split(',').map((value) => value.trim()).filter(Boolean),
    }) });
  } else if (form.dataset.form === 'request') {
    await api('/requests', { method: 'POST', body: JSON.stringify({
      ...values,
      rate_offered: number(values.rate_offered),
      min_experience: Number(values.min_experience || 0),
      territory_id: number(values.territory_id),
      skills_required: values.skills_required.split(',').map((value) => value.trim()).filter(Boolean),
      languages_required: values.languages_required.split(',').map((value) => value.trim()).filter(Boolean),
    }) });
  } else if (form.dataset.form === 'user') {
    const payload = { ...values };
    if (!payload.territory_id) delete payload.territory_id;
    else payload.territory_id = number(payload.territory_id);
    if (!payload.parent_agent_id) delete payload.parent_agent_id;
    if (!payload.email) delete payload.email;
    if (!payload.service_specialization) delete payload.service_specialization;
    const result = await api('/users', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await refresh();
    showAlert('Account created for {{name}}. Temporary password (shown once): {{password}}', false, {
      name: result.user.legal_name,
      password: result.temp_password,
    });
    return;
  } else if (form.dataset.form === 'global-admin-promotion') {
    await api('/global-admin-promotions', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: values.target_user_id }),
    });
    await refresh();
    showAlert('Global Admin promotion request submitted for independent review.');
    return;
  }
  form.reset();
  await refresh();
  showAlert('Saved successfully.');
}

async function showCandidates(requestId, container) {
  const existing = container.querySelector('.candidate-results');
  if (existing) { existing.remove(); return; }
  const panel = node('div', undefined, 'candidate-results list');
  panel.style.gridColumn = '1 / -1';
  panel.append(node('h3', 'Eligible candidates'));
  panel.append(node('p', 'Scores are recommendations based on the factors below. A staff member reviews each proposal. Confirm the worker’s willingness and terms directly before reserving.', 'muted'));
  try {
    const candidates = await api(`/requests/${requestId}/candidates`);
    if (!candidates.length) panel.append(empty('No verified available workers meet this request yet.'));
    for (const person of candidates) {
      const item = card(person.name, t('{{years}} years · match score {{score}}%', { years: person.experience_years, score: person.score }), 'verified');
      item.append(matchBreakdown(person.parts));
      item.append(button('Propose match', 'propose', 'button button-primary', { id: requestId, worker: person.worker_id }));
      panel.append(item);
    }
  } catch (error) {
    panel.append(empty(error.message));
  }
  container.append(panel);
}

function matchBreakdown(parts) {
  const details = document.createElement('details');
  details.className = 'match-breakdown';
  const summary = node('summary', 'Score factors');
  details.append(summary);
  const labels = { skills: 'Skills', location: 'Location', availability: 'Availability', experience: 'Experience', rate: 'Expected rate', language: 'Languages' };
  const list = node('ul');
  for (const [key, label] of Object.entries(labels)) {
    if (typeof parts?.[key] !== 'number') continue;
    list.append(node('li', `${label}: ${Math.round(parts[key] * 100)}%`));
  }
  if (!list.children.length) list.append(node('li', 'Breakdown unavailable for this earlier match.'));
  details.append(list);
  return details;
}

async function showMatches(requestId, container) {
  const existing = container.querySelector('.match-results');
  if (existing) { existing.remove(); return; }
  const panel = node('div', undefined, 'match-results list');
  panel.style.gridColumn = '1 / -1';
  panel.append(node('h3', 'Proposed matches'));
  try {
    const matches = await api(`/requests/${requestId}/matches`);
    if (!matches.length) panel.append(empty('No matches have been proposed.'));
    for (const match of matches) {
      const item = card(match.worker_name, t('Match score {{score}}%', { score: match.score }), match.status);
      item.append(matchBreakdown(match.score_breakdown));
      if (match.status === 'proposed') {
        item.append(button('Confirm match & reserve', 'respond', 'button button-primary', { id: match.id, decision: 'accepted' }));
        item.append(button('Decline', 'respond', 'button button-outline', { id: match.id, decision: 'declined' }));
      } else if (match.status === 'accepted') {
        item.append(button('Release reservation', 'release', 'button button-outline', { id: match.id }));
      }
      panel.append(item);
    }
  } catch (error) {
    panel.append(empty(error.message));
  }
  container.append(panel);
}

async function showWorkerDocuments(workerId, container) {
  const previous = container.querySelector('.document-results');
  if (previous) { previous.remove(); return; }
  const panel = node('div', undefined, 'document-results list');
  panel.style.gridColumn = '1 / -1';
  panel.append(node('h3', 'Worker documents'));
  try {
    const documents = await api(`/workers/${workerId}/documents`);
    if (!documents.length) panel.append(empty('No documents uploaded yet.'));
    for (const document of documents) {
      const item = card(t(document.doc_type.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')), [t('Expires {{date}}', { date: document.expires_on ?? t('not specified') }), document.review_note].filter(Boolean).join(' · '), document.status);
      item.append(button('Download', 'document-download', 'button button-outline', { id: document.id }));
      if (state.user.role === 'compliance' && ['uploaded','under_review'].includes(document.status)) {
        item.append(button('Verify document', 'document-review', 'button button-primary', { id: document.id, decision: 'verified' }));
        item.append(button('Reject', 'document-review', 'button button-outline', { id: document.id, decision: 'rejected' }));
      }
      panel.append(item);
    }
  } catch (error) {
    panel.append(empty(error.message));
  }
  container.append(panel);
}

function showDocumentUpload(workerId, container) {
  const previous = container.querySelector('.document-upload');
  if (previous) { previous.remove(); return; }
  const form = node('form', undefined, 'document-upload form-card inline-form');
  form.dataset.form = 'upload-document';
  form.dataset.worker = workerId;
  form.style.gridColumn = '1 / -1';
  const title = node('h3', 'Upload identity document'); title.className = 'span-2'; form.append(title);
  const kind = field('Document type', 'doc_type', 'select');
  for (const [value, label] of [['national_id','National ID'],['police_clearance','Police clearance'],['reference','Reference'],['certificate','Certificate']]) {
    const option = node('option', label); option.value = value; kind.input.append(option);
  }
  form.append(kind.label, field('Expiry date (if applicable)', 'expires_on', 'date', false).label);
  form.append(field('PDF, JPEG or PNG (up to 10 MB)', 'file', 'file', true, { accept: 'application/pdf,image/jpeg,image/png' }).label);
  form.append(button('Upload privately', 'submit', 'button button-primary span-2'));
  container.append(form);
}

async function showPropertyPhotos(propertyId, container) {
  const previous = container.querySelector('.property-gallery');
  if (previous) {
    previous.remove();
    return;
  }
  const gallery = node('div', undefined, 'property-gallery');
  gallery.append(node('h3', 'Property photos & video'));
  container.append(gallery);
  try {
    const photos = await api(`/properties/${propertyId}/photos`);
    if (!photos.length) {
      gallery.append(empty('No pictures have been added to this listing yet.'));
      return;
    }
    const grid = node('div', undefined, 'property-photo-grid');
    for (const photo of photos) {
      const response = await fetch(`${apiRoot()}/properties/${propertyId}/photos/${photo.id}/file`, {
        headers: { authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` },
      });
      if (!response.ok) throw new Error(t('Could not load a property picture ({{status}}).', { status: response.status }));
      const url = URL.createObjectURL(await response.blob());
      propertyPhotoUrls.add(url);
      const figure = node('figure', undefined, 'property-photo');
      if (photo.mime?.startsWith('video/')) {
        const video=node('video'); video.src=url; video.controls=true; video.playsInline=true; video.preload='metadata'; video.setAttribute('aria-label',photo.caption||t('Property video')); figure.append(video);
      } else {
        const image = node('img'); image.src = url; image.alt = photo.caption || t('Property picture'); image.loading = 'lazy'; figure.append(image);
      }
      if (photo.caption) figure.append(node('figcaption', photo.caption));
      grid.append(figure);
    }
    gallery.append(grid);
  } catch (error) {
    gallery.append(empty(error.message));
  }
}

function showPropertyUpload(propertyId, container) {
  const previous = container.querySelector('.property-photo-upload');
  if (previous) {
    previous.remove();
    return;
  }
  const form = node('form', undefined, 'property-photo-upload inline-form');
  form.dataset.form = 'property-photos';
  form.dataset.property = propertyId;
  const title = node('h3', 'Add listing photos or video');
  title.className = 'span-2';
  form.append(title);
  const pictures = field('Choose photos or video (JPEG, PNG, MP4 or WebM)', 'photos', 'file', true, {
    accept: 'image/jpeg,image/png,video/mp4,video/webm',
    multiple: true,
  }).label;
  pictures.className = 'span-2';
  form.append(pictures);
  form.append(field('Caption (optional)', 'caption', 'text', false, { maxlength: '300' }).label);
  form.append(button('Upload media', 'submit', 'button button-primary span-2'));
  container.append(form);
}

async function showUserDocuments(userId, container) {
  const previous = container.querySelector('.user-document-results');
  if (previous) {
    previous.remove();
    return;
  }
  const panel = node('div', undefined, 'user-document-results list');
  panel.style.gridColumn = '1 / -1';
  panel.append(node('h3', 'Applicant KYC documents'));
  container.append(panel);
  try {
    const documents = await api(`/users/${userId}/documents`);
    if (!documents.length) {
      panel.append(empty('The applicant has not uploaded any KYC documents.'));
      return;
    }
    for (const doc of documents) {
      const item = card(t(doc.doc_type.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')), t('{{size}} · uploaded {{date}}', {
        size: `${Math.ceil(doc.size_bytes / 1024)} KB`,
        date: new Date(doc.created_at).toLocaleDateString(document.documentElement.lang),
      }), doc.status);
      if (doc.review_note) item.append(node('p', doc.review_note, 'form-error'));
      item.append(button('Download', 'user-document-download', 'button button-outline', { id: doc.id, user: userId }));
      if (state.user.role === 'compliance' && doc.status === 'uploaded' && userId !== state.user.id) {
        item.append(button('Verify document', 'user-document-review', 'button button-primary', { id: doc.id, user: userId, decision: 'verified' }));
        item.append(button('Reject document', 'user-document-review', 'button button-outline', { id: doc.id, user: userId, decision: 'rejected' }));
      }
      panel.append(item);
    }
  } catch (error) {
    panel.append(empty(error.message));
  }
}

async function uploadPropertyPhotos(propertyId, files, caption = '') {
  if (!files.length) return;
  for (const file of files) {
    if (!['image/jpeg', 'image/png','video/mp4','video/webm'].includes(file.type)) {
      throw new Error(t('Choose a JPEG/PNG image or MP4/WebM video.'));
    }
    const limit=Number(file.type.startsWith('image/')?state.marketplaceConfig.system?.image_max_bytes:state.marketplaceConfig.system?.video_max_bytes)|| (file.type.startsWith('image/')?10485760:52428800);
    if (file.size > limit) {
      throw new Error(t('This file exceeds the configured upload size limit.'));
    }
    const query = new URLSearchParams({ caption });
    const response = await fetch(`${apiRoot()}/properties/${propertyId}/photos/upload?${query}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}`,
        'content-type': file.type,
      },
      body: file,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(t(result?.error ?? 'Picture upload failed ({{status}})', { status: response.status }));
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  showAlert('');
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  submitForm(form)
    .catch((error) => showAlert(error.message, true))
    .finally(() => {
      if (submit?.isConnected) submit.disabled = false;
    });
});

document.addEventListener('click', async (event) => {
  if (event.target === $('#workspace-more-dialog')) {
    $('#workspace-more-dialog').close();
    return;
  }
  if (event.target.closest('[data-close-workspace-more]')) {
    $('#workspace-more-dialog').close();
    return;
  }
  const workspaceLink = event.target.closest('.workspace-nav-link[data-panel]');
  if (workspaceLink) {
    state.panel = workspaceLink.dataset.panel;
    if ($('#workspace-more-dialog').open) $('#workspace-more-dialog').close();
    renderPanel();
    return;
  }
  if (event.target.closest('#mobile-workspace-more')) {
    $('#workspace-more-dialog').showModal();
    return;
  }
  const tab = event.target.closest('.tab[data-panel]');
  if (tab) { state.panel = tab.dataset.panel; renderPanel(); return; }
  const action = event.target.closest('button[data-action]');
  if (!action) return;
  const { action: name, id } = action.dataset;
  if (name === 'open-panel') {
    state.panel = action.dataset.panel;
    renderPanel();
    return;
  }
  const container = action.closest('.list-card');
  if (name === 'commission-approve' || name === 'commission-pay' || name === 'commission-release-held') {
    const endpoint = name === 'commission-approve' ? 'approve' : name === 'commission-pay' ? 'pay' : 'release-held';
    const reference = name === 'commission-approve' ? null : window.prompt(t('Enter the payment reference.'));
    if (name !== 'commission-approve' && (!reference || reference.trim().length < 3)) return;
    try {
      await api(`/commissions/${id}/${endpoint}`, { method: 'POST', body: JSON.stringify(reference ? { reference: reference.trim() } : {}) });
      await refresh();
      showAlert(name === 'commission-approve' ? 'Commission approved.' : name === 'commission-pay' ? 'Commission installment paid.' : 'Commission holdback released.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'global-promotion-approve' || name === 'global-promotion-reject') {
    const decision = name === 'global-promotion-approve' ? 'approve' : 'reject';
    const prompt = decision === 'approve'
      ? 'Enter the approval reason (at least 10 characters).'
      : 'Enter the rejection reason (at least 10 characters).';
    const reason = window.prompt(t(prompt));
    if (!reason || reason.trim().length < 10) return;
    try {
      await api(`/global-admin-promotions/${id}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await refresh();
      showAlert(decision === 'approve' ? 'Global Admin promotion approved.' : 'Global Admin promotion rejected.');
    } catch (error) {
      showAlert(error.message, true);
    }
    return;
  }
  if (name === 'contract-document-upload') {
    const file = container.querySelector('input[type="file"]')?.files?.[0];
    if (!file) { showAlert('Choose a signed contract document first.', true); return; }
    if (file.size > 10 * 1024 * 1024) { showAlert('The contract document must be 10 MB or smaller.', true); return; }
    try {
      await api(`/contracts/${id}/documents?stage=${encodeURIComponent(action.dataset.stage)}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      await refresh(); showAlert(action.dataset.stage === 'party_signed' ? 'Party-signed contract uploaded for company countersignature.' : 'Company-countersigned contract uploaded. Review it, then complete the signature step.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (form.dataset.form === 'marketplace') {
    const files=[...form.querySelector('input[name="media"]').files];
    if(!files.length) throw new Error('Add at least one photo before posting this listing.');
    const payload={...values,territory_id:number(values.territory_id)};
    if(!payload.seller_user_id) delete payload.seller_user_id;
    if(payload.price) payload.price=number(payload.price); else delete payload.price;
    if(!payload.rent_period) delete payload.rent_period;
    if(!payload.condition) delete payload.condition;
    const listing=await api('/marketplace/listings',{method:'POST',body:JSON.stringify(payload)});
    for(const file of files){const qs=new URLSearchParams();const response=await fetch(`${apiRoot()}/marketplace/listings/${listing.id}/media/upload?${qs}`,{method:'POST',headers:{authorization:`Bearer ${sessionStorage.getItem(TOKEN_KEY)}`,'content-type':file.type},body:file});const result=await response.json().catch(()=>null);if(!response.ok) throw new Error(result?.error??`Media upload failed (${response.status})`);}
    await api(`/marketplace/listings/${listing.id}/submit`,{method:'POST',body:'{}'});
    await refresh();showAlert('Listing submitted. It will appear to buyers after any required review.');return;
  }
  if(form.dataset.form==='marketplace-existing-media'){
    const files=[...form.querySelector('input[name="media"]').files];if(!files.length)throw new Error('Choose at least one file.');
    for(const file of files){const response=await fetch(`${apiRoot()}/marketplace/listings/${form.dataset.listing}/media/upload`,{method:'POST',headers:{authorization:`Bearer ${sessionStorage.getItem(TOKEN_KEY)}`,'content-type':file.type},body:file});const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.error??`Upload failed (${response.status})`);}
    await api(`/marketplace/listings/${form.dataset.listing}/submit`,{method:'POST',body:'{}'});await refresh();showAlert('Listing submitted for publication review.');return;
  }
  if(form.dataset.form==='marketplace-config'){
    const valuesToSave=[];const enabled=['products','services','equipment','properties'].filter((key)=>form.elements.namedItem(`domain:${key}`)?.checked);
    if(enabled.length) valuesToSave.push({scope:'system',key:'enabled_domains',value:enabled});
    const categories=(scope)=>form.elements.namedItem(`${scope}_categories`).value.split('\n').map((line)=>line.trim()).filter(Boolean).map((line)=>{const [key,...rest]=line.split('|');return {key:key.trim().toLowerCase().replaceAll(' ','_'),label:rest.join('|').trim(),enabled:true};});
    for(const scope of ['products','services']) valuesToSave.push({scope,key:'categories',value:categories(scope)});
    const property_types=form.elements.namedItem('property_types').value.split('\n').map((line)=>line.trim()).filter(Boolean).map((line)=>{const [key,...rest]=line.split('|');return {key:key.trim(),label:rest.join('|').trim(),enabled:true};});
    const periods=form.elements.namedItem('rental_periods').value.split('\n').map((line)=>line.trim()).filter(Boolean).map((line)=>{const [key,...rest]=line.split('|');return {key:key.trim(),label:rest.join('|').trim(),enabled:true};});
    valuesToSave.push({scope:'properties',key:'property_types',value:property_types},{scope:'rentals',key:'periods',value:periods});
    if(state.user.role==='global_admin'){
      valuesToSave.push({scope:'system',key:'moderation_required',value:form.elements.namedItem('moderation_required').checked});
      valuesToSave.push({scope:'system',key:'image_max_bytes',value:Math.round(number(form.elements.namedItem('image_max_mb').value)*1048576)});
      valuesToSave.push({scope:'system',key:'video_max_bytes',value:Math.round(number(form.elements.namedItem('video_max_mb').value)*1048576)});
      valuesToSave.push({scope:'system',key:'max_media_per_listing',value:number(form.elements.namedItem('max_media_per_listing').value)});
      const account_types=(state.marketplaceConfig.users?.account_types??[]).map((account)=>({...account,enabled:form.elements.namedItem(`account:${account.key}`).checked}));
      valuesToSave.push({scope:'users',key:'account_types',value:account_types});
      const kyc_requirements={};for(const role of ['worker','customer','agent','property_owner'])kyc_requirements[role]=['national_id','police_clearance'].filter((doc)=>form.elements.namedItem(`kyc:${role}:${doc}`).checked);
      valuesToSave.push({scope:'users',key:'kyc_requirements',value:kyc_requirements});
    }
    if(!enabled.length) throw new Error('Enable at least one marketplace domain.');
    if(valuesToSave.some((entry)=>entry.scope==='products'||entry.scope==='services')&&valuesToSave.filter((entry)=>['products','services'].includes(entry.scope)).some((entry)=>!entry.value.length)) throw new Error('Keep at least one category in each catalog.');
    state.marketplaceConfig=await api('/marketplace/config',{method:'PATCH',body:JSON.stringify({values:valuesToSave})});
    await refresh();showAlert('Marketplace configuration saved.');return;
  }
  if (name === 'contract-document-download') {
    try {
      const response = await fetch(`${apiRoot()}/contract-documents/${id}/file`, { headers: { authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Document download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'afrolife-signed-contract'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'agent-specialization') {
    const select = container.querySelector(`[data-agent-specialization="${CSS.escape(id)}"]`);
    try {
      await api(`/agents/${id}/specialization`, { method: 'PATCH', body: JSON.stringify({ service_specialization: select.value || null }) });
      await refresh(); showAlert('Agent service assignment updated.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'contract-step') {
    const step = action.dataset.step;
    const body = { action: step };
    if (step === 'cancel' || step === 'reject') {
      const reason = window.prompt(t('Enter a reason (at least 10 characters).'));
      if (!reason || reason.trim().length < 10) return;
      body.reason = reason.trim();
    }
    if (step === 'record_payment') {
      const contract = state.contracts.find((item) => item.id === id);
      const amount = ['onboarding_amt', 'guarantee_amt', 'monthly_mgmt_amt', 'employer_fee_amt', 'other_fee_amt'].reduce((sum, key) => sum + Number(contract?.[key] ?? 0), 0);
      const reference = window.prompt(t('Enter the payment reference.'));
      if (!reference || reference.trim().length < 3) return;
      Object.assign(body, { channel: 'manual', reference: reference.trim(), amount });
    }
    api(`/contracts/${id}/transition`, { method: 'POST', body: JSON.stringify(body) })
      .then(async () => { await refresh(); showAlert('Contract workflow updated.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'rent-reconcile') {
    api(`/rent-transactions/${id}/reconcile`, { method: 'POST', body: '{}' })
      .then(async () => { await refresh(); showAlert('Rent transaction reconciled and posted to the ledger.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'rent-void') {
    const reason = window.prompt(t('Enter why this pending receipt should be voided (at least 10 characters).'));
    if (!reason || reason.trim().length < 10) return;
    api(`/rent-transactions/${id}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) })
      .then(async () => { await refresh(); showAlert('Pending rent transaction voided.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'lease-end') {
    if (!window.confirm(t('End this lease? Future rent charges will be waived.'))) return;
    api(`/leases/${id}/end`, { method: 'POST', body: '{}' })
      .then(async () => { await refresh(); showAlert('Lease ended.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'deposit-pay') {
    const reference = window.prompt(t('Enter the deposit payment reference.'));
    if (!reference || reference.trim().length < 3) return;
    api(`/leases/${id}/deposit/pay`, { method: 'POST', body: JSON.stringify({ reference: reference.trim(), channel: 'manual' }) })
      .then(async () => { await refresh(); showAlert('Deposit receipt recorded and awaiting independent reconciliation.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'deposit-refund') {
    const amount = window.prompt(t('Enter the deposit return amount in ETB.'));
    if (!amount) return;
    const reason = window.prompt(t('Enter a reason for the deposit return.'));
    if (!reason || reason.trim().length < 10) return;
    const reference = window.prompt(t('Enter the payout reference.'));
    if (!reference || reference.trim().length < 3) return;
    api(`/leases/${id}/deposit/refund`, { method: 'POST', body: JSON.stringify({ amount: number(amount), reason: reason.trim(), reference: reference.trim(), channel: 'manual' }) })
      .then(async () => { await refresh(); showAlert('Deposit return recorded and awaiting independent reconciliation.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'rent-record') {
    const reference = window.prompt(t('Enter the rent payment reference.'));
    if (!reference || reference.trim().length < 3) return;
    api(`/charges/${id}/pay`, { method: 'POST', body: JSON.stringify({ reference: reference.trim(), channel: 'manual' }) })
      .then(async () => { await refresh(); showAlert('Rent payment recorded and awaiting independent reconciliation.'); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'lease-payments') {
    const target = action.closest('.list-card');
    try {
      const [charges, payments] = await Promise.all([api(`/leases/${id}/charges`), api(`/leases/${id}/payments`)]);
      const details = node('section', undefined, 'panel form-card');
      details.append(node('h3', 'Charges and receipts'));
      for (const charge of charges) {
        const row = card(charge.period, t('Due {{due}} · ETB {{amount}}', { due: charge.due_on, amount: Number(charge.amount).toLocaleString(document.documentElement.lang) }), charge.status);
        if (['finance', 'finance_manager', 'global_admin', 'super_admin'].includes(state.user.role) && ['due', 'overdue'].includes(charge.status)) row.append(button('Record rent payment', 'rent-record', 'button button-outline', { id: charge.id }));
        details.append(row);
      }
      for (const payment of payments) {
        const row = card(t(payment.kind), `${payment.reference} · ETB ${Number(payment.amount).toLocaleString(document.documentElement.lang)}`, payment.status);
        if (payment.status === 'pending' && ['finance_manager', 'global_admin', 'super_admin'].includes(state.user.role)) {
          row.append(button('Reconcile', 'rent-reconcile', 'button button-outline', { id: payment.id }));
          row.append(button('Void receipt', 'rent-void', 'button button-outline', { id: payment.id }));
        }
        details.append(row);
      }
      target.append(details);
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'mfa-setup') {
    api('/auth/mfa/setup', { method: 'POST', body: '{}' })
      .then((result) => { state.mfaSetup = result; renderPanel(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'worker-upload') { showDocumentUpload(id, container); return; }
  if (name === 'worker-documents') { void showWorkerDocuments(id, container); return; }
  if (name === 'property-photos') { void showPropertyPhotos(id, container); return; }
  if (name === 'property-upload') { showPropertyUpload(id, container); return; }
  if(name==='marketplace-media'){
    try{const response=await fetch(`${apiRoot()}/marketplace/media/${id}/file`,{headers:{authorization:`Bearer ${sessionStorage.getItem(TOKEN_KEY)}`}});if(!response.ok)throw new Error(`Media unavailable (${response.status})`);const blob=await response.blob();const url=URL.createObjectURL(blob);propertyPhotoUrls.add(url);const viewer=node('div',undefined,'marketplace-viewer');let media;if(action.dataset.mime?.startsWith('video/')){media=node('video');media.controls=true;media.autoplay=false;media.playsInline=true;}else{media=node('img');media.alt=t('Marketplace listing photo');}media.src=url;viewer.append(media);container.append(viewer);}catch(error){showAlert(error.message,true);}return;
  }
  if(name==='marketplace-submit'){try{await api(`/marketplace/listings/${id}/submit`,{method:'POST',body:'{}'});await refresh();showAlert('Listing submitted.');}catch(error){showAlert(error.message,true);}return;}
  if(name==='marketplace-review'){
    let note;if(action.dataset.decision==='reject'){note=window.prompt(t('Explain what the seller needs to change (at least 10 characters).'));if(!note||note.trim().length<10)return;}
    try{await api(`/marketplace/listings/${id}/review`,{method:'PATCH',body:JSON.stringify({decision:action.dataset.decision,...(note?{note:note.trim()}:{})})});await refresh();showAlert(action.dataset.decision==='publish'?'Listing published.':'Listing returned for changes.');}catch(error){showAlert(error.message,true);}return;
  }
  if (name === 'user-documents') { void showUserDocuments(id, container); return; }
  if (name === 'user-document-review') {
    let note;
    if (action.dataset.decision === 'rejected') {
      note = window.prompt(t('Explain what needs to be corrected in this document (at least 10 characters).'));
      if (!note || note.trim().length < 10) return;
    }
    api(`/users/${action.dataset.user}/documents/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision: action.dataset.decision, ...(note ? { note: note.trim() } : {}) }),
    })
      .then(async () => { showAlert(t('KYC document {{decision}}.', { decision: t(action.dataset.decision) })); await refresh(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'user-document-download') {
    fetch(`${API_ROOT}/users/${action.dataset.user}/documents/${id}/file`, {
      headers: { authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('Download failed ({{status}})', { status: response.status }));
        const blob = await response.blob();
        const link = node('a');
        link.href = URL.createObjectURL(blob);
        link.download = `afrolife-kyc-${id}`;
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'document-review') {
    let note;
    if (action.dataset.decision === 'rejected') {
      note = window.prompt(t('Explain what needs to be corrected in this document (at least 10 characters).'));
      if (!note || note.trim().length < 10) return;
    }
    api(`/documents/${id}/review`, { method: 'POST', body: JSON.stringify({ decision: action.dataset.decision, ...(note ? { note: note.trim() } : {}) }) })
      .then(async () => { showAlert(`Document ${action.dataset.decision}.`); await refresh(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'document-download') {
    fetch(`${API_ROOT}/documents/${id}/file`, { headers: { authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` } })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error ?? `Download failed (${response.status})`);
        }
        const blob = await response.blob();
        const link = node('a');
        link.href = URL.createObjectURL(blob);
        link.download = `afrolife-document-${id}`;
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'worker-verify') {
    api(`/workers/${id}/verify`, { method: 'POST', body: '{}' })
      .then(async () => { showAlert('Worker verified and ready for matching.'); await refresh(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'user-kyc') {
    api(`/users/${id}/kyc`, { method: 'POST', body: JSON.stringify({ decision: action.dataset.decision }) })
      .then(async () => { showAlert(`Account marked ${action.dataset.decision}.`); await refresh(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'user-activate' || name === 'user-deactivate') {
    const endpoint = name === 'user-activate' ? 'activate' : 'deactivate';
    api(`/users/${id}/${endpoint}`, { method: 'POST', body: '{}' })
      .then(async () => { showAlert(`Account ${name === 'user-activate' ? 'activated' : 'deactivated'}.`); await refresh(); })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'candidates') { void showCandidates(id, container); return; }
  if (name === 'matches') { void showMatches(id, container); return; }
  if (name === 'propose') {
    api(`/requests/${id}/matches`, { method: 'POST', body: JSON.stringify({ worker_id: action.dataset.worker }) })
      .then(async () => { showAlert('Match proposed.'); await refresh(); })
      .catch((error) => showAlert(error.message, true));
  }
  if (name === 'respond') {
    api(`/matches/${id}/respond`, { method: 'POST', body: JSON.stringify({ decision: action.dataset.decision }) })
      .then(async () => { showAlert(action.dataset.decision === 'accepted' ? 'Match accepted and worker reserved.' : 'Match declined.'); await refresh(); })
      .catch((error) => showAlert(error.message, true));
  }
  if (name === 'release') {
    const dialog = $('#availability-dialog');
    $('#availability-form').dataset.match = id;
    $('#availability-select').value = 'immediate';
    dialog.showModal();
  }
});

$('#login-form').addEventListener('submit', login);
$('#signup-form').addEventListener('submit', submitSignup);
$('#signup-followup-upload').addEventListener('click', () => uploadSignupReplacement()
  .catch((error) => setLocalizedText($('#signup-error'), error.message)));
$('#edir-registration-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('#edir-registration-error');
  setLocalizedText(error, '');
  $('#edir-registration-success').hidden = true;
  const values = formData(form);
  const payload = { ...values, accept_review_terms: values.accept_review_terms === 'on' };
  for (const key of ['registration_reference','governance_reference','contact_email']) if (!payload[key]) delete payload[key];
  try {
    const result = await api('/edir/public/registration-applications', {
      method: 'POST', body: JSON.stringify(payload),
    });
    form.reset();
    setLocalizedText($('#edir-registration-success'), 'Application received. EthioLife Master Edir will review it before an organization workspace is activated. Reference: {{id}}', { id: result.id });
    $('#edir-registration-success').hidden = false;
  } catch (reason) {
    setLocalizedText(error, reason.message);
  }
});
$('#availability-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const matchId = event.currentTarget.dataset.match;
  try {
    await api(`/matches/${matchId}/release`, {
      method: 'POST',
      body: JSON.stringify({ availability: $('#availability-select').value }),
    });
    $('#availability-dialog').close();
    showAlert('Reservation released and request reopened.');
    await refresh();
  } catch (error) {
    showAlert(error.message, true);
  }
});
$('#cancel-availability').addEventListener('click', () => $('#availability-dialog').close());
$('#signup-account-type').addEventListener('change', updateSignupFields);
$('#signup-agent-type').addEventListener('change', updateSignupFields);
$('#signup-plan').addEventListener('change', updatePlanLabels);
$('#signup-territory-search').addEventListener('input', syncSignupTerritory);
$('#signup-territory-search').addEventListener('change', syncSignupTerritory);
$('#show-signup').addEventListener('click', () => openSignup());
$('#show-agent-plans').addEventListener('click', () => openSignup(true));
document.querySelectorAll('[data-open-edir-registration]').forEach((button) => button.addEventListener('click', () => {
  const form = $('#edir-registration-form');
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector('input[name="display_name"]').focus({ preventScroll: true });
}));
$('#show-login').addEventListener('click', () => {
  $('#signup-form').hidden = true;
  $('#login-form').hidden = false;
  setLocalizedText($('#login-error'), '');
});
$('#save-server').addEventListener('click', saveNativeServer);
$('#change-server').addEventListener('click', () => {
  $('#server-setup').hidden = false;
  $('#login-form').hidden = true;
  $('#signup-form').hidden = true;
});
$('#logout').addEventListener('click', () => signOut());
$('#retry-session').addEventListener('click', async () => {
  const button = $('#retry-session');
  button.disabled = true;
  try {
    await loadWorkspace();
  } catch (error) {
    console.error('EthioLife could not restore the saved session.', error);
    if (state.user && !$('#app-view').hidden) {
      showAlert('Your session is still active, but some workspace data could not be loaded. Check the connection and reload the workspace.', true);
      return;
    }
    $('#login-error').textContent = 'Unable to reconnect to your workspace. Your saved session is retained; check the connection and retry, or sign in again.';
  } finally {
    button.disabled = false;
  }
});
$('#refresh').addEventListener('click', () => refresh().catch((error) => showAlert(error.message, true)));
$('#install-app').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('#install-app').hidden = true;
});
document.querySelectorAll('[data-install-pwa]').forEach((button) => button.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#install-app').hidden = true;
    return;
  }
  $('#install-help').hidden = false;
}));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $('#install-app').hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  $('#install-app').hidden = true;
});

initializeLocale(() => {
  renderSignupTerritoryOptions();
  updatePlanLabels();
  document.querySelectorAll('[data-i18n-source]').forEach((element) => {
    element.textContent = t(element.dataset.i18nSource, JSON.parse(element.dataset.i18nValues ?? '{}'));
  });
  if ($('#signup-success').hidden === false) {
    setLocalizedText($('#signup-success'), $('#signup-success').dataset.i18nSource);
  }
  if (state.user) {
    $('#account-name').textContent = `${state.user.legal_name} · ${roleLabel(state.user.role)}`;
    $('#page-subtitle').textContent = t('Signed in as {{role}}. Your access is limited to your assigned role and territory.', { role: roleLabel(state.user.role) });
    renderStats();
    renderPanel();
  }
});
initializeNativeServer();
updateSignupFields();

if (!isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.error('EthioLife offline support could not be enabled.', error);
  }));
}
if (sessionStorage.getItem(TOKEN_KEY)) {
  loadWorkspace().catch((error) => {
    console.error('EthioLife could not restore the saved session.', error);
    if (sessionStorage.getItem(TOKEN_KEY)) {
      if (state.user && !$('#app-view').hidden) {
        showAlert('Your session is still active, but some workspace data could not be loaded. Check the connection and reload the workspace.', true);
      } else {
        $('#retry-session').hidden = false;
        $('#login-error').textContent = 'Unable to reconnect to your workspace. Your saved session is retained; check the connection and retry, or sign in again.';
      }
    }
  });
}
