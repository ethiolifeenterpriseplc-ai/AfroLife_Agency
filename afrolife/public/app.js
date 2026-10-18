import { initializeLocale, t } from './i18n.js';
import { ApiError, optionalApiFallback } from './api-errors.js';
import { createMfiWorkspace } from './mfi.js';
import { createAccountingWorkspace } from './accounting.js';
import { createEdirWorkspace } from './edir.js';
import { createPrivacyWorkspace } from './privacy.js';
import { createGlobalBiWorkspace } from './global-bi.js';
import { createMiniAppAccessEditor } from './mini-app-access.js';
import { miniAppByPanel } from './mini-apps/registry.js';
import { isMiniAppAllowed, isPanelEnabled, panelFromUrl, panelUrl } from './workspace-navigation.js';
import { MIN_SEARCH_QUERY_LENGTH, searchWorkspaceRecords } from './workspace-search.js';

const WEB_API_ROOT = '/api/v1';
let API_ROOT = WEB_API_ROOT;
const TOKEN_KEY = 'afrolife.session';
const API_URL_KEY = 'afrolife.api-base';
const SIGNUP_UPLOAD_KEY = 'afrolife.signup-upload';
const SIGNUP_DONE_KEY = 'afrolife.signup-upload-complete';
const EDIR_ORGANIZATION_KEY = 'afrolife.edir-organization';
const DEFAULT_EDIR_ORGANIZATION = '00000000-0000-4000-8000-000000000002';
const STAFF = new Set(['global_admin', 'super_admin', 'compliance', 'finance', 'finance_manager']);
const KNOWN_PANELS = new Set([
  'overview', 'leads', 'workers', 'requests', 'learning', 'properties', 'marketplace',
  'contracts', 'commissions', 'agents', 'rent', 'mfi', 'accounting', 'edir',
  'insurance', 'privacy', 'global-bi', 'security', 'admin', 'status', 'password',
]);
const MINI_APP_PANELS = new Set([
  'leads', 'workers', 'requests', 'learning', 'properties', 'marketplace',
  'contracts', 'commissions', 'agents', 'rent', 'mfi', 'accounting', 'edir',
  'insurance', 'privacy', 'global-bi',
]);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, features: { mfiPilotEnabled: false, edirEnabled: false, accountingEnabled: false, globalBiEnabled: false, insuranceBrokerageSandboxEnabled: false, enabledModules: [] }, edirMe: null, edirOrganizationId: localStorage.getItem(EDIR_ORGANIZATION_KEY) ?? DEFAULT_EDIR_ORGANIZATION, panel: panelFromUrl(window.location.href, KNOWN_PANELS), mfaRequired: false, mfaSetup: null, leads: [], workers: [], requests: [], properties: [], ownerStatements: [], territories: [], commissions: [], summary: null, users: [], team: [], globalAdminPromotions: [], businessRules: [], roleAccess: null, learningContent: [], signupOptions: null, contracts: [], leases: [], tenants: [], pendingRent: [], serviceIdentities: [], readinessEvidence: [], propertyAccountingTemplate: null, propertyPeriodClose: null, marketplaceConfig: {}, marketplaceListings: [], marketplaceSellers: [], insuranceRequests: [], insuranceStaffRequests: [], insuranceAgentReferrals: [], insuranceEligibleAgents: [], insuranceSandboxStatus: null, insuranceSandboxCases: [], platformServices: [], platformServicePackages: [], platformTenants: [], platformCatalogProducts: [], serviceStatus: null, serviceMetrics: null, searchResults: [], searchUnavailable: [], searchQuery: '', workspaceDataErrors: [] };
const loadedPanels = new Set();
let workspaceSearchSequence = 0;
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

function hasActivity(activity) {
  return state.user?.role_activities?.[activity] === true;
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
    state.panel = panelFromUrl(window.location.href, KNOWN_PANELS);
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
  state.panel = 'overview';
  workspaceSearchSequence += 1;
  loadedPanels.clear();
  Object.assign(state, {
    leads: [], workers: [], requests: [], properties: [], ownerStatements: [], territories: [],
    commissions: [], summary: null, users: [], team: [], globalAdminPromotions: [], businessRules: [],
    roleAccess: null, learningContent: [], contracts: [], leases: [], tenants: [], pendingRent: [],
    platformServices: [], platformServicePackages: [], platformTenants: [], platformCatalogProducts: [],
    marketplaceConfig: {}, marketplaceListings: [], marketplaceSellers: [], insuranceRequests: [],
    insuranceStaffRequests: [], insuranceAgentReferrals: [], insuranceEligibleAgents: [],
    edirMe: null, mfaSetup: null,
    serviceIdentities: [], readinessEvidence: [], propertyAccountingTemplate: null, propertyPeriodClose: null,
    insuranceSandboxStatus: null, insuranceSandboxCases: [],
    serviceStatus: null, serviceMetrics: null, searchResults: [], searchUnavailable: [], searchQuery: '',
    workspaceDataErrors: [],
  });
  state.features = { mfiPilotEnabled: false, edirEnabled: false, accountingEnabled: false, insuranceBrokerageSandboxEnabled: false, enabledModules: [] };
  $('#workspace-search-input').value = '';
  $('#workspace-search-results').replaceChildren();
  $('#workspace-search-results').hidden = true;
  history.replaceState(null, '', panelUrl(window.location.href, 'overview'));
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
  state.features = await getOptional('/features', { mfiPilotEnabled: false, edirEnabled: false, accountingEnabled: false, globalBiEnabled: false, insuranceBrokerageSandboxEnabled: false, enabledModules: [] });
  state.edirMe = null;
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
  $('#learning-tab').hidden = !hasActivity('learning.content.view') && !hasActivity('learning.content.manage');
  const canUseListings = hasActivity('property.listings.view');
  $('#properties-tab').hidden = !canUseListings;
  $('#marketplace-tab').hidden = false;
  if (!canUseListings && state.panel === 'properties') state.panel = 'overview';
  $('#contracts-tab').hidden = ['customer', 'worker', 'property_owner'].includes(state.user.role);
  const canUseCommissions = ['global_admin','super_admin','finance','finance_manager','master_agent','field_agent'].includes(state.user.role);
  $('#commissions-tab').hidden = !canUseCommissions;
  if (!canUseCommissions && state.panel === 'commissions') state.panel = 'overview';
  $('#agents-tab').hidden = !['global_admin', 'super_admin', 'master_agent'].includes(state.user.role);
  $('#rent-tab').hidden = !['property.tenancy.manage', 'rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void', 'rent.deposit.refund_request'].some(hasActivity);
  $('#mfi-tab').hidden = !state.features.mfiPilotEnabled;
  const accountingRole = ['global_admin','super_admin','finance','finance_manager','compliance','corporate_business_manager','master_agent','field_agent','property_owner','insurance_agent','insurance_broker'].includes(state.user.role);
  $('#accounting-tab').hidden = !state.features.accountingEnabled || !accountingRole;
  $('#global-bi-tab').hidden = state.features.globalBiEnabled !== true;
  $('#edir-tab').hidden = !state.features.edirEnabled;
  if ($('#mfi-tab').hidden && state.panel === 'mfi') state.panel = 'overview';
  if ($('#accounting-tab').hidden && state.panel === 'accounting') state.panel = 'overview';
  if ($('#edir-tab').hidden && state.panel === 'edir') state.panel = 'overview';
  const sharedPanels = ['overview', 'marketplace', 'edir', 'insurance', 'mfi', 'security', 'privacy'];
  document.querySelectorAll('.tab').forEach((tab) => {
    if (['property_owner', 'customer'].includes(state.user.role)) {
      const allowed = new Set([...sharedPanels, ...(canUseListings ? ['properties'] : [])]);
      if (hasActivity('learning.content.view') || hasActivity('learning.content.manage')) allowed.add('learning');
      if (hasActivity('workforce.workers.view') || hasActivity('workforce.workers.register')) allowed.add('workers');
      if (hasActivity('staffing.requests.manage')) allowed.add('requests');
      if (['rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void', 'rent.deposit.refund_request'].some(hasActivity)) allowed.add('rent');
      if (accountingRole && state.features.accountingEnabled) allowed.add('accounting');
      tab.hidden = !allowed.has(tab.dataset.panel);
    } else if (['worker', 'corporate_business_manager', 'master_agent', 'field_agent'].includes(state.user.role)) {
      const allowed = new Set([
        ...sharedPanels,
        ...(state.user.role === 'corporate_business_manager' ? ['admin'] : []),
        'leads', 'contracts', 'commissions', 'agents',
      ]);
      if (hasActivity('workforce.workers.view') || hasActivity('workforce.workers.register')) allowed.add('workers');
      if (accountingRole && state.features.accountingEnabled) allowed.add('accounting');
      if (hasActivity('staffing.requests.manage')) allowed.add('requests');
      if (canUseListings) allowed.add('properties');
      if (hasActivity('learning.content.view') || hasActivity('learning.content.manage')) allowed.add('learning');
      if (['rent.payments.submit', 'rent.transactions.view', 'rent.transactions.reconcile', 'rent.transactions.void', 'rent.deposit.refund_request'].some(hasActivity)) allowed.add('rent');
      tab.hidden = !allowed.has(tab.dataset.panel);
    }
  });
  for (const [panel, enabled] of [
    ['workers', hasActivity('workforce.workers.view') || hasActivity('workforce.workers.register')],
    ['requests', hasActivity('staffing.requests.manage')],
    ['properties', canUseListings],
    ['learning', hasActivity('learning.content.view') || hasActivity('learning.content.manage')],
  ]) {
    if (enabled) {
      const tab = document.querySelector(`.tab[data-panel="${panel}"]`);
      if (tab) tab.hidden = false;
    }
  }
  const enabledModules = Array.isArray(state.features.enabledModules) && state.features.enabledModules.length
    ? state.features.enabledModules
    : [...KNOWN_PANELS];
  for (const tab of document.querySelectorAll('.tab[data-panel]')) {
    if (!isPanelEnabled(tab.dataset.panel, enabledModules)) tab.hidden = true;
    if (MINI_APP_PANELS.has(tab.dataset.panel)
        && Array.isArray(state.features.allowedModules)
        && !isMiniAppAllowed(tab.dataset.panel, state.features.allowedModules)) tab.hidden = true;
  }
  $('#status-tab').hidden = false;
  if (state.panel === 'password' || state.mfaRequired) {
    state.panel = state.user.must_change_password ? 'password' : 'security';
    history.replaceState(null, '', panelUrl(window.location.href, state.panel));
  } else if (document.querySelector(`.tab[data-panel="${CSS.escape(state.panel)}"]`)?.hidden) {
    state.panel = 'overview';
    history.replaceState(null, '', panelUrl(window.location.href, state.panel));
  }
  renderMobileWorkspaceNav();
  if (state.user.must_change_password) {
    state.panel = 'password';
    history.replaceState(null, '', panelUrl(window.location.href, state.panel));
    renderPanel();
    return;
  }
  if (state.mfaRequired) {
    state.panel = 'security';
    renderPanel();
    return;
  }
  renderPanel();
  await refresh();
}

async function getOptional(path, fallback) {
  try {
    return await api(path);
  } catch (error) {
    return optionalApiFallback(error, fallback);
  }
}

async function loadPanelData(panel) {
  state.workspaceDataErrors = [];
  const safeGet = async (path, fallback) => {
    try {
      return await getOptional(path, fallback);
    } catch (error) {
      console.error(`Workspace panel ${panel} could not load ${path}.`, error);
      state.workspaceDataErrors.push(path);
      return fallback;
    }
  };
  const load = async (key, path, fallback = []) => { state[key] = await safeGet(path, fallback); };
  switch (panel) {
    case 'overview':
      [state.leads, state.workers, state.requests, state.commissions] = await Promise.all([
        safeGet('/leads', []), safeGet('/workers', []), safeGet('/requests', []), safeGet('/commissions', []),
      ]);
      state.serviceStatus = await safeGet('/system/status', null);
      state.summary = STAFF.has(state.user.role) && state.user.role !== 'compliance'
        ? await safeGet('/reports/summary', null)
        : state.user.enterprise_features_enabled ? await safeGet('/reports/me', null) : null;
      break;
    case 'leads':
      await load('leads', '/leads');
      state.team = ['global_admin', 'super_admin', 'master_agent'].includes(state.user.role)
        ? await safeGet('/agents/team', []) : [];
      break;
    case 'workers':
      [state.workers, state.territories] = await Promise.all([safeGet('/workers', []), safeGet('/territories', [])]);
      break;
    case 'requests':
      [state.requests, state.leads, state.territories] = await Promise.all([
        safeGet('/requests', []), safeGet('/leads', []), safeGet('/territories', []),
      ]);
      break;
    case 'learning':
      state.learningContent = hasActivity('learning.content.view') || hasActivity('learning.content.manage')
        ? await safeGet('/learning/content', []) : [];
      break;
    case 'properties':
      [state.marketplaceConfig, state.territories] = await Promise.all([
        safeGet('/marketplace/config', {}), safeGet('/territories', []),
      ]);
      state.marketplaceSellers = ['global_admin', 'super_admin', 'corporate_business_manager'].includes(state.user.role)
        ? await safeGet('/marketplace/sellers', []) : [];
      if (hasActivity('property.listings.view')) state.properties = await safeGet('/properties', []);
      state.ownerStatements = state.user.role === 'property_owner'
        ? (await safeGet('/owner/statements', { statements: [] })).statements ?? [] : [];
      break;
    case 'marketplace':
      [state.marketplaceConfig, state.marketplaceListings, state.territories] = await Promise.all([
        safeGet('/marketplace/config', {}), safeGet('/marketplace/listings', []), safeGet('/territories', []),
      ]);
      state.marketplaceSellers = ['global_admin', 'super_admin', 'corporate_business_manager'].includes(state.user.role)
        ? await safeGet('/marketplace/sellers', []) : [];
      break;
    case 'contracts':
      [state.leads, state.contracts] = await Promise.all([safeGet('/leads', []), safeGet('/contracts', [])]);
      break;
    case 'commissions':
      await load('commissions', '/commissions');
      break;
    case 'agents':
      await load('team', '/agents/team');
      break;
    case 'rent':
      [state.propertyAccountingTemplate, state.properties, state.tenants, state.pendingRent, state.leases] = await Promise.all([
        ['global_admin', 'super_admin', 'finance', 'finance_manager'].includes(state.user.role)
          ? safeGet('/finance/property-chart-of-accounts-template', null) : null,
        hasActivity('property.listings.view') ? safeGet('/properties', []) : [],
        safeGet('/tenants', []), safeGet('/rent-transactions/pending', []), safeGet('/leases', []),
      ]);
      break;
    case 'insurance':
      [state.insuranceRequests, state.insuranceStaffRequests, state.insuranceAgentReferrals, state.insuranceEligibleAgents] = await Promise.all([
        safeGet('/insurance/requests/me', []), safeGet('/insurance/requests', []),
        safeGet('/insurance/requests/agent-referrals/me', []), safeGet('/insurance/requests/agent-referrals/agents', []),
      ]);
      if (state.features.insuranceBrokerageSandboxEnabled) {
        [state.insuranceSandboxStatus, state.insuranceSandboxCases] = await Promise.all([
          safeGet('/insurance/brokerage-sandbox/status', null), safeGet('/insurance/brokerage-sandbox/cases/mine', []),
        ]);
      } else {
        state.insuranceSandboxStatus = null;
        state.insuranceSandboxCases = [];
      }
      break;
    case 'edir':
      state.edirMe = state.features.edirEnabled && state.user.kyc_status === 'verified'
        ? await safeGet('/edir/me', null) : null;
      break;
    case 'admin':
      state.users = ['global_admin', 'super_admin', 'compliance'].includes(state.user.role)
        ? await safeGet('/users', []) : [];
      [state.territories, state.serviceIdentities, state.readinessEvidence, state.globalAdminPromotions] = await Promise.all([
        safeGet('/territories', []),
        isPlatformAdmin() ? safeGet('/service-identities', []) : [],
        isPlatformAdmin() ? safeGet('/readiness-evidence', []) : [],
        isPlatformAdmin() ? safeGet('/global-admin-promotions', []) : [],
      ]);
      state.businessRules = state.user.role === 'global_admin' ? await safeGet('/business-rules', []) : [];
      state.roleAccess = state.user.role === 'super_admin' ? await safeGet('/role-access', null) : null;
      state.summary = STAFF.has(state.user.role) && state.user.role !== 'compliance'
        ? await safeGet('/reports/summary', null) : null;
      if (['global_admin', 'super_admin', 'finance', 'finance_manager'].includes(state.user.role)) {
        state.propertyAccountingTemplate = await safeGet('/finance/property-chart-of-accounts-template', null);
      }
      if (state.user.role === 'global_admin') {
        [state.platformServices, state.platformServicePackages, state.platformTenants, state.platformCatalogProducts] = await Promise.all([
          safeGet('/platform/services', []), safeGet('/platform/service-packages', []),
          safeGet('/platform/tenants', []), safeGet('/platform/catalog-products', []),
        ]);
      }
      break;
    case 'status':
      state.serviceStatus = await safeGet('/system/status', null);
      state.serviceMetrics = isPlatformAdmin()
        ? await safeGet('/system/metrics', { routes: [] }) : null;
      break;
    default:
      break;
  }
  loadedPanels.add(panel);
}

async function refresh(force = true) {
  showAlert('');
  try {
    if (force) loadedPanels.delete(state.panel);
    const panel = state.panel;
    for (const url of propertyPhotoUrls) URL.revokeObjectURL(url);
    propertyPhotoUrls.clear();
    if (!loadedPanels.has(panel)) await loadPanelData(panel);
    if (panel !== state.panel) return;
    if (state.panel === 'password') state.panel = 'overview';
    if (state.workspaceDataErrors.length) {
      showAlert('Some workspace information could not be loaded. Select Refresh to retry: {{items}}', true, {
        items: state.workspaceDataErrors.join(', '),
      });
    }
    renderStats();
    renderPanel();
  } catch (error) {
    showAlert(error.message, true);
  }
}

function visiblePanelNames() {
  return new Set([...document.querySelectorAll('.tab[data-panel]:not([hidden])')].map((tab) => tab.dataset.panel));
}

function panelLabel(panel) {
  return document.querySelector(`.tab[data-panel="${CSS.escape(panel)}"]`)?.textContent.trim() ?? panel;
}

function workspaceRecords(panel, rows) {
  const descriptors = {
    leads: { type: 'Lead', title: (r) => r.name, subtitle: (r) => [r.phone, r.status].filter(Boolean).join(' · '), searchable: (r) => [r.name], phones: (r) => [r.phone] },
    workers: { type: 'Worker', title: (r) => r.name, subtitle: (r) => [r.sector, r.verification].filter(Boolean).join(' · '), searchable: (r) => [r.name, r.sector], phones: (r) => [r.phone] },
    requests: { type: 'Request', title: (r) => r.sector ?? r.title ?? `Request ${String(r.id ?? '').slice(0, 8)}`, subtitle: (r) => [r.status, r.territory_name].filter(Boolean).join(' · '), searchable: (r) => [r.sector, r.title, r.status], phones: () => [] },
    properties: { type: 'Property', title: (r) => r.address, subtitle: (r) => [r.ptype, r.status].filter(Boolean).join(' · '), searchable: (r) => [r.address, r.ptype], phones: () => [] },
    marketplace: { type: 'Listing', title: (r) => r.title, subtitle: (r) => [r.kind, r.status].filter(Boolean).join(' · '), searchable: (r) => [r.title, r.kind, r.description], phones: () => [] },
    contracts: { type: 'Contract', title: (r) => r.contract_no, subtitle: (r) => r.state ?? r.status ?? '', searchable: (r) => [r.contract_no], phones: () => [] },
    commissions: { type: 'Commission', title: (r) => `Commission ${String(r.id ?? '').slice(0, 8)}`, subtitle: (r) => [r.status, r.amount ? `ETB ${r.amount}` : ''].filter(Boolean).join(' · '), searchable: (r) => [r.id, r.status], phones: () => [] },
    rent: { type: 'Tenant', title: (r) => r.name, subtitle: (r) => r.phone ?? '', searchable: (r) => [r.name], phones: (r) => [r.phone] },
    admin: { type: 'Person', title: (r) => r.legal_name, subtitle: (r) => [r.role, r.phone].filter(Boolean).join(' · '), searchable: (r) => [r.legal_name], phones: (r) => [r.phone] },
  };
  const descriptor = descriptors[panel];
  return descriptor && Array.isArray(rows) ? rows.map((row) => ({
    panel,
    type: descriptor.type,
    id: row.id,
    title: String(descriptor.title(row) ?? ''),
    subtitle: String(descriptor.subtitle(row) ?? ''),
    searchable: descriptor.searchable(row),
    phones: descriptor.phones(row),
  })).filter((record) => record.title) : [];
}

async function searchWorkspace(query) {
  const sequence = ++workspaceSearchSequence;
  const term = String(query ?? '').trim();
  const resultBox = $('#workspace-search-results');
  resultBox.hidden = false;
  resultBox.replaceChildren();
  if (term.length < MIN_SEARCH_QUERY_LENGTH) {
    resultBox.append(node('p', t('Enter at least {{count}} characters to search.', { count: MIN_SEARCH_QUERY_LENGTH })));
    return;
  }

  const resources = [
    ['leads', '/leads'], ['workers', '/workers'], ['requests', '/requests'],
    ['properties', '/properties'], ['marketplace', '/marketplace/listings'],
    ['contracts', '/contracts'], ['commissions', '/commissions'], ['rent', '/tenants'],
    ...(visiblePanelNames().has('admin') && ['global_admin', 'super_admin', 'compliance'].includes(state.user.role)
      ? [['admin', '/users']] : []),
  ].filter(([panel]) => visiblePanelNames().has(panel));
  const unavailable = [];
  const batches = await Promise.all(resources.map(async ([panel, path]) => {
    try {
      const records = await api(path);
      return workspaceRecords(panel, records);
    } catch (error) {
      console.error(`Workspace search could not query ${panelLabel(panel)}.`, error);
      unavailable.push(panel);
      return [];
    }
  }));
  if (sequence !== workspaceSearchSequence) return;
  state.searchQuery = term;
  state.searchUnavailable = unavailable;
  state.searchResults = searchWorkspaceRecords(term, batches.flat());
  renderWorkspaceSearchResults();
}

function renderWorkspaceSearchResults() {
  const resultBox = $('#workspace-search-results');
  resultBox.replaceChildren();
  const summary = state.searchUnavailable.length
    ? t('Some areas could not be searched. Results may be partial.')
    : t('{{count}} matching result(s).', { count: state.searchResults.length });
  resultBox.append(node('p', summary));
  if (!state.searchResults.length && !state.searchUnavailable.length) {
    resultBox.append(node('p', 'No matching records were found in the areas available to your role.'));
  }
  for (const record of state.searchResults) {
    const row = node('article', undefined, 'workspace-search-result');
    const copy = node('div');
    copy.append(node('h3', record.title), node('p', `${record.type} · ${panelLabel(record.panel)}${record.subtitle ? ` · ${record.subtitle}` : ''}`));
    row.append(copy, button('Open area', 'open-panel', 'button button-outline', { panel: record.panel }));
    resultBox.append(row);
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
  const unavailableServices = state.serviceStatus?.services?.filter((service) => service.status === 'unavailable') ?? [];
  if (unavailableServices.length) {
    const notice = node('section', undefined, 'alert error');
    notice.setAttribute('role', 'status');
    notice.append(node('strong', 'Some services are temporarily unavailable: '));
    notice.append(node('span', unavailableServices.map((service) => service.name).join(', ')));
    notice.append(button('View service status', 'open-panel', 'button button-outline', { panel: 'status' }));
    wrap.append(notice);
  }
  wrap.append(renderServiceLauncher());
  if (loadedPanels.has('edir') && state.user.kyc_status === 'verified' && state.features.edirEnabled && !state.edirMe?.membership) {
    const offer = node('section', undefined, 'panel form-card edir-offer');
    offer.append(node('p', 'ETHIOLIFE EDIR · MEMBERSHIP OFFER', 'eyebrow'));
    offer.append(node('h2', 'Explore Edir membership and available benefits'));
    offer.append(node('p', 'Open to verified EthioLife users across worker, employer, landlord, tenant, seller, and buyer services. Review active community, savings, share, and contribution options before requesting membership. Lending, insurance, and benefit payouts are not live in this pilot.'));
    const action = button('View Edir offer', 'open-edir-offer', 'button button-primary');
    action.addEventListener('click', () => navigateToPanel('edir'));
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

function renderServiceStatus() {
  const wrap = node('div');
  wrap.append(sectionHeading('Service status', 'Availability of this deployment’s application services. Health status does not confirm financial readiness.'));
  if (!state.serviceStatus) {
    wrap.append(empty('Service status has not been loaded.'));
    return wrap;
  }
  wrap.append(node('p', `Checked ${new Date(state.serviceStatus.checked_at).toLocaleString(document.documentElement.lang)}`, 'muted'));
  const list = node('div', undefined, 'service-health-list');
  for (const service of state.serviceStatus.services) {
    const item = node('article', undefined, 'service-health-row');
    item.dataset.status = service.status;
    const name = node('div');
    name.append(node('strong', service.name));
    const latency = service.latency_ms === null ? '' : ` · ${service.latency_ms} ms`;
    name.append(node('small', `${service.status.replaceAll('_', ' ')}${latency}`));
    item.append(name);
    list.append(item);
  }
  wrap.append(list);
  if (isPlatformAdmin() && state.serviceMetrics) {
    const metrics = node('section', undefined, 'panel form-card service-metrics');
    metrics.append(node('h3', 'API request metrics'));
    metrics.append(node('p', 'In-memory aggregate for this API process; counters reset when it restarts.'));
    const metricList = node('div', undefined, 'service-health-list');
    for (const metric of state.serviceMetrics.routes) {
      const row = node('article', undefined, 'service-health-row');
      const details = node('div');
      details.append(node('strong', metric.route));
      details.append(node('small', `${metric.requests} requests · ${metric.failures} failed · average ${metric.average_duration_ms} ms · max ${metric.max_duration_ms} ms`));
      row.append(details);
      metricList.append(row);
    }
    if (!state.serviceMetrics.routes.length) metricList.append(empty('No API requests have been recorded yet.'));
    metrics.append(metricList);
    wrap.append(metrics);
  }
  return wrap;
}

const serviceDescriptions = {
  leads: 'Register and follow up on customer and business opportunities.',
  contracts: 'Prepare, review, and track service agreements.',
  commissions: 'Review earned commissions and payment status.',
  agents: 'Oversee agent teams and service specialization.',
  rent: 'Manage leases, rent receipts, and deposit workflows.',
  edir: 'Open the central community membership and financial pilot.',
  mfi: 'Open institution-scoped SACCO and MFI pilot operations.',
  accounting: 'Entity-scoped general ledger, journal approval, and parent consolidation.',
  insurance: 'Request insurance information and review your request activity.',
};

const integratedMiniAppLogos = Object.freeze({
  leads: '/mini-apps/leads/logo.svg',
  contracts: '/mini-apps/contracts/logo.svg',
  commissions: '/mini-apps/commissions/logo.svg',
  rent: '/mini-apps/rent/logo.svg',
  agents: '/mini-apps/agents/logo.svg',
  edir: '/mini-apps/edir/logo.svg',
  mfi: '/mini-apps/mfi/logo.svg',
  insurance: '/mini-apps/insurance/logo.svg',
});

function miniAppLogo(panel) {
  return miniAppByPanel[panel]?.logo ?? integratedMiniAppLogos[panel] ?? null;
}

function decoratePublicServiceLogos() {
  const logos = new Map([
    ['Homes & rentals', miniAppLogo('properties')],
    ['Marketplace', miniAppLogo('marketplace')],
    ['Workforce', miniAppLogo('workers')],
    ['EthioLife Edir', miniAppLogo('edir')],
    ['SACCO / MFI', miniAppLogo('mfi')],
    ['Agent services', '/icon.svg'],
  ]);
  for (const card of document.querySelectorAll('#public-hub .service-card')) {
    const src = logos.get(card.querySelector('strong')?.textContent.trim());
    const current = card.querySelector('.service-icon');
    if (!src || !current) continue;
    const logo = node('img', undefined, 'service-icon service-icon-image');
    logo.src = src;
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    current.replaceWith(logo);
  }
}

decoratePublicServiceLogos();

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
    const miniApp = miniAppByPanel[panel];
    const logoSource = miniAppLogo(panel);
    const card = node('article', undefined, 'service-launcher-card');
    if (logoSource) {
      const logo = node('img', undefined, 'service-launcher-logo');
      logo.src = logoSource;
      logo.alt = '';
      logo.setAttribute('aria-hidden', 'true');
      card.append(logo);
    }
    card.append(
      node('h3', t(miniApp?.name ?? tab.textContent.trim())),
      node('p', t(miniApp?.description ?? serviceDescriptions[panel] ?? 'Open this role-based service workspace.')),
    );
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
  learning: '▶',
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
  const logoSource = miniAppLogo(panel);
  const icon = node('span', workspaceNavIcons[panel] ?? '•', 'workspace-nav-icon');
  icon.setAttribute('aria-hidden', 'true');
  const label = node('span', tab.textContent.trim(), 'workspace-nav-label');
  link.append(icon, label);
  if (logoSource) {
    const logo = node('img', undefined, 'workspace-nav-logo');
    logo.src = logoSource;
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    icon.hidden = true;
    link.insertBefore(logo, label);
  }
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
  moreButton.setAttribute('aria-expanded', 'false');
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
  for (const lead of state.leads) {
    const item = card(lead.name, t('{{phone}} · {{type}}', { phone: lead.phone, type: t(lead.lead_type[0].toUpperCase() + lead.lead_type.slice(1)) }), lead.status);
    if (lead.protected_until) item.append(node('p', `Ownership protected until ${new Date(lead.protected_until).toLocaleString(document.documentElement.lang)}.`));
    item.append(button('Attribution history', 'lead-attribution-history', 'button button-outline', { id: lead.id }));
    if (isPlatformAdmin() && lead.status !== 'converted') {
      const reassign = node('form', undefined, 'inline-form');
      reassign.dataset.form = 'lead-reassign';
      reassign.dataset.lead = lead.id;
      const target = field('Reassign to active agent', 'target_agent_id', 'select');
      const placeholder = node('option', 'Choose an agent'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
      target.input.append(placeholder);
      for (const agent of state.team.filter((entry) => entry.active && ['master_agent','field_agent'].includes(entry.role))) {
        const option = node('option', `${agent.legal_name} · ${roleLabel(agent.role)}`); option.value = agent.id; target.input.append(option);
      }
      const reason = field('Reassignment reason (at least 10 characters)', 'reason', 'text', true, { minLength: 10, maxLength: 1000 });
      reassign.append(target.label, reason.label, button('Reassign and record reason', 'submit', 'button button-outline'));
      item.append(reassign);
    }
    list.append(item);
  }
  form.hidden = !hasActivity('workforce.workers.register');
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
    if (hasActivity('workforce.documents.upload')) item.append(button('Upload documents', 'worker-upload', 'button button-outline', { id: worker.id }));
    if (hasActivity('workforce.documents.view')) {
      item.append(button('Documents', 'worker-documents', 'button button-outline', { id: worker.id }));
    }
    if (worker.verification !== 'verified' && hasActivity('workforce.workers.verify')) item.append(button('Verify worker', 'worker-verify', 'button button-primary', { id: worker.id }));
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
  form.hidden = !hasActivity('staffing.requests.manage');
  const list = node('div', undefined, 'list');
  if (!state.requests.length) list.append(empty('No service requests yet.'));
  for (const request of state.requests) {
    const item = card(request.sector, t('ETB {{rate}} · {{skills}} · {{status}}', {
      rate: Number(request.rate_offered).toLocaleString(document.documentElement.lang),
      skills: request.skills_required?.join(', ') || t('Open skills'),
      status: t(request.status),
    }), request.status);
    item.dataset.request = request.id;
    if (hasActivity('staffing.requests.manage') && request.status === 'open') item.append(button('Find candidates', 'candidates', 'button button-outline', { id: request.id }));
    if (hasActivity('staffing.requests.manage')) item.append(button('Matches', 'matches', 'button button-outline', { id: request.id }));
    list.append(item);
  }
  columns.append(form, list);
  wrap.append(columns);
  return wrap;
}

function createLearningForm(content = null) {
  const form = node('form', undefined, 'panel form-card inline-form learning-content-form');
  form.dataset.form = 'learning-content';
  if (content) form.dataset.content = content.id;
  form.append(node('h3', content ? 'Edit training content' : 'Publish training or support content'));
  const title = field('Title', 'title', 'text', true, { minlength: 3, maxlength: 200 });
  const summary = field('Summary', 'summary', 'textarea', true, { minlength: 5, maxlength: 1000, rows: 2 });
  const category = field('Category', 'category', 'select');
  for (const [value, label] of [
    ['workforce_onboarding', 'Workforce onboarding'], ['property_management', 'Property management'],
    ['tenant_support', 'Tenant support'], ['landlord_support', 'Landlord support'],
    ['buyer_support', 'Buyer support'], ['seller_support', 'Seller support'],
    ['agent_training', 'Agent training'], ['general_support', 'General support'],
  ]) {
    const option = node('option', label); option.value = value; category.input.append(option);
  }
  const type = field('Format', 'content_type', 'select');
  for (const [value, label] of [['video', 'Video'], ['tutorial', 'Tutorial'], ['article', 'Article']]) {
    const option = node('option', label); option.value = value; type.input.append(option);
  }
  const video = field('Video URL (HTTPS)', 'video_url', 'url', false, { placeholder: 'https://example.com/training.mp4' });
  const body = field('Tutorial or support notes', 'body', 'textarea', false, { maxlength: 20000, rows: 5 });
  const visibility = field('Publication status', 'status', 'select');
  for (const [value, label] of [['draft', 'Draft'], ['published', 'Published']]) {
    const option = node('option', label); option.value = value; visibility.input.append(option);
  }
  if (content) {
    title.input.value = content.title;
    summary.input.value = content.summary;
    category.input.value = content.category;
    type.input.value = content.content_type;
    video.input.value = content.video_url ?? '';
    body.input.value = content.body ?? '';
    visibility.input.value = content.status === 'published' ? 'published' : 'draft';
  }
  form.append(title.label, summary.label, category.label, type.label, video.label, body.label, visibility.label);
  const audiences = node('fieldset', undefined, 'learning-audiences');
  audiences.append(node('legend', 'Audience roles'));
  for (const [role, label] of [
    ['worker', 'Workers'], ['customer', 'Tenants and buyers'], ['property_owner', 'Landlords and sellers'],
    ['master_agent', 'Master Agents'], ['field_agent', 'Agents'], ['corporate_business_manager', 'Corporate Business Managers'],
    ['compliance', 'Compliance'], ['finance', 'Finance'], ['finance_manager', 'Finance managers'],
    ['global_admin', 'Global Admins'], ['super_admin', 'Super Admins'],
  ]) {
    const option = document.createElement('input');
    option.type = 'checkbox';
    option.name = 'audience_roles';
    option.value = role;
    option.checked = content ? content.audience_roles.includes(role) : ['worker', 'customer', 'property_owner', 'master_agent', 'field_agent'].includes(role);
    const labelElement = node('label', label, 'learning-audience-option');
    labelElement.prepend(option);
    audiences.append(labelElement);
  }
  form.append(audiences, button(content ? 'Save content changes' : 'Save training content', 'submit', 'button button-primary'));
  return form;
}

function renderLearning() {
  const wrap = node('div');
  wrap.append(sectionHeading('Training & support library', 'Role-targeted tutorials, videos, and practical guidance for workforce and property services.'));
  const manager = hasActivity('learning.content.manage');
  if (manager) wrap.append(createLearningForm());
  const list = node('div', undefined, 'list');
  if (!state.learningContent.length) list.append(empty('No training content is available for your role yet.'));
  for (const content of state.learningContent) {
    const item = card(content.title, content.summary, content.status);
    item.append(node('p', `${content.category.replaceAll('_', ' ')} · ${content.content_type} · For ${content.audience_roles.map(roleLabel).join(', ')}`));
    if (content.body) item.append(node('p', content.body, 'learning-content-body'));
    if (content.video_url) {
      const link = node('a', content.content_type === 'video' ? 'Open training video' : 'Open related video');
      link.href = content.video_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      item.append(link);
    }
    if (manager && content.status !== 'archived') {
      item.append(button('Edit', 'learning-edit', 'button button-outline', { id: content.id }));
      item.append(button('Archive', 'learning-archive', 'button button-outline', { id: content.id }));
    }
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderProperties() {
  const wrap = node('div');
  const buyer = state.user.role === 'customer';
  const canManage = hasActivity('property.listings.manage');
  wrap.append(sectionHeading(
    buyer ? 'Available property listings' : 'Property listings',
    buyer ? 'Browse available properties and view their pictures.' : 'Create and manage property records, units, rent details, and private listing pictures.',
  ));
  const columns = node('div', undefined, 'columns');
  if (canManage) {
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
    if (canManage) actions.append(button('Add media', 'property-upload', 'button button-outline', { id: property.id }));
    item.append(actions);
    listings.append(item);
  }
  columns.append(listings);
  wrap.append(columns);
  if (state.user.role === 'property_owner') {
    const statements = node('section', undefined, 'panel form-card');
    statements.append(node('h2','Owner rent & deposit statements'));
    statements.append(node('p','These read-only records show lease charges and reconciled rent/deposit receipts. They do not initiate or confirm a payout to you.'));
    statements.append(button('Download CSV statement', 'owner-statement-download', 'button button-outline'));
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
    if(state.user.role==='customer'&&listing.status==='published'&&listing.transaction_mode==='sale'&&listing.price&&config.sandbox_checkout_available){const quantity=field('Quantity','quantity','number',true,{min:1,max:1000,step:1});quantity.input.value='1';const checkout=button('Create sandbox order & simulate payment','marketplace-sandbox-checkout','button button-outline',{id:listing.id});checkout.addEventListener('click',async()=>{checkout.disabled=true;try{const order=await api(`/marketplace/listings/${listing.id}/sandbox-orders`,{method:'POST',body:JSON.stringify({quantity:Number(quantity.input.value),idempotency_key:crypto.randomUUID()})});const paid=await api(`/marketplace/sandbox-orders/${order.id}/mock-payment`,{method:'POST',body:'{}'});showAlert(paid.notice);}catch(error){showAlert(error.message,true);}finally{checkout.disabled=false;}});const sandboxNote=node('p','Test checkout only. No real payment is taken.','muted');item.append(quantity.label,sandboxNote,checkout);}
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
  const ownedListings = state.marketplaceListings.filter((listing) =>
    listing.created_by === state.user.id || listing.seller_user_id === state.user.id);
  const report = node('section', undefined, 'panel form-card');
  report.append(node('h2', 'Marketplace report dashboard'));
  const summary = node('div', undefined, 'enterprise-metrics');
  for (const [label, value] of [
    ['Published listings available', state.marketplaceListings.filter((listing) => listing.status === 'published').length],
    ['Your listings', ownedListings.length],
    ['Marketplace membership', 'Not available'],
    ['Purchase ledger', 'Not live'],
  ]) {
    const metric = node('div', undefined, 'enterprise-metric');
    metric.append(node('span', label), node('strong', value));
    summary.append(metric);
  }
  report.append(summary, node('p', 'Marketplace listing prices are not payments. Local mock mode supports a sandbox order and simulated payment for published fixed-price sales; it never charges a buyer or posts to Accounting. Real checkout, buyer memberships, wallets, loans, and purchase history remain unavailable.'));
  const activity = node('div', undefined, 'list');
  activity.append(node('h3', 'Your detailed listing activity'));
  if (!ownedListings.length) activity.append(node('p', 'No marketplace listing activity is linked to your account.'));
  for (const listing of ownedListings) {
    activity.append(card(listing.title,
      `${listing.domain} · ${listing.transaction_mode} · Created ${new Date(listing.created_at).toLocaleString(document.documentElement.lang)} · Updated ${new Date(listing.updated_at ?? listing.created_at).toLocaleString(document.documentElement.lang)}`,
      listing.status));
  }
  report.append(activity);
  wrap.append(report);
  return wrap;
}

function renderInsurance() {
  const wrap = node('div');
  wrap.append(sectionHeading('Insurance information', 'Consent-based, non-binding information and referral workflow. No insurance policy or coverage is created by this mini-app.'));
  const notice = node('section', undefined, 'panel form-card');
  const requestCount = state.insuranceRequests.length;
  const pendingCount = state.insuranceRequests.filter((request) => request.status === 'pending').length;
  const metrics = node('div', undefined, 'enterprise-metrics');
  notice.append(
    node('h2', 'Insurance report dashboard'),
    node('p', 'Insurance policy enrollment, claims, member wallets, and loans are not available in this platform. Existing Insurance ledgers are separate organization accounting records and do not prove personal cover or a payment balance.'),
    node('p', 'Agents may only make a consented, non-binding follow-up or refer a customer to the Insurance service team. Product recommendations, comparisons, quotes, premium collection, policy issuance or changes, and claims decisions are not available.'),
  );
  for (const [label, value] of [
    ['Policy membership', 'Not available'],
    ['Requests submitted', requestCount],
    ['Awaiting response', pendingCount],
  ]) {
    const metric = node('div', undefined, 'enterprise-metric');
    metric.append(node('span', label), node('strong', value));
    metrics.append(metric);
  }
  notice.append(metrics);
  const requestForm = node('form', undefined, 'panel form-card inline-form');
  requestForm.dataset.form = 'insurance-request';
  requestForm.append(node('h3', 'Request information'));
  const product = field('Information requested', 'product_interest', 'select');
  for (const [value, label] of [['life', 'Life insurance information'], ['household', 'Household cover information'], ['property', 'Property cover information']]) {
    const option = node('option', label);
    option.value = value;
    product.input.append(option);
  }
  requestForm.append(product.label, field('What would you like to know?', 'message', 'textarea', true, { minlength: 10, maxlength: 500 }).label);
  const consent = node('label', undefined, 'benefit-check span-2');
  const consentInput = document.createElement('input');
  consentInput.type = 'checkbox';
  consentInput.name = 'consent';
  consentInput.required = true;
  consent.append(consentInput, node('span', 'I consent to EthioLife forwarding this information request to the Insurance service team. This is not an application, policy, quote, or coverage confirmation.'));
  const agentConsent = node('label', undefined, 'benefit-check span-2');
  const agentConsentInput = document.createElement('input');
  agentConsentInput.type = 'checkbox';
  agentConsentInput.name = 'agent_referral_consent';
  agentConsent.append(agentConsentInput, node('span', 'Optional: I consent to sharing my name, phone number, and selected topic with one assigned AfroLife Agent for non-binding follow-up and referral to the Insurance service team. The Agent cannot advise, quote, collect premiums, or issue or change a policy.'));
  requestForm.append(consent, agentConsent, button('Submit information request', 'submit', 'button button-primary span-2'));
  wrap.append(notice, requestForm);
  const myRequests = node('section', undefined, 'panel form-card');
  myRequests.append(node('h2', 'Your requests and activity'));
  if (!state.insuranceRequests.length) myRequests.append(node('p', 'No Insurance information requests are linked to your account.'));
  for (const request of state.insuranceRequests) {
    const referral = request.agent_referral_status
      ? ` · Agent referral: ${request.agent_referral_status}${request.assigned_agent_name ? ` (${request.assigned_agent_name})` : ''}`
      : '';
    const item = card(request.product_interest, `${request.message} · Submitted ${new Date(request.created_at).toLocaleString(document.documentElement.lang)}${request.responded_at ? ` · Updated ${new Date(request.responded_at).toLocaleString(document.documentElement.lang)}` : ''}${request.response_note ? ` · Response: ${request.response_note}` : ''}${referral}`, request.status);
    if (request.agent_referral_id && request.agent_referral_status !== 'customer_withdrew') {
      item.append(button('Withdraw Agent-sharing consent', 'insurance-referral-withdraw', 'button button-outline', { id: request.agent_referral_id }));
    }
    if (request.agent_referral_events?.length) {
      item.append(node('p', `Agent-sharing activity: ${request.agent_referral_events.map((event) =>
        `${event.event_type} · ${new Date(event.created_at).toLocaleString(document.documentElement.lang)}`).join(' · ')}`));
    }
    myRequests.append(item);
  }
  wrap.append(myRequests);
  if (state.insuranceStaffRequests.length) {
    const queue = node('section', undefined, 'panel form-card');
    queue.append(node('h2', 'Insurance information request review'));
    for (const request of state.insuranceStaffRequests) {
      const item = card(`${request.legal_name} · ${request.product_interest}`,
        `${request.phone} · ${request.message} · ${new Date(request.created_at).toLocaleString(document.documentElement.lang)}`,
        request.status);
      if (request.status === 'pending' && request.can_respond) {
        item.append(button('Respond', 'insurance-request-decision', 'button button-primary', { id: request.id, status: 'responded' }));
        item.append(button('Close request', 'insurance-request-decision', 'button button-outline', { id: request.id, status: 'closed' }));
      } else if (request.response_note) {
        item.append(node('p', request.response_note));
      }
      queue.append(item);
    }
    wrap.append(queue);
  }
  if (state.insuranceAgentReferrals.length) {
    const referrals = node('section', undefined, 'panel form-card');
    referrals.append(node('h2', 'Consent-based Agent referrals'));
    for (const referral of state.insuranceAgentReferrals) {
      const item = card(
        `${referral.legal_name} · ${referral.product_interest}`,
        `${referral.phone} · ${referral.status} · ${new Date(referral.created_at).toLocaleString(document.documentElement.lang)}`,
        referral.status,
      );
      if (referral.events?.length) {
        item.append(node('p', `Activity: ${referral.events.map((event) =>
          `${event.event_type} · ${new Date(event.created_at).toLocaleString(document.documentElement.lang)}`).join(' · ')}`));
      }
      if (referral.status === 'unassigned' && state.insuranceEligibleAgents.length) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Assign referral to an active Agent');
        select.dataset.referralAgent = referral.id;
        select.append(new Option('Select Agent', ''));
        for (const agent of state.insuranceEligibleAgents) {
          select.append(new Option(`${agent.legal_name} · ${agent.role}`, agent.id));
        }
        const reason = document.createElement('select');
        reason.setAttribute('aria-label', 'Referral assignment reason');
        reason.dataset.referralReason = referral.id;
        reason.append(new Option('Select assignment reason', ''));
        for (const [value, label] of [
          ['customer_requested', 'Customer requested this Agent'],
          ['workload_balance', 'Workload balance'],
          ['staff_review', 'Insurance staff review'],
        ]) reason.append(new Option(label, value));
        item.append(select, reason, button('Assign referral', 'insurance-referral-assign', 'button button-primary', { id: referral.id }));
      } else if (referral.assigned_agent_name) {
        item.append(node('p', `Assigned Agent: ${referral.assigned_agent_name}`));
      }
      if (referral.can_update && ['assigned', 'contact_attempted'].includes(referral.status)) {
        item.append(button('Contact attempted', 'insurance-referral-status', 'button button-outline', { id: referral.id, status: 'contact_attempted' }));
        item.append(button('Refer to Insurance team', 'insurance-referral-status', 'button button-outline', { id: referral.id, status: 'referred_to_insurance_team' }));
        item.append(button('Customer declined', 'insurance-referral-status', 'button button-outline', { id: referral.id, status: 'customer_declined' }));
      }
      referrals.append(item);
    }
    wrap.append(referrals);
  } else if (['master_agent', 'field_agent'].includes(state.user.role)) {
    wrap.append(node('p', 'No consented Insurance referrals are assigned in your Agent scope.'));
  }
  if (state.features.insuranceBrokerageSandboxEnabled && state.insuranceSandboxStatus?.enabled) {
    const sandbox = node('section', undefined, 'panel form-card');
    sandbox.append(
      node('h2', 'Brokerage lifecycle training sandbox'),
      node('p', 'Development-only simulated workflow using synthetic product and transaction data. It cannot contact insurers, issue real policies, move money, settle commissions, or decide real claims.'),
    );
    const runForm = node('form', undefined, 'inline-form');
    runForm.dataset.form = 'insurance-sandbox-create';
    const acknowledgement = node('label', undefined, 'benefit-check span-2');
    const acknowledgementInput = document.createElement('input');
    acknowledgementInput.type = 'checkbox';
    acknowledgementInput.name = 'acknowledge_synthetic_only';
    acknowledgementInput.required = true;
    acknowledgement.append(acknowledgementInput, node('span', 'I confirm that this scenario uses no real customer, policy, payment, or claims data.'));
    runForm.append(acknowledgement, button('Create synthetic training case', 'submit', 'button button-primary span-2'));
    sandbox.append(runForm);
    for (const item of state.insuranceSandboxCases) {
      const caseCard = card(item.scenario_reference, `${item.event_count} lifecycle events · Created ${new Date(item.created_at).toLocaleString(document.documentElement.lang)}`, 'synthetic only');
      caseCard.append(button('Run complete demo', 'insurance-sandbox-run', 'button button-outline', { id: item.id }));
      caseCard.append(button('View event trace', 'insurance-sandbox-view', 'button button-outline', { id: item.id }));
      const comparisonCategory = document.createElement('select');
      comparisonCategory.setAttribute('aria-label', 'Synthetic product comparison category');
      for (const [value, label] of [['household', 'Household']]) {
        comparisonCategory.append(new Option(label, value));
      }
      comparisonCategory.dataset.sandboxComparison = item.id;
      caseCard.append(comparisonCategory, button('Compare synthetic products', 'insurance-sandbox-compare', 'button button-outline', { id: item.id }));
      const quoteProduct = document.createElement('select');
      quoteProduct.setAttribute('aria-label', 'Synthetic quote product');
      quoteProduct.append(new Option('Select synthetic product', ''));
      for (const product of state.insuranceSandboxStatus.synthetic_products.filter((item) => item.category === 'household')) {
        quoteProduct.append(new Option(`${product.label} · ETB ${(product.monthlyPremiumMinor / 100).toFixed(2)}/month`, product.key));
      }
      quoteProduct.dataset.sandboxQuoteProduct = item.id;
      caseCard.append(quoteProduct, button('Simulate a 12-month quote', 'insurance-sandbox-quote', 'button button-outline', { id: item.id }));
      sandbox.append(caseCard);
      if (item.events) {
        for (const event of item.events) {
          caseCard.append(node('p', `${event.sequence_number}. ${event.event_type} · ${JSON.stringify(event.event_data)}`));
        }
      }
    }
    wrap.append(sandbox);
  }
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
  wrap.append(sectionHeading('Agent management', "Review agent activity and set optional profile focus across the Super Agent and Master Agent network. Profile focus does not limit an agent's services."));
  wrap.append(renderServiceLauncher(['leads', 'workers', 'requests', 'properties', 'marketplace', 'contracts', 'commissions', 'rent', 'agents', 'edir', 'mfi', 'insurance']));
  const list = node('div', undefined, 'list');
  const services = {
    financial_service: 'Financial services focus',
    growth_partnership: 'Growth & partnerships focus',
    workforce_property: 'Workforce & property focus',
  };
  if (!state.team.length) list.append(empty('No agents are available in this management scope.'));
  for (const agent of state.team) {
    const item = card(agent.legal_name, `${roleLabel(agent.role)} · ${agent.active ? 'active' : 'inactive'} · Leads ${agent.lead_count} · Contracts ${agent.contract_count} · Listings ${agent.property_count} · Profile focus: ${services[agent.service_specialization] ?? 'General agent'}`);
    if (agent.id !== state.user.id && (isPlatformAdmin() || agent.parent_id === state.user.id)) {
      const select = document.createElement('select');
      select.dataset.agentSpecialization = agent.id;
      for (const [value, label] of [['', 'General agent'], ...Object.entries(services)]) {
        const option = node('option', label); option.value = value;
        option.selected = (agent.service_specialization ?? '') === value;
        select.append(option);
      }
      item.append(select, button('Save profile focus', 'agent-specialization', 'button button-outline', { id: agent.id }));
    }
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderRent() {
  const wrap = node('div');
  wrap.append(sectionHeading('Rent & deposits', 'Record payments first. A different finance officer reconciles them into the ledger.'));
  if (['global_admin','super_admin','finance','finance_manager'].includes(state.user.role)) {
    const close = node('section', undefined, 'panel form-card');
    close.append(node('h3', 'Property period-close checks'));
    close.append(node('p', 'Read-only exception checks for outstanding rent, receipts awaiting reconciliation and unbalanced rent journals. This is evidence for Finance review, not a period lock or accounting approval.'));
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'property-period-close';
    const month = new Date().toISOString().slice(0, 7);
    form.append(field('Accounting period', 'period', 'month', true, { value: month }).label);
    form.append(button('Run checks', 'submit', 'button button-primary'));
    close.append(form);
    if (state.propertyAccountingTemplate) {
      const link = button('Download chart-of-accounts draft JSON', 'coa-template-download', 'button button-outline');
      close.append(link);
      close.append(node('p', `Chart status: ${state.propertyAccountingTemplate.status}. Codes and recognition policy require Finance approval.`));
    }
    if (state.propertyPeriodClose) {
      close.append(node('p', `Period ${state.propertyPeriodClose.period}: ${state.propertyPeriodClose.ready_for_finance_review ? 'ready for Finance review' : 'exceptions found'} · pending receipts ${state.propertyPeriodClose.pending_receipts} · unpaid charges ${state.propertyPeriodClose.unpaid_rent_charges} · unbalanced journals ${state.propertyPeriodClose.unbalanced_ledger_transactions}`));
    }
    wrap.append(close);
  }
  const columns = node('div', undefined, 'columns');
  if (['global_admin', 'super_admin', 'master_agent', 'field_agent'].includes(state.user.role)) {
    const tenantForm = node('form', undefined, 'panel form-card inline-form');
    tenantForm.dataset.form = 'tenant';
    tenantForm.append(node('h3', 'Register a tenant'), field('Full name', 'name').label, field('Phone', 'phone', 'tel').label, field('National ID (optional)', 'national_id', 'text', false).label, button('Save tenant', 'submit', 'button button-primary'));
    columns.append(tenantForm);
    const leaseForm = node('form', undefined, 'panel form-card inline-form');
    leaseForm.dataset.form = 'lease';
    leaseForm.append(node('h3', 'Create a lease draft'));
    leaseForm.append(node('p', 'A lease stays inactive until independent approval, signature evidence, handover, and move-in inspection are recorded.'));
    const unit = field('Vacant unit', 'unit_id', 'select');
    const unitEmpty = node('option', 'Choose a unit'); unitEmpty.value = ''; unitEmpty.disabled = true; unitEmpty.selected = true; unit.input.append(unitEmpty);
    for (const property of state.properties) for (const entry of property.units ?? []) if (entry.occupancy === 'vacant') {
      const option = node('option', `${property.address} · ${entry.unit_no}`); option.value = entry.id; unit.input.append(option);
    }
    const tenant = field('Tenant', 'tenant_id', 'select');
    const tenantEmpty = node('option', 'Choose a tenant'); tenantEmpty.value = ''; tenantEmpty.disabled = true; tenantEmpty.selected = true; tenant.input.append(tenantEmpty);
    for (const entry of state.tenants) { const option = node('option', `${entry.name} · ${entry.phone}`); option.value = entry.id; tenant.input.append(option); }
    leaseForm.append(unit.label, tenant.label, field('Monthly rent (ETB)', 'rent', 'number', true, { min: '0.01', step: '0.01' }).label, field('Deposit (ETB)', 'deposit', 'number', false, { min: '0', step: '0.01', value: '0' }).label, field('Start date', 'start_date', 'date').label, field('Term (months)', 'months', 'number', true, { min: '1', max: '120', value: '12' }).label, button('Create lease draft', 'submit', 'button button-primary'));
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
    if (lease.notice_type) {
      item.append(node('p', `Latest operational notice: ${lease.notice_type}, received ${lease.notice_received_on}, proposed effective ${lease.proposed_effective_on}. This is not legal validation or lease termination.`));
    }
    if (lease.status !== 'active' && lease.status !== 'ended') {
      item.append(node('p', `Term ${lease.start_date} to ${lease.end_date}. Signature uploads are evidence only and do not verify signer identity or legal validity.`));
    }
    if (lease.status === 'active' && hasActivity('property.tenancy.manage')) {
      const noticeForm = node('form', undefined, 'inline-form');
      noticeForm.dataset.form = 'lease-notice';
      noticeForm.dataset.lease = lease.id;
      const noticeType = field('Notice direction', 'notice_type', 'select');
      for (const [value, label] of [
        ['tenant_to_owner', 'Tenant to owner'],
        ['owner_to_tenant', 'Owner to tenant'],
        ['mutual_agreement', 'Mutual agreement'],
        ['other', 'Other'],
      ]) {
        const option = node('option', label);
        option.value = value;
        noticeType.input.append(option);
      }
      noticeForm.append(
        node('h4', 'Record a notice (operational record only)'),
        noticeType.label,
        field('Received date', 'received_on', 'date', true, { value: new Date().toISOString().slice(0, 10) }).label,
        field('Proposed effective date', 'proposed_effective_on', 'date', true).label,
        field('Summary (do not include sensitive personal details)', 'summary', 'textarea', true, { minlength: '10', maxlength: '1000' }).label,
        button('Record notice', 'submit', 'button button-outline'),
        node('p', 'Recording does not verify legal service, create a legally valid notice, change lease status, or end the lease.'),
      );
      item.append(noticeForm);
    }
    if (lease.status === 'draft' && hasActivity('property.tenancy.manage')
      && (lease.created_by === state.user.id || isPlatformAdmin())) {
      item.append(button('Submit for approval', 'lease-submit-approval', 'button button-primary', { id: lease.id }));
    }
    if (lease.status === 'pending_approval' && hasActivity('property.tenancy.approve')) {
      item.append(button('Approve lease', 'lease-approve', 'button button-primary', { id: lease.id }));
    }
    if (lease.status === 'pending_signature' && hasActivity('property.tenancy.manage')) {
      for (const party of ['tenant', 'owner']) {
        const evidenceExists = party === 'tenant' ? lease.tenant_signature_evidence : lease.owner_signature_evidence;
        if (evidenceExists) {
          item.append(node('p', `${party === 'tenant' ? 'Tenant' : 'Owner'} signature evidence uploaded.`));
          continue;
        }
        const evidenceForm = node('form', undefined, 'inline-form');
        evidenceForm.dataset.form = 'lease-signature';
        evidenceForm.dataset.lease = lease.id;
        evidenceForm.dataset.party = party;
        evidenceForm.append(
          field(`${party === 'tenant' ? 'Tenant' : 'Owner'} signer name`, 'signer_name', 'text', true, { minlength: '2', maxlength: '200' }).label,
          field(`${party === 'tenant' ? 'Tenant' : 'Owner'} signature evidence (PDF, JPEG, PNG)`, 'signature_document', 'file', true, { accept: 'application/pdf,image/jpeg,image/png' }).label,
          button(`Upload ${party} evidence`, 'submit', 'button button-outline'),
        );
        item.append(evidenceForm);
      }
      if (hasActivity('property.tenancy.execute')
        && lease.tenant_signature_evidence && lease.owner_signature_evidence) {
        item.append(button('Record handover & activate', 'lease-execute', 'button button-primary', { id: lease.id }));
      }
    }
    item.append(button('View charges & payments', 'lease-payments', 'button button-outline', { id: lease.id }));
    if (['global_admin', 'super_admin', 'master_agent', 'field_agent'].includes(state.user.role) && lease.status === 'active') item.append(button('End lease', 'lease-end', 'button button-outline', { id: lease.id }));
    if (['master_agent', 'field_agent', 'finance', 'finance_manager', 'global_admin', 'super_admin'].includes(state.user.role) && lease.status === 'active' && Number(lease.deposit) > 0) item.append(button('Record deposit', 'deposit-pay', 'button button-outline', { id: lease.id }));
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

function renderRoleAccess() {
  if (state.user.role !== 'super_admin' || !state.roleAccess) return document.createDocumentFragment();
  const section = node('section', undefined, 'panel form-card role-access');
  section.append(
    node('h3', 'Role and activity access'),
    node('p', 'Select the activities each role may perform. Sensitive financial actions remain subject to transaction controls and independent-actor checks. Super Admin access is fixed.'),
  );
  const form = node('form', undefined, 'role-access-form');
  form.dataset.form = 'role-access';
  for (const role of state.roleAccess.roles.filter((entry) => entry.editable)) {
    const group = node('fieldset', undefined, 'role-access-group');
    group.append(node('legend', roleLabel(role.key)));
    const overrides = state.roleAccess.overrides[role.key] ?? {};
    for (const activity of state.roleAccess.activities) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.role = role.key;
      input.dataset.activity = activity.key;
      const defaults = activity.defaultRoles.includes(role.key)
        || (role.key === 'global_admin' && activity.defaultRoles.includes('super_admin'));
      input.checked = overrides[activity.key] ?? defaults;
      const label = node('label', `${activity.group} · ${activity.label}${activity.sensitive ? ' · Sensitive' : ''}`, 'role-access-option');
      label.prepend(input);
      group.append(label);
    }
    form.append(group);
  }
  form.append(button('Save role access', 'submit', 'button button-primary'));
  section.append(form);
  return section;
}

function renderReadinessEvidence() {
  const section = node('section', undefined, 'panel form-card');
  section.style.marginTop = '20px';
  section.append(node('h3', 'Production readiness evidence'));
  section.append(node('p', 'Append operational evidence for each service. Records are stored in the shared database and attributed to the signed-in administrator. An evidence record does not itself grant legal, provider, finance, or production authorization.'));
  const form = node('form', undefined, 'inline-form');
  form.dataset.form = 'readiness-evidence';
  form.append(
    field('Service / module', 'module', 'select', true).label,
    field('Evidence category', 'category', 'select', true).label,
    field('Owner / domain', 'owner', 'text', true, { placeholder: 'Legal, Finance, Provider, Ops, Security' }).label,
    field('Approver / reviewer', 'approver', 'text', true, { placeholder: 'Named approver' }).label,
    field('Status', 'status', 'select', true).label,
    field('Evidence reference', 'evidence_ref', 'text', true, { placeholder: 'contract, ticket, control ID, provider record' }).label,
    field('Environment', 'environment', 'select', true).label,
    field('Approval notes', 'notes', 'textarea', false, { rows: '3', placeholder: 'Required conditions, review outcome, or unresolved risk.' }).label,
  );
  const moduleSelect = form.elements.module;
  for (const value of ['platform', 'workforce', 'insurance', 'mfi', 'edir', 'property', 'marketplace', 'agency']) {
    const option = node('option', value.toUpperCase()); option.value = value; moduleSelect.append(option);
  }
  const category = form.elements.category;
  for (const value of ['legal', 'provider', 'finance', 'security', 'operations', 'accessibility', 'capacity', 'dr', 'incident', 'service_account', 'release_owner', 'privacy']) {
    const option = node('option', value.replaceAll('_', ' ')); option.value = value; category.append(option);
  }
  const statusSelect = form.elements.status;
  for (const value of ['open', 'evidence_recorded', 'blocked', 'not_applicable']) {
    const option = node('option', value.replaceAll('_', ' ')); option.value = value; statusSelect.append(option);
  }
  const environmentSelect = form.elements.environment;
  for (const value of ['production', 'staging', 'sandbox', 'development']) {
    const option = node('option', value); option.value = value; environmentSelect.append(option);
  }
  form.append(button('Record evidence', 'submit', 'button button-primary span-2'));
  section.append(form);
  const list = node('div', undefined, 'list');
  if (!state.readinessEvidence.length) list.append(empty('No operational-readiness evidence has been recorded yet.'));
  for (const entry of state.readinessEvidence) {
    const item = card(`${entry.module.toUpperCase()} · ${entry.category.replaceAll('_', ' ')} · ${entry.owner_name}`, `${entry.environment} · approver/reviewer ${entry.approver_name} · ${entry.status.replaceAll('_', ' ')}`, entry.status);
    item.append(node('p', `Recorded by ${entry.recorded_by_name} (${entry.recorded_by_role}) · ${new Date(entry.created_at).toLocaleString(document.documentElement.lang)}`));
    if (entry.evidence_reference) item.append(node('p', `Reference: ${entry.evidence_reference}`));
    if (entry.notes) item.append(node('p', entry.notes));
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderPlatformControlPlane() {
  const section = node('section', undefined, 'panel form-card');
  section.style.marginTop = '20px';
  section.append(node('h3', 'Tenant and service control plane'));
  section.append(node('p', 'Manage tenant registry, deployment references, service packages, and non-financial catalog products. Tenant database credentials and infrastructure secrets are never stored here. Tenant data remains authoritative in the tenant deployment. A separate read-only BI projection is a planned component and is not connected yet.'));

  const packageForm = node('form', undefined, 'inline-form');
  packageForm.dataset.form = 'platform-service-package';
  packageForm.append(
    field('Package key', 'package_key', 'text', true, { pattern: '[a-z][a-z0-9_-]{1,79}', placeholder: 'full-platform' }).label,
    field('Package name', 'display_name').label,
    field('Description', 'description', 'text', true, { maxlength: '1000' }).label,
  );
  const services = node('fieldset', undefined, 'span-2');
  services.append(node('legend', 'Services included'));
  for (const service of state.platformServices.filter((item) => item.available)) {
    const label = node('label', service.display_name);
    const check = node('input');
    check.type = 'checkbox';
    check.name = 'services';
    check.value = service.service_key;
    label.prepend(check);
    services.append(label);
  }
  packageForm.append(services, button('Create service package', 'submit', 'button button-primary span-2'));
  section.append(packageForm);

  const packageList = node('div', undefined, 'list');
  for (const item of state.platformServicePackages) {
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'platform-service-package-update';
    form.dataset.packageId = item.id;
    const active = field('Package active', 'active', 'select');
    for (const [value, labelText] of [['true', 'Yes'], ['false', 'No']]) {
      const option = node('option', labelText); option.value = value; active.input.append(option);
    }
    active.input.value = String(item.active);
    form.append(
      field('Package', 'display_name', 'text', true, { value: item.display_name }).label,
      field('Description', 'description', 'text', true, { value: item.description, maxlength: '1000' }).label,
      active.label,
    );
    const servicesField = node('fieldset', undefined, 'span-2');
    servicesField.append(node('legend', 'Included services'));
    for (const service of state.platformServices) {
      const label = node('label', service.display_name);
      const check = node('input');
      check.type = 'checkbox';
      check.name = 'services';
      check.value = service.service_key;
      check.checked = item.services.includes(service.service_key);
      check.disabled = !service.available && !check.checked;
      label.prepend(check);
      servicesField.append(label);
    }
    form.append(servicesField, button('Save package', 'submit', 'button button-outline span-2'));
    packageList.append(form);
  }
  if (!state.platformServicePackages.length) packageList.append(empty('No service packages are configured yet.'));
  section.append(packageList);

  const tenantForm = node('form', undefined, 'inline-form');
  tenantForm.dataset.form = 'platform-tenant';
  tenantForm.append(
    field('Tenant key', 'tenant_key', 'text', true, { pattern: '[a-z][a-z0-9-]{1,79}', placeholder: 'afrolife-legacy' }).label,
    field('Tenant name', 'display_name').label,
    field('Hosting mode', 'hosting_mode', 'select').label,
    field('Region (optional)', 'region', 'text', false, { maxlength: '120' }).label,
    field('Deployment reference (no URL or secret)', 'deployment_reference', 'text', false, { maxlength: '200', placeholder: 'deployment inventory reference' }).label,
    field('Service package', 'package_id', 'select').label,
  );
  for (const [value, labelText] of [['cloud', 'Cloud'], ['on_premises', 'On premises']]) {
    const option = node('option', labelText); option.value = value; tenantForm.elements.hosting_mode.append(option);
  }
  const packageSelect = tenantForm.elements.package_id;
  const packagePlaceholder = node('option', 'Choose service package'); packagePlaceholder.value = ''; packageSelect.append(packagePlaceholder);
  for (const item of state.platformServicePackages.filter((entry) => entry.active)) {
    const option = node('option', `${item.display_name} · ${item.services.length} services`); option.value = item.id; packageSelect.append(option);
  }
  tenantForm.append(button('Register tenant', 'submit', 'button button-primary span-2'));
  section.append(tenantForm);

  const serviceList = node('div', undefined, 'list');
  for (const service of state.platformServices) {
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'platform-service';
    form.dataset.serviceKey = service.service_key;
    const available = field('Available', 'available', 'select');
    for (const [value, labelText] of [['true', 'Yes'], ['false', 'No']]) {
      const option = node('option', labelText); option.value = value; available.input.append(option);
    }
    available.input.value = String(service.available);
    form.append(
      field('Service', 'display_name', 'text', true, { value: service.display_name }).label,
      field('Description', 'description', 'text', true, { value: service.description, maxlength: '1000' }).label,
      available.label,
      button('Save service', 'submit', 'button button-outline'),
    );
    serviceList.append(form);
  }
  section.append(serviceList);

  const tenants = node('div', undefined, 'list');
  if (!state.platformTenants.length) tenants.append(empty('No tenant deployments are registered yet.'));
  for (const tenant of state.platformTenants) {
    const item = card(
      `${tenant.display_name} · ${tenant.tenant_key}`,
      `${tenant.hosting_mode.replaceAll('_', ' ')} · ${tenant.region ?? 'region not set'} · deployment ${tenant.deployment_status} · configuration v${tenant.config_version}`,
      tenant.status,
    );
    item.append(node('p', `Packages: ${tenant.packages.map((entry) => entry.display_name).join(', ') || 'none'}`));
    if (tenant.deployment_reference) item.append(node('p', `Deployment reference: ${tenant.deployment_reference}`));
    if (tenant.deployment_verification_reference) item.append(node('p', `Verification evidence reference: ${tenant.deployment_verification_reference}`));
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'platform-tenant-update';
    form.dataset.tenantId = tenant.id;
    const status = field('Tenant status', 'status', 'select');
    for (const value of ['provisioning', 'active', 'suspended', 'retired']) {
      const option = node('option', value.replaceAll('_', ' ')); option.value = value; status.input.append(option);
    }
    status.input.value = tenant.status;
    const deployment = field('Deployment verification', 'deployment_status', 'select');
    for (const value of ['not_registered', 'registered', 'verified']) {
      const option = node('option', value.replaceAll('_', ' ')); option.value = value; deployment.input.append(option);
    }
    deployment.input.value = tenant.deployment_status;
    const verification = field(
      'Verification evidence reference (non-secret)',
      'deployment_verification_reference',
      'text',
      false,
      { maxlength: '200', value: tenant.deployment_verification_reference ?? '', placeholder: 'release or attestation record ID' },
    );
    verification.input.required = deployment.input.value === 'verified' && !tenant.deployment_verification_reference;
    deployment.input.addEventListener('change', () => {
      verification.input.required = deployment.input.value === 'verified' && !tenant.deployment_verification_reference;
    });
    const packageField = field('Service package', 'package_id', 'select', false);
    const none = node('option', 'Keep current packages'); none.value = ''; packageField.input.append(none);
    for (const entry of state.platformServicePackages.filter((candidate) => candidate.active)) {
      const option = node('option', entry.display_name); option.value = entry.id; packageField.input.append(option);
    }
    form.append(status.label, deployment.label, verification.label, packageField.label, button('Update tenant', 'submit', 'button button-outline'));
    item.append(form);
    tenants.append(item);
  }
  section.append(tenants);

  const productForm = node('form', undefined, 'inline-form');
  productForm.dataset.form = 'platform-catalog-product';
  productForm.append(
    field('Product key', 'product_key', 'text', true, { pattern: '[a-z][a-z0-9_-]{1,79}', placeholder: 'household-support-plan' }).label,
    field('Product name', 'display_name').label,
    field('Description', 'description', 'text', true, { maxlength: '2000' }).label,
    field('Catalog category', 'category', 'select').label,
  );
  for (const value of ['catalog', 'marketplace', 'service_addon']) {
    const option = node('option', value.replaceAll('_', ' ')); option.value = value; productForm.elements.category.append(option);
  }
  productForm.append(button('Create catalog product', 'submit', 'button button-primary span-2'));
  section.append(productForm);
  const products = node('div', undefined, 'list');
  if (!state.platformCatalogProducts.length) products.append(empty('No non-financial catalog products are configured.'));
  for (const product of state.platformCatalogProducts) {
    const item = card(`${product.display_name} · ${product.product_key}`, `${product.category} · ${product.description}`, product.status);
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'platform-catalog-product-update';
    form.dataset.productId = product.id;
    const status = field('Product status', 'status', 'select');
    for (const value of ['draft', 'active', 'retired']) {
      const option = node('option', value); option.value = value; status.input.append(option);
    }
    status.input.value = product.status;
    form.append(
      field('Name', 'display_name', 'text', true, { value: product.display_name }).label,
      field('Description', 'description', 'text', true, { value: product.description, maxlength: '2000' }).label,
      status.label,
      button('Save product', 'submit', 'button button-outline'),
    );
    item.append(form);
    products.append(item);
  }
  section.append(products);
  return section;
}

function renderAdmin() {
  const wrap = node('div');
  const isAdmin = isPlatformAdmin();
  const isGlobalAdmin = state.user.role === 'global_admin';
  const isBusinessManager=state.user.role==='corporate_business_manager';
  wrap.append(sectionHeading(isAdmin ? isGlobalAdmin ? 'Global administration' : 'Administration' : isBusinessManager ? 'Business manager workspace' : 'Compliance review', isAdmin ? isGlobalAdmin ? 'Manage system-wide configuration and review cross-module operations.' : 'Provision accounts and review the operational summary.' : isBusinessManager ? 'Manage business operations and review marketplace submissions.' : 'Review account verification before activation.'));
  if (isAdmin) wrap.append(createMiniAppAccessEditor(api, state.user, state.users));
  if (state.user.role === 'super_admin') wrap.append(renderRoleAccess());
  const columns = node('div', undefined, 'columns');
  if (isGlobalAdmin) wrap.append(renderBusinessRules());
  if (isGlobalAdmin) wrap.append(renderPlatformControlPlane());
  if (isAdmin) wrap.append(renderGlobalAdminPromotions());
  if (isAdmin) wrap.append(renderReadinessEvidence());
  if (isAdmin) {
    const identities = node('section', undefined, 'panel form-card');
    identities.style.marginTop = '20px';
    identities.append(node('h3', 'Service identity inventory'));
    identities.append(node('p', 'Record vault references and rotation evidence only. Never enter credential values or tokens. Rotation and retirement require a different platform administrator from the identity creator.'));
    const form = node('form', undefined, 'inline-form');
    form.dataset.form = 'service-identity';
    form.append(
      field('Identity name', 'name', 'text', true, { minlength: '3', maxlength: '200' }).label,
      field('Purpose', 'purpose', 'text', true, { minlength: '3', maxlength: '1000' }).label,
      field('Environment', 'environment', 'select').label,
      field('Owner', 'owner_user_id', 'select', false).label,
      field('Vault reference (not a secret)', 'secret_manager_reference', 'text', true, { placeholder: 'vault://team/service-account' }).label,
      field('Expiry date', 'expiry_date', 'date').label,
      field('Evidence', 'evidence', 'text', true, { minlength: '10', maxlength: '2000' }).label,
    );
    const env = form.elements.environment;
    for (const value of ['staging','production','development','sandbox']) {
      const option = node('option', value); option.value = value; env.append(option);
    }
    const owner = form.elements.owner_user_id;
    const noOwner = node('option', 'No named owner'); noOwner.value = ''; owner.append(noOwner);
    for (const user of state.users.filter((item) => item.active)) {
      const option = node('option', `${user.legal_name} · ${roleLabel(user.role)}`); option.value = user.id; owner.append(option);
    }
    form.append(button('Add service identity', 'submit', 'button button-primary span-2'));
    identities.append(form);
    if (!state.serviceIdentities.length) identities.append(empty('No service identities are registered.'));
    for (const identity of state.serviceIdentities) {
      const item = card(identity.name, `${identity.environment} · owner ${identity.owner_user_id ?? 'unassigned'} · expires ${identity.expiry_date ?? 'not set'} · rotated ${identity.rotated_at ?? 'never'}`, identity.status);
      item.append(node('p', `${identity.purpose} · ${identity.secret_manager_reference ?? 'Vault reference missing'}`));
      if (identity.status === 'active' && identity.created_by !== state.user.id) {
        const rotation = node('form', undefined, 'inline-form');
        rotation.dataset.form = 'service-identity-rotate';
        rotation.dataset.identity = identity.id;
        rotation.append(
          field('New vault reference', 'secret_manager_reference', 'text', true, { placeholder: 'vault://team/service-account' }).label,
          field('New expiry', 'expiry_date', 'date', true).label,
          field('Rotation evidence', 'evidence', 'text', true, { minlength: '10', maxlength: '2000' }).label,
          button('Record verified rotation', 'submit', 'button button-outline'),
        );
        item.append(rotation, button('Retire identity', 'service-identity-retire', 'button button-outline', { id: identity.id }));
      }
      const events = button('View lifecycle evidence', 'service-identity-events', 'button button-quiet', { id: identity.id });
      item.append(events);
      identities.append(item);
    }
    wrap.append(identities);
  }
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
    const specialization = field('Profile focus (optional; does not limit agent services)', 'service_specialization', 'select', false);
    for (const [value, label] of [['', 'General agent'], ['financial_service', 'Financial services focus'], ['growth_partnership', 'Growth & partnerships focus'], ['workforce_property', 'Workforce & property focus']]) {
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
  $('#workspace').dataset.panel = state.panel;
  $('.page-heading').dataset.panel = state.panel;
  document.querySelectorAll('.tab').forEach((tab) => {
    const isCurrent = tab.dataset.panel === state.panel;
    tab.classList.toggle('active', isCurrent);
    if (isCurrent) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  document.querySelectorAll('.workspace-nav-link[data-panel]').forEach((link) => {
    const isCurrent = link.dataset.panel === state.panel;
    link.classList.toggle('active', isCurrent);
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const additionalPanels = new Set([...document.querySelectorAll('#workspace-more-nav [data-panel]')].map((link) => link.dataset.panel));
  const moreButton = $('#mobile-workspace-more');
  const moreIsCurrent = additionalPanels.has(state.panel);
  moreButton?.classList.toggle('active', moreIsCurrent);
  if (moreIsCurrent) moreButton?.setAttribute('aria-current', 'page');
  else moreButton?.removeAttribute('aria-current');
  const panelTitles = {
    password: 'Account security',
    security: 'Account security',
    admin: 'Admin workspace',
    learning: 'Training & support',
    mfi: 'SACCO / MFI workspace',
    accounting: 'Financial Services',
    'global-bi': 'Global BI',
    edir: 'EthioLife Edir workspace',
    insurance: 'Insurance information',
    marketplace: 'Marketplace',
    leads: 'Leads',
    workers: 'Workers',
    requests: 'Requests & matching',
    properties: 'Properties',
    contracts: 'Contracts',
    commissions: 'Commissions',
    agents: 'Agent management',
    rent: 'Rent & deposits',
  };
  const pageTitle = $('#page-title');
  const logoSource = miniAppLogo(state.panel);
  pageTitle.replaceChildren();
  if (logoSource) {
    const logo = node('img', undefined, 'page-mini-app-logo');
    logo.src = logoSource;
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    pageTitle.append(logo);
  }
  pageTitle.append(document.createTextNode(t(panelTitles[state.panel] ?? 'Your workspace')));
  // Shared shell statistics describe agency activity, so keep them on the overview only.
  $('#stat-grid').hidden = state.panel !== 'overview';
  if (state.panel === 'mfi') {
    $('#workspace').replaceChildren(createMfiWorkspace(api, state.user));
    return;
  }
  if (state.panel === 'accounting') {
    $('#workspace').replaceChildren(createAccountingWorkspace(api,state.user));
    return;
  }
  if (state.panel === 'global-bi') {
    $('#workspace').replaceChildren(createGlobalBiWorkspace(api));
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
    insurance: renderInsurance,
    status: renderServiceStatus,
    leads: renderLeads,
    workers: renderWorkers,
    requests: renderRequests,
    learning: renderLearning,
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

function navigateToPanel(panel, { replace = false } = {}) {
  const tab = document.querySelector(`.tab[data-panel="${CSS.escape(panel)}"]`);
  if (!tab || tab.hidden || !KNOWN_PANELS.has(panel)) {
    showAlert('This workspace is unavailable for your account or deployment.', true);
    return;
  }
  if (panel === 'status') loadedPanels.delete(panel);
  state.panel = panel;
  const url = panelUrl(window.location.href, panel);
  if (replace) history.replaceState(null, '', url);
  else if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) history.pushState(null, '', url);
  renderPanel();
  void refresh(false);
}

async function submitForm(form) {
  const values = formData(form);
  if (form.dataset.form === 'role-access') {
    const changes = [...form.querySelectorAll('input[data-role][data-activity]')]
      .filter((input) => {
        const role = input.dataset.role;
        const activity = state.roleAccess.activities.find((entry) => entry.key === input.dataset.activity);
        const configured = state.roleAccess.overrides[role]?.[activity.key];
        const defaults = activity.defaultRoles.includes(role)
          || (role === 'global_admin' && activity.defaultRoles.includes('super_admin'));
        return input.checked !== (configured ?? defaults);
      })
      .map((input) => ({ role: input.dataset.role, activity: input.dataset.activity, enabled: input.checked }));
    if (!changes.length) {
      showAlert('Role access is already up to date.');
      return;
    }
    await api('/role-access', { method: 'PATCH', body: JSON.stringify({ changes }) });
    state.roleAccess = await api('/role-access');
    await refresh();
    showAlert('Role access saved.');
    return;
  }
  if (form.dataset.form === 'platform-service-package') {
    const selected = [...form.querySelectorAll('input[name="services"]:checked')].map((input) => input.value);
    await api('/platform/service-packages', {
      method: 'POST',
      body: JSON.stringify({
        package_key: values.package_key,
        display_name: values.display_name,
        description: values.description,
        services: selected,
      }),
    });
    form.reset();
    await refresh();
    showAlert('Service package created.');
    return;
  }
  if (form.dataset.form === 'platform-service-package-update') {
    const selected = [...form.querySelectorAll('input[name="services"]:checked')].map((input) => input.value);
    await api(`/platform/service-packages/${encodeURIComponent(form.dataset.packageId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        display_name: values.display_name,
        description: values.description,
        active: values.active === 'true',
        services: selected,
      }),
    });
    await refresh();
    showAlert('Service package configuration saved.');
    return;
  }
  if (form.dataset.form === 'platform-tenant') {
    if (!values.package_id) throw new Error('Choose a service package before registering a tenant.');
    const payload = { ...values };
    if (!payload.region) delete payload.region;
    if (!payload.deployment_reference) delete payload.deployment_reference;
    await api('/platform/tenants', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await refresh();
    showAlert('Tenant registered in provisioning state. Verify its deployment before activation.');
    return;
  }
  if (form.dataset.form === 'platform-service') {
    await api(`/platform/services/${encodeURIComponent(form.dataset.serviceKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        display_name: values.display_name,
        description: values.description,
        available: values.available === 'true',
      }),
    });
    await refresh();
    showAlert('Platform service configuration saved.');
    return;
  }
  if (form.dataset.form === 'platform-tenant-update') {
    const payload = {
      status: values.status,
      deployment_status: values.deployment_status,
      ...(values.package_id ? { package_id: values.package_id } : {}),
      ...(values.deployment_verification_reference ? { deployment_verification_reference: values.deployment_verification_reference } : {}),
    };
    await api(`/platform/tenants/${encodeURIComponent(form.dataset.tenantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    await refresh();
    showAlert('Tenant configuration saved.');
    return;
  }
  if (form.dataset.form === 'platform-catalog-product') {
    await api('/platform/catalog-products', {
      method: 'POST',
      body: JSON.stringify({
        product_key: values.product_key,
        display_name: values.display_name,
        description: values.description,
        category: values.category,
      }),
    });
    form.reset();
    await refresh();
    showAlert('Catalog product created in draft state. Activate it after review.');
    return;
  }
  if (form.dataset.form === 'platform-catalog-product-update') {
    const prior = state.platformCatalogProducts.find((item) => item.id === form.dataset.productId);
    if (!prior) throw new Error('Catalog product is no longer available; refresh and retry.');
    await api(`/platform/catalog-products/${encodeURIComponent(form.dataset.productId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        display_name: values.display_name,
        description: values.description,
        status: values.status,
        attributes: prior.attributes ?? {},
      }),
    });
    await refresh();
    showAlert('Catalog product updated.');
    return;
  }
  if (form.dataset.form === 'property-period-close') {
    const result = await api(`/finance/property-period-close?period=${encodeURIComponent(values.period)}`);
    state.propertyPeriodClose = result;
    renderPanel();
    showAlert('Period checks complete. Confirm all findings with Finance before close.');
    return;
  }
  if (form.dataset.form === 'service-identity') {
    const payload = { ...values };
    if (!payload.owner_user_id) delete payload.owner_user_id;
    if (!payload.expiry_date) delete payload.expiry_date;
    await api('/service-identities', { method: 'POST', body: JSON.stringify(payload) });
    await refresh();
    showAlert('Service identity recorded. No secret value was stored.');
    return;
  }
  if (form.dataset.form === 'service-identity-rotate') {
    await api(`/service-identities/${form.dataset.identity}/rotate`, { method: 'POST', body: JSON.stringify(values) });
    await refresh();
    showAlert('Rotation evidence recorded. The external secret manager remains authoritative for the credential.');
    return;
  }
  if (form.dataset.form === 'readiness-evidence') {
    const payload = {
      module: values.module,
      category: values.category,
      owner_name: values.owner.trim(),
      approver_name: values.approver.trim(),
      status: values.status,
      evidence_reference: values.evidence_ref.trim(),
      environment: values.environment,
      notes: values.notes?.trim() ?? '',
    };
    if (!payload.owner_name || !payload.approver_name || !payload.evidence_reference) {
      throw new Error('Owner, approver, and evidence reference are required.');
    }
    await api('/readiness-evidence', { method: 'POST', body: JSON.stringify(payload) });
    state.readinessEvidence = await api('/readiness-evidence');
    renderPanel();
    showAlert('Operational readiness evidence recorded in the shared database. This is evidence only and does not grant approval.');
    return;
  }
  if (form.dataset.form === 'learning-content') {
    const payload = { ...values };
    payload.audience_roles = [...form.querySelectorAll('input[name="audience_roles"]:checked')].map((input) => input.value);
    if (!payload.video_url) delete payload.video_url;
    const contentId = form.dataset.content;
    await api(contentId ? `/learning/content/${contentId}` : '/learning/content', {
      method: contentId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    await refresh();
    showAlert(contentId ? 'Training content updated.' : 'Training content saved.');
    return;
  }
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
      history.replaceState(null, '', panelUrl(window.location.href, state.panel));
      await refresh();
    }
    showAlert('Password updated successfully.');
    return;
  }
  if (form.dataset.form === 'insurance-request') {
    await api('/insurance/requests', {
      method: 'POST',
      body: JSON.stringify({
        product_interest: values.product_interest,
        message: values.message,
        consent: values.consent === 'on',
        agent_referral_consent: values.agent_referral_consent === 'on',
      }),
    });
    await refresh();
    showAlert('Your Insurance information request was submitted. It is not an application or policy.');
    return;
  }
  if (form.dataset.form === 'insurance-sandbox-create') {
    await api('/insurance/brokerage-sandbox/cases', {
      method: 'POST',
      body: JSON.stringify({ acknowledge_synthetic_only: values.acknowledge_synthetic_only === 'on' }),
    });
    state.insuranceSandboxCases = await api('/insurance/brokerage-sandbox/cases/mine');
    renderPanel();
    showAlert('Synthetic Insurance brokerage training case created; no live business activity occurred.');
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
    await api('/leases/workflow', { method: 'POST', body: JSON.stringify(payload) });
    await refresh(); showAlert('Lease draft created. Submit it for independent approval before collecting signatures or activating the unit.'); return;
  }
  if (form.dataset.form === 'lease-signature') {
    const file = form.querySelector('input[name="signature_document"]')?.files?.[0];
    if (!file) throw new Error('Choose a signature evidence file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('The signature evidence file must be 10 MB or smaller.');
    const query = new URLSearchParams({ party: form.dataset.party, signer_name: values.signer_name.trim() });
    await api(`/leases/${form.dataset.lease}/signature-documents?${query}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    await refresh();
    showAlert('Signature evidence uploaded. The file does not verify signer identity or legal validity.');
    return;
  }
  if (form.dataset.form === 'lease-notice') {
    const payload = {
      ...values,
      idempotency_key: form.dataset.idempotencyKey ??= crypto.randomUUID(),
    };
    await api(`/leases/${form.dataset.lease}/notices`, { method: 'POST', body: JSON.stringify(payload) });
    await refresh();
    showAlert('Operational notice record saved. This does not terminate the lease or establish legal validity.');
    return;
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
  } else if (form.dataset.form === 'lead-reassign') {
    await api(`/admin/leads/${form.dataset.lead}/reassign`, { method: 'POST', body: JSON.stringify(values) });
    await refresh(); showAlert('Lead reassigned and new ownership protection started.'); return;
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
    form.dataset.idempotencyKey ||= crypto.randomUUID();
    await api('/requests', { method: 'POST', headers: { 'Idempotency-Key': form.dataset.idempotencyKey }, body: JSON.stringify({
      ...values,
      rate_offered: number(values.rate_offered),
      min_experience: Number(values.min_experience || 0),
      territory_id: number(values.territory_id),
      skills_required: values.skills_required.split(',').map((value) => value.trim()).filter(Boolean),
      languages_required: values.languages_required.split(',').map((value) => value.trim()).filter(Boolean),
    }) });
    delete form.dataset.idempotencyKey;
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
      item.append(matchEvaluation(person.evaluation));
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

function matchEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== 'object') return document.createDocumentFragment();
  const details = document.createElement('details');
  details.className = 'match-breakdown';
  details.append(node('summary', 'Eligibility and scoring policy'));
  const list = node('ul');
  const labels = {
    worker_verified: 'Worker verification',
    worker_available: 'Worker availability',
    sector_matches: 'Service sector',
    current_national_id: 'Current national ID',
    current_police_clearance: 'Current police clearance',
    current_reference: 'Current reference',
    current_certificate: 'Current certificate',
    not_previously_proposed: 'Not already proposed for this request',
  };
  for (const [key, label] of Object.entries(labels)) {
    if (typeof evaluation.eligibility?.[key] !== 'boolean') continue;
    const required = key === 'current_reference' ? evaluation.eligibility.reference_required
      : key === 'current_certificate' ? evaluation.eligibility.certificate_required : true;
    const state = evaluation.eligibility[key] ? 'passed' : 'not present';
    list.append(node('li', `${label}: ${state}${required ? ' (required)' : ' (optional)'}`));
  }
  if (evaluation.scoring?.weights) {
    list.append(node('li', `Scoring policy: ${evaluation.policy_version ?? 'legacy'}`));
    for (const [factor, weight] of Object.entries(evaluation.scoring.weights)) {
      list.append(node('li', `${factor}: weight ${weight}`));
    }
  }
  if (evaluation.evaluated_at) {
    list.append(node('li', `Evaluated: ${new Date(evaluation.evaluated_at).toLocaleString()}`));
  }
  if (!list.children.length) list.append(node('li', 'Evaluation details are unavailable for this record.'));
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
      item.append(matchEvaluation(match.score_breakdown?._evaluation));
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
    if ($('#workspace-more-dialog').open) $('#workspace-more-dialog').close();
    navigateToPanel(workspaceLink.dataset.panel);
    return;
  }
  if (event.target.closest('#mobile-workspace-more')) {
    const moreButton = $('#mobile-workspace-more');
    $('#workspace-more-dialog').showModal();
    moreButton.setAttribute('aria-expanded', 'true');
    return;
  }
  const tab = event.target.closest('.tab[data-panel]');
  if (tab) { navigateToPanel(tab.dataset.panel); return; }
  const action = event.target.closest('button[data-action]');
  if (!action) return;
  const { action: name, id } = action.dataset;
  if (name === 'owner-statement-download') {
    try {
      const response = await fetch(`${apiRoot()}/owner/statements?format=csv`, {
        headers: { authorization: ['Bearer', sessionStorage.getItem(TOKEN_KEY)].join(' ') },
      });
      if (!response.ok) throw new Error(`Owner statement download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'owner-rent-statement.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showAlert(error.message, true);
    }
    return;
  }
  if (name === 'coa-template-download') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.propertyAccountingTemplate, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'property-chart-of-accounts-draft.json';
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (name === 'service-identity-retire') {
    const evidence = window.prompt(t('Enter retirement evidence (minimum 10 characters).'));
    if (!evidence || evidence.trim().length < 10) return;
    try {
      await api(`/service-identities/${id}/retire`, { method: 'POST', body: JSON.stringify({ evidence: evidence.trim() }) });
      await refresh();
      showAlert('Inventory marked retired. Revoke the credential in the external secret manager separately.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'service-identity-events') {
    try {
      const events = await api(`/service-identities/${id}/events`);
      const container = action.closest('.list-card');
      container.querySelector('.service-identity-events')?.remove();
      const evidence = node('div', undefined, 'service-identity-events');
      evidence.append(node('h4', 'Lifecycle evidence'));
      if (!events.length) evidence.append(empty('No lifecycle evidence is recorded.'));
      for (const entry of events) evidence.append(node('p', `${entry.action} · ${entry.created_at} · ${entry.actor_id} · ${entry.evidence}`));
      container.append(evidence);
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'open-panel') {
    navigateToPanel(action.dataset.panel);
    return;
  }
  const container = action.closest('.list-card');
  if (name === 'learning-edit') {
    const existing = container.querySelector('.learning-content-form');
    if (existing) { existing.remove(); return; }
    const content = state.learningContent.find((entry) => entry.id === id);
    if (content) container.append(createLearningForm(content));
    return;
  }
  if (name === 'learning-archive') {
    if (!window.confirm(t('Archive this training item? It will no longer appear to audiences.'))) return;
    try {
      await api(`/learning/content/${id}`, { method: 'DELETE' });
      await refresh();
      showAlert('Training content archived.');
    } catch (error) {
      showAlert(error.message, true);
    }
    return;
  }
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
  if (name === 'lead-attribution-history') {
    const existing = container.querySelector('.lead-attribution-events');
    if (existing) { existing.remove(); return; }
    const history = node('div', undefined, 'lead-attribution-events list');
    container.append(history);
    try {
      const events = await api(`/leads/${id}/attribution-history`);
      if (!events.length) history.append(empty('No attribution history is available.'));
      for (const item of events) {
        const label = item.event_type === 'created' ? 'Lead created' : 'Lead reassigned';
        history.append(card(label, `${item.prior_agent_id ? `${item.prior_agent_id} → ` : ''}${item.new_agent_id} · by ${item.actor_id} · ${new Date(item.created_at).toLocaleString(document.documentElement.lang)}${item.reason ? ` · ${item.reason}` : ''}`, item.event_type));
      }
    } catch (error) {
      history.append(empty(error.message));
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
  if (name === 'lease-submit-approval' || name === 'lease-approve') {
    const reason = window.prompt(t('Enter the reason (at least 10 characters).'));
    if (!reason || reason.trim().length < 10) return;
    const path = name === 'lease-submit-approval'
      ? `/leases/${id}/submit-for-approval`
      : `/leases/${id}/approve`;
    api(path, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) })
      .then(async () => {
        await refresh();
        showAlert(name === 'lease-submit-approval' ? 'Lease submitted for independent approval.' : 'Lease approved. Signature evidence is now required.');
      })
      .catch((error) => showAlert(error.message, true));
    return;
  }
  if (name === 'lease-execute') {
    const lease = state.leases.find((item) => item.id === id);
    if (!lease) return;
    const reason = window.prompt(t('Enter the execution reason (at least 10 characters).'));
    if (!reason || reason.trim().length < 10) return;
    const handoverDate = window.prompt(t('Enter the possession handover date (YYYY-MM-DD).'), lease.start_date);
    if (!handoverDate || !/^\d{4}-\d{2}-\d{2}$/.test(handoverDate)) return;
    if (!window.confirm(t('Confirm that the move-in inspection is complete and the handover date is correct.'))) return;
    api(`/leases/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reason.trim(),
        handover_date: handoverDate,
        move_in_inspection_completed: true,
      }),
    })
      .then(async () => {
        await refresh();
        showAlert('Lease activated and rent schedule created. Uploaded signature files are retained as evidence only.');
      })
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
        if (['master_agent', 'field_agent', 'finance', 'finance_manager', 'global_admin', 'super_admin'].includes(state.user.role) && ['due', 'overdue'].includes(charge.status)) row.append(button('Record rent payment', 'rent-record', 'button button-outline', { id: charge.id }));
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
  if (name === 'insurance-request-decision') {
    const responseNote = window.prompt(t('Enter the information response or closure reason (at least 10 characters).'));
    if (!responseNote || responseNote.trim().length < 10) return;
    try {
      await api(`/insurance/requests/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status: action.dataset.status, response_note: responseNote.trim() }),
      });
      await refresh();
      showAlert('Insurance information request updated.');
    } catch (error) {
      showAlert(error.message, true);
    }
    return;
  }
  if (name === 'insurance-referral-assign') {
    const item = action.closest('.list-card');
    const agentId = item?.querySelector(`[data-referral-agent="${CSS.escape(id)}"]`)?.value;
    const reason = item?.querySelector(`[data-referral-reason="${CSS.escape(id)}"]`)?.value;
    if (!agentId || !reason) { showAlert('Select an active Agent and assignment reason before assigning this referral.', true); return; }
    try {
      await api(`/insurance/requests/agent-referrals/${encodeURIComponent(id)}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agent_id: agentId, reason }),
      });
      await refresh();
      showAlert('Consent-based Insurance referral assigned.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-referral-status') {
    try {
      await api(`/insurance/requests/agent-referrals/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: action.dataset.status }),
      });
      await refresh();
      showAlert('Insurance referral activity updated.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-referral-withdraw') {
    if (!window.confirm(t('Withdraw permission for Agent follow-up? The Agent will immediately lose access to this referral.'))) return;
    try {
      await api(`/insurance/requests/agent-referrals/${encodeURIComponent(id)}/withdraw`, {
        method: 'POST',
        body: '{}',
      });
      await refresh();
      showAlert('Agent-sharing consent withdrawn.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-sandbox-run') {
    if (!window.confirm(t('Run a fully synthetic training lifecycle? No real insurer, customer, policy, claim, or payment will be contacted or created.'))) return;
    try {
      await api(`/insurance/brokerage-sandbox/cases/${encodeURIComponent(id)}/run-demo`, {
        method: 'POST',
        body: JSON.stringify({ scenario_run_id: crypto.randomUUID(), acknowledge_synthetic_only: true }),
      });
      state.insuranceSandboxCases = await api('/insurance/brokerage-sandbox/cases/mine');
      renderPanel();
      showAlert('Synthetic end-to-end brokerage lifecycle completed. No real business activity occurred.');
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-sandbox-view') {
    try {
      const events = await api(`/insurance/brokerage-sandbox/cases/${encodeURIComponent(id)}/events`);
      state.insuranceSandboxCases = state.insuranceSandboxCases.map((item) =>
        item.id === id ? { ...item, events } : item);
      renderPanel();
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-sandbox-compare') {
    const item = action.closest('.list-card');
    const category = item?.querySelector(`[data-sandbox-comparison="${CSS.escape(id)}"]`)?.value;
    try {
      const result = await api(`/insurance/brokerage-sandbox/cases/${encodeURIComponent(id)}/comparison?${new URLSearchParams({ category })}`);
      showAlert(result.notes.join(' '));
      const comparison = node('section', undefined, 'panel form-card');
      comparison.append(node('h3', 'Synthetic product comparison'));
      for (const product of result.products) {
        comparison.append(card(product.label,
          `ETB ${(product.monthlyPremiumMinor / 100).toFixed(2)} per synthetic month · ${product.features.join(', ')}`,
          'illustrative only'));
      }
      item.append(comparison);
    } catch (error) { showAlert(error.message, true); }
    return;
  }
  if (name === 'insurance-sandbox-quote') {
    const item = action.closest('.list-card');
    const productKey = item?.querySelector(`[data-sandbox-quote-product="${CSS.escape(id)}"]`)?.value;
    if (!productKey) { showAlert('Select a synthetic training product.', true); return; }
    try {
      let events = state.insuranceSandboxCases.find((sandboxCase) => sandboxCase.id === id)?.events;
      if (!events) {
        events = await api(`/insurance/brokerage-sandbox/cases/${encodeURIComponent(id)}/events`);
        state.insuranceSandboxCases = state.insuranceSandboxCases.map((sandboxCase) =>
          sandboxCase.id === id ? { ...sandboxCase, events } : sandboxCase);
      }
      const runId = events.find((event) => event.event_type === 'needs_assessment_simulated')?.scenario_run_id;
      if (!runId) throw new Error('Run the complete synthetic demo before simulating a quote.');
      const result = await api(`/insurance/brokerage-sandbox/cases/${encodeURIComponent(id)}/quotes`, {
        method: 'POST',
        body: JSON.stringify({
          scenario_run_id: runId,
          product_key: productKey,
          term_months: 12,
          acknowledge_synthetic_only: true,
        }),
      });
      showAlert(`Synthetic quote only, not an offer: ETB ${(result.quote.event_data.synthetic_monthly_premium_minor / 100).toFixed(2)} monthly. No cover or payment was created.`);
    } catch (error) { showAlert(error.message, true); }
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
$('#workspace-more-dialog').addEventListener('close', () => {
  $('#mobile-workspace-more')?.setAttribute('aria-expanded', 'false');
});
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

$('#workspace-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await searchWorkspace($('#workspace-search-input').value);
  } catch (error) {
    console.error('Workspace search failed.', error);
    $('#workspace-search-results').replaceChildren(node('p', 'Search could not be completed. Check your connection and try again.'));
    $('#workspace-search-results').hidden = false;
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener('popstate', () => {
  if (!state.user) return;
  const requested = panelFromUrl(window.location.href, KNOWN_PANELS);
  const panel = visiblePanelNames().has(requested) ? requested : 'overview';
  if (panel !== requested) history.replaceState(null, '', panelUrl(window.location.href, panel));
  if (panel !== state.panel) navigateToPanel(panel, { replace: true });
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
