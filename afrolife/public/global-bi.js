const el = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = String(text);
  if (className) item.className = className;
  return item;
};

const dateValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

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

  return {
    asOf: typeof payload.asOf === 'string' ? payload.asOf : null,
    reportingTenants: (typeof payload.reportingTenants === 'number' || typeof payload.reportingTenants === 'string')
      && String(payload.reportingTenants).trim() !== ''
      && Number.isFinite(Number(payload.reportingTenants))
      ? Number(payload.reportingTenants) : null,
    metrics,
    series,
  };
}

function formatPeriod(period) {
  const source = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period;
  const date = new Date(`${source.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? period
    : new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(date);
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
    el('p', 'A read-only, aggregate-only view across reporting tenants. No customer, member, transaction-row, or credential details are displayed.', 'bi-intro'),
  );

  const filterForm = el('form', undefined, 'bi-filter-form');
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const fromLabel = el('label', 'From date');
  const fromInput = el('input');
  fromInput.type = 'date';
  fromInput.name = 'from';
  fromInput.required = true;
  fromInput.value = dateValue(monthStart);
  fromLabel.append(fromInput);
  const toLabel = el('label', 'To date');
  const toInput = el('input');
  toInput.type = 'date';
  toInput.name = 'to';
  toInput.required = true;
  toInput.value = dateValue(today);
  toLabel.append(toInput);
  const submit = el('button', 'Apply period', 'button button-primary');
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
    const from = fromInput.value;
    const to = toInput.value;
    if (!from || !to || from > to) {
      summary.replaceChildren();
      metrics.replaceChildren();
      trends.replaceChildren();
      status.textContent = 'Choose a valid reporting period. The start date must be on or before the end date.';
      status.classList.add('is-error');
      return;
    }

    status.textContent = 'Loading aggregate dashboard…';
    status.classList.remove('is-error');
    summary.replaceChildren();
    metrics.replaceChildren();
    trends.replaceChildren();

    try {
      const query = new URLSearchParams({ from, to });
      const payload = normalizeGlobalBiDashboard(await api(`/global-bi/dashboard?${query}`));
      if (requestNumber !== sequence) return;

      status.textContent = `Reporting period ${from} to ${to}. Figures are limited to approved aggregate projections.`;
      const summaryTitle = el('h2', 'Reporting coverage');
      const coverage = el('article', undefined, 'bi-coverage');
      coverage.append(
        el('span', 'Reporting tenants'),
        el('strong', payload.reportingTenants === null ? 'Not reported' : String(payload.reportingTenants)),
      );
      const freshness = el('article', undefined, 'bi-freshness');
      freshness.append(el('span', 'Latest projection'));
      const asOfDate = payload.asOf ? new Date(payload.asOf) : null;
      freshness.append(el('strong', asOfDate && !Number.isNaN(asOfDate.getTime())
        ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(asOfDate)
        : 'Not yet reported'));
      summary.append(summaryTitle, coverage, freshness);

      metrics.append(el('h2', 'Aggregate indicators'));
      if (!payload.metrics.length) {
        metrics.append(el('p', 'No aggregate indicators are available for this period yet. The projection store may be empty or awaiting approved reporting data.', 'bi-empty'));
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
        status.textContent = 'No aggregate projection data is available for this period. No sample or operational transaction data is shown.';
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
