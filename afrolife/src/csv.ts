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

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;

  const pushValue = () => {
    row.push(value);
    value = '';
    closedQuote = false;
  };
  const pushRow = () => {
    pushValue();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += character;
      }
      continue;
    }

    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error('Malformed CSV: unexpected data after a quoted field');
    }
    if (character === ',') {
      pushValue();
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      pushRow();
    } else if (character === '"') {
      if (value.length) throw new Error('Malformed CSV: quote inside an unquoted field');
      quoted = true;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unterminated quoted field');
  if (value.length || row.length || closedQuote) pushRow();
  return rows;
}

export function selectCsvRows(input: string, oneBasedRowNumbers: readonly number[]): string {
  const parsed = parseCsv(input);
  const [headers, ...dataRows] = parsed;
  if (!headers?.length || dataRows.some((row) => row.length !== headers.length)) {
    throw new Error('Malformed CSV: rows must match the header width');
  }
  const uniqueRows = new Set(oneBasedRowNumbers);
  if (uniqueRows.size !== oneBasedRowNumbers.length
      || oneBasedRowNumbers.some((number) => !Number.isSafeInteger(number) || number < 1 || number > dataRows.length)) {
    throw new Error('CSV row selection must contain unique, valid one-based row numbers');
  }
  const selectedRows = oneBasedRowNumbers.map((number) => dataRows[number - 1]);
  const objects = selectedRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  return toCsv(objects, headers);
}
