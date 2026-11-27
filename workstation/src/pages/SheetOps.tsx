import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { Filter, X } from 'lucide-react';
import { colName } from '../../shared/formula.ts';
import { rangeName, trimRange } from '../../shared/sheet.ts';
import {
  columnsOf,
  FNS,
  runOp,
  type Fn,
  type OpResult,
  type SheetOp,
} from '../../shared/sheetOps.ts';
import type { Approval, CellRange, SheetFilter } from '../../shared/types.ts';

export type OpKind = 'pivot' | 'sort' | 'filter' | 'total';
export const OP_KINDS: [OpKind, string][] = [
  ['pivot', 'Pivot'],
  ['sort', 'Sort'],
  ['filter', 'Filter'],
  ['total', 'Total'],
];
const FN_NAME: Record<Fn, string> = {
  sum: 'Sum',
  count: 'Count',
  average: 'Average',
  min: 'Smallest',
  max: 'Largest',
};
const TESTS: [string, string][] = [
  ['', 'is'],
  ['<>', 'is not'],
  ['>', 'more than'],
  ['<', 'less than'],
  ['>=', 'at least'],
  ['<=', 'at most'],
];

/**
 * The sheet's own Pivot, Sort, Filter and Total, set up in a line under the toolbar. The same
 * operations an agent runs; this is the way to do them by hand.
 */
export function OpForm({
  kind,
  rows,
  range,
  onRun,
  onClose,
}: {
  kind: OpKind;
  rows: string[][];
  range: CellRange;
  onRun: (op: SheetOp, result: Extract<OpResult, { ok: true }>) => void;
  onClose: () => void;
}) {
  const cols = columnsOf(rows, range);
  const first = cols[0]?.col ?? range.left;
  const last = cols.at(-1)?.col ?? range.right;
  const [group, setGroup] = useState(first);
  const [group2, setGroup2] = useState<number | null>(null);
  const [across, setAcross] = useState<number | null>(null);
  const [fn, setFn] = useState<Fn>('sum');
  const [of, setOf] = useState(last);
  const [desc, setDesc] = useState(false);
  const [test, setTest] = useState('');
  const [value, setValue] = useState('');
  const [col, setCol] = useState(kind === 'filter' ? first : last);
  const [allNumbers, setAllNumbers] = useState(true);
  const [confirm, setConfirm] = useState(false);

  const letter = (c: number) => colName(c);
  const op: SheetOp =
    kind === 'pivot'
      ? {
          op: 'pivot',
          source: range,
          rows: [letter(group), ...(group2 !== null ? [letter(group2)] : [])],
          columns: across !== null ? letter(across) : null,
          values: [{ fn, of: letter(of) }],
        }
      : kind === 'sort'
        ? { op: 'sort', source: range, by: [{ column: letter(col), descending: desc }] }
        : kind === 'filter'
          ? { op: 'filter', source: range, column: letter(col), test: `${test}${value}` }
          : {
              op: 'total',
              source: range,
              fn,
              columns: allNumbers ? null : [letter(col)],
            };
  const result = runOp(rows, op);

  const pickCol = (v: number, set: (n: number) => void, label: string) => (
    <select
      aria-label={label}
      value={v}
      onChange={(e) => (set(Number(e.target.value)), setConfirm(false))}
    >
      {cols.map((c) => (
        <option key={c.col} value={c.col}>
          {c.name}
        </option>
      ))}
    </select>
  );
  const maybeCol = (v: number | null, set: (n: number | null) => void, label: string) => (
    <select
      aria-label={label}
      value={v ?? ''}
      onChange={(e) => (
        set(e.target.value === '' ? null : Number(e.target.value)),
        setConfirm(false)
      )}
    >
      <option value="">nothing</option>
      {cols.map((c) => (
        <option key={c.col} value={c.col}>
          {c.name}
        </option>
      ))}
    </select>
  );
  const pickFn = (
    <select aria-label="Work out" value={fn} onChange={(e) => setFn(e.target.value as Fn)}>
      {FNS.map((f) => (
        <option key={f} value={f}>
          {FN_NAME[f]}
        </option>
      ))}
    </select>
  );

  const go = () => {
    if (!result.ok) return;
    if (result.overwrites.length && !confirm) return setConfirm(true);
    onRun(op, result);
  };

  return (
    <form
      className="sheet-op"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <span className="sheet-op-range">{rangeName(trimRange(rows, range))}</span>
      {kind === 'pivot' && (
        <>
          <label>Group by {pickCol(group, setGroup, 'Group by')}</label>
          <label>then {maybeCol(group2, setGroup2, 'Then group by')}</label>
          <label>across {maybeCol(across, setAcross, 'Spread across')}</label>
          <label>
            show {pickFn} of {pickCol(of, setOf, 'Of column')}
          </label>
        </>
      )}
      {kind === 'sort' && (
        <>
          <label>Sort by {pickCol(col, setCol, 'Sort by')}</label>
          <select
            aria-label="Order"
            value={desc ? 'desc' : 'asc'}
            onChange={(e) => setDesc(e.target.value === 'desc')}
          >
            <option value="asc">smallest first, A→Z</option>
            <option value="desc">largest first, Z→A</option>
          </select>
        </>
      )}
      {kind === 'filter' && (
        <>
          <label>Show rows where {pickCol(col, setCol, 'Column')}</label>
          <select aria-label="Test" value={test} onChange={(e) => setTest(e.target.value)}>
            {TESTS.map(([t, label]) => (
              <option key={t} value={t}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="North, 500…"
            autoFocus
          />
        </>
      )}
      {kind === 'total' && (
        <>
          <label>Add a row with the {pickFn}</label>
          <label>
            of{' '}
            <select
              aria-label="Columns"
              value={allNumbers ? 'all' : String(col)}
              onChange={(e) => {
                setAllNumbers(e.target.value === 'all');
                if (e.target.value !== 'all') setCol(Number(e.target.value));
                setConfirm(false);
              }}
            >
              <option value="all">every number column</option>
              {cols.map((c) => (
                <option key={c.col} value={c.col}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <button type="submit" className="primary" disabled={!result.ok}>
        {confirm ? 'Write over them' : OP_KINDS.find(([k]) => k === kind)![1]}
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <span className={`sheet-op-says ${result.ok ? '' : 'bad'}`}>
        {!result.ok
          ? result.error
          : confirm
            ? `This writes over ${result.overwrites.slice(0, 4).join(', ')}${result.overwrites.length > 4 ? ` and ${result.overwrites.length - 4} more` : ''}.`
            : result.summary.replace(/^Pivot of [^ ]+ at /, 'Goes at ')}
      </span>
    </form>
  );
}

/** A filter is on for everyone looking at the sheet: say so, and how many rows it hides. */
export function FilterBar({
  filter,
  names,
  hidden,
  onClear,
}: {
  filter: SheetFilter;
  names: string;
  hidden: number;
  onClear: () => void;
}) {
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(filter.test)!;
  const says = TESTS.find(([t]) => t === (m[1] === '=' ? '' : (m[1] ?? '')))?.[1] ?? 'is';
  return (
    <div className="sheet-filter" role="status">
      <Filter size={13} />
      <span>
        Showing rows of {rangeName(filter.range)} where <b>{names}</b> {says}{' '}
        <b>{m[2] || '(blank)'}</b>
        {' · '}
        {hidden} hidden for everyone
      </span>
      <button onClick={onClear}>
        <X size={13} /> Clear
      </button>
    </div>
  );
}

/**
 * An agent's pivot, sort, filter or total, drawn on the sheet in a lighter tint before anything is
 * saved. Keep applies it (worked out again on the sheet as it is then); Discard declines it.
 */
export function Suggestion({
  approval,
  agent,
  result,
  onShow,
}: {
  approval: Approval;
  agent: string;
  result: OpResult;
  onShow: () => void;
}) {
  const { run } = useWorkspace();
  // Brought into view once when it arrives.
  useEffect(() => {
    const t = setTimeout(onShow, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval.id]);
  const decide = (decision: 'approved' | 'declined') =>
    void run(() => api(`/approvals/${approval.id}`, { body: { decision } }));
  return (
    <div className="sheet-suggestion" role="status">
      <Sparkles size={13} />
      <span>
        <b>{agent}</b> suggests:{' '}
        {result.ok
          ? `${result.summary}${result.overwrites.length ? ` It writes over ${result.overwrites.slice(0, 4).join(', ')}${result.overwrites.length > 4 ? ` and ${result.overwrites.length - 4} more` : ''}.` : ''} Shown tinted; nothing is saved until you keep it.`
          : `something that can't run on the sheet as it is now (${result.error}).`}
      </span>
      {result.ok && (
        <button className="primary" onClick={() => decide('approved')}>
          <Check size={13} /> Keep
        </button>
      )}
      {result.ok && result.area && <button onClick={onShow}>Show</button>}
      <button onClick={() => decide('declined')}>Discard</button>
    </div>
  );
}
