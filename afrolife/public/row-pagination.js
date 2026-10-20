const PAGE_SIZES = [10, 25, 50, 100];

export function paginateRows(rows, requestedSize, requestedPage = 1) {
  const pageSize = PAGE_SIZES.includes(Number(requestedSize)) ? Number(requestedSize) : PAGE_SIZES[0];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(Number(requestedPage) || 1)));
  const start = (page - 1) * pageSize;
  return { page, pageSize, pageCount, start, end: Math.min(start + pageSize, rows.length) };
}
