import { useMemo, useState } from 'react';
import {
  AlignLeft,
  FileText,
  Folder,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Lock,
  MessageSquareText,
  PanelLeftClose,
  Pin,
  Search,
} from 'lucide-react';
import { useWorkspace } from './workspace.tsx';
import { Actor } from '../features/agents/Character.tsx';
import { conversationLabel } from '../features/conversations/audience.ts';
import type { Resource } from '../../shared/types.ts';

const icons = {
  note: <AlignLeft size={14} />,
  doc: <FileText size={14} />,
  pin: <Pin size={14} />,
  image: <ImageIcon size={14} />,
  plan: <ListChecks size={14} />,
  folder: <Folder size={14} />,
};

/** Find anything you are allowed to see, across every space, and go to it. */
export function FindSheet() {
  const { s, setUi, openConversation } = useWorkspace();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const spaceName = (id: string | null) => s.spaces.find((x) => x.id === id)?.name ?? '';
  const results = useMemo(() => {
    if (q.length < 2) return null;
    const has = (text: string) => text.toLowerCase().includes(q);
    return {
      items: s.resources
        .filter((r) => r.kind !== 'plan' && (has(r.title) || (r.kind !== 'image' && has(r.body))))
        .slice(0, 12),
      messages: s.messages
        .filter((m) => has(m.text))
        .slice(-8)
        .reverse(),
      who: s.users.filter((u) => !u.retired && u.id !== s.me.id && has(u.name)).slice(0, 6),
      steps: s.goals.filter((g) => has(g.title)).slice(0, 6),
    };
  }, [q, s]);
  const goTo = (r: Resource) => {
    const base = { find: false, spaceId: r.spaceId, agentId: null };
    if (r.kind === 'doc') setUi({ ...base, readerId: r.id, selectedId: r.id, wide: false });
    else if (r.kind === 'folder') setUi({ ...base, surface: 'graph', readerId: null });
    else setUi({ ...base, surface: 'canvas', readerId: null, wide: false, selectedId: r.id });
  };
  const excerpt = (text: string) => {
    const at = text.toLowerCase().indexOf(q);
    const from = Math.max(0, at - 24);
    return (from ? '…' : '') + text.replace(/\s+/g, ' ').slice(from, from + 90);
  };
  const empty =
    results &&
    !results.items.length &&
    !results.messages.length &&
    !results.who.length &&
    !results.steps.length;
  return (
    <div className="sheet find-sheet" aria-label="Find">
      <header>
        <Search size={15} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setUi({ find: false })}
          placeholder="Find anything"
          aria-label="Find anything"
        />
        <button aria-label="Close" onClick={() => setUi({ find: false })}>
          <PanelLeftClose size={16} />
        </button>
      </header>
      <div className="rail-scroll">
        {!results && (
          <p className="rail-empty">
            Search notes, documents, pinned messages, conversations, plan steps, people and agents
            across every space you can see.
          </p>
        )}
        {empty && <p className="rail-empty">Nothing matches “{query}”.</p>}
        {results && results.items.length > 0 && (
          <section>
            <h3>Items</h3>
            {results.items.map((r) => (
              <button key={r.id} className="find-row" onClick={() => goTo(r)}>
                {icons[r.kind]}
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {spaceName(r.spaceId)}
                    {r.visibility === 'private' &&
                    s.spaces.find((x) => x.id === r.spaceId)?.kind === 'project'
                      ? ' · only you'
                      : ''}
                  </small>
                </span>
                {r.visibility === 'private' && <Lock size={11} />}
              </button>
            ))}
          </section>
        )}
        {results && results.steps.length > 0 && (
          <section>
            <h3>Plan steps</h3>
            {results.steps.map((g) => (
              <button
                key={g.id}
                className="find-row"
                onClick={() => {
                  const plan = s.resources.find(
                    (r) => r.kind === 'plan' && r.spaceId === g.spaceId,
                  );
                  setUi({
                    find: false,
                    spaceId: g.spaceId,
                    surface: 'canvas',
                    readerId: null,
                    selectedId: plan?.id ?? null,
                  });
                }}
              >
                <ListChecks size={14} />
                <span>
                  <strong>{g.title}</strong>
                  <small>
                    {spaceName(g.spaceId)}
                    {g.done ? ' · done' : ''}
                  </small>
                </span>
              </button>
            ))}
          </section>
        )}
        {results && results.messages.length > 0 && (
          <section>
            <h3>Said</h3>
            {results.messages.map((m) => {
              const c = s.conversations.find((x) => x.id === m.conversationId);
              const author = s.users.find((u) => u.id === m.authorId);
              return (
                <button
                  key={m.id}
                  className="find-row"
                  onClick={() => {
                    if (c?.spaceId) setUi({ spaceId: c.spaceId });
                    openConversation(m.conversationId);
                    setUi({ find: false });
                  }}
                >
                  {c?.kind === 'channel' ? <Hash size={14} /> : <MessageSquareText size={14} />}
                  <span>
                    <strong>{excerpt(m.text)}</strong>
                    <small>
                      {author?.name} · {c ? conversationLabel(s, c).label : ''}
                    </small>
                  </span>
                </button>
              );
            })}
          </section>
        )}
        {results && results.who.length > 0 && (
          <section>
            <h3>People and agents</h3>
            {results.who.map((u) => (
              <button
                key={u.id}
                className="find-row"
                onClick={() =>
                  u.kind === 'agent'
                    ? setUi({ find: false, agentId: u.id, readerId: null, wide: false })
                    : setUi((old) => ({
                        find: false,
                        audience: {
                          ...old.audience,
                          [old.spaceId ?? '']: { kind: 'person', userId: u.id },
                        },
                      }))
                }
              >
                <Actor user={u} jobs={s.jobs} size={18} />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.kind === 'agent'
                      ? u.role === 'personal'
                        ? 'Your private agent'
                        : `Agent in ${spaceName(u.spaceId ?? null)}`
                      : 'Message them'}
                  </small>
                </span>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
