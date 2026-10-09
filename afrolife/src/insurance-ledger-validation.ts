export interface InsuranceJournalLineInput {
  account_code: string;
  debit: string;
  credit: string;
}

function cents(value: string): bigint {
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) {
    throw new TypeError('Insurance journal amounts must be non-negative decimals with up to two fractional digits');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function normalized(value: string): string {
  const amount = cents(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

export function validateInsuranceJournalLines(lines: InsuranceJournalLineInput[]) {
  if (new Set(lines.map((line) => line.account_code)).size !== lines.length) {
    throw new TypeError('Each insurance journal account may appear only once');
  }
  let debit = 0n;
  let credit = 0n;
  const canonical = lines.map((line) => {
    const lineDebit = cents(line.debit);
    const lineCredit = cents(line.credit);
    if ((lineDebit > 0n) === (lineCredit > 0n)) {
      throw new TypeError('Each insurance journal line must contain either a debit or a credit');
    }
    debit += lineDebit;
    credit += lineCredit;
    return { account_code: line.account_code, debit: normalized(line.debit), credit: normalized(line.credit) };
  }).sort((a, b) => a.account_code.localeCompare(b.account_code));
  if (debit <= 0n || debit !== credit) {
    throw new TypeError('Insurance journal debits and credits must be equal and greater than zero');
  }
  return { lines: canonical, amount: `${debit / 100n}.${String(debit % 100n).padStart(2, '0')}` };
}
