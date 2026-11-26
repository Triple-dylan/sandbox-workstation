import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Download, Plus, Send, Snowflake, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../data/client.ts';
import { useFading, useSpot } from '../app/spot.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { Choice } from '../app/Choice.tsx';
import { colName, evaluate, toNumber } from '../../shared/formula.ts';
import {
  MAX_COLS,
  MAX_ROWS,
  formatValue,
  fromTsv,
  readSheet,
  shiftFormula,
  sortRows,
  toCsv,
  toHtmlTable,
  toTsv,
  writeXlsx,
} from '../../shared/sheet.ts';
import type { Resource, SheetFormat } from '../../shared/types.ts';
import { useShareCursor, useTeamCursors } from '../features/presence/cursors.ts';
import { LinkStatus } from '../features/connectors/LinkStatus.tsx';

type Edit = { row: number; col: number; value: string };
type Box = { top: number; bottom: number; left: number; right: number };

const FORMATS: [SheetFormat, string][] = [
  ['plain', 'Plain'],
  ['number', '1,234.00'],
  ['currency', '$1,234.00'],
  ['percent', '12%'],
];
const ROW_HEIGHT = 29;
const HEAD_HEIGHT = 24;

/**
 * What was last copied from a sheet in this tab. Pasting it back keeps its formulas, moved the way
 * Excel moves them; anything copied from elsewhere comes in as values.
 */
let lastCopy: { tsv: string; raw: string[][]; top: number; left: number } | null = null;

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A sheet that behaves like Excel: arrows move, typing replaces, Enter or F2 edits, Shift extends,
 * ⌘-arrows jump, ⌘C ⌘X ⌘V work with Excel and Google Sheets, ⌘D fills down, ⌘Z undoes. Each change
 * is saved cell by cell, so two people can work at once.
 */
export function SheetPage({ page }: { page: Resource }) {
  const { s, run, pick, notify, user, setUi, menu } = useWorkspace();
  const sheet = readSheet(page.body);
  const stored = sheet.rows;
  const [extra, setExtra] = useState({ rows: 0, cols: 0 });
  const width = Math.min(MAX_COLS, Math.max(6, ...stored.map((r) => r.length)) + extra.cols);
  const height = Math.min(MAX_ROWS, Math.max(20, stored.length + 3) + extra.rows);
  const rows = Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => stored[r]?.[c] ?? ''),
  );
  const freeze = sheet.freeze ?? 0;
  const [widths, setWidths] = useState<Record<string, number>>({});
  const colWidth = (c: number) => widths[c] ?? sheet.widths?.[c] ?? 132;

  // Rows someone pointed at from a conversation: brought into view and lit for a moment.
  const [lit, setLit] = useFading<[number, number]>(6000);
  const grid = useRef<HTMLTableElement>(null);
  useSpot(page.id, (spot) => {
    if (!spot.rows) return;
    setLit(spot.rows);
    grid.current
      ?.querySelectorAll('tbody tr')
      [spot.rows[0]]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  const team = useTeamCursors(page.id);
  const shareSpot = useShareCursor(page.id);
  const onCell = new Map<string, { name: string; color: string }>();
  for (const [id, c] of Object.entries(team))
    if (c.kind === 'cell')
      onCell.set(`${c.row}:${c.col}`, {
        name: user(id)?.name ?? 'Someone',
        color: user(id)?.color ?? '#888',
      });

  // The cell you are on, the far corner of what you have chosen, and whether you are typing in it.
  const [at, setAt] = useState<{ r: number; c: number } | null>(null);
  const [end, setEnd] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<'enter' | 'edit' | null>(null);
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  // Where a run of Tabs began, so Enter goes to the next row under it, as in Excel and Sheets.
  const tabRun = useRef<{ r: number; c: number } | null>(null);
  // A cell to move to once it exists: Tab past the last column adds one first.
  const goTo = useRef<{ r: number; c: number } | null>(null);
  useEffect(() => {
    if (goTo.current && goTo.current.c < width) {
      cellAt(goTo.current.r, goTo.current.c)?.focus();
      goTo.current = null;
    }
  });

  const corner = end ?? at;
  const box: Box | null =
    at && corner
      ? {
          top: Math.min(at.r, corner.r),
          bottom: Math.max(at.r, corner.r),
          left: Math.min(at.c, corner.c),
          right: Math.max(at.c, corner.c),
        }
      : null;
  const many = !!box && (box.top !== box.bottom || box.left !== box.right);
  const inBox = (r: number, c: number) =>
    many && r >= box!.top && r <= box!.bottom && c >= box!.left && c <= box!.right;
  const rangeName = box
    ? many
      ? `${colName(box.left)}${box.top + 1}:${colName(box.right)}${box.bottom + 1}`
      : `${colName(box.left)}${box.top + 1}`
    : '';

  // Undo and redo, per person, as Excel keeps them.
  const history = useRef<{ undo: Edit[][]; redo: Edit[][] }>({ undo: [], redo: [] });
  const send = (edits: Edit[]) =>
    run(() => api(`/resources/${page.id}/cells`, { body: { edits } }));
  const apply = (edits: Edit[], from: 'do' | 'undo' | 'redo' = 'do') => {
    const changed = edits.filter((e) => (stored[e.row]?.[e.col] ?? '') !== e.value);
    if (!changed.length) return;
    const before = changed.map((e) => ({ ...e, value: stored[e.row]?.[e.col] ?? '' }));
    if (from === 'undo') history.current.redo.push(before);
    else {
      history.current.undo.push(before);
      if (from === 'do') history.current.redo = [];
    }
    void send(changed);
  };
  const undo = () => {
    const last = history.current.undo.pop();
    if (last) apply(last, 'undo');
  };
  const redo = () => {
    const last = history.current.redo.pop();
    if (last) apply(last, 'redo');
  };
  const layout = (patch: { formats?: object; widths?: object; freeze?: number }) =>
    void run(() => api(`/resources/${page.id}/layout`, { body: patch }));

  const cellAt = (r: number, c: number) =>
    grid.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`);
  const moveTo = (r: number, c: number, extend = false) => {
    const next = {
      r: Math.max(0, Math.min(height - 1, r)),
      c: Math.max(0, Math.min(width - 1, c)),
    };
    if (extend) {
      setEnd(next);
      cellAt(next.r, next.c)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    setEnd(null);
    cellAt(next.r, next.c)?.focus();
  };
  // ⌘-arrow: to the edge of the block of filled cells, or the next filled cell, as Excel does.
  const jump = (r: number, c: number, dr: number, dc: number) => {
    const filled = (y: number, x: number) => !!rows[y]?.[x]?.trim();
    const inside = (y: number, x: number) => y >= 0 && y < height && x >= 0 && x < width;
    let y = r;
    let x = c;
    if (filled(y, x) && inside(y + dr, x + dc) && filled(y + dr, x + dc)) {
      while (inside(y + dr, x + dc) && filled(y + dr, x + dc)) ((y += dr), (x += dc));
    } else {
      do ((y += dr), (x += dc));
      while (inside(y, x) && !filled(y, x));
      if (!inside(y, x)) ((y -= dr), (x -= dc));
    }
    return { r: y, c: x };
  };

  const startEditing = (mode: 'enter' | 'edit', text: string) => {
    setEditing(mode);
    setValue(text);
  };
  const finishEditing = (keep: boolean) => {
    if (at && editing && keep) apply([{ row: at.r, col: at.c, value }]);
    setEditing(null);
  };

  const cellsIn = (b: Box, shown: boolean) =>
    Array.from({ length: b.bottom - b.top + 1 }, (_, i) =>
      Array.from({ length: b.right - b.left + 1 }, (_, j) => {
        const r = b.top + i;
        const c = b.left + j;
        return shown ? formatValue(evaluate(rows, r, c), sheet.formats?.[c]) : rows[r][c];
      }),
    );
  const clear = (b: Box) => {
    const edits: Edit[] = [];
    for (let r = b.top; r <= b.bottom; r++)
      for (let c = b.left; c <= b.right; c++) edits.push({ row: r, col: c, value: '' });
    apply(edits);
  };
  const copy = (e: React.ClipboardEvent) => {
    if (!box || editing) return;
    e.preventDefault();
    const shown = cellsIn(box, true);
    const tsv = toTsv(shown);
    e.clipboardData.setData('text/plain', tsv);
    e.clipboardData.setData('text/html', toHtmlTable(shown, false));
    lastCopy = { tsv, raw: cellsIn(box, false), top: box.top, left: box.left };
  };
  const paste = (e: React.ClipboardEvent) => {
    if (!box || editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const ours = lastCopy && lastCopy.tsv === text ? lastCopy : null;
    const block = ours ? ours.raw : fromTsv(text);
    const single = block.length === 1 && block[0].length === 1;
    // One value pasted over a range fills the range, as in Excel.
    const target =
      single && many
        ? box
        : {
            ...box,
            bottom: box.top + block.length - 1,
            right: box.left + Math.max(...block.map((r) => r.length)) - 1,
          };
    const edits: Edit[] = [];
    for (let r = target.top; r <= Math.min(MAX_ROWS - 1, target.bottom); r++)
      for (let c = target.left; c <= Math.min(MAX_COLS - 1, target.right); c++) {
        const i = single ? 0 : r - target.top;
        const j = single ? 0 : c - target.left;
        const raw = block[i]?.[j] ?? '';
        edits.push({
          row: r,
          col: c,
          value: ours ? shiftFormula(raw, r - (ours.top + i), c - (ours.left + j)) : raw,
        });
      }
    apply(edits);
    if (!single || !many)
      setEnd({ r: Math.min(MAX_ROWS - 1, target.bottom), c: Math.min(MAX_COLS - 1, target.right) });
    const grows = {
      rows: Math.max(0, target.bottom + 2 - height),
      cols: Math.max(0, target.right + 1 - width),
    };
    if (grows.rows || grows.cols)
      setExtra((x) => ({ rows: x.rows + grows.rows, cols: x.cols + grows.cols }));
  };
  // ⌘D and ⌘R: the top row (or left column) of the range copied across it, formulas moved along.
  const fill = (down: boolean) => {
    if (!box) return;
    const b = many
      ? box
      : down
        ? { ...box, top: Math.max(0, box.top - 1) }
        : { ...box, left: Math.max(0, box.left - 1) };
    const edits: Edit[] = [];
    for (let r = b.top; r <= b.bottom; r++)
      for (let c = b.left; c <= b.right; c++) {
        if (down ? r === b.top : c === b.left) continue;
        const source = down ? rows[b.top][c] : rows[r][b.left];
        edits.push({
          row: r,
          col: c,
          value: down ? shiftFormula(source, r - b.top, 0) : shiftFormula(source, 0, c - b.left),
        });
      }
    apply(edits);
  };
  const sortBy = (col: number, descending: boolean) => {
    const keep = Math.max(freeze, 1);
    const data = stored.length;
    if (data <= keep + 1) return;
    const full = stored.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? ''));
    const sorted = sortRows(full, col, descending, keep);
    const edits: Edit[] = [];
    sorted.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value !== full[r][c]) edits.push({ row: r, col: c, value });
      }),
    );
    apply(edits);
    notify(
      `Sorted by ${rows[0]?.[col] || `column ${colName(col)}`}${descending ? ', largest first' : ''}. ⌘Z undoes it.`,
    );
  };
  const setFormat = (col: number, format: SheetFormat) =>
    layout({ formats: { ...sheet.formats, [col]: format } });
  const columnMenu = (
    e: { clientX: number; clientY: number; preventDefault: () => void },
    c: number,
  ) =>
    menu(e, [
      { label: 'Sort A → Z, smallest first', run: () => sortBy(c, false) },
      { label: 'Sort Z → A, largest first', run: () => sortBy(c, true) },
      'line',
      ...FORMATS.map(([f, name]) => ({
        label: `Show as ${name}`,
        checked: (sheet.formats?.[c] ?? 'plain') === f,
        run: () => setFormat(c, f),
      })),
      'line',
      {
        label: `Select column ${colName(c)}`,
        run: () => {
          setAt({ r: 0, c });
          setEnd({ r: height - 1, c });
          cellAt(0, c)?.focus();
          setEnd({ r: height - 1, c });
        },
      },
    ]);

  // Ask your agent about the chosen cells: the rail opens with them as what it reads.
  const askAbout = () => {
    if (!box) return;
    const cells = cellsIn(box, true).map((r) => r.join(' · '));
    setUi({
      asking: { resourceId: page.id, quote: `${rangeName}: ${cells.join(' / ')}` },
      railOpen: true,
    });
  };

  const removeRows = () => {
    if (!picked) return;
    const n = picked.to - picked.from + 1;
    const edits: Edit[] = [];
    for (let r = picked.from; r < stored.length; r++)
      for (let c = 0; c < width; c++)
        edits.push({ row: r, col: c, value: stored[r + n]?.[c] ?? '' });
    apply(edits);
    setPicked(null);
  };
  const share = () =>
    picked &&
    pick({
      title: 'Share these rows in a conversation',
      chats: true,
      filter: () => false,
      onPick: (t) => {
        if (t.type !== 'chat') return;
        const chat = s.conversations.find((c) => c.id === t.id);
        void run(() =>
          api('/messages', {
            body: {
              conversationId: t.id,
              text: `Rows ${picked.from + 1}–${picked.to + 1} of ${page.title}`,
              embed: { resourceId: page.id, from: picked.from, to: picked.to },
            },
          }),
        ).then(
          (ok) =>
            ok &&
            notify(
              `Shared in ${chat?.kind === 'channel' ? `#${chat.title}` : 'the conversation'}. It stays live.`,
            ),
        );
        setPicked(null);
      },
    });
  const inPick = (r: number) => !!picked && r >= picked.from && r <= picked.to;

  const resize = (c: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = e.clientX;
    const from = colWidth(c);
    let now = from;
    const move = (m: MouseEvent) => {
      now = Math.max(40, Math.min(600, from + m.clientX - start));
      setWidths((w) => ({ ...w, [c]: now }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (now !== from) layout({ widths: { ...sheet.widths, [c]: now } });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Tab and Enter while entering data: Tab moves along the row (adding a column at the edge), and
  // Enter starts the next row under the cell where the Tabs began.
  const step = (key: 'Tab' | 'Enter', back: boolean, r: number, c: number) => {
    if (key === 'Tab') {
      if (tabRun.current?.r !== r) tabRun.current = { r, c };
      if (!back && c === width - 1 && width < MAX_COLS) {
        goTo.current = { r, c: c + 1 };
        setExtra((x) => ({ ...x, cols: x.cols + 1 }));
        return;
      }
      return moveTo(r, c + (back ? -1 : 1));
    }
    const col = !back && tabRun.current?.r === r ? tabRun.current.c : c;
    tabRun.current = null;
    moveTo(r + (back ? -1 : 1), col);
  };

  const keys = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const mod = e.metaKey || e.ctrlKey;
    const arrow = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[
      e.key
    ] as [number, number] | undefined;
    if (editing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(null);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        finishEditing(true);
        step(e.key, e.shiftKey, r, c);
      } else if (arrow && editing === 'enter') {
        e.preventDefault();
        finishEditing(true);
        tabRun.current = null;
        moveTo(r + arrow[0], c + arrow[1]);
      }
      return;
    }
    if (arrow) {
      tabRun.current = null;
      e.preventDefault();
      const from = e.shiftKey ? (corner ?? { r, c }) : { r, c };
      const to = mod
        ? jump(from.r, from.c, arrow[0], arrow[1])
        : { r: from.r + arrow[0], c: from.c + arrow[1] };
      moveTo(to.r, to.c, e.shiftKey);
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (e.key === 'Enter' && !e.shiftKey && !many && !tabRun.current)
        return startEditing('edit', rows[r][c]);
      step(e.key, e.shiftKey, r, c);
      return;
    }
    if (e.key === 'F2') return (e.preventDefault(), startEditing('edit', rows[r][c]));
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (box) clear(box);
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') return (e.preventDefault(), redo());
    if (mod && e.key.toLowerCase() === 'd') return (e.preventDefault(), fill(true));
    if (mod && e.key.toLowerCase() === 'r') return (e.preventDefault(), fill(false));
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAt({ r: 0, c: 0 });
      setEnd({ r: Math.max(0, stored.length - 1), c: width - 1 });
      return;
    }
    if (e.key === 'Escape') return setEnd(null);
    // Typing on a cell replaces what is in it, as in Excel.
    if (!mod && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      setEnd(null);
      startEditing('enter', e.key);
    }
  };

  const formatHere = (at && sheet.formats?.[at.c]) || 'plain';
  return (
    <div className="sheet-page">
      <div className="sheet-tools">
        <span className="cell-name">{rangeName}</span>
        <span className="cell-formula truncate">
          {at
            ? (editing ? value : rows[at.r]?.[at.c]) || ' '
            : 'Click a cell and type. Start with = for a sum, like =SUM(B2:B5).'}
        </span>
        <LinkStatus page={page} />
        {many && (
          <button onClick={askAbout}>
            <Sparkles size={13} /> Ask about {rangeName}
          </button>
        )}
        {picked && (
          <>
            <button onClick={share}>
              <Send size={13} /> Share rows {picked.from + 1}–{picked.to + 1}
            </button>
            <button onClick={removeRows}>
              <Trash2 size={13} /> Delete
            </button>
          </>
        )}
        {at && (
          <Choice
            label={`Show column ${colName(at.c)} as`}
            value={formatHere}
            options={FORMATS}
            onChange={(f) => setFormat(at.c, f)}
          />
        )}
        {at && (
          <button onClick={() => sortBy(at.c, false)} title={`Sort by column ${colName(at.c)}`}>
            <ArrowDownUp size={13} /> Sort
          </button>
        )}
        <button
          aria-pressed={freeze > 0}
          title={freeze ? 'Let row 1 scroll away' : 'Keep row 1 in view while scrolling'}
          onClick={() => layout({ freeze: freeze ? 0 : 1 })}
        >
          <Snowflake size={13} /> {freeze ? 'Row 1 kept' : 'Keep row 1'}
        </button>
        <button
          onClick={() => setExtra((x) => ({ ...x, rows: x.rows + 5 }))}
          disabled={height >= MAX_ROWS}
        >
          <Plus size={13} /> Rows
        </button>
        <button
          onClick={() => setExtra((x) => ({ ...x, cols: x.cols + 1 }))}
          disabled={width >= MAX_COLS}
        >
          <Plus size={13} /> Column
        </button>
        <button
          title="Download"
          aria-label="Download"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            menu({ clientX: r.left, clientY: r.bottom + 4, preventDefault: () => {} }, [
              {
                label: 'Excel (.xlsx)',
                run: () =>
                  download(
                    `${page.title}.xlsx`,
                    writeXlsx(page.title, sheet) as BlobPart,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  ),
              },
              {
                label: 'CSV (.csv)',
                run: () => download(`${page.title}.csv`, toCsv(sheet), 'text/csv'),
              },
            ]);
          }}
        >
          <Download size={13} />
        </button>
      </div>
      <div className="sheet-scroll">
        <table
          className="sheet"
          ref={grid}
          onCopy={copy}
          onPaste={paste}
          onCut={(e) => {
            if (!box || editing) return;
            copy(e);
            clear(box);
          }}
        >
          <thead>
            <tr>
              <th />
              {rows[0].map((_, c) => (
                <th
                  key={c}
                  style={{ width: colWidth(c), minWidth: colWidth(c), maxWidth: colWidth(c) }}
                  className={box && c >= box.left && c <= box.right ? 'on' : ''}
                  onContextMenu={(e) => columnMenu(e, c)}
                >
                  <button
                    className="col-name"
                    aria-label={`Column ${colName(c)}: sort and format`}
                    onClick={(e) => columnMenu(e, c)}
                  >
                    {colName(c)}
                    {sheet.formats?.[c] && sheet.formats[c] !== 'plain' && (
                      <small>
                        {FORMATS.find(([f]) => f === sheet.formats![c])![1].replace(/[\d,.]+/g, '')}
                      </small>
                    )}
                  </button>
                  <span
                    className="col-resize"
                    role="separator"
                    aria-label={`Resize column ${colName(c)}`}
                    onMouseDown={(e) => resize(c, e)}
                    onDoubleClick={() => layout({ widths: { ...sheet.widths, [c]: 132 } })}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className={`${r === 0 ? 'head' : ''} ${r < freeze ? 'frozen' : ''} ${inPick(r) ? 'picked' : ''} ${lit && r >= lit[0] && r <= lit[1] ? 'lit' : ''}`}
                style={
                  r < freeze
                    ? ({
                        '--frozen-top': `${HEAD_HEIGHT + r * ROW_HEIGHT}px`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <th className={box && r >= box.top && r <= box.bottom ? 'on' : ''}>
                  <button
                    aria-label={`Select row ${r + 1}`}
                    aria-pressed={inPick(r)}
                    onClick={(e) =>
                      setPicked((p) =>
                        e.shiftKey && p
                          ? { from: Math.min(p.from, r), to: Math.max(p.to, r) }
                          : p && p.from === r && p.to === r
                            ? null
                            : { from: r, to: r },
                      )
                    }
                  >
                    {r + 1}
                  </button>
                </th>
                {row.map((cell, c) => {
                  const here = at?.r === r && at?.c === c;
                  const typing = here && !!editing;
                  const shown = typing
                    ? value
                    : formatValue(evaluate(rows, r, c), sheet.formats?.[c]);
                  const numeric = !typing && toNumber(evaluate(rows, r, c)) !== null;
                  const who = onCell.get(`${r}:${c}`);
                  return (
                    <td
                      key={c}
                      className={`${numeric ? 'num' : ''} ${cell.startsWith('=') ? 'calc' : ''} ${who ? 'teammate' : ''} ${inBox(r, c) ? 'in-range' : ''} ${here ? 'here' : ''}`}
                      onMouseDown={(e) => {
                        if (typing) return;
                        tabRun.current = null;
                        if (e.shiftKey && at) {
                          e.preventDefault();
                          setEnd({ r, c });
                          return;
                        }
                        dragging.current = true;
                        setEnd(null);
                      }}
                      onMouseEnter={(e) => {
                        if (!dragging.current || !(e.buttons & 1) || !at) return;
                        window.getSelection()?.removeAllRanges();
                        setEnd({ r, c });
                      }}
                      onDoubleClick={() => startEditing('edit', cell)}
                      style={who ? ({ '--who': who.color } as React.CSSProperties) : undefined}
                    >
                      {many && r === box!.bottom && c === box!.right && (
                        <button
                          className="range-ask"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={askAbout}
                          title={`Ask your agent about ${rangeName}`}
                        >
                          <Sparkles size={12} /> Ask
                        </button>
                      )}
                      {who && <span className="cell-who">{who.name}</span>}
                      <input
                        data-cell={`${r}:${c}`}
                        value={shown}
                        className={typing ? 'typing' : ''}
                        aria-label={`${colName(c)}${r + 1}`}
                        onFocus={(e) => {
                          if (!here) {
                            setAt({ r, c });
                            setEditing(null);
                          }
                          // Selected, so typing replaces what is there, as in Excel.
                          if (!typing) e.target.select();
                          shareSpot({ kind: 'cell', row: r, col: c });
                        }}
                        onChange={(e) => {
                          if (!typing) setEditing('enter');
                          setValue(e.target.value);
                        }}
                        onBlur={() => {
                          if (typing) finishEditing(true);
                        }}
                        onKeyDown={(e) => keys(e, r, c)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
