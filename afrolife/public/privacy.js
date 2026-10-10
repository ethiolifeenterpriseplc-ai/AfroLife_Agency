import { t } from './i18n.js';

function el(tag, value, className) {
  const item = document.createElement(tag);
  if (value) item.textContent = t(String(value));
  if (className) item.className = className;
  return item;
}

function field(labelText, name, type = 'text', required = true) {
  const label = el('label', labelText);
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  input.name = name;
  if (type !== 'textarea') input.type = type;
  input.required = required;
  label.append(input);
  return label;
}

function select(labelText, name, options) {
  const label = el('label', labelText);
  const input = document.createElement('select');
  input.name = name;
  input.required = true;
  for (const [value, text] of options) {
    const option = el('option', text);
    option.value = value;
    input.append(option);
  }
  label.append(input);
  return label;
}

export function createPrivacyWorkspace(api, user) {
  const root = el('div', undefined, 'workspace-stack');
  const staff = ['global_admin','super_admin','compliance'].includes(user.role);
  const canReportIncident = ['super_admin','compliance','finance','finance_manager'].includes(user.role);
  let requests = [];
  let incidents = [];
  const error = el('p', '', 'form-error');
  const notice = el('p', '', 'alert');

  function render() {
    root.replaceChildren();
    const intro = el('section', undefined, 'panel form-card');
    intro.append(el('h2','Personal data requests and incident tracking'));
    intro.append(el('p','Submit a request about your personal data or report a suspected privacy/security incident. Case tracking does not determine legal deadlines or whether external notification is required.'));
    root.append(intro);

    const requestForm = el('form', undefined, 'panel form-card inline-form');
    requestForm.dataset.privacyForm = 'request';
    requestForm.append(el('h3','New personal data request'));
    requestForm.append(select('Request type','request_type',[
      ['access','Access my data'],['correction','Correct my data'],['deletion','Delete my data'],
      ['portability','Provide a copy / portability'],['restriction','Restrict processing'],['objection','Object to processing'],['other','Other'],
    ]));
    requestForm.append(field('Describe the request (avoid passwords and payment credentials)','details','textarea'));
    requestForm.append(el('button','Submit request','button button-primary'));
    requestForm.querySelector('button').type = 'submit';
    root.append(requestForm);

    const requestList = el('section', undefined, 'panel form-card');
    requestList.append(el('h3', staff ? `Personal data requests (${requests.length})` : `Your requests (${requests.length})`));
    for (const request of requests) {
      const item = el('article', undefined, 'list-card');
      item.append(el('strong', `${request.request_type} · ${request.status}`));
      item.append(el('p', request.details));
      item.append(el('small', `Received ${new Date(request.received_at).toLocaleString(document.documentElement.lang)}`));
      if (request.response) item.append(el('p', `Response: ${request.response}`));
      if (staff && !['completed','declined','withdrawn'].includes(request.status)) {
        const form = el('form', undefined, 'inline-form');
        form.dataset.privacyForm = 'request-update';
        form.dataset.id = request.id;
        form.append(select('Update status','status',[
          ['in_review','In review'],['awaiting_requester','Awaiting requester'],['completed','Completed'],['declined','Declined'],
        ]));
        form.append(field('Response / case note','response','textarea', false));
        form.append(field('Assigned staff user ID','assigned_to','text', false));
        const button = el('button','Save request update','button button-outline'); button.type = 'submit';
        form.append(button);
        item.append(form);
      }
      requestList.append(item);
    }
    if (!requests.length) requestList.append(el('p','No personal data requests yet.'));
    root.append(requestList);

    if (canReportIncident) {
      const form = el('form', undefined, 'panel form-card inline-form');
      form.dataset.privacyForm = 'incident';
      form.append(el('h3','Report a privacy or security incident'));
      form.append(select('Incident type','incident_type',[
        ['unauthorized_access','Unauthorized access'],['loss','Loss'],['disclosure','Disclosure'],
        ['alteration','Alteration'],['unavailability','Unavailability'],['other','Other'],
      ]));
      form.append(select('Initial severity','severity', [['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']]));
      form.append(field('Short summary','summary'));
      form.append(field('What happened and what is known so far','details','textarea'));
      form.append(field('Types of data involved (do not include raw personal data)','affected_data'));
      form.append(field('Estimated number of affected people (optional)','affected_people_estimate','number',false));
      form.append(field('When it occurred (optional)','occurred_at','datetime-local',false));
      form.append(field('Containment steps taken (optional)','containment_actions','textarea',false));
      const button = el('button','Record incident','button button-primary'); button.type = 'submit';
      form.append(button);
      root.append(form);
    }
    if (staff) {
      const incidentList = el('section', undefined, 'panel form-card');
      incidentList.append(el('h3',`Privacy incidents (${incidents.length})`));
      for (const incident of incidents) {
        const item = el('article', undefined, 'list-card');
        item.append(el('strong',`${incident.reference} · ${incident.severity} · ${incident.status}`));
        item.append(el('p',incident.summary));
        item.append(el('p',`${incident.affected_data} · estimated people: ${incident.affected_people_estimate ?? 'unknown'}`));
        if (incident.outcome) item.append(el('p',`Outcome: ${incident.outcome}`));
        if (incident.status !== 'closed') {
          const form = el('form', undefined, 'inline-form');
          form.dataset.privacyForm = 'incident-update'; form.dataset.id = incident.id;
          form.append(select('Status','status', [['investigating','Investigating'],['contained','Contained'],['review','Review'],['closed','Closed']]));
          form.append(field('Containment actions (optional)','containment_actions','textarea',false));
          form.append(field('Outcome (required to close)','outcome','textarea',false));
          const button = el('button','Update incident','button button-outline'); button.type = 'submit'; form.append(button);
          item.append(form);
        }
        incidentList.append(item);
      }
      if (!incidents.length) incidentList.append(el('p','No privacy incidents recorded.'));
      root.append(incidentList);
    }
    root.prepend(notice, error);
  }

  async function load() {
    try {
      [requests, incidents] = await Promise.all([
        api('/privacy/requests'), staff ? api('/privacy/incidents') : Promise.resolve([]),
      ]);
      error.textContent = '';
    } catch (reason) { error.textContent = t(reason.message); }
    render();
  }

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-privacy-form]');
    if (!form) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const type = form.dataset.privacyForm;
    try {
      if (type === 'request') await api('/privacy/requests',{ method:'POST',body:JSON.stringify(values) });
      if (type === 'request-update') {
        if (values.assigned_to) values.assigned_to = values.assigned_to.trim(); else delete values.assigned_to;
        await api(`/privacy/requests/${form.dataset.id}`,{ method:'PATCH',body:JSON.stringify(values) });
      }
      if (type === 'incident') {
        if (values.affected_people_estimate) values.affected_people_estimate = Number(values.affected_people_estimate); else delete values.affected_people_estimate;
        if (values.occurred_at) values.occurred_at = new Date(values.occurred_at).toISOString(); else delete values.occurred_at;
        for (const key of ['containment_actions']) if (!values[key]) delete values[key];
        await api('/privacy/incidents',{ method:'POST',body:JSON.stringify(values) });
      }
      if (type === 'incident-update') {
        for (const key of ['containment_actions','outcome']) if (!values[key]) delete values[key];
        await api(`/privacy/incidents/${form.dataset.id}`,{ method:'PATCH',body:JSON.stringify(values) });
      }
      notice.textContent = t('Case update saved.');
      await load();
    } catch (reason) { error.textContent = t(reason.message); }
  });

  load();
  return root;
}
