export const WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS = 500;
export const WORKFORCE_PAYROLL_EXPORT_MAX_ROWS = 2000;

export function takeWorkforcePayrollBatch<T>(rows: readonly T[], maximumRows: number): {
  rows: T[];
  hasMore: boolean;
} {
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1) {
    throw new RangeError('Workforce payroll batch size must be a positive integer');
  }
  return {
    rows: rows.slice(0, maximumRows),
    hasMore: rows.length > maximumRows,
  };
}
