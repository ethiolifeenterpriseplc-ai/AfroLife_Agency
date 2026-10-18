const el = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = String(text);
  if (className) item.className = className;
  return item;
};

export function normalizeAccountingTrendRows(monthly) {
  if (!Array.isArray(monthly)) return [];
  return monthly.filter((row) => row && typeof row.month === 'string' && row.month.length > 0);
}

function formatMonth(value) {
  const source = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);
  const date = new Date(`${source}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(date);
}

function renderMetricChart(rows, key, label, currencyCode) {
  const values = rows.map((row) => ({ month: row.month, rawValue: row[key], value: Number(row[key]) }))
    .filter((point) => Number.isFinite(point.value));
  if (!values.length) return null;
  const maxMagnitude = Math.max(1, ...values.map((point) => Math.abs(point.value)));
  const chart = el('section', undefined, 'finance-trend');
  chart.append(el('h3', label));
  const bars = el('ol', undefined, 'finance-bar-chart');
  bars.setAttribute('aria-label', `${label} by month for the selected entity`);

  for (const point of values) {
    const row = el('li', undefined, 'finance-chart-row');
    const track = el('span', undefined, 'finance-chart-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = el('span', undefined, `finance-chart-bar${key === 'posted_volume' ? ' is-volume' : ''}`);
    bar.style.width = `${Math.max(0, Math.min(100, Math.abs(point.value) / maxMagnitude * 100))}%`;
    track.append(bar);
    row.append(
      el('span', formatMonth(point.month), 'finance-chart-period'),
      track,
      el('span', key === 'posted_volume' ? `${currencyCode} ${point.rawValue}` : String(point.rawValue), 'finance-chart-value'),
    );
    bars.append(row);
  }
  chart.append(bars);
  return chart;
}

function renderAccessibleTable(rows, currencyCode) {
  const table = el('table', undefined, 'finance-data-table');
  table.append(el('caption', 'Monthly posted journal activity and volume'));
  const head = el('thead');
  const header = el('tr');
  for (const label of ['Month', 'Posted journals', `Posted volume (${currencyCode})`]) {
    const cell = el('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  head.append(header);
  const body = el('tbody');
  for (const row of rows) {
    body.append(el('tr', undefined, 'finance-data-row'));
    const tableRow = body.lastElementChild;
    tableRow.append(
      el('td', formatMonth(row.month)),
      el('td', row.posted_journals ?? 'Not reported'),
      el('td', row.posted_volume === undefined || row.posted_volume === null
        ? 'Not reported' : String(row.posted_volume)),
    );
  }
  table.append(head, body);
  const wrapper = el('div', undefined, 'finance-table-wrap');
  wrapper.append(table);
  return wrapper;
}

export function createAccountingTrend(api, getEntityId, getCurrencyCode) {
  const section = el('section', undefined, 'panel financial-trend-panel');
  section.append(
    el('h2', 'Monthly posting trends'),
    el('p', 'Posted journal activity and volume are shown for this entity only.'),
  );
  const status = el('p', 'Select an accounting entity to load its trend.', 'financial-dashboard-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const content = el('div');
  section.append(status, content);
  let requestSequence = 0;

  async function refresh() {
    const sequence = ++requestSequence;
    const entityId = getEntityId();
    content.replaceChildren();
    status.classList.remove('is-error');
    if (!entityId) {
      status.textContent = 'No accounting entity is selected.';
      return;
    }
    status.textContent = 'Loading this entity’s monthly trend…';
    try {
      const dashboard = await api(`/accounting/entities/${encodeURIComponent(entityId)}/dashboard`);
      if (sequence !== requestSequence || entityId !== getEntityId()) return;
      const rows = normalizeAccountingTrendRows(dashboard?.monthly);
      status.textContent = 'Trend data is scoped to the selected entity. Only returned monthly reporting rows are shown.';
      if (!rows.length) {
        content.append(el('p', 'No monthly trend data is available for this entity yet.', 'financial-empty'));
        return;
      }

      const currencyCode = getCurrencyCode() || 'ETB';
      const charts = [
        renderMetricChart(rows, 'posted_journals', 'Posted journals', currencyCode),
        renderMetricChart(rows, 'posted_volume', 'Posted volume', currencyCode),
      ].filter(Boolean);
      content.append(...charts);
      if (!charts.length) {
        content.append(el('p', 'The monthly response contains no usable posted journal or volume values.', 'financial-empty'));
      }
      content.append(renderAccessibleTable(rows, currencyCode));
    } catch (error) {
      if (sequence !== requestSequence) return;
      status.classList.add('is-error');
      status.textContent = `Could not load this entity’s trend: ${error?.message ?? 'request failed'}`;
      const retry = el('button', 'Retry monthly trend', 'button button-outline');
      retry.type = 'button';
      retry.addEventListener('click', () => void refresh());
      content.append(retry);
    }
  }

  return { element: section, refresh };
}
