import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../data/client.ts';
import { useFading, useSpot } from '../app/spot.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { sheetRows } from '../app/util.tsx';
import { colName, evaluate, toNumber } from '../../shared/formula.ts';
import type { Resource } from '../../shared/types.ts';
import { useShareCursor, useTeamCursors } from '../features/presence/cursors.ts';

/** A sheet: rows and columns, with sums. Each cell is saved on its own, so two people can work at once. */
export function SheetPage({ page }: { page: Resource }) {
  const { s, run, pick, notify, user, setUi } = useWorkspace();
  // Rows someone pointed at from a conversation: brought into view and lit for a moment.
  const [lit, setLit] = useFading<[number, number]>(6000);
  useSpot(page.id, (spot) => {
    if (!spot.rows) return;
    setLit(spot.rows);
    grid.current
      ?.querySelectorAll('tbody tr')
      [spot.rows[0]]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  const stored = sheetRows(page.body);
  const width = Math.max(4, ...stored.map((r) => r.length));
  const rows = Array.from({ length: Math.max(8, stored.length) }, (_, r) =>
    Array.from({ length: width }, (_, c) => stored[r]?.[c] ?? ''),
  );
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const team = useTeamCursors(page.id);
  const shareSpot = useShareCursor(page.id);
  // Who is on which cell, so each cell can show its teammate.
  const onCell = new Map<string, { name: string; color: string }>();
  for (const [id, c] of Object.entries(team))
    if (c.kind === 'cell')
      onCell.set(`${c.row}:${c.col}`, {
        name: user(id)?.name ?? 'Someone',
        color: user(id)?.color ?? '#888',
      });
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
  // A block of cells chosen by dragging or Shift: what you ask about, like a selection in a document.
  const [range, setRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(
    null,
  );
  const anchor = useRef<{ r: number; c: number } | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const box = range && {
    top: Math.min(range.r1, range.r2),
    bottom: Math.max(range.r1, range.r2),
    left: Math.min(range.c1, range.c2),
    right: Math.max(range.c1, range.c2),
  };
  const many = !!box && (box.top !== box.bottom || box.left !== box.right);
  const inRange = (r: number, c: number) =>
    many && r >= box!.top && r <= box!.bottom && c >= box!.left && c <= box!.right;
  const rangeName = box
    ? `${colName(box.left)}${box.top + 1}:${colName(box.right)}${box.bottom + 1}`
    : '';
  const extendTo = (r: number, c: number) => {
    const from = anchor.current ?? { r, c };
    setRange({ r1: from.r, c1: from.c, r2: r, c2: c });
  };
  // Ask your agent about the chosen cells: the rail opens with them as what it reads.
  const askAbout = () => {
    if (!box) return;
    const cells: string[] = [];
    for (let r = box.top; r <= box.bottom; r++)
      cells.push(
        Array.from({ length: box.right - box.left + 1 }, (_, i) =>
          evaluate(rows, r, box.left + i),
        ).join(' · '),
      );
    setUi({
      asking: { resourceId: page.id, quote: `${rangeName}: ${cells.join(' / ')}` },
      railOpen: true,
    });
  };
  const grid = useRef<HTMLTableElement>(null);
  const key = focus ? `${focus.r}:${focus.c}` : '';
  // The cell being edited follows a teammate's change unless you have typed something different.
  const live = focus ? (rows[focus.r]?.[focus.c] ?? '') : '';
  const before = useRef('');
  useEffect(() => {
    if (focus && value === before.current) setValue(live);
    before.current = live;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, key]);

  const commit = (r: number, c: number, text: string) => {
    if (text === (stored[r]?.[c] ?? '')) return;
    void run(() => api(`/resources/${page.id}/cells`, { body: { row: r, col: c, value: text } }));
  };
  const go = (r: number, c: number) =>
    grid.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus();
  const saveAll = (next: string[][]) =>
    void run(() =>
      api(`/resources/${page.id}`, {
        method: 'PATCH',
        body: { body: JSON.stringify({ rows: next }) },
      }),
    );
  const removeRows = () => {
    if (!picked) return;
    saveAll(rows.filter((_, r) => r < picked.from || r > picked.to));
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
  return (
    <div className="sheet-page">
      <div className="sheet-tools">
        <span className="cell-name">{focus ? `${colName(focus.c)}${focus.r + 1}` : ''}</span>
        <span className="cell-formula truncate">
          {focus ? value || ' ' : 'Click a cell to edit. Start with = for a sum, like =SUM(B2:B5).'}
        </span>
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
        <button onClick={() => saveAll([...rows, Array.from({ length: width }, () => '')])}>
          <Plus size={13} /> Row
        </button>
        <button onClick={() => saveAll(rows.map((r) => [...r, '']))} disabled={width >= 26}>
          <Plus size={13} /> Column
        </button>
      </div>
      <div className="sheet-scroll">
        <table className="sheet" ref={grid}>
          <thead>
            <tr>
              <th />
              {rows[0].map((_, c) => (
                <th key={c}>{colName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className={`${r === 0 ? 'head' : ''} ${inPick(r) ? 'picked' : ''} ${lit && r >= lit[0] && r <= lit[1] ? 'lit' : ''}`}
              >
                <th>
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
                  const editing = focus?.r === r && focus?.c === c;
                  const shown = editing ? value : evaluate(rows, r, c);
                  const numeric = !editing && toNumber(shown) !== null;
                  return (
                    <td
                      key={c}
                      className={`${numeric ? 'num' : ''} ${cell.startsWith('=') ? 'calc' : ''} ${onCell.has(`${r}:${c}`) ? 'teammate' : ''} ${inRange(r, c) ? 'in-range' : ''}`}
                      onMouseDown={(e) => {
                        if (e.shiftKey && anchor.current) {
                          e.preventDefault();
                          extendTo(r, c);
                          return;
                        }
                        anchor.current = { r, c };
                        dragging.current = true;
                        setRange({ r1: r, c1: c, r2: r, c2: c });
                      }}
                      onMouseEnter={(e) => {
                        if (!dragging.current || !(e.buttons & 1)) return;
                        if (anchor.current && (anchor.current.r !== r || anchor.current.c !== c)) {
                          (document.activeElement as HTMLElement | null)?.blur();
                          window.getSelection()?.removeAllRanges();
                        }
                        extendTo(r, c);
                      }}
                      style={
                        onCell.has(`${r}:${c}`)
                          ? ({ '--who': onCell.get(`${r}:${c}`)!.color } as React.CSSProperties)
                          : undefined
                      }
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
                      {onCell.has(`${r}:${c}`) && (
                        <span className="cell-who">{onCell.get(`${r}:${c}`)!.name}</span>
                      )}
                      <input
                        data-cell={`${r}:${c}`}
                        value={shown}
                        aria-label={`${colName(c)}${r + 1}`}
                        onFocus={() => {
                          setFocus({ r, c });
                          shareSpot({ kind: 'cell', row: r, col: c });
                          setValue(cell);
                          before.current = cell;
                        }}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => {
                          commit(r, c, value);
                          setFocus((f) => (f?.r === r && f?.c === c ? null : f));
                        }}
                        onKeyDown={(e) => {
                          if (e.shiftKey && e.key.startsWith('Arrow')) {
                            e.preventDefault();
                            const at = box ? { r: range!.r2, c: range!.c2 } : { r, c };
                            if (!anchor.current) anchor.current = { r, c };
                            const next = {
                              r: Math.max(
                                0,
                                Math.min(
                                  rows.length - 1,
                                  at.r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0),
                                ),
                              ),
                              c: Math.max(
                                0,
                                Math.min(
                                  width - 1,
                                  at.c +
                                    (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0),
                                ),
                              ),
                            };
                            extendTo(next.r, next.c);
                            return;
                          }
                          if (e.key === 'Enter')
                            (e.preventDefault(), go(Math.min(rows.length - 1, r + 1), c));
                          if (e.key === 'ArrowDown')
                            (e.preventDefault(), go(Math.min(rows.length - 1, r + 1), c));
                          if (e.key === 'ArrowUp') (e.preventDefault(), go(Math.max(0, r - 1), c));
                          if (e.key === 'Escape') {
                            setValue(cell);
                            before.current = cell;
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
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
