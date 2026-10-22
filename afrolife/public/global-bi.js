const el = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = String(text);
  if (className) item.className = className;
  return item;
};

const localDateTimeValue = (date) => {
  const local = new Date(date);
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, '0'),
    String(local.getDate()).padStart(2, '0'),
  ].join('-') + `T${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
};

export function isGlobalBiUtcBucketBoundary(date) {
  return date instanceof Date && Number.isFinite(date.valueOf())
    && date.getUTCMinutes() % 30 === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0;
}

export function normalizeGlobalBiDashboard(payload) {
  if (!payload || typeof payload !== 'object'
      || !Array.isArray(payload.metrics) || !Array.isArray(payload.series)) {
    throw new Error('The Global BI service returned an unexpected response.');
  }

  const metrics = payload.metrics.filter((metric) =>
    metric && typeof metric.key === 'string'
      && (typeof metric.value === 'number' || typeof metric.value === 'string')
      && typeof metric.unit === 'string');
  const series = payload.series.filter((point) =>
    point && typeof point.period === 'string' && typeof point.metric === 'string'
      && (typeof point.value === 'number' || typeof point.value === 'string'));

  const targetIntervalMinutes = Number.isFinite(Number(payload.targetIntervalMinutes))
    ? Number(payload.targetIntervalMinutes) : null;
  const projectionStates = new Set([
    'not_configured', 'recent_projection_observed', 'stale', 'invalid_timestamp',
  ]);

  return {
    grain: payload.grain === '30_minutes' && targetIntervalMinutes === 30 ? '30_minutes' : null,
    targetIntervalMinutes,
    asOf: typeof payload.asOf === 'string' ? payload.asOf : null,
    oldestProjectionAt: typeof payload.oldestProjectionAt === 'string' ? payload.oldestProjectionAt : null,
    projectionState: projectionStates.has(payload.projectionState) ? payload.projectionState : 'unknown',
    projectorConfiguration: typeof payload.projectorConfiguration === 'string' ? payload.projectorConfiguration : 'unconfirmed',
    schedulerConfiguration: typeof payload.schedulerConfiguration === 'string' ? payload.schedulerConfiguration : 'unconfirmed',
    tenantProjectorHealth: 'unconfirmed',
    reportingTenants: (typeof payload.reportingTenants === 'number' || typeof payload.reportingTenants === 'string')
      && String(payload.reportingTenants).trim() !== ''
      && Number.isFinite(Number(payload.reportingTenants))
      ? Number(payload.reportingTenants) : null,
    metrics,
    series,
  };
}

function formatPeriod(period) {
  const source = /^\d{4}-\d{2}$/.test(period) ? `${period}-01T12:00:00Z` : period;
  const date = new Date(source);
  return Number.isNaN(date.getTime())
    ? period
    : new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(date);
}

function metricLabel(metric) {
  return metric.replaceAll(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderSeries(series, container) {
  if (!series.length) {
    container.append(el('p', 'No aggregate trend series is available for this reporting period.', 'bi-empty'));
    return;
  }

  const metrics = [...new Set(series.map((point) => point.metric))];
  const table = el('table', undefined, 'bi-data-table');
  const caption = el('caption', 'Aggregate trend values by reporting period');
  const head = el('thead');
  const headerRow = el('tr');
  for (const heading of ['Metric', 'Period', 'Value']) {
    const cell = el('th', heading);
    cell.scope = 'col';
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = el('tbody');

  for (const metric of metrics) {
    const points = series.filter((point) => point.metric === metric);
    const numericValues = points.map((point) => Number(point.value)).filter(Number.isFinite);
    const maxMagnitude = Math.max(1, ...numericValues.map(Math.abs));
    const section = el('section', undefined, 'bi-series-group');
    section.append(el('h3', metricLabel(metric)));
    const bars = el('ol', undefined, 'bi-series-chart');
    bars.setAttribute('aria-label', `${metricLabel(metric)} aggregate values by period`);

    for (const point of points) {
      const row = el('li', undefined, 'bi-series-row');
      const value = String(point.value);
      const parsed = Number(point.value);
      const label = el('span', formatPeriod(point.period), 'bi-series-period');
      const track = el('span', undefined, 'bi-series-track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('span', undefined, `bi-series-bar${Number.isFinite(parsed) && parsed < 0 ? ' is-negative' : ''}`);
      bar.style.width = Number.isFinite(parsed) ? `${Math.max(0, Math.min(100, Math.abs(parsed) / maxMagnitude * 100))}%` : '0%';
      track.append(bar);
      row.append(label, track, el('span', value, 'bi-series-value'));
      bars.append(row);

      const tableRow = el('tr');
      tableRow.append(el('td', metricLabel(metric)), el('td', formatPeriod(point.period)), el('td', value));
      body.append(tableRow);
    }

    section.append(bars);
    container.append(section);
  }

  table.append(caption, head, body);
  const tableWrap = el('div', undefined, 'bi-table-wrap');
  tableWrap.append(table);
  container.append(tableWrap);
}

export function createGlobalBiWorkspace(api) {
  const root = el('div', undefined, 'global-bi-workspace');
  root.append(
    el('p', 'GLOBAL · Read-only, aggregate-only analytics. Tenant data remains in separate authoritative data planes; this workspace has no direct tenant database access.', 'bi-intro bi-scope-banner'),
    el('p', 'Requested update cadence: every 30 minutes, using UTC-aligned buckets. The tenant-local projector and scheduler are not centrally configured or verified. A recent import is evidence of received data only, not proof of projector health or full tenant coverage.', 'bi-cadence-notice'),
  );

  const filterForm = el('form', undefined, 'bi-filter-form');
  const today = new Date();
  const toDefault = new Date(Math.floor(today.valueOf() / 1_800_000) * 1_800_000);
  const fromDefault = new Date(toDefault.valueOf() - 24 * 60 * 60_000);
  const fromLabel = el('label', 'From (local input; UTC buckets)');
  const fromInput = el('input');
  fromInput.type = 'datetime-local';
  fromInput.name = 'from';
  fromInput.required = true;
  fromInput.value = localDateTimeValue(fromDefault);
  fromLabel.append(fromInput);
  const toLabel = el('label', 'To (local input; UTC buckets)');
  const toInput = el('input');
  toInput.type = 'datetime-local';
  toInput.name = 'to';
  toInput.required = true;
  toInput.value = localDateTimeValue(toDefault);
  toLabel.append(toInput);
  const submit = el('button', 'Apply window', 'button button-primary');
  submit.type = 'submit';
  filterForm.append(fromLabel, toLabel, submit);
  root.append(filterForm);

  const status = el('p', 'Loading aggregate dashboard…', 'bi-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(status);
  const summary = el('section', undefined, 'bi-summary');
  summary.setAttribute('aria-label', 'Global BI reporting freshness and coverage');
  const metrics = el('section', undefined, 'bi-metrics');
  metrics.setAttribute('aria-label', 'Aggregate dashboard metrics');
  const trends = el('section', undefined, 'bi-trends');
  trends.setAttribute('aria-label', 'Aggregate dashboard trends');
  root.append(summary, metrics, trends);

  let sequence = 0;
  async function loadDashboard() {
    const requestNumber = ++sequence;
    const from = fromInput.value ? new Date(fromInput.value) : null;
    const to = toInput.value ? new Date(toInput.value) : null;
    if (!from || !to || !Number.isFinite(from.valueOf()) || !Number.isFinite(to.valueOf()) || from > to) {
      summary.replaceChildren();
      metrics.replaceChildren();
      trends.replaceChildren();
      status.textContent = 'Choose a valid reporting window. The start must be before the end.';
      status.classList.add('is-error');
      return;
    }
    if (!isGlobalBiUtcBucketBoundary(from) || !isGlobalBiUtcBucketBoundary(to)) {
      summary.replaceChildren();
      metrics.replaceChildren();
      trends.replaceChildren();
      status.textContent = 'Choose start and end times that align exactly to 30-minute UTC bucket boundaries.';
      status.classList.add('is-error');
      return;
    }

    status.textContent = 'Loading aggregate dashboard…';
    status.classList.remove('is-error');
    summary.replaceChildren();
    metrics.replaceChildren();
    trends.replaceChildren();

    try {
      const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const payload = normalizeGlobalBiDashboard(await api(`/global-bi/dashboard?${query}`));
      if (requestNumber !== sequence) return;

      status.textContent = `${payload.grain === '30_minutes' ? 'Confirmed 30-minute UTC buckets' : 'Bucket grain not reported'} from ${from.toISOString()} to ${to.toISOString()}. Figures are approved aggregates only.`;
      const summaryTitle = el('h2', 'Reporting coverage');
      const coverage = el('article', undefined, 'bi-coverage');
      coverage.append(
        el('span', 'Reporting tenants'),
        el('strong', payload.reportingTenants === null ? 'Not reported' : String(payload.reportingTenants)),
      );
      const freshness = el('article', undefined, 'bi-freshness');
      freshness.append(el('span', 'Latest received projection'));
      const asOfDate = payload.asOf ? new Date(payload.asOf) : null;
      freshness.append(el('strong', asOfDate && !Number.isNaN(asOfDate.getTime())
        ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', timeZoneName: 'short' }).format(asOfDate)
        : 'Not yet reported'));
      const cadence = el('article', undefined, `bi-freshness bi-projection-state is-${payload.projectionState.replaceAll('_', '-')}`);
      cadence.append(el('span', 'Projection status'));
      cadence.append(el('strong', payload.projectionState === 'recent_projection_observed'
        ? 'Recent data observed · health unconfirmed'
        : payload.projectionState === 'stale' ? 'No recent projection observed'
          : payload.projectionState === 'not_configured' ? 'No projection received'
            : payload.projectionState === 'invalid_timestamp' ? 'Invalid projection timestamp'
              : 'Not reported'));
      const projector = el('article', undefined, 'bi-freshness bi-scheduler-state');
      projector.append(el('span', 'Tenant projector configuration'), el('strong',
        payload.projectorConfiguration.replaceAll('_', ' ')));
      const scheduler = el('article', undefined, 'bi-freshness bi-scheduler-state');
      scheduler.append(el('span', 'Tenant scheduler configuration'), el('strong',
        payload.schedulerConfiguration.replaceAll('_', ' ')));
      const projectorHealth = el('article', undefined, 'bi-freshness bi-scheduler-state');
      projectorHealth.append(el('span', 'Tenant projector health'), el('strong',
        payload.tenantProjectorHealth.replaceAll('_', ' ')));
      summary.append(summaryTitle, coverage, freshness, cadence, projector, scheduler, projectorHealth);

      metrics.append(el('h2', 'Aggregate indicators'));
      if (!payload.metrics.length) {
        metrics.append(el('p', 'No aggregate indicators are available for this window. The tenant-local projector and 30-minute scheduler have not been confirmed. No sample or operational transaction data is shown.', 'bi-empty'));
      } else {
        const list = el('dl', undefined, 'bi-metric-list');
        for (const metric of payload.metrics) {
          const item = el('div', undefined, 'bi-metric');
          item.append(
            el('dt', metricLabel(metric.key)),
            el('dd', String(metric.value)),
            el('small', metric.unit),
          );
          list.append(item);
        }
        metrics.append(list);
      }

      trends.append(el('h2', 'Reporting trends'));
      renderSeries(payload.series, trends);
      if (!payload.metrics.length && !payload.series.length) {
        status.textContent = 'No aggregate projection data is available for this window. No sample or operational transaction data is shown.';
      }
    } catch (error) {
      if (requestNumber !== sequence) return;
      summary.replaceChildren();
      metrics.replaceChildren();
      trends.replaceChildren();
      status.classList.add('is-error');
      status.textContent = error?.status === 503
        ? 'Global BI is not configured or available yet. No cross-tenant analytics are being displayed.'
        : `Could not load the aggregate dashboard: ${error?.message ?? 'request failed'}`;
      const retry = el('button', 'Retry dashboard', 'button button-outline');
      retry.type = 'button';
      retry.addEventListener('click', () => void loadDashboard());
      trends.append(retry);
    }
  }

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadDashboard();
  });
  void loadDashboard();
  return root;
}
