import { useState } from 'react';
import { Search, Zap } from 'lucide-react';
import { isPage } from '../../shared/types.ts';
import { KindIcon, chatTitle, excerpt } from './util.tsx';
import { useWorkspace, type Picker, type Target } from './workspace.tsx';

/** One box to find a page or conversation, also used wherever something asks you to choose a page. */
export function Find({ picker, close }: { picker: Picker; close: () => void }) {
  const { s, space } = useWorkspace();
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const q = query.trim().toLowerCase();
  const pages = s.resources
    .filter((r) => isPage(r.kind) && (!picker.filter || picker.filter(r)))
    .filter((r) => (picker.filter ? r.spaceId === space.id : true))
    .map((r) => ({
      r,
      score: !q
        ? r.spaceId === space.id
          ? 1
          : 0.5
        : (r.title.toLowerCase().includes(q) ? 3 : 0) + (r.body.toLowerCase().includes(q) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.updatedAt.localeCompare(a.r.updatedAt))
    .slice(0, 8);
  const chats = picker.chats
    ? s.conversations
        .filter((c) => c.kind !== 'discussion')
        .filter((c) => !q || chatTitle(c, s).toLowerCase().includes(q))
        .slice(0, 6)
    : [];
  const actions = (picker.actions ?? []).filter(
    (a) => !q || a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q),
  );
  const rows: { target?: Target; run?: () => void; node: React.ReactNode }[] = [
    ...pages.map(({ r }) => ({
      target: { type: 'page' as const, id: r.id },
      node: (
        <>
          <KindIcon kind={r.kind} />
          <span className="truncate">
            <strong>{r.title}</strong>
            <small>
              {s.spaces.find((x) => x.id === r.spaceId)?.kind === 'personal'
                ? 'Your space'
                : s.spaces.find((x) => x.id === r.spaceId)?.name}
              {r.visibility === 'private' ? ' · only you' : ''} · {excerpt(r, 70)}
            </small>
          </span>
        </>
      ),
    })),
    ...chats.map((c) => ({
      target: { type: 'chat' as const, id: c.id },
      node: (
        <>
          <KindIcon kind="channel" />
          <span className="truncate">
            <strong>{chatTitle(c, s)}</strong>
            <small>{c.kind === 'channel' ? 'Channel' : 'Conversation'}</small>
          </span>
        </>
      ),
    })),
  ];
  // With nothing typed, the things to do come first; once you type, what you can open does.
  const acts: typeof rows = actions.map((a) => ({
    run: a.run,
    node: (
      <>
        <Zap size={14} />
        <span className="truncate">
          <strong>{a.label}</strong>
          {a.hint && <small>{a.hint}</small>}
        </span>
      </>
    ),
  }));
  const all = q ? [...rows, ...acts].slice(0, 12) : [...rows.slice(0, 6), ...acts];
  const choose = (row: (typeof all)[number]) => {
    close();
    if (row.run) row.run();
    else if (row.target) picker.onPick(row.target);
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="find" role="dialog" aria-label={picker.title}>
        <label>
          <Search size={15} />
          <input
            autoFocus
            value={query}
            placeholder={picker.title}
            aria-label={picker.title}
            onChange={(e) => {
              setQuery(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown')
                (e.preventDefault(), setAt((i) => Math.min(all.length - 1, i + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
              if (e.key === 'Enter' && all[at]) choose(all[at]);
              if (e.key === 'Escape') close();
            }}
          />
        </label>
        <div className="find-rows" role="listbox">
          {all.length === 0 && <p className="feed-empty">Nothing matches.</p>}
          {all.map((row, i) => (
            <button
              key={i}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setAt(i)}
              onClick={() => choose(row)}
            >
              {row.node}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
