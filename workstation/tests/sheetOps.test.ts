import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../shared/formula.ts';
import { applyEdits, hiddenRows, runOp } from '../shared/sheetOps.ts';
import { currentRegion, hasHeader } from '../shared/sheet.ts';

const sales = [
  ['Region', 'Rep', 'Amount'],
  ['North', 'Ana', '1200'],
  ['South', 'Ben', '800'],
  ['North', 'Ben', '400'],
  ['East', 'Ana', '300'],
  ['South', 'Ana', '=B9'],
  [''],
];
const all = { top: 0, left: 0, bottom: 6, right: 2 };
/** The sheet after the op, shown as a person sees it, for the given area. */
const shown = (
  rows: string[][],
  area: { top: number; left: number; bottom: number; right: number },
) => {
  const out: string[][] = [];
  for (let r = area.top; r <= area.bottom; r++) {
    const line: string[] = [];
    for (let c = area.left; c <= area.right; c++) line.push(evaluate(rows, r, c));
    out.push(line);
  }
  return out;
};

test('sheet ops: a pivot is live formulas beside the data, right and in order', () => {
  const result = runOp(sales, {
    op: 'pivot',
    source: all,
    rows: ['region'],
    values: [
      { fn: 'sum', of: 'Amount' },
      { fn: 'count', of: 'C' },
    ],
  });
  assert.ok(result.ok);
  assert.deepEqual(result.area, { top: 0, left: 4, bottom: 4, right: 6 });
  assert.deepEqual(result.overwrites, []);
  const after = applyEdits(sales, result.edits);
  assert.deepEqual(shown(after, result.area!), [
    ['Region', 'Sum of Amount', 'Count of Amount'],
    ['East', '300', '1'],
    ['North', '1600', '2'],
    ['South', '800', '2'],
    ['Total', '2700', '5'],
  ]);
  assert.equal(after[2][5], '=SUMIFS($C$2:$C$6, $A$2:$A$6, E3)');
  // It keeps up: change the data and the pivot changes with it.
  after[1][2] = '2000';
  assert.equal(evaluate(after, 2, 5), '2400');
  assert.match(result.summary, /Pivot of A1:C6 at E1:G5: sum of Amount, count of Amount by Region/);
});

test('sheet ops: a cross-tab, two-level groups, averages, and where it goes', () => {
  const cross = runOp(sales, {
    op: 'pivot',
    source: all,
    rows: ['Region'],
    columns: 'Rep',
    values: [{ fn: 'sum', of: 'Amount' }],
    at: 'A10',
  });
  assert.ok(cross.ok);
  assert.deepEqual(shown(applyEdits(sales, cross.edits), cross.area!), [
    ['Region', 'Ana', 'Ben', 'Total'],
    ['East', '300', '0', '300'],
    ['North', '1200', '400', '1600'],
    ['South', '0', '800', '800'],
    ['Total', '1500', '1200', '2700'],
  ]);
  const two = runOp(sales, {
    op: 'pivot',
    source: all,
    rows: ['Rep', 'Region'],
    values: [{ fn: 'average', of: 'Amount' }],
  });
  assert.ok(two.ok);
  assert.deepEqual(shown(applyEdits(sales, two.edits), two.area!), [
    ['Rep', 'Region', 'Average of Amount'],
    ['Ana', 'East', '300'],
    ['Ana', 'North', '1200'],
    ['Ana', 'South', '0'],
    ['Ben', 'North', '400'],
    ['Ben', 'South', '800'],
    ['Total', '', '540'],
  ]);
  // Put over existing cells, it says which.
  const over = runOp(sales, {
    op: 'pivot',
    source: all,
    rows: ['Rep'],
    values: [{ fn: 'max', of: 'Amount' }],
    at: 'B2',
  });
  assert.ok(over.ok);
  assert.ok(over.overwrites.includes('B2'));
});

test('sheet ops: sort, filter and total, and plain reasons when something is wrong', () => {
  const sorted = runOp(sales, {
    op: 'sort',
    source: all,
    by: [{ column: 'Amount', descending: true }],
  });
  assert.ok(sorted.ok);
  const after = applyEdits(sales, sorted.edits);
  assert.deepEqual(
    after.slice(0, 6).map((r) => r[0]),
    ['Region', 'North', 'South', 'North', 'East', 'South'],
  );
  assert.equal(after[0][2], 'Amount', 'the header stays put');

  const filtered = runOp(sales, { op: 'filter', source: all, column: 'Amount', test: '>500' });
  assert.ok(filtered.ok);
  assert.deepEqual(filtered.edits, []);
  assert.deepEqual([...hiddenRows(sales, filtered.filter)], [3, 4, 5]);
  assert.match(filtered.summary, /2 of 5 rows shown/);

  const totalled = runOp(sales, { op: 'total', source: all });
  assert.ok(totalled.ok);
  const t = applyEdits(sales, totalled.edits);
  assert.deepEqual([t[6][0], t[6][2], evaluate(t, 6, 2)], ['Total', '=SUM(C2:C6)', '2700']);

  const bad = runOp(sales, {
    op: 'pivot',
    source: all,
    rows: ['Country'],
    values: [{ fn: 'sum', of: 'Amount' }],
  });
  assert.deepEqual(bad, { ok: false, error: 'There is no column "Country" in A1:C6.' });
  const noValues = runOp(sales, { op: 'pivot', source: all, rows: ['Region'], values: [] });
  assert.equal(noValues.ok, false);
  assert.equal(runOp(sales, { op: 'explode' } as never).ok, false);
});

test('sheet ops: ⌘A takes the block around a cell, and a gap column does not hide the header', () => {
  const rows = [
    ['Region', 'Amount', '', 'Region', 'Total'],
    ['North', '5', '', 'North', '=SUMIF(A2:A3, D2, B2:B3)'],
    ['South', '7'],
    [],
    ['note'],
  ];
  assert.deepEqual(currentRegion(rows, 1, 0), { top: 0, left: 0, bottom: 2, right: 1 });
  assert.deepEqual(currentRegion(rows, 0, 4), { top: 0, left: 3, bottom: 1, right: 4 });
  assert.deepEqual(currentRegion(rows, 4, 0), { top: 4, left: 0, bottom: 4, right: 0 });
  assert.equal(hasHeader(rows, { top: 0, left: 0, bottom: 2, right: 4 }), true);
  const f = runOp(rows, {
    op: 'filter',
    source: { top: 0, left: 0, bottom: 2, right: 4 },
    column: 'Region',
    test: 'North',
  });
  assert.ok(f.ok);
  assert.deepEqual([...hiddenRows(rows, f.filter)], [2], 'the header row is never filtered out');
});
