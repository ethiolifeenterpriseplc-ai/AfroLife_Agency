import { z } from 'zod';

const amountPattern = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
export const mfiAmountSchema = z.string()
  .regex(amountPattern, 'Enter a positive ETB amount with up to two decimal places')
  .refine((value) => amountPattern.test(value) && decimalToCents(value) > 0n, 'Amount must be greater than zero');

export function decimalToCents(value: string): bigint {
  if (!amountPattern.test(value)) throw new TypeError('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function parseMfiAmount(value: unknown): string {
  return mfiAmountSchema.parse(value);
}

export function normalizeAmount(value: string): string {
  return centsToAmount(decimalToCents(value));
}

export function centsToAmount(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
