export const WORKFORCE_PAYABLE_CALCULATION_MAX_ROWS = 500;
export const WORKFORCE_PAYROLL_EXPORT_MAX_ROWS = 2000;

export function exceedsWorkforcePayrollBatchLimit(rowCount: number, maximumRows: number): boolean {
  return rowCount > maximumRows;
}
