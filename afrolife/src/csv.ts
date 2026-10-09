type CsvValue = string | number | boolean | Date | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const numericText = /^-?\d+(?:\.\d+)?$/.test(raw);
  const protectedValue = typeof value === 'string' && !numericText && /^[\t\r ]*[=+\-@]/.test(raw)
    ? `'${raw}`
    : raw;
  return /[",\r\n]/.test(protectedValue)
    ? `"${protectedValue.replaceAll('"', '""')}"`
    : protectedValue;
}

export function toCsv<T extends Record<string, CsvValue>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const header = columns.map(cell).join(',');
  return [header, ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\r\n') + '\r\n';
}
