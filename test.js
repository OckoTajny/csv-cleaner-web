/* Tests for CSV Cleanroom. Run with: node test.js */
'use strict';

const assert = require('node:assert/strict');
const {
  stripBom,
  detectDelimiter,
  parseDelimited,
  toCsv,
  normalizeNumber,
  normalizeDate,
  snakeCase,
  makeHeaders,
  cleanCsv
} = require('./app.js');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('detects comma, semicolon, tab and pipe delimiters', () => {
  assert.equal(detectDelimiter('a,b\n1,2'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3\n4;5;6'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(detectDelimiter('a|b|c\n1|2|3'), '|');
  // Commas inside quoted fields must not win the vote.
  assert.equal(detectDelimiter('semi,quoted;value\n"a,b";c'), ';');
});

test('parses quoted fields, escaped quotes, embedded newlines and BOM', () => {
  const bom = stripBom('\uFEFFid,name');
  assert.equal(bom.hadBom, true);
  assert.equal(bom.text, 'id,name');

  const rows = parseDelimited(
    '\uFEFFid,name\r\n1,"Doe, Jane"\r\n2,"He said ""hi""\nnext"\r\n',
    ','
  );
  assert.deepEqual(rows, [
    ['id', 'name'],
    ['1', 'Doe, Jane'],
    ['2', 'He said "hi"\nnext']
  ]);
});

test('trims cells and converts decimal commas including European grouping', () => {
  const result = cleanCsv('name;amount;note\n  Ada  ; 1 234,50 ;  ok \nBob;89,9;x');
  assert.equal(result.delimiter, ';');
  assert.deepEqual(result.headers, ['name', 'amount', 'note']);
  assert.deepEqual(result.rows[0], ['Ada', '1234.50', 'ok']);
  assert.deepEqual(result.rows[1], ['Bob', '89.9', 'x']);
  assert.equal(result.stats.cellsTrimmed, 3);
  assert.equal(result.stats.decimalsFixed, 2);
  assert.equal(normalizeNumber(' 12,5 ').value, '12.5');
  assert.equal(normalizeNumber('1.234.567').value, '1234567');
  assert.equal(normalizeNumber('1.234').value, '1.234');
  assert.equal(normalizeNumber('n/a').changed, false);
});

test('normalizes common date formats to ISO and leaves invalid dates alone', () => {
  assert.equal(normalizeDate('05.01.2024', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('5.1.24', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('01/05/2024', 'MDY').value, '2024-01-05');
  assert.equal(normalizeDate('01/05/2024', 'DMY').value, '2024-05-01');
  assert.equal(normalizeDate('13/05/2024', 'MDY').value, '2024-05-13');
  assert.equal(normalizeDate('2024/1/5', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('2024-01-05 9:05', 'DMY').value, '2024-01-05T09:05:00');
  assert.equal(normalizeDate('Jan 5, 2024', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('5 January 2024', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('05-Jan-2024', 'DMY').value, '2024-01-05');
  assert.equal(normalizeDate('31.02.2024', 'DMY').changed, false);
  assert.equal(normalizeDate('hello', 'DMY').changed, false);
});

test('turns headers into unique ASCII snake_case names', () => {
  const result = makeHeaders(['Order ID', 'Zákazník', 'Částka (EUR)', 'Order ID', '2024']);
  assert.deepEqual(result.headers, [
    'order_id',
    'zakaznik',
    'castka_eur',
    'order_id_2',
    'col_2024'
  ]);
  assert.equal(result.renamed, 5);
  assert.equal(snakeCase('  Příliš žluťoučký kůň  '), 'prilis_zlutoucky_kun');
  assert.equal(snakeCase('---'), '');
});

test('removes duplicates after cleaning and counts repaired rows', () => {
  const result = cleanCsv(
    'name;amount;date\n' +
    'Ada;1,5;05.01.2024\n' +
    '  Ada ; 1,5 ; 2024-01-05\n' +
    'Bob;2;2024-01-06'
  );
  assert.equal(result.stats.inputRows, 3);
  assert.equal(result.stats.outputRows, 2);
  assert.equal(result.stats.duplicatesRemoved, 1);
  assert.equal(result.stats.repairedRows, 2);
  assert.deepEqual(result.rows[0], ['Ada', '1.5', '2024-01-05']);
  assert.deepEqual(result.rows[1], ['Bob', '2', '2024-01-06']);
});

test('writes RFC 4180 output that parses back to the same table', () => {
  const result = cleanCsv(
    'name,note,date\n' +
    '"Ada","likes, commas",2024-01-05\n' +
    '"Bob","said ""hi""",2024-01-06'
  );
  const csv = toCsv(result.headers, result.rows, ',');

  assert.equal(
    csv,
    'name,note,date\r\n' +
    'Ada,"likes, commas",2024-01-05\r\n' +
    'Bob,"said ""hi""",2024-01-06\r\n'
  );

  const parsed = parseDelimited(csv, ',');
  assert.deepEqual(parsed[0], result.headers);
  assert.deepEqual(parsed.slice(1), result.rows);
});

test('handles BOM, blank lines and ragged rows with accurate stats', () => {
  const input = '\uFEFFid;name;amount\r\n1;Ada;10\r\n\r\n2;Bob\r\n3;Cy;30;extra\r\n';
  const result = cleanCsv(input);

  assert.equal(result.hadBom, true);
  assert.equal(result.delimiter, ';');
  assert.equal(result.stats.emptyRowsRemoved, 1);
  assert.equal(result.stats.raggedRows, 2);
  assert.deepEqual(result.headers, ['id', 'name', 'amount']);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[1], ['2', 'Bob', '']);
  assert.deepEqual(result.rows[2], ['3', 'Cy', '30']);
});

let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok ${passed + failed} - ${name}`);
    console.error(String(error.message || error).split('\n').map((line) => '  ' + line).join('\n'));
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
if (failed) process.exitCode = 1;
