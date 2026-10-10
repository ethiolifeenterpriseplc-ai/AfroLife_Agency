const MONEY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export function parseEdirMoney(value: unknown, allowZero = false): bigint {
  if (typeof value !== 'string' || !MONEY.test(value)) {
    throw new Error('Amount must be a decimal string with at most two fractional digits');
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (!allowZero && cents <= 0n) throw new Error('Amount must be greater than zero');
  return cents;
}

export function formatEdirMoney(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function edirCashPostings(direction: 'deposit' | 'withdrawal' | 'contribution', amount: string) {
  if (direction === 'withdrawal') {
    return [
      { account: 'member' as const, debit: amount, credit: '0.00' },
      { account: 'cash' as const, debit: '0.00', credit: amount },
    ];
  }
  return [
    { account: 'cash' as const, debit: amount, credit: '0.00' },
    { account: 'member' as const, debit: '0.00', credit: amount },
  ];
}
