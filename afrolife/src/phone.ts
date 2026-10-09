// Pure phone helpers (no framework imports). Everything is stored as E.164 so "0911 234 567",
// "911234567" and "+251 911 234 567" are the same person: duplicate-lead and login checks depend on this.

/** Returns +251XXXXXXXXX for Ethiopian numbers (mobile 9x/7x, landline 1-5x), a +E.164 string for other countries, or null. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s\-().]/g, '');
  let d: string;
  if (/^\+251\d{9}$/.test(s)) d = s.slice(4);
  else if (/^00251\d{9}$/.test(s)) d = s.slice(5);
  else if (/^251\d{9}$/.test(s)) d = s.slice(3);
  else if (/^0\d{9}$/.test(s)) d = s.slice(1);
  else if (/^\d{9}$/.test(s)) d = s;
  else if (/^\+(?!251)[1-9]\d{7,14}$/.test(s)) return s;
  else return null;
  return /^[1-579]/.test(d) ? '+251' + d : null;
}
