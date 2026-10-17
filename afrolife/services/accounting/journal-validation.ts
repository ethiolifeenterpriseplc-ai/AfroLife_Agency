import { HttpError } from '../../src/http-error.js';

export type JournalLineAmounts = {
  debit: string;
  credit: string;
};

export const MAX_JOURNAL_AMOUNT_CENTS = 999999999999999999n;

export function toCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function validateBalancedJournal(
  lines: JournalLineAmounts[],
  label = 'Journal',
): bigint {
  let debit = 0n;
  let credit = 0n;

  for (const line of lines) {
    const lineDebit = toCents(line.debit);
    const lineCredit = toCents(line.credit);
    if ((lineDebit > 0n) === (lineCredit > 0n)) {
      throw new HttpError(400, `Each ${label.toLowerCase()} line must contain either a debit or a credit`);
    }
    debit += lineDebit;
    credit += lineCredit;
  }

  if (debit === 0n || debit !== credit) {
    throw new HttpError(400, `${label} debits and credits must balance and be greater than zero`);
  }
  if (debit > MAX_JOURNAL_AMOUNT_CENTS) {
    throw new HttpError(400, `${label} exceeds the supported journal amount`);
  }

  return debit;
}
