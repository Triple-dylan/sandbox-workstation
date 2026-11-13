import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { sheetRows } from '../app/util.tsx';
import { colName, evaluate, toNumber } from '../features/sheet/formula.ts';
import type { Resource } from '../../shared/types.ts';

/** A sheet: rows and columns, with sums. Each cell is saved on its own, so two people can work at once. */
export function SheetPage({ page }: { page: Resource }) {
  const { s, run, pick, notify } = useWorkspace();
  const stored = sheetRows(page.body);
  const width = Math.max(4, ...stored.map((r) => r.length));
  const rows = Array.from({ length: Math.max(8, stored.length) }, (_, r) =>
    Array.from({ length: width }, (_, c) => stored[r]?.[c] ?? ''),
  );
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
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
              <tr key={r} className={`${r === 0 ? 'head' : ''} ${inPick(r) ? 'picked' : ''}`}>
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
                      className={`${numeric ? 'num' : ''} ${cell.startsWith('=') ? 'calc' : ''}`}
                    >
                      <input
                        data-cell={`${r}:${c}`}
                        value={shown}
                        aria-label={`${colName(c)}${r + 1}`}
                        onFocus={() => {
                          setFocus({ r, c });
                          setValue(cell);
                          before.current = cell;
                        }}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => {
                          commit(r, c, value);
                          setFocus((f) => (f?.r === r && f?.c === c ? null : f));
                        }}
                        onKeyDown={(e) => {
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
