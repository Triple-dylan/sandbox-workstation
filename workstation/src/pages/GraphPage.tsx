import { useClickAway } from '../app/clickAway.ts';
import { useRef, useState } from 'react';
import { Columns2, SlidersHorizontal, Star, X } from 'lucide-react';
import { useWorkspace } from '../app/workspace.tsx';
import { api } from '../data/client.ts';
import { KindIcon, ago, excerpt, kindName } from '../app/util.tsx';
import { lastVisit, useSaved, writeSaved, type GraphFilter } from '../app/saved.ts';
import { Graph } from '../features/graph/Graph.tsx';
import { noFilter } from '../features/graph/tree.ts';

const kinds: { id: GraphFilter['kind']; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'doc', label: 'Documents' },
  { id: 'sheet', label: 'Sheets' },
  { id: 'deck', label: 'Decks' },
  { id: 'canvas', label: 'Canvases' },
  { id: 'asset', label: 'Assets' },
];
const same = (a: GraphFilter, b: GraphFilter) =>
  a.kind === b.kind && a.mine === b.mine && a.recent === b.recent && !!a.archive === !!b.archive;

/**
 * The graph is your own view of everything you can see in a space, private and shared. You narrow
 * it with filters and saved views, and ask your agent about it from the rail; answers light up the
 * pages they came from instead of sending you somewhere else.
 */
export function GraphPage() {
  const { s, ui, setUi, space, resource, open, user, myChat, ask, run } = useWorkspace();
  const [filter, setFilter] = useState<GraphFilter>(noFilter);
  const [sinceVisit, setSinceVisit] = useState(false);
  const [naming, setNaming] = useState(false);
  const [panel, setPanel] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const panelBox = useRef<HTMLDivElement>(null);
  useClickAway(panel, () => setPanel(false), bar, panelBox);
  const saved = useSaved(space.id);
  const visit = useRef(lastVisit(space.id));
  const week = useRef(new Date(Date.now() - 7 * 86_400_000).toISOString());
  const since = sinceVisit ? visit.current || week.current : week.current;
  const selectedId = ui.selection[0] ?? null;
  const page = resource(selectedId);
  // The pages the latest answer drew on, while that answer is on show.
  const answer = myChat
    ? s.messages.filter((m) => m.conversationId === myChat.id && m.authorId !== s.me.id).at(-1)
    : undefined;
  const lit = ui.railOpen && answer ? answer.sourceIds : [];
  const filtering = !same(filter, noFilter);
  // One short line for what is narrowing the graph, shown while the panel is closed.
  const view = sinceVisit
    ? 'Since I was last here'
    : saved.views.find((v) => same(v.filter, filter))?.name;
  const active = view
    ? [view]
    : [
        filter.kind !== 'all' ? kinds.find((k) => k.id === filter.kind)!.label : '',
        filter.archive ? 'Archive' : '',
        filter.mine ? 'Only mine' : '',
        filter.recent ? 'Changed this week' : '',
      ].filter(Boolean);
  const summary = active.join(' · ');
  const clear = () => {
    setSinceVisit(false);
    setFilter(noFilter);
  };
  const toggle = (patch: Partial<GraphFilter>) => {
    setSinceVisit(false);
    setFilter((f) => ({ ...f, ...patch }));
  };
  return (
    <div className="graph-page">
      <Graph
        filter={filter}
        since={since}
        lit={lit}
        selected={selectedId}
        onSelect={(id) => setUi({ selection: id ? [id] : [] })}
      />
      <div className="graph-filter-bar" ref={bar}>
        <button
          className="chip"
          aria-expanded={panel}
          aria-label="Filter the graph"
          onClick={() => setPanel(!panel)}
        >
          <SlidersHorizontal size={13} /> {active.length ? summary : 'Filter'}
        </button>
        {active.length > 0 && !panel && (
          <button className="chip ghost" aria-label="Clear filters" onClick={clear}>
            <X size={12} />
          </button>
        )}
      </div>
      {panel && (
        <div
          className="graph-filter-panel"
          role="dialog"
          aria-label="Filter the graph"
          ref={panelBox}
        >
          <div className="graph-filters" role="toolbar" aria-label="Narrow the graph">
            <span className="seg">
              {kinds.map((k) => (
                <button
                  key={k.id}
                  aria-pressed={filter.kind === k.id}
                  onClick={() => toggle({ kind: k.id })}
                >
                  {k.label}
                </button>
              ))}
            </span>
            <span className="seg" role="radiogroup" aria-label="Live or archive">
              <button
                role="radio"
                aria-checked={!filter.archive}
                onClick={() => toggle({ archive: false })}
              >
                Live
              </button>
              <button
                role="radio"
                aria-checked={!!filter.archive}
                onClick={() => toggle({ archive: true })}
              >
                Archive
              </button>
            </span>
            <button aria-pressed={filter.mine} onClick={() => toggle({ mine: !filter.mine })}>
              Only mine
            </button>
            <button
              aria-pressed={filter.recent && !sinceVisit}
              onClick={() => {
                setSinceVisit(false);
                setFilter((f) => ({ ...f, recent: sinceVisit ? true : !f.recent }));
              }}
            >
              Changed this week
            </button>
          </div>
          <div className="graph-saved" aria-label="Saved views and questions">
            <button
              aria-pressed={sinceVisit}
              onClick={() => {
                const on = !sinceVisit;
                setSinceVisit(on);
                setFilter({ ...noFilter, recent: on });
              }}
            >
              <Star size={12} /> Since I was last here
            </button>
            {saved.views.map((v) => (
              <span key={v.name} className="chip">
                <button
                  aria-pressed={!sinceVisit && same(filter, v.filter)}
                  onClick={() => {
                    setSinceVisit(false);
                    setFilter(v.filter);
                  }}
                >
                  <Star size={12} /> {v.name}
                </button>
                <button
                  aria-label={`Forget ${v.name}`}
                  onClick={() =>
                    writeSaved(space.id, (x) => ({
                      ...x,
                      views: x.views.filter((y) => y.name !== v.name),
                    }))
                  }
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {saved.questions.map((q) => (
              <span key={q} className="chip">
                <button title={`Ask again: ${q}`} onClick={() => void ask(q)}>
                  <Star size={12} /> <span className="truncate">{q}</span>
                </button>
                <button
                  aria-label="Forget this question"
                  onClick={() =>
                    writeSaved(space.id, (x) => ({
                      ...x,
                      questions: x.questions.filter((y) => y !== q),
                    }))
                  }
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {filtering && !sinceVisit && !saved.views.some((v) => same(v.filter, filter)) && (
              <>
                {naming ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = (
                        e.currentTarget.elements.namedItem('name') as HTMLInputElement
                      ).value.trim();
                      if (name)
                        writeSaved(space.id, (x) => ({
                          ...x,
                          views: [
                            ...x.views.filter((v) => v.name !== name),
                            { name, filter },
                          ].slice(-8),
                        }));
                      setNaming(false);
                    }}
                  >
                    <input
                      name="name"
                      autoFocus
                      placeholder="Name this view"
                      aria-label="Name this view"
                      onBlur={(e) => !e.target.value && setNaming(false)}
                    />
                  </form>
                ) : (
                  <button className="dashed" onClick={() => setNaming(true)}>
                    + Save this view
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {page && (
        <aside className="graph-card" aria-label={page.title}>
          <header>
            <KindIcon kind={page.kind} size={15} />
            <strong className="truncate">{page.title}</strong>
            <button aria-label="Close" onClick={() => setUi({ selection: [] })}>
              <X size={13} />
            </button>
          </header>
          <small>
            {kindName[page.kind]} ·{' '}
            {page.visibility === 'private' || space.kind === 'personal'
              ? 'only you'
              : `shared with ${space.name}`}
            {' · '}
            {user(page.updatedBy)?.name ?? 'someone'}, {ago(page.updatedAt)}
          </small>
          {page.kind === 'asset' && page.body.startsWith('data:') && (
            <img src={page.body} alt={page.title} />
          )}
          <p>{excerpt(page, 220) || 'Empty so far.'}</p>
          {page.source && (
            <small>
              Brought in from {page.source.name} · {page.source.type}
            </small>
          )}
          <div>
            <button className="primary" onClick={() => open({ type: 'page', id: page.id }, true)}>
              <Columns2 size={13} /> Open beside
            </button>
            <button onClick={() => open({ type: 'page', id: page.id })}>Open</button>
            {page.archived && (
              <button
                onClick={() =>
                  void run(() =>
                    api(`/resources/${page.id}`, { method: 'PATCH', body: { archived: false } }),
                  )
                }
              >
                Bring back
              </button>
            )}
          </div>
        </aside>
      )}
      {lit.length > 0 && (
        <p className="graph-lit">
          Lit: the {lit.length} page{lit.length === 1 ? '' : 's'} the last answer came from.
        </p>
      )}
    </div>
  );
}
