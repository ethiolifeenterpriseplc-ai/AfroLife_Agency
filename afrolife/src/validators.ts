import { z } from 'zod';
import { normalizePhone } from './phone.js';

/** Accepts any common way of writing a phone number and yields the canonical +E.164 form. */
export const Phone = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0911 234 567 or +251 911 234 567' });
    return z.NEVER;
  }
  return p;
});
