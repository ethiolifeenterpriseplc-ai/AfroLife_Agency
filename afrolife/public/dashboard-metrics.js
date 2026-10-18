function countBy(rows, property) {
  const counts = new Map();
  for (const row of rows) {
    const value = typeof row?.[property] === 'string' && row[property] ? row[property] : 'unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

export function workforceDashboardMetrics(workers) {
  const rows = Array.isArray(workers) ? workers : [];
  return { total: rows.length, byVerification: countBy(rows, 'verification') };
}

export function staffingDashboardMetrics(requests) {
  const rows = Array.isArray(requests) ? requests : [];
  return { total: rows.length, byStatus: countBy(rows, 'status') };
}

export function propertyDashboardMetrics(properties) {
  const rows = Array.isArray(properties) ? properties : [];
  return {
    totalListings: rows.length,
    totalUnits: rows.reduce((total, property) => total + (Array.isArray(property?.units) ? property.units.length : 0), 0),
    byStatus: countBy(rows, 'status'),
  };
}
