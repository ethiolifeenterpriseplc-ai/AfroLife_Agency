import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/csv.js';

test('plain values, commas, quotes and line breaks are escaped', () => {
  const out = toCsv([{ a: 'x', b: 'hello, "world"', c: 'line1\nline2' }], ['a', 'b', 'c']);
  assert.equal(out, 'a,b,c\r\nx,"hello, ""world""","line1\nline2"\r\n');
});
test('numbers (including negatives) and dates are written as they are', () => {
  assert.equal(toCsv([{ n: -5000, m: '12500.00', neg: '-30.50', d: new Date('2026-10-05T08:00:00Z') }], ['n', 'm', 'neg', 'd']), 'n,m,neg,d\r\n-5000,12500.00,-30.50,2026-10-05T08:00:00.000Z\r\n');
});
test('spreadsheet formulas are neutralised', () => {
  const row = toCsv([{ a: '=HYPERLINK("http://evil")', b: '+1+1', c: '@SUM(A1)', d: '-cmd|calc', e: 'normal' }], ['a', 'b', 'c', 'd', 'e']).split('\r\n')[1];
  assert.match(row, /^"'=HYPERLINK\(""http:\/\/evil""\)",'\+1\+1,'@SUM\(A1\),'-cmd\|calc,normal$/);
});
test('empty values are blank and an empty table still has its header', () => {
  assert.equal(toCsv([{ a: null, b: undefined }], ['a', 'b']), 'a,b\r\n,\r\n');
  assert.equal(toCsv([], ['a', 'b']), 'a,b\r\n');
});
