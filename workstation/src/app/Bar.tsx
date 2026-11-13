import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  FilePlus2,
  History,
  Lock,
  Maximize2,
  MessageSquareReply,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { Character, agentState } from '../features/agents/Character.tsx';
import { MessageView } from '../features/feed/Feed.tsx';
import { chatTitle, scopeOf } from './util.tsx';
import { writeSaved } from './saved.ts';
import { useWorkspace } from './workspace.tsx';
import { DRAG } from './scope.ts';
import type { Message } from '../../shared/types.ts';

/**
 * Your own agent, on every screen. It is private to you. What it is asked about follows what is on
 * screen and is always named in the bar; it never decides who a message goes to.
 */
export function Bar({ pill }: { pill: boolean }) {
  const {
    s,
    ui,
    setUi,
    space,
    columns,
    myAgent,
    myChat,
    ask,
    open,
    run,
    user,
    notify,
    commands,
    resource,
  } = useWorkspace();
  const [menu, setMenu] = useState<'agent' | 'sees' | null>(null);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const scope = scopeOf(ui, s, columns);
  const thread = myChat ? s.messages.filter((m) => m.conversationId === myChat.id) : [];
  const lastId = thread.at(-1)?.id;
  const busy = s.jobs.find(
    (j) => j.conversationId === myChat?.id && (j.status === 'running' || j.status === 'queued'),
  );
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [text, pill]);
  useEffect(() => {
    if (ui.barOpen) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lastId, ui.barOpen, busy?.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setUi({ barOpen: true });
        setTimeout(() => box.current?.focus(), 30);
      }
      if (e.key === 'Escape' && ui.barOpen && document.activeElement === box.current)
        setUi({ barOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.barOpen, setUi]);
  if (!myAgent || !myChat) return null;
  const roster = s.users.filter(
    (u) => u.kind === 'agent' && u.role === 'project' && u.spaceId === space.id && !u.retired,
  );
  // Your own agent unless you chose one of the space's; either way the exchange is private to you.
  const talking = roster.find((a) => a.id === ui.barAgent) ?? myAgent;
  const own = talking.id === myAgent.id;
  const state = s.activity.some((a) => a.agentId === talking.id && a.status === 'working')
    ? 'working'
    : agentState(talking.id, s.jobs);
  const skills = s.skills.filter((k) => (talking.skillIds ?? []).includes(k.id));

  if (pill)
    return (
      <button
        className="bar-pill"
        onClick={() => {
          setUi({ barOpen: true });
          setTimeout(() => box.current?.focus(), 30);
        }}
      >
        <Character agent={talking} size={20} state={state} /> Ask{' '}
        {own ? 'your agent' : talking.name}
      </button>
    );

  const put = async (body: string) => {
    setMenu(null);
    await ask(body, { handTo: own ? null : talking.id });
  };
  // A line starting with "/" does something instead of asking: the same actions as Find.
  const typedCommand = text.startsWith('/') ? text.slice(1).trim().toLowerCase() : null;
  const matching =
    typedCommand === null
      ? []
      : commands()
          .filter((c) => c.label.toLowerCase().includes(typedCommand))
          .slice(0, 6);
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (typedCommand !== null) {
      if (!matching[0]) return notify('No action by that name. Type / on its own to see them.');
      setText('');
      return matching[0].run();
    }
    setText('');
    await put(body);
  };
  // Where a drafted reply can go: the conversation or page feed that is on screen.
  const shown = columns === 1 ? [ui.panes[ui.active]] : ui.panes;
  const replyTarget = shown.find(
    (t) => (t.type === 'chat' && t.id !== myChat.id) || t.type === 'page',
  );
  const replyKey =
    replyTarget?.type === 'chat'
      ? `chat:${replyTarget.id}`
      : replyTarget?.type === 'page'
        ? `page:${replyTarget.id}`
        : null;
  const replyName =
    replyTarget?.type === 'chat'
      ? chatTitle(
          s.conversations.find((c) => c.id === replyTarget.id)!,
          s,
        )
      : 'this page';
  const onGraph = shown.some((t) => t.type === 'graph');
  // The panel shows the exchange in hand: your last question and what came back.
  const lastAsk = thread.map((m) => m.authorId).lastIndexOf(s.me.id);
  const latest = thread.slice(Math.max(0, lastAsk)).slice(-5);
  const questionFor = (m: Message) => {
    const at = thread.indexOf(m);
    for (let i = at - 1; i >= 0; i--) if (thread[i].authorId === s.me.id) return thread[i].text;
    return '';
  };
  const saveAsPage = async (m: Message) => {
    const title = questionFor(m).slice(0, 80) || 'Answer';
    const made = await run(() =>
      api<{ id: string }>('/resources', {
        body: { spaceId: space.id, kind: 'doc', title, body: m.text, visibility: 'private' },
      }),
    );
    if (made) {
      open({ type: 'page', id: made.id }, true);
      notify('Saved as a page only you can see. Share it when you are ready.');
    }
  };
  const actions = (m: Message) =>
    user(m.authorId)?.kind === 'agent' && (
      <p className="answer-actions">
        {replyKey && (
          <button
            title={`Put this in the reply box for ${replyName}. You send it.`}
            onClick={() => {
              setUi((old) => ({ drafts: { ...old.drafts, [replyKey]: m.text } }));
              notify(
                `Drafted in the reply box for ${replyName}. Nothing is sent until you send it.`,
              );
            }}
          >
            <MessageSquareReply size={12} /> Use as my reply
          </button>
        )}
        <button onClick={() => void saveAsPage(m)}>
          <FilePlus2 size={12} /> Save as a page
        </button>
        {onGraph && questionFor(m) && (
          <button
            onClick={() => {
              const q = questionFor(m);
              writeSaved(space.id, (saved) => ({
                ...saved,
                questions: [q, ...saved.questions.filter((x) => x !== q)].slice(0, 8),
              }));
              notify('Saved. It is under the graph filters whenever you want to ask it again.');
            }}
          >
            <Star size={12} /> Save this question
          </button>
        )}
      </p>
    );

  const onScreen = scopeOf({ ...ui, barSees: 'screen' }, s, columns);
  const lookingAt = shown.find((x) => x && (x.type === 'page' || x.type === 'chat'));
  const kind = lookingAt?.type === 'page' ? resource(lookingAt.id)?.kind : undefined;
  // Things worth doing with what is on screen, one click each.
  const suggestions: { label: string; ask: string }[] = [
    ...(ui.selection.length
      ? [
          {
            label: 'Summarise the selection',
            ask: 'Summarise what I have selected in a few lines.',
          },
          {
            label: 'Turn it into a page',
            ask: 'Create a document that pulls together what I have selected.',
          },
        ]
      : kind === 'doc'
        ? [
            { label: 'Summarise this page', ask: 'Summarise this page in five lines or fewer.' },
            {
              label: 'What is unclear or missing?',
              ask: 'What is unclear, unsupported or missing on this page? Be specific.',
            },
          ]
        : kind === 'sheet'
          ? [
              {
                label: 'What stands out in these numbers?',
                ask: 'What stands out in this sheet? Name the rows.',
              },
            ]
          : kind === 'canvas'
            ? [
                {
                  label: 'What is this board saying?',
                  ask: 'Explain what this canvas lays out and what is still undecided.',
                },
              ]
            : lookingAt?.type === 'chat'
              ? [
                  {
                    label: 'Catch me up here',
                    ask: 'Catch me up on this conversation: what was decided and what is open.',
                  },
                  {
                    label: 'Draft my reply',
                    ask: 'Draft a short reply from me to the latest message here.',
                  },
                ]
              : [
                  {
                    label: 'What changed lately?',
                    ask: 'What changed in this space recently, and what needs me? Name the pages.',
                  },
                ]),
    { label: 'Find where we decided…', ask: 'Find where we decided ' },
  ];
  return (
    <div className={`bar-wrap ${ui.barOpen ? 'open' : ''}`}>
      {ui.barOpen && (
        <section className="bar-panel" aria-label={`${myAgent.name}, private to you`}>
          <header>
            <strong>{myAgent.name}</strong>
            <small>
              Private to you
              {s.runtime.id === 'scripted' ? ' · scripted stand-in, no model connected' : ''}
            </small>
            <button
              aria-label="Open this conversation as a page"
              title="Open as a page"
              onClick={() => {
                open({ type: 'chat', id: myChat.id }, true);
                setUi({ barOpen: false });
              }}
            >
              <Maximize2 size={13} />
            </button>
            <button aria-label="Close" onClick={() => setUi({ barOpen: false })}>
              <X size={14} />
            </button>
          </header>
          <div className="bar-thread" ref={list}>
            {thread.length === 0 && (
              <p className="feed-empty">
                Ask about what is on screen, or the whole space. Answers stay between you and{' '}
                {myAgent.name}; it can hand work to the space’s agents and draft replies for you to
                send.
              </p>
            )}
            {thread.length > latest.length && (
              <button
                className="link earlier"
                onClick={() => {
                  open({ type: 'chat', id: myChat.id }, true);
                  setUi({ barOpen: false });
                }}
              >
                Earlier · open the conversation beside
              </button>
            )}
            {latest.map((m) => (
              <MessageView key={m.id} m={m} quiet extra={actions(m)} />
            ))}
            {busy && (
              <p className="work">
                <Character agent={user(busy.agentId) ?? myAgent} size={20} state="working" />
                {user(busy.agentId)?.name ?? myAgent.name} is working…
              </p>
            )}
          </div>
        </section>
      )}
      {focused && !text && !menu && (
        <div className="bar-do" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((sug) => (
            <button
              key={sug.label}
              onClick={() => {
                // A suggestion that ends in an ellipsis is a start for you to finish.
                if (sug.label.endsWith('…')) return setText(sug.ask);
                void put(sug.ask);
              }}
            >
              {sug.label}
            </button>
          ))}
          {skills.map((k) => (
            <button
              key={k.id}
              title={k.description}
              onClick={() => void put(`Use your skill "${k.name}" on what I am looking at.`)}
            >
              <Zap size={11} /> {k.name}
            </button>
          ))}
          <button className="quiet" onClick={() => setText('/')}>
            / to do something
          </button>
        </div>
      )}
      {typedCommand !== null && (
        <div
          className="bar-menu commands"
          role="listbox"
          aria-label="Actions"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matching.length === 0 && <p>No action by that name.</p>}
          {matching.map((c, i) => (
            <button
              key={c.label}
              role="option"
              aria-selected={i === 0}
              onClick={() => {
                setText('');
                c.run();
              }}
            >
              <Zap size={13} /> {c.label}
              {c.hint && <small>{c.hint}</small>}
            </button>
          ))}
        </div>
      )}
      {menu === 'agent' && (
        <div className="bar-menu" role="menu" aria-label="Who to ask">
          <p>Who you are asking. Whoever you pick answers only to you.</p>
          {[myAgent, ...roster].map((a) => (
            <button
              key={a.id}
              role="menuitemradio"
              aria-checked={a.id === talking.id}
              onClick={() => {
                setUi({ barAgent: a.id === myAgent.id ? null : a.id });
                setMenu(null);
                box.current?.focus();
              }}
            >
              <Character agent={a} size={28} />
              <span>
                <strong>{a.name}</strong>
                <small>
                  {a.id === myAgent.id
                    ? 'Your own. Sees what you can see, and can pass work to the others.'
                    : a.purpose || `Shared with ${space.name}`}
                </small>
              </span>
              {a.id === myAgent.id ? <Lock size={12} /> : <Users size={12} />}
            </button>
          ))}
          <button className="plain" onClick={() => (setMenu(null), setUi({ dialog: 'agent' }))}>
            + New agent
          </button>
        </div>
      )}
      {menu === 'sees' && (
        <div className="bar-menu" role="menu" aria-label="What it looks at">
          <p>What {talking.name} reads to answer you. This never decides who sees the answer.</p>
          {(
            [
              ['screen', 'What is on screen', onScreen.label],
              [
                'space',
                'The whole space',
                `Everything ${own ? 'you' : talking.name} can open in ${space.kind === 'personal' ? 'your space' : space.name}`,
              ],
              ['none', 'Nothing', 'Just your words'],
            ] as const
          ).map(([id, name, detail]) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={ui.barSees === id}
              onClick={() => {
                setUi({ barSees: id });
                setMenu(null);
                box.current?.focus();
              }}
            >
              <span>
                <strong>{name}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
          {ui.barExtras.length > 0 && (
            <div className="extras">
              {ui.barExtras.map((id) => (
                <span key={id}>
                  {resource(id)?.title ?? 'Page'}
                  <button
                    aria-label="Remove"
                    onClick={() => setUi({ barExtras: ui.barExtras.filter((x) => x !== id) })}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p>Drag a page from the list onto the bar to add it.</p>
        </div>
      )}
      <form
        className="bar"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        onDragOver={(e) => [...e.dataTransfer.types].includes(DRAG) && e.preventDefault()}
        onDrop={(e) => {
          try {
            const dropped = JSON.parse(e.dataTransfer.getData(DRAG));
            if (dropped.type !== 'page') return;
            e.preventDefault();
            e.stopPropagation();
            setUi({ barExtras: [...new Set([...ui.barExtras, dropped.id])].slice(0, 6) });
          } catch {
            // Not something from the list.
          }
        }}
      >
        <button
          type="button"
          className="bar-agent"
          aria-label={`Asking ${talking.name}. Change who you ask`}
          aria-expanded={menu === 'agent'}
          onClick={() => setMenu(menu === 'agent' ? null : 'agent')}
        >
          <Character agent={talking} size={28} state={state} />
          <span className="truncate">{own ? 'Your agent' : talking.name}</span>
          <ChevronDown size={12} />
        </button>
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={`Ask ${own ? 'your agent' : talking.name}, or / to do something`}
          aria-label={`Ask ${talking.name}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
            if (e.key === 'Escape') (setMenu(null), setText(''));
          }}
        />
        <button
          type="button"
          className="scope"
          aria-label={`It will read: ${scope.label}. Change`}
          aria-expanded={menu === 'sees'}
          title="What it reads to answer you"
          onClick={() => setMenu(menu === 'sees' ? null : 'sees')}
        >
          <small>reads</small> {scope.label} <ChevronDown size={11} />
        </button>
        <button
          type="button"
          className="bar-history"
          aria-label={ui.barOpen ? 'Hide the conversation' : 'Show the conversation'}
          aria-expanded={ui.barOpen}
          title="The conversation so far"
          onClick={() => setUi({ barOpen: !ui.barOpen })}
        >
          <History size={15} />
        </button>
        <button className="send" type="submit" aria-label="Ask" disabled={!text.trim()}>
          <ArrowUp size={15} />
        </button>
      </form>
    </div>
  );
}
