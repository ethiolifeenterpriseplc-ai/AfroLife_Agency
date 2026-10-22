function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = String(text);
  if (className) item.className = className;
  return item;
}

function checklist(title, steps) {
  const section = element('section', undefined, 'panel tenant-data-checklist');
  section.append(element('h3', title));
  const list = element('ol');
  for (const step of steps) list.append(element('li', step));
  section.append(list);
  return section;
}

export function createTenantDataAdminWorkspace(
  api,
  assignments,
  selectedTenantId,
  workspace,
  analyticsStatus,
  onTenantChange,
) {
  const root = element('div', undefined, 'tenant-data-admin-workspace');
  const heading = element('div', undefined, 'section-heading');
  const title = element('div');
  title.append(element('h2', 'Tenant data administration'));
  title.append(element('p', 'Scoped operational metadata and review requests. Database operations remain with your tenant operator.'));
  heading.append(title);
  root.append(heading);

  const selectorLabel = element('label', 'Select an assigned tenant');
  selectorLabel.htmlFor = 'tenant-data-admin-tenant';
  const selector = element('select');
  selector.id = 'tenant-data-admin-tenant';
  selector.append(new Option('Choose a tenant', ''));
  for (const assignment of assignments) {
    const option = new Option(
      `${assignment.display_name} · ${assignment.capabilities.join(', ').replaceAll('_', ' ')}`,
      assignment.tenant_id,
    );
    selector.append(option);
  }
  selector.value = selectedTenantId ?? '';
  selector.addEventListener('change', () => {
    if (assignments.some((assignment) => assignment.tenant_id === selector.value)) {
      void onTenantChange(selector.value);
    }
  });
  const scopeSelector = element('div', undefined, 'field tenant-data-tenant-select');
  scopeSelector.append(selectorLabel, selector);
  root.append(scopeSelector);

  const assignment = assignments.find((item) => item.tenant_id === selectedTenantId);
  if (!assignment) {
    const empty = element('section', undefined, 'panel');
    empty.append(element('p', assignments.length
      ? 'Choose one of your assigned tenants to open its scoped workspace.'
      : 'No active tenant data-administrator assignment is available for this account.'));
    root.append(empty);
    return root;
  }

  const scopeBanner = element('div', undefined, 'tenant-data-scope-banner');
  scopeBanner.setAttribute('role', 'status');
  scopeBanner.append(
    element('span', 'TENANT SCOPE'),
    element('strong', workspace?.tenant?.name ?? assignment.display_name),
    element('span', 'Only this selected tenant is in scope. Global BI and other tenants are not available here.'),
  );
  root.append(scopeBanner);

  if (!workspace) {
    const failed = element('section', undefined, 'panel');
    failed.append(element('p', 'Tenant workspace metadata could not be loaded. Use Refresh to retry.'));
    root.append(failed);
    return root;
  }

  const metadata = element('section', undefined, 'panel tenant-data-metadata');
  metadata.append(element('h3', 'Deployment metadata · read only'));
  const facts = element('dl');
  const details = [
    ['Hosting model', workspace.tenant.hosting_mode === 'on_premises' ? 'On-premises' : 'Cloud managed'],
    ['Region', workspace.tenant.region ?? 'Not reported'],
    ['Deployment status', workspace.tenant.deployment_status ?? 'Not reported'],
    ['Configuration version', workspace.tenant.config_version ?? 'Not reported'],
    ['Metadata updated', workspace.tenant.updated_at ? new Date(workspace.tenant.updated_at).toLocaleString() : 'Not reported'],
  ];
  for (const [label, value] of details) {
    facts.append(element('dt', label), element('dd', value));
  }
  metadata.append(facts, element('p', 'No database endpoints, credentials, raw records, or direct tenant database connection are provided.'));
  root.append(metadata);

  if (assignment.capabilities.includes('analytics_admin')) {
    const analytics = element('section', undefined, 'panel tenant-data-analytics');
    analytics.append(element('h3', 'Tenant-local analytics'));
    analytics.append(element('p', analyticsStatus?.message
      ?? 'Tenant-local analytics projector is not connected. No tenant analytics are available from the central platform.'));
    analytics.append(element('p', `Projection grain: ${analyticsStatus?.grain ?? '30 minutes'} · UTC. Status: ${analyticsStatus?.projector_status ?? 'not connected'}; health unconfirmed.`));
    analytics.append(element('p', 'This view does not query Global BI or expose cross-tenant totals.'));
    root.append(analytics);
  }

  if (assignment.capabilities.includes('database_admin')) {
    root.append(checklist('Migration preflight', [
      'Confirm tenant change approval, operator identity, and maintenance window.',
      'Compare the migration manifest and checksums with the tenant-approved baseline; investigate drift.',
      'Confirm a tenant-local backup and restore-tested recovery point before any approved change.',
    ]));
    root.append(checklist('Backup and restore review', [
      'Review tenant-local encryption, retention, recovery objectives, and the latest successful backup evidence.',
      'Have the tenant operator restore into an isolated environment and verify integrity and application checks.',
      'Record validation, RPO/RTO evidence, and operator sign-off in the tenant evidence store.',
    ]));

    const requestPanel = element('section', undefined, 'panel tenant-data-request');
    requestPanel.append(element('h3', 'Request operator review'));
    requestPanel.append(element('p', 'Submitting records a request only. No migration, SQL, backup, restore, or database change is executed.'));
    const form = element('form');
    form.className = 'tenant-data-request-form';
    const typeLabel = element('label', 'Review type');
    const type = element('select');
    type.name = 'request_type';
    for (const [value, label] of [
      ['migration_review', 'Migration review'],
      ['backup_restore_review', 'Backup / restore review'],
      ['database_change_review', 'Database change review'],
    ]) type.append(new Option(label, value));
    typeLabel.append(type);
    const summaryLabel = element('label', 'Request summary');
    const summary = element('textarea');
    summary.name = 'summary';
    summary.required = true;
    summary.minLength = 10;
    summary.maxLength = 1000;
    summary.placeholder = 'Describe the review needed; do not include SQL, credentials, or connection details.';
    summaryLabel.append(summary);
    const evidenceLabel = element('label', 'Non-secret evidence reference (optional)');
    const evidence = element('input');
    evidence.type = 'text';
    evidence.name = 'evidence_reference';
    evidence.maxLength = 200;
    evidenceLabel.append(evidence);
    const submit = element('button', 'Create review request', 'button button-primary');
    submit.type = 'submit';
    const feedback = element('p');
    feedback.setAttribute('aria-live', 'polite');
    form.append(typeLabel, summaryLabel, evidenceLabel, submit, feedback);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      feedback.textContent = '';
      try {
        const body = {
          request_type: type.value,
          summary: summary.value,
          ...(evidence.value.trim() ? { evidence_reference: evidence.value.trim() } : {}),
        };
        const result = await api(`/platform/my-data/${encodeURIComponent(assignment.tenant_id)}/operator-requests`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        feedback.textContent = `Review request recorded (${result.id}). Execution: not performed.`;
        form.reset();
      } catch (error) {
        feedback.textContent = error?.message ?? 'The review request could not be recorded.';
      } finally {
        submit.disabled = false;
      }
    });
    requestPanel.append(form);
    root.append(requestPanel);
  }
  return root;
}
