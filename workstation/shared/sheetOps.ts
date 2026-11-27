/**
 * Sheet operations: pivot, sort, filter and total, run by code on the real cells. An agent (or a
 * person, from the sheet's menu) says what to do; this works out exactly which cells change. Every
 * number a pivot or total shows is a formula over the source cells, so it is right by construction
 * and keeps up when the data changes.
 */
import { colIndex, colName, evaluate, matcher, toNumber } from './formula.ts';
import { hasHeader, MAX_COLS, MAX_ROWS, rangeName, shiftFormula, trimRange } from './sheet.ts';
import type { CellRange, SheetFilter } from './types.ts';

export type Fn = 'sum' | 'count' | 'average' | 'min' | 'max';
export const FNS: Fn[] = ['sum', 'count', 'average', 'min', 'max'];

/** Columns are named by letter ("D") or, when the block has a header row, by name ("Amount"). */
export type SheetOp =
  | {
      op: 'pivot';
      source: CellRange;
      /** One or two columns to group by, down the side. */
      rows: string[];
      /** A column to spread across the top (a cross-tab). Then only the first value is used. */
      columns?: string | null;
      values: { fn: Fn; of: string }[];
      /** Top-left cell to put it at, like "H2". Default: the first clear columns right of the data. */
      at?: string | null;
    }
  | { op: 'sort'; source: CellRange; by: { column: string; descending?: boolean }[] }
  | { op: 'filter'; source: CellRange; column: string; test: string }
  | { op: 'clear-filter' }
  | { op: 'total'; source: CellRange; fn?: Fn; columns?: string[] | null };

export type Edit = { row: number; col: number; value: string };
export type OpResult =
  | {
      ok: true;
      edits: Edit[];
      /** The cells it writes, to show and to keep for a refresh. */
      area: CellRange | null;
      /** Cells that held something and would be written over, by name. */
      overwrites: string[];
      /** One line saying what it did, for the page feed and the person approving it. */
      summary: string;
      /** filter and clear-filter set the sheet's filter instead of writing cells. */
      filter?: SheetFilter | null;
    }
  | { ok: false; error: string };

const FN_LABEL: Record<Fn, string> = {
  sum: 'Sum',
  count: 'Count',
  average: 'Average',
  min: 'Min',
  max: 'Max',
};
const FN_IF: Record<Fn, string> = {
  sum: 'SUMIFS',
  count: 'COUNTIFS',
  average: 'AVERAGEIFS',
  min: 'MINIFS',
  max: 'MAXIFS',
};
const FN_PLAIN: Record<Fn, string> = {
  sum: 'SUM',
  count: 'COUNT',
  average: 'AVERAGE',
  min: 'MIN',
  max: 'MAX',
};

const fail = (error: string): OpResult => ({ ok: false, error });
const fixed = (col: number, row: number) => `$${colName(col)}$${row + 1}`;
const span = (col: number, top: number, bottom: number) =>
  `${fixed(col, top)}:${fixed(col, bottom)}`;

/** The block's columns, what each is called, and where its data rows start. */
function frame(rows: string[][], source: CellRange) {
  const headed = hasHeader(rows, source);
  const names = new Map<number, string>();
  for (let c = source.left; c <= source.right; c++)
    names.set(c, headed ? evaluate(rows, source.top, c).trim() : colName(c));
  const first = headed ? source.top + 1 : source.top;
  // Trailing empty rows in the selection are not data.
  let last = source.bottom;
  while (
    last >= first &&
    Array.from({ length: source.right - source.left + 1 }).every(
      (_, i) => !(rows[last]?.[source.left + i] ?? '').trim(),
    )
  )
    last--;
  const find = (spec: string): number | null => {
    const s = spec.trim();
    for (const [c, name] of names) if (name.toLowerCase() === s.toLowerCase()) return c;
    if (/^[A-Za-z]{1,2}$/.test(s)) {
      const c = colIndex(s);
      if (c >= source.left && c <= source.right) return c;
    }
    return null;
  };
  return { headed, names, first, last, find };
}

function checkSource(source: CellRange | undefined): string | null {
  if (!source) return 'Choose the cells to work on.';
  if (source.top < 0 || source.left < 0 || source.bottom >= MAX_ROWS || source.right >= MAX_COLS)
    return 'Those cells are outside the sheet.';
  if (source.top > source.bottom || source.left > source.right)
    return 'That range is back to front.';
  return null;
}

/** The right-most column holding anything, in any row. */
const usedWidth = (rows: string[][]) =>
  Math.max(0, ...rows.map((r) => r.reduceRight((w, c, i) => (w || !c.trim() ? w : i + 1), 0)));

function parseCell(at: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,2})\$?(\d{1,3})$/.exec(at.trim());
  if (!m) return null;
  return { row: Number(m[2]) - 1, col: colIndex(m[1]) };
}

/** Group values in a column, in sort order: numbers by size, text alphabetically, blanks last. */
function keys(rows: string[][], col: number, first: number, last: number): string[] {
  const seen = new Map<string, string>();
  for (let r = first; r <= last; r++) {
    const v = evaluate(rows, r, col).trim();
    const k = v.toLowerCase();
    if (!seen.has(k)) seen.set(k, v);
  }
  return [...seen.values()].sort((a, b) => {
    if (!a || !b) return !a === !b ? 0 : !a ? 1 : -1;
    const x = toNumber(a);
    const y = toNumber(b);
    return x !== null && y !== null
      ? x - y
      : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** Writes a block of cells and notes anything it would write over. */
function writer(rows: string[][]) {
  const edits: Edit[] = [];
  const overwrites: string[] = [];
  return {
    edits,
    overwrites,
    put(row: number, col: number, value: string) {
      if ((rows[row]?.[col] ?? '').trim()) overwrites.push(`${colName(col)}${row + 1}`);
      edits.push({ row, col, value });
    },
  };
}

function pivot(rows: string[][], op: Extract<SheetOp, { op: 'pivot' }>): OpResult {
  const f = frame(rows, op.source);
  if (f.last < f.first) return fail('There are no rows of data in those cells.');
  const groupCols: number[] = [];
  for (const spec of op.rows ?? []) {
    const c = f.find(spec);
    if (c === null) return fail(`There is no column "${spec}" in ${rangeName(op.source)}.`);
    groupCols.push(c);
  }
  if (!groupCols.length || groupCols.length > 2) return fail('Group by one or two columns.');
  const across = op.columns ? f.find(op.columns) : null;
  if (op.columns && across === null)
    return fail(`There is no column "${op.columns}" in ${rangeName(op.source)}.`);
  const values: { fn: Fn; col: number }[] = [];
  for (const v of op.values ?? []) {
    if (!FNS.includes(v.fn)) return fail(`"${v.fn}" is not one of ${FNS.join(', ')}.`);
    const c = f.find(v.of);
    if (c === null) return fail(`There is no column "${v.of}" in ${rangeName(op.source)}.`);
    values.push({ fn: v.fn, col: c });
  }
  if (!values.length) return fail('Say what to add up, like the sum of Amount.');
  const shownValues = across !== null ? values.slice(0, 1) : values;

  // Every combination of group values that occurs, in order.
  const firstKeys = keys(rows, groupCols[0], f.first, f.last);
  const combos: string[][] = [];
  if (groupCols.length === 1) combos.push(...firstKeys.map((k) => [k]));
  else {
    const second = keys(rows, groupCols[1], f.first, f.last);
    const present = new Set<string>();
    for (let r = f.first; r <= f.last; r++)
      present.add(
        `${evaluate(rows, r, groupCols[0]).trim().toLowerCase()}\u0000${evaluate(rows, r, groupCols[1]).trim().toLowerCase()}`,
      );
    for (const a of firstKeys)
      for (const b of second)
        if (present.has(`${a.toLowerCase()}\u0000${b.toLowerCase()}`)) combos.push([a, b]);
  }
  const acrossKeys = across !== null ? keys(rows, across, f.first, f.last) : [];
  if (combos.length > 200) return fail(`That makes ${combos.length} rows; group by fewer values.`);
  if (acrossKeys.length > 26)
    return fail(
      `That makes ${acrossKeys.length} columns across; choose a column with fewer values.`,
    );

  const width = groupCols.length + (across !== null ? acrossKeys.length + 1 : shownValues.length);
  const height = combos.length + 2;
  let top = op.source.top;
  let left = usedWidth(rows) + 1;
  if (op.at) {
    const at = parseCell(op.at);
    if (!at) return fail(`"${op.at}" is not a cell.`);
    ({ row: top, col: left } = at);
  }
  if (left + width > MAX_COLS || top + height > MAX_ROWS)
    return fail('There is no room for it on this sheet.');

  const w = writer(rows);
  const name = (c: number) => f.names.get(c)!;
  // Header row.
  groupCols.forEach((c, i) => w.put(top, left + i, name(c)));
  if (across !== null) {
    acrossKeys.forEach((k, i) => w.put(top, left + groupCols.length + i, k || '(blank)'));
    w.put(top, left + width - 1, 'Total');
  } else
    shownValues.forEach((v, i) =>
      w.put(top, left + groupCols.length + i, `${FN_LABEL[v.fn]} of ${name(v.col)}`),
    );

  // A condition on one column: the label cell when there is one, else "" for blanks.
  const cond = (col: number, key: string, labelRef: string) =>
    `${span(col, f.first, f.last)}, ${key ? labelRef : '""'}`;
  const cell = (fn: Fn, of: number, conds: string[]) =>
    fn === 'count'
      ? `=COUNTIFS(${conds.join(', ')})`
      : `=${FN_IF[fn]}(${span(of, f.first, f.last)}, ${conds.join(', ')})`;

  combos.forEach((combo, i) => {
    const r = top + 1 + i;
    combo.forEach((k, g) => w.put(r, left + g, k || '(blank)'));
    const conds = combo.map((k, g) => cond(groupCols[g], k, `${colName(left + g)}${r + 1}`));
    if (across !== null) {
      const v = shownValues[0];
      acrossKeys.forEach((k, j) => {
        const c = left + groupCols.length + j;
        const headRef = `${colName(c)}$${top + 1}`;
        w.put(
          r,
          c,
          cell(v.fn, v.col, [
            ...conds,
            k
              ? `${span(across, f.first, f.last)}, ${headRef}`
              : `${span(across, f.first, f.last)}, ""`,
          ]),
        );
      });
      w.put(r, left + width - 1, cell(v.fn, v.col, conds));
    } else
      shownValues.forEach((v, j) =>
        w.put(r, left + groupCols.length + j, cell(v.fn, v.col, conds)),
      );
  });

  // Grand total row: worked out from the source, so an average is the true average.
  const totalRow = top + 1 + combos.length;
  w.put(totalRow, left, 'Total');
  for (let g = 1; g < groupCols.length; g++) w.put(totalRow, left + g, '');
  const grand = (fn: Fn, of: number, extra: string[] = []) =>
    extra.length
      ? cell(fn, of, extra)
      : fn === 'count'
        ? `=COUNTIFS(${span(groupCols[0], f.first, f.last)}, "<>")`
        : `=${FN_PLAIN[fn]}(${span(of, f.first, f.last)})`;
  if (across !== null) {
    const v = shownValues[0];
    acrossKeys.forEach((k, j) => {
      const c = left + groupCols.length + j;
      w.put(
        totalRow,
        c,
        grand(v.fn, v.col, [
          `${span(across, f.first, f.last)}, ${k ? `${colName(c)}$${top + 1}` : '""'}`,
        ]),
      );
    });
    w.put(totalRow, left + width - 1, grand(v.fn, v.col));
  } else
    shownValues.forEach((v, j) => w.put(totalRow, left + groupCols.length + j, grand(v.fn, v.col)));

  const area = { top, left, bottom: totalRow, right: left + width - 1 };
  const what = shownValues
    .map((v) => `${FN_LABEL[v.fn].toLowerCase()} of ${name(v.col)}`)
    .join(', ');
  return {
    ok: true,
    edits: w.edits,
    overwrites: w.overwrites,
    area,
    summary: `Pivot of ${rangeName(op.source)} at ${rangeName(area)}: ${what} by ${groupCols.map(name).join(' and ')}${across !== null ? `, across ${name(across)}` : ''}.`,
  };
}

function sort(rows: string[][], op: Extract<SheetOp, { op: 'sort' }>): OpResult {
  const f = frame(rows, op.source);
  if (!op.by?.length) return fail('Say which column to sort by.');
  const by: { col: number; descending: boolean }[] = [];
  for (const b of op.by) {
    const c = f.find(b.column);
    if (c === null) return fail(`There is no column "${b.column}" in ${rangeName(op.source)}.`);
    by.push({ col: c, descending: !!b.descending });
  }
  const order = Array.from({ length: f.last - f.first + 1 }, (_, i) => f.first + i);
  const shown = (r: number, c: number) => evaluate(rows, r, c).trim();
  order.sort((a, b) => {
    for (const k of by) {
      const x = shown(a, k.col);
      const y = shown(b, k.col);
      if (!x || !y) {
        if (!x !== !y) return !x ? 1 : -1;
        continue;
      }
      const nx = toNumber(x);
      const ny = toNumber(y);
      const diff =
        nx !== null && ny !== null
          ? nx - ny
          : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
      if (diff) return k.descending ? -diff : diff;
    }
    return a - b;
  });
  const edits: Edit[] = [];
  order.forEach((from, i) => {
    const to = f.first + i;
    for (let c = op.source.left; c <= op.source.right; c++) {
      // A formula pointing along its own row keeps pointing at its own row.
      const value = shiftFormula(rows[from]?.[c] ?? '', to - from, 0);
      if (value !== (rows[to]?.[c] ?? '')) edits.push({ row: to, col: c, value });
    }
  });
  const area = { ...op.source, top: f.first, bottom: Math.max(f.first, f.last) };
  return {
    ok: true,
    edits,
    overwrites: [],
    area,
    summary: `Sorted ${rangeName(area)} by ${by.map((k) => `${f.names.get(k.col)}${k.descending ? ' (largest first)' : ''}`).join(', then ')}.`,
  };
}

function filter(rows: string[][], op: Extract<SheetOp, { op: 'filter' }>): OpResult {
  const f = frame(rows, op.source);
  const c = f.find(op.column);
  if (c === null) return fail(`There is no column "${op.column}" in ${rangeName(op.source)}.`);
  const test = String(op.test ?? '');
  const keep = matcher(test);
  let shownCount = 0;
  for (let r = f.first; r <= f.last; r++) if (keep(evaluate(rows, r, c))) shownCount++;
  const source = { ...op.source, top: f.first, bottom: Math.max(f.first, f.last) };
  return {
    ok: true,
    edits: [],
    overwrites: [],
    area: source,
    filter: { range: source, col: c, test },
    summary: `Filtered ${rangeName(source)} to ${f.names.get(c)} ${/^[<>=]/.test(test) ? test : `= ${test || '(blank)'}`}: ${shownCount} of ${f.last - f.first + 1} rows shown.`,
  };
}

function total(rows: string[][], op: Extract<SheetOp, { op: 'total' }>): OpResult {
  const f = frame(rows, op.source);
  if (f.last < f.first) return fail('There are no rows of data in those cells.');
  const fn = op.fn ?? 'sum';
  if (!FNS.includes(fn)) return fail(`"${fn}" is not one of ${FNS.join(', ')}.`);
  let cols: number[];
  if (op.columns?.length) {
    cols = [];
    for (const spec of op.columns) {
      const c = f.find(spec);
      if (c === null) return fail(`There is no column "${spec}" in ${rangeName(op.source)}.`);
      cols.push(c);
    }
  } else {
    // Every column that is mostly numbers.
    cols = [];
    for (let c = op.source.left; c <= op.source.right; c++) {
      let n = 0;
      for (let r = f.first; r <= f.last; r++) if (toNumber(evaluate(rows, r, c)) !== null) n++;
      if (n && n * 2 >= f.last - f.first + 1) cols.push(c);
    }
    if (!cols.length) return fail('None of those columns hold numbers to total.');
  }
  const row = f.last + 1;
  if (row >= MAX_ROWS) return fail('There is no room below for a total.');
  const w = writer(rows);
  const labelCol = op.source.left;
  if (!cols.includes(labelCol)) w.put(row, labelCol, fn === 'sum' ? 'Total' : FN_LABEL[fn]);
  for (const c of cols)
    w.put(row, c, `=${FN_PLAIN[fn]}(${colName(c)}${f.first + 1}:${colName(c)}${f.last + 1})`);
  const area = { top: row, left: op.source.left, bottom: row, right: op.source.right };
  return {
    ok: true,
    edits: w.edits,
    overwrites: w.overwrites,
    area,
    summary: `${FN_LABEL[fn]} of ${cols.map((c) => f.names.get(c)).join(', ')} in row ${row + 1}.`,
  };
}

/** Works out what an operation changes. Nothing is written; the result is applied (or not) after. */
export function runOp(rows: string[][], op: SheetOp): OpResult {
  if (!op || typeof op !== 'object') return fail('That is not a sheet operation.');
  if (op.op === 'clear-filter')
    return {
      ok: true,
      edits: [],
      overwrites: [],
      area: null,
      filter: null,
      summary: 'Filter cleared.',
    };
  const bad = checkSource(op.source);
  if (bad) return fail(bad);
  // Selecting a whole sheet takes in empty columns and rows; work on the cells that hold something.
  op = { ...op, source: trimRange(rows, op.source) };
  if (op.op === 'pivot') return pivot(rows, op);
  if (op.op === 'sort') return sort(rows, op);
  if (op.op === 'filter') return filter(rows, op);
  if (op.op === 'total') return total(rows, op);
  return fail(`"${(op as { op: string }).op}" is not one of pivot, sort, filter, total.`);
}

/** The rows a filter hides, by sheet row index. */
export function hiddenRows(rows: string[][], f: SheetFilter | null | undefined): Set<number> {
  const hidden = new Set<number>();
  if (!f) return hidden;
  const keep = matcher(f.test);
  for (let r = f.range.top; r <= f.range.bottom; r++)
    if (!keep(evaluate(rows, r, f.col))) hidden.add(r);
  return hidden;
}

/** Applies edits to a copy of the rows, growing them as needed. */
export function applyEdits(rows: string[][], edits: Edit[]): string[][] {
  const next = rows.map((r) => [...r]);
  for (const e of edits) {
    while (next.length <= e.row) next.push([]);
    const row = next[e.row];
    while (row.length <= e.col) row.push('');
    row[e.col] = e.value;
  }
  return next;
}

/** The columns of a block as a person picks them: by header name when it has one, else by letter. */
export function columnsOf(rows: string[][], source: CellRange): { col: number; name: string }[] {
  const f = frame(rows, trimRange(rows, source));
  return [...f.names].map(([col, name]) => ({ col, name: name || colName(col) }));
}

const OPS = ['pivot', 'sort', 'filter', 'clear-filter', 'total'] as const;

/** "A1:E25" (or "B3") as a range; null when it is not one. */
export function parseRange(text: string): CellRange | null {
  const m = /^\$?([A-Za-z]{1,2})\$?(\d{1,3})(?::\$?([A-Za-z]{1,2})\$?(\d{1,3}))?$/.exec(
    text.trim(),
  );
  if (!m) return null;
  const a = { r: Number(m[2]) - 1, c: colIndex(m[1]) };
  const b = m[3] ? { r: Number(m[4]) - 1, c: colIndex(m[3]) } : a;
  const r = {
    top: Math.min(a.r, b.r),
    left: Math.min(a.c, b.c),
    bottom: Math.max(a.r, b.r),
    right: Math.max(a.c, b.c),
  };
  return r.top < 0 || r.bottom >= MAX_ROWS || r.right >= MAX_COLS ? null : r;
}

/**
 * An operation as an agent writes it: one JSON object, the cells named as "range": "A1:E25"
 * (or left out, meaning the cells the person chose). A string back says what is wrong with it.
 */
export function readOp(text: string, chosen: CellRange | null): SheetOp | string {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return 'The "body" of sheet-ops is not one JSON object.';
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return 'The "body" of sheet-ops is not one JSON object.';
  if (!OPS.includes(raw.op as (typeof OPS)[number]))
    return `"op" must be one of ${OPS.join(', ')}.`;
  if (raw.op === 'clear-filter') return { op: 'clear-filter' };
  const given = raw.range ?? raw.source;
  let source: CellRange | null = null;
  if (typeof given === 'string') source = parseRange(given);
  else if (given && typeof given === 'object') {
    const g = given as CellRange;
    source = [g.top, g.left, g.bottom, g.right].every((n) => Number.isInteger(n) && n >= 0)
      ? { top: g.top, left: g.left, bottom: g.bottom, right: g.right }
      : null;
  } else source = chosen;
  if (!source)
    return given
      ? `"${String(given)}" is not a range like "A1:E25".`
      : 'Say which cells with "range", like "A1:E25".';
  const text_ = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  if (raw.op === 'pivot') {
    const rows = Array.isArray(raw.rows) ? raw.rows.map(text_) : raw.rows ? [text_(raw.rows)] : [];
    const values = (Array.isArray(raw.values) ? raw.values : []).map((v) => ({
      fn: text_((v as { fn?: unknown }).fn).toLowerCase() as Fn,
      of: text_((v as { of?: unknown }).of),
    }));
    return {
      op: 'pivot',
      source,
      rows,
      columns: raw.columns ? text_(raw.columns) : null,
      values,
      at: raw.at ? text_(raw.at) : null,
    };
  }
  if (raw.op === 'sort') {
    const by = (Array.isArray(raw.by) ? raw.by : raw.by ? [raw.by] : []).map((b) =>
      typeof b === 'string'
        ? { column: b, descending: false }
        : {
            column: text_((b as { column?: unknown }).column),
            descending: !!(b as { descending?: unknown }).descending,
          },
    );
    return { op: 'sort', source, by };
  }
  if (raw.op === 'filter')
    return { op: 'filter', source, column: text_(raw.column), test: text_(raw.test) };
  return {
    op: 'total',
    source,
    fn: (text_(raw.fn).toLowerCase() || 'sum') as Fn,
    columns: Array.isArray(raw.columns) ? raw.columns.map(text_) : null,
  };
}

/** An operation written back out the way it is stored on a proposal: the range by name. */
export function writeOp(op: SheetOp): string {
  if (op.op === 'clear-filter') return JSON.stringify(op);
  const { source, ...rest } = op;
  return JSON.stringify({ ...rest, range: rangeName(source) });
}
