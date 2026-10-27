import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, selectCsvRows, toCsv } from '../src/csv.js';

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

test('CSV parsing preserves escaped quotes, embedded newlines, and row ordering', () => {
  const csv = toCsv([
    { worker: 'Ada, "A"', note: 'first line\nsecond line' },
    { worker: 'Bela', note: 'ok' },
  ], ['worker', 'note']);
  assert.deepEqual(parseCsv(csv), [
    ['worker', 'note'],
    ['Ada, "A"', 'first line\nsecond line'],
    ['Bela', 'ok'],
  ]);
  assert.equal(selectCsvRows(csv, [2]), toCsv([{ worker: 'Bela', note: 'ok' }], ['worker', 'note']));
});

test('CSV parser rejects malformed quoting and row selections', () => {
  assert.throws(() => parseCsv('a,b\r\n"unfinished,x'), /unterminated quoted field/);
  assert.throws(() => parseCsv('a,b\r\nx"y,z'), /quote inside an unquoted field/);
  assert.throws(() => selectCsvRows('a,b\r\nx,y\r\n', [0]), /unique, valid one-based/);
  assert.throws(() => selectCsvRows('a,b\r\nx,y\r\n', [1, 1]), /unique, valid one-based/);
});
