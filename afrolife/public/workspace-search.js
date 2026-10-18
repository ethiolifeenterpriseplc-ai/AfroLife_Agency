export const MIN_SEARCH_QUERY_LENGTH = 2;

export function searchWorkspaceRecords(query, records, limit = 30) {
  const term = String(query ?? '').trim().toLocaleLowerCase();
  if (term.length < MIN_SEARCH_QUERY_LENGTH) return [];

  const digits = term.replace(/\D/g, '');
  return records.filter((record) => {
    const textMatch = record.searchable.some((value) => String(value ?? '').toLocaleLowerCase().includes(term));
    const phoneMatch = digits.length >= 4
      && record.phones.some((phone) => String(phone ?? '').replace(/\D/g, '').includes(digits));
    return textMatch || phoneMatch;
  }).slice(0, limit);
}
