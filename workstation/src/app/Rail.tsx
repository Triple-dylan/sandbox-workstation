import { useClickAway } from './clickAway.ts';
import { IncomingRequests, OutgoingRequests, SendDraft, draftFor } from './AgentRequests.tsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronsRight,
  Copy,
  CornerDownRight,
  FilePlus2,
  LayoutDashboard,
  MessageSquareReply,
  Paperclip,
  Plus,
  Send,
  Settings2,
  Share,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { Character, agentState } from '../features/agents/Character.tsx';
import { ApprovalCard, SourceChips } from '../features/feed/Feed.tsx';
import { ShareMenu, type Shared } from '../features/share/Share.tsx';
import { Md, chatTitle, scopeOf } from './util.tsx';
import { useWorkspace } from './workspace.tsx';
import { DRAG } from './scope.ts';
import { bringIn } from '../features/import/bringIn.ts';
import { addressed, useMentions } from '../features/feed/mentions.tsx';
import type { Id, Message, Resource } from '../../shared/types.ts';

type Ask = { label: string; ask: string };

/** The few things worth doing with what is on screen, one click each. */
const ASKS: Record<
  'selection' | 'pieces' | 'doc' | 'sheet' | 'deck' | 'canvas' | 'chat' | 'space',
  Ask[]
> = {
  selection: [
    { label: 'Rewrite it', ask: 'Rewrite this so it is clearer. Keep the meaning.' },
    { label: 'Make it shorter', ask: 'Make this shorter without losing anything that matters.' },
    {
      label: 'Check it',
      ask: 'Is this right? Check it against our pages and say what supports or contradicts it.',
    },
    { label: 'Find support for it', ask: 'Find what in our pages supports this, and quote it.' },
  ],
  pieces: [
    {
      label: 'What if this slips?',
      ask: 'What happens to the rest of the plan if what I selected slips by a week? Name what moves.',
    },
    { label: 'Summarise', ask: 'Summarise what I have selected in a few lines.' },
    {
      label: 'Find related',
      ask: 'What else in this space relates to what I have selected? Name the pages.',
    },
    {
      label: 'Turn it into a page',
      ask: 'Create a document that pulls together what I have selected.',
    },
  ],
  doc: [
    {
      label: 'Check the claims',
      ask: 'Which claims on this page are not backed up by our other pages? Quote each line.',
    },
    {
      label: 'What changed lately',
      ask: 'What changed on this page recently, and who changed it?',
    },
    {
      label: 'What is unclear or missing',
      ask: 'What is unclear, unsupported or missing on this page? Be specific.',
    },
    { label: 'Summarise', ask: 'Summarise this page in five lines or fewer.' },
  ],
  sheet: [
    { label: 'What stands out', ask: 'What stands out in this sheet? Name the rows.' },
    {
      label: 'Check the maths',
      ask: 'Check the numbers and formulas in this sheet. Name any row that looks wrong.',
    },
  ],
  deck: [
    {
      label: 'Tighten the slides',
      ask: 'Which slides are too long or unclear? Suggest shorter wording for each.',
    },
    { label: 'Speaker notes', ask: 'Draft short speaker notes for each slide.' },
  ],
  canvas: [
    {
      label: 'What is this board saying',
      ask: 'Explain what this canvas lays out and what is still undecided.',
    },
    {
      label: 'What is at risk',
      ask: 'What on this board is at risk of slipping, and what depends on it?',
    },
  ],
  chat: [
    {
      label: 'Catch me up',
      ask: 'Catch me up on this conversation since I was last here: what was decided and what is open.',
    },
    {
      label: 'What was decided',
      ask: 'List what has been decided in this conversation, with who decided it.',
    },
    { label: 'What needs me', ask: 'What in this conversation is waiting on me?' },
    { label: 'Draft my reply', ask: 'Draft a short reply from me to the latest message here.' },
  ],
  space: [
    {
      label: 'What changed lately',
      ask: 'What changed in this space recently, and what needs me? Name the pages.',
    },
  ],
};

/**
 * Your own agent, always on the right and private to you. Closed, it is a slim strip one click or ⌘J
 * away. It reads what is on screen, offers the few things worth doing with it, shows what it is
 * working on, and its answers point at the text they are about. Anything in it can be shared with
 * the team on purpose; nothing in it is seen by anyone else otherwise.
 */
export function Rail({ docked }: { docked: boolean }) {
  const ws = useWorkspace();
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
    jump,
    pick,
  } = ws;
  const popMenu = ws.menu;
  const [text, setText] = useState('');
  const [earlier, setEarlier] = useState(false);
  const attach = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<'sees' | null>(null);
  const seesMenu = useRef<HTMLDivElement>(null);
  const seesButton = useRef<HTMLButtonElement>(null);
  useClickAway(menu === 'sees', () => setMenu(null), seesMenu, seesButton);
  const [sharing, setSharing] = useState<{ id: Id; text: string } | null>(null);
  const [picked, setPicked] = useState<{ id: Id; text: string; top: number; left: number } | null>(
    null,
  );
  const [shared, setShared] = useState<Record<Id, Shared>>({});
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // Asked from a page header or elsewhere: start the box with what was chosen.
  useEffect(() => {
    if (ui.railText === null) return;
    setText(ui.railText);
    setUi({ railText: null });
    requestAnimationFrame(() => {
      const el = box.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, [ui.railText, setUi]);
  const rail = useRef<HTMLElement>(null);
  // Who you can bring in with @: this workspace's agents, and teammates' own agents (which reach
  // the teammate first).
  const teammates = new Set(
    s.members.filter((m) => m.spaceId === space.id && m.userId !== s.me.id).map((m) => m.userId),
  );
  const roster = s.users.filter(
    (u) =>
      u.kind === 'agent' &&
      !u.retired &&
      ((u.role === 'project' && u.spaceId === space.id) ||
        (u.role === 'personal' && !!u.ownerId && teammates.has(u.ownerId))),
  );
  const mentions = useMentions({ text, setText, agents: roster, jobs: s.jobs, box });
  const thread = myChat ? s.messages.filter((m) => m.conversationId === myChat.id) : [];
  const lastAnswer = [...thread].reverse().find((m) => user(m.authorId)?.kind === 'agent');
  const busy = s.jobs.find(
    (j) => j.conversationId === myChat?.id && (j.status === 'running' || j.status === 'queued'),
  );

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text, ui.railOpen]);
  // Open, it has been read; closed, a new answer puts a dot on the strip.
  useEffect(() => {
    if (ui.railOpen) setSeen(lastAnswer?.id);
  }, [ui.railOpen, lastAnswer?.id]);
  useEffect(() => {
    if (ui.railOpen) body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, ui.railOpen, busy?.id]);
  // Asking about a piece of a page opens the rail ready to type.
  useEffect(() => {
    if (ui.asking) setTimeout(() => box.current?.focus(), 30);
  }, [ui.asking]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        // Closed: open it. Open but elsewhere: go to its box. Already in it: fold it away.
        const next = !ui.railOpen || !rail.current?.contains(document.activeElement);
        setUi({ railOpen: next });
        if (next) setTimeout(() => box.current?.focus(), 30);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.railOpen, setUi]);
  // A selection inside one of its answers offers Copy, Share and Ask about this.
  useEffect(() => {
    const onUp = () =>
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        const node = sel?.anchorNode?.parentElement?.closest<HTMLElement>('[data-answer]');
        if (!text || !node || !rail.current?.contains(node) || !sel?.rangeCount)
          return setPicked(null);
        const r = sel.getRangeAt(0).getBoundingClientRect();
        const box = rail.current.getBoundingClientRect();
        setPicked({
          id: node.dataset.answer!,
          text,
          top: r.top - box.top - 40,
          left: Math.max(10, Math.min(r.left - box.left, box.width - 250)),
        });
      }, 0);
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  if (!myAgent || !myChat) return null;
  const working =
    !!busy || s.activity.some((a) => a.agentId === myAgent.id && a.status === 'working');
  const state = working ? 'working' : agentState(myAgent.id, s.jobs);

  if (!ui.railOpen)
    return (
      <aside className="rail-shut" aria-label="Your agent">
        <button
          className="rail-strip"
          onClick={() => {
            setUi({ railOpen: true });
            setTimeout(() => box.current?.focus(), 30);
          }}
          title="Your agent · ⌘J"
          aria-label={`Open your agent${lastAnswer && lastAnswer.id !== seen ? ', an answer is waiting' : ''}`}
        >
          <Character agent={myAgent} size={28} state={state} />
          {lastAnswer && lastAnswer.id !== seen && <i className="rail-dot" />}
          <span className="rail-strip-label">
            {working
              ? 'Working…'
              : lastAnswer && lastAnswer.id !== seen
                ? '1 answer waiting'
                : 'Your agent'}
          </span>
          <kbd>⌘J</kbd>
        </button>
      </aside>
    );

  const scope = scopeOf(ui, s, columns);
  const onScreen = scopeOf({ ...ui, barSees: 'screen' }, s, columns).label;
  const wholeSpace = scopeOf({ ...ui, barSees: 'space' }, s, columns).label;
  const shown = columns === 1 ? [ui.panes[ui.active]] : ui.panes;
  const lookingAt = shown.find((x) => x && (x.type === 'page' || x.type === 'chat'));
  const page = lookingAt?.type === 'page' ? resource(lookingAt.id) : undefined;
  const chat =
    lookingAt?.type === 'chat' ? s.conversations.find((c) => c.id === lookingAt.id) : undefined;
  const canvas = shown
    .map((t) => (t?.type === 'page' ? resource(t.id) : undefined))
    .find((r) => r?.kind === 'canvas');
  const asking = ui.asking && resource(ui.asking.resourceId) ? ui.asking : null;
  const status = busy
    ? 'Working on it'
    : asking
      ? 'Looking at your selection'
      : ui.selection.length
        ? `Looking at ${ui.selection.length} selected`
        : 'Only you see this';

  const suggestions =
    ASKS[
      asking
        ? 'selection'
        : ui.selection.length && page?.kind === 'canvas'
          ? 'pieces'
          : chat
            ? 'chat'
            : page && page.kind in ASKS
              ? (page.kind as keyof typeof ASKS)
              : 'space'
    ];
  const skills = s.skills.filter((k) => (myAgent.skillIds ?? []).includes(k.id));

  const put = async (words: string) => {
    setMenu(null);
    const anchor = asking ?? undefined;
    setUi({ asking: null });
    await ask(words, { anchor, handTo: addressed(words, roster)?.id ?? null });
  };
  const typedCommand = text.startsWith('/') ? text.slice(1).trim().toLowerCase() : null;
  const matching =
    typedCommand === null
      ? []
      : commands()
          .filter((c) => c.label.toLowerCase().includes(typedCommand))
          .slice(0, 6);
  const send = async () => {
    const words = text.trim();
    if (!words) return;
    if (typedCommand !== null) {
      if (!matching[0]) return notify('No action by that name. Type / on its own to see them.');
      setText('');
      return matching[0].run();
    }
    setText('');
    await put(words);
  };

  // The question an answer replies to, and the text on a page it was about.
  const questionOf = (m: Message) => {
    for (let i = thread.indexOf(m) - 1; i >= 0; i--)
      if (thread[i].authorId === s.me.id) return thread[i];
    return undefined;
  };
  const aboutOf = (m: Message) => {
    const q = questionOf(m);
    return q?.anchor && q.anchor.quote ? q.anchor : null;
  };
  const replyTarget = shown.find(
    (t) => (t?.type === 'chat' && t.id !== myChat.id) || t?.type === 'page',
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
  // Your agent's words, in a direct message to a teammate, for you to send.
  const sendTo = (m: Message, e: React.MouseEvent) => {
    const teammates = s.members
      .filter((x) => x.spaceId === space.id && x.userId !== s.me.id)
      .map((x) => user(x.userId))
      .filter((u): u is NonNullable<typeof u> => u?.kind === 'human');
    if (!teammates.length) return notify('Nobody else is in this workspace yet.');
    const r = e.currentTarget.getBoundingClientRect();
    popMenu(
      { clientX: r.left, clientY: r.bottom + 4, preventDefault: () => {} },
      teammates.map((p) => ({
        label: `To ${p.name}`,
        run: async () => {
          const dm =
            s.conversations.find((c) => c.kind === 'dm' && c.participantIds.includes(p.id)) ??
            (await run(() => api<{ id: string }>('/dms', { body: { userId: p.id } })));
          if (!dm) return;
          setUi((old) => ({ drafts: { ...old.drafts, [`chat:${dm.id}`]: m.text } }));
          open({ type: 'chat', id: dm.id }, true);
          notify(`Drafted to ${p.name}. Read it over; nothing is sent until you send it.`);
        },
      })),
    );
  };
  // Worth keeping as a page only when it reads like one.
  const pageLength = (t: string) =>
    t.length > 700 || (t.match(/^#{1,3} /gm)?.length ?? 0) >= 2 || t.split('\n').length > 12;
  const lastAnswerId = thread.at(-1)?.authorId !== s.me.id ? thread.at(-1)?.id : undefined;
  const saveAsPage = async (m: Message) => {
    const title = (questionOf(m)?.text ?? 'Answer').slice(0, 80);
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
  const putOnBoard = async (m: Message, board: Resource) => {
    const pieces = s.resources.filter((r) => r.parentId === board.id && r.placement && !r.archived);
    const chosen = pieces.filter((p) => ui.selection.includes(p.id));
    const near = chosen.length ? chosen : pieces;
    const x = near.length
      ? Math.max(...near.map((p) => p.placement!.x + p.placement!.width)) + 48
      : 80;
    const y = near.length ? Math.min(...near.map((p) => p.placement!.y)) : 80;
    const made = await run(() =>
      api<Resource>('/resources', {
        body: {
          spaceId: board.spaceId,
          parentId: board.id,
          kind: 'note',
          title: 'From my agent',
          body: m.text.slice(0, 1200),
          placement: { x, y, width: 280, height: 160 },
        },
      }),
    );
    if (made)
      notify(`Put on ${board.title}. Everyone on the board can see it.`, {
        label: 'Undo',
        run: () => void run(() => api(`/resources/${made.id}`, { method: 'DELETE' })),
      });
  };
  const takeBack = async (m: Message) => {
    const done = shared[m.id];
    if (!done) return;
    await run(() => api(`/messages/${done.messageId}`, { method: 'DELETE' }));
    setShared((old) => {
      const next = { ...old };
      delete next[m.id];
      return next;
    });
  };

  const lastAsk = thread.map((m) => m.authorId).lastIndexOf(s.me.id);
  // The last thing asked was stopped before an answer came.
  const lastJob = s.jobs
    .filter((j) => j.conversationId === myChat.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const stopped =
    lastJob?.status === 'failed' &&
    lastJob.error?.startsWith('Stopped') &&
    thread.at(-1)?.authorId === s.me.id;
  const latest = earlier ? thread : thread.slice(Math.max(0, lastAsk - 1)).slice(-6);

  const answer = (m: Message) => {
    const about = aboutOf(m);
    const aboutPage = about && resource(about.resourceId);
    const done = shared[m.id];
    return (
      <div key={m.id} className="rail-answer" data-answer={m.id}>
        <p className="rail-who">
          <Character agent={user(m.authorId) ?? myAgent} size={18} />
          {user(m.authorId)?.id === myAgent.id
            ? 'Your agent'
            : m.sharedFrom
              ? `${user(m.authorId)?.name} · sent by ${user(m.sharedFrom.ownerId)?.name}`
              : m.asked
                ? `${user(m.authorId)?.name} answered ${user(m.asked.agentId)?.id === myAgent.id ? 'your agent' : user(m.asked.agentId)?.name}`
                : `${user(m.authorId)?.name} · only you see this`}
          {m.runtime === 'scripted' && <span className="tag">scripted stand-in</span>}
        </p>
        {m.asked && (
          <p className="rail-asked">
            {user(m.asked.agentId)?.id === myAgent.id
              ? 'Your agent asked'
              : `${user(m.asked.agentId)?.name} asked`}
            : <span>“{m.asked.request}”</span>
          </p>
        )}
        {about && aboutPage && (
          <button
            className="rail-ref"
            onClick={() => jump({ resourceId: aboutPage.id, quote: about.quote })}
            title={`Show it on ${aboutPage.title}`}
          >
            <CornerDownRight size={12} />
            <b>{aboutPage.title}</b>
            <span className="truncate">“{about.quote}”</span>
          </button>
        )}
        <div className={done ? 'rail-text was-shared' : 'rail-text'}>
          <Md text={m.text} />
        </div>
        {m.read.length > 0 && (
          <p className="rail-read">
            <span>Read</span>
            {m.read.map((title) => {
              const page = s.resources.find(
                (r) => r.title === title.replace(/ \(pinned\)$/, '') && r.kind !== 'folder',
              );
              return page ? (
                <button key={title} onClick={() => open({ type: 'page', id: page.id }, true)}>
                  {title}
                </button>
              ) : (
                <i key={title}>{title}</i>
              );
            })}
            <button
              className="rail-read-add"
              title="Give it another page to read next time"
              onClick={() =>
                pick({
                  title: 'Add a page for your agent to read',
                  onPick: (t) => {
                    if (t.type !== 'page') return;
                    setUi({ barExtras: [...new Set([...ui.barExtras, t.id])].slice(0, 6) });
                    notify(`It will read ${resource(t.id)?.title ?? 'that page'} too.`);
                  },
                })
              }
            >
              <Plus size={11} /> page
            </button>
          </p>
        )}
        {m.id === lastAnswerId && m.replies.length > 0 && !m.approvalId && (
          <p className="rail-replies">
            {m.replies.map((r) => (
              <button key={r} onClick={() => void put(r)}>
                {r}
              </button>
            ))}
          </p>
        )}
        {m.approvalId && <ApprovalCard approvalId={m.approvalId} />}
        {(() => {
          const request = draftFor(s.agentRequests, thread, m);
          if (!request) return null;
          // A draft that failed is not something to send: write it yourself instead.
          const failed = s.jobs.find((j) => j.id === m.jobId)?.status === 'failed';
          return <SendDraft request={request} text={failed ? '' : m.text} />;
        })()}
        {m.asked && user(m.authorId)?.role === 'project' && (
          <button
            className="link rail-direct"
            onClick={() => {
              setText(`@${user(m.authorId)!.name} `);
              box.current?.focus();
            }}
          >
            Ask {user(m.authorId)!.name} directly
          </button>
        )}
        {done ? (
          <p className="rail-shared">
            <Share size={11} /> Shared to <b>{done.label}</b>
            {Date.now() - done.at < 10 * 60_000 && (
              <button className="link" onClick={() => void takeBack(m)}>
                Undo
              </button>
            )}
          </p>
        ) : (
          <p className="rail-actions">
            <button
              onClick={() => setSharing(sharing?.id === m.id ? null : { id: m.id, text: m.text })}
              aria-expanded={sharing?.id === m.id}
            >
              <Share size={12} /> Share
            </button>
            {about && aboutPage?.kind === 'doc' && (
              <button
                onClick={() =>
                  void ask('Suggest an edit to this line based on what you just said.', {
                    anchor: about,
                  })
                }
              >
                <Sparkles size={12} /> Suggest an edit
              </button>
            )}
            {canvas && (
              <button onClick={() => void putOnBoard(m, canvas)}>
                <LayoutDashboard size={12} /> Put on the board
              </button>
            )}
            {replyKey && !m.approvalId && (
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
            {!m.approvalId && (
              <button onClick={(e) => sendTo(m, e)} title="Draft it to a teammate; you send it">
                <Send size={12} /> Send to…
              </button>
            )}
            {!m.approvalId && pageLength(m.text) && (
              <button onClick={() => void saveAsPage(m)}>
                <FilePlus2 size={12} /> Save as a page
              </button>
            )}
          </p>
        )}
        {sharing?.id === m.id && (
          <ShareMenu
            m={m}
            text={sharing.text}
            about={about}
            onShared={(x) => setShared((old) => ({ ...old, [m.id]: x }))}
            onClose={() => setSharing(null)}
          />
        )}
        <SourceChips ids={m.sourceIds} />
      </div>
    );
  };

  return (
    <aside
      ref={rail}
      className={`rail ${docked ? '' : 'floats'}`}
      aria-label={`${myAgent.name}, private to you`}
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
      <header className="rail-top">
        <Character agent={myAgent} size={30} state={state} />
        <span className="rail-title">
          <strong>Your agent</strong>
          <small>
            <i className={working ? 'on' : ''} />
            {status}
            {s.runtime.id === 'scripted' ? ' · scripted stand-in' : ''}
          </small>
        </span>
        <button
          aria-label="Your agent's skills and instructions"
          title="Skills and instructions"
          onClick={() => open({ type: 'who', id: myAgent.id }, true)}
        >
          <Settings2 size={14} />
        </button>
        <button
          aria-label="Close · ⌘J"
          title="Close · ⌘J"
          onClick={() => setUi({ railOpen: false })}
        >
          <ChevronsRight size={15} />
        </button>
      </header>

      <div className="rail-do" aria-label="Quick asks">
        <small>
          {asking
            ? 'For your selection'
            : chat
              ? 'For this conversation'
              : page?.kind === 'canvas'
                ? 'For this board'
                : page
                  ? 'For this page'
                  : 'For this space'}
        </small>
        <div>
          {suggestions.map((sug, i) => (
            <button
              key={sug.label}
              className={i === 0 ? 'first' : ''}
              onClick={() => void put(sug.ask)}
              disabled={!!busy}
            >
              {sug.label}
            </button>
          ))}
          {skills.slice(0, 3).map((k) => (
            <button
              key={k.id}
              title={k.description}
              onClick={() => void put(`Use your skill "${k.name}" on what I am looking at.`)}
              disabled={!!busy}
            >
              <Zap size={11} /> {k.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rail-body" ref={body} onScroll={() => picked && setPicked(null)}>
        <IncomingRequests />
        <OutgoingRequests />
        {thread.length === 0 && (
          <p className="rail-empty">Select text on any page to ask about just that part.</p>
        )}
        {thread.length > latest.length && (
          <button className="link rail-earlier" onClick={() => setEarlier(true)}>
            Show earlier
          </button>
        )}
        {latest.map((m) =>
          m.authorId === s.me.id ? (
            <div key={m.id} className="rail-q">
              {m.anchor?.quote && resource(m.anchor.resourceId) && (
                <button
                  className="rail-ref small"
                  onClick={() => jump({ resourceId: m.anchor!.resourceId, quote: m.anchor!.quote })}
                >
                  <CornerDownRight size={11} /> <span className="truncate">“{m.anchor.quote}”</span>
                </button>
              )}
              <p>{m.text}</p>
            </div>
          ) : (
            answer(m)
          ),
        )}
        {!busy && stopped && <p className="rail-stopped">Stopped. Nothing was changed.</p>}
        {busy && (
          <div className="rail-work" role="status">
            <p>
              <Character agent={user(busy.agentId) ?? myAgent} size={18} state="working" />
              {user(busy.agentId)?.id === myAgent.id
                ? 'Working on it'
                : `${user(busy.agentId)?.name} is working on it`}
              <button
                className="link rail-stop"
                onClick={() => void run(() => api(`/jobs/${busy.id}/stop`, { body: {} }))}
              >
                Stop
              </button>
            </p>
            <span className="rail-progress" />
          </div>
        )}
      </div>

      {picked && (
        <div
          className="rail-pick"
          style={{ top: picked.top, left: picked.left }}
          onMouseDown={(e) => e.preventDefault()}
          role="toolbar"
          aria-label="For the highlighted text"
        >
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(picked.text);
              setPicked(null);
            }}
          >
            <Copy size={12} /> Copy
          </button>
          <button
            className="on"
            onClick={() => {
              setSharing({ id: picked.id, text: picked.text });
              setPicked(null);
            }}
          >
            <Share size={12} /> Share
          </button>
          <i />
          <button
            onClick={() => {
              setText(`About “${picked.text.slice(0, 120)}”: `);
              setPicked(null);
              box.current?.focus();
            }}
          >
            Ask about this
          </button>
        </div>
      )}

      {typedCommand !== null && (
        <div
          className="rail-menu"
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
              onClick={() => (setText(''), c.run())}
            >
              <Zap size={13} /> {c.label}
              {c.hint && <small>{c.hint}</small>}
            </button>
          ))}
        </div>
      )}
      {mentions.menu && <div className="rail-menu">{mentions.menu}</div>}
      {menu === 'sees' && (
        <div className="rail-menu" role="menu" aria-label="What it reads" ref={seesMenu}>
          {(
            [
              ['screen', onScreen, 'What you have open'],
              ['space', wholeSpace, 'Every page you can open here'],
            ] as const
          )
            // On a screen that shows no particular page, "on screen" already means the whole space.
            .filter(([id]) => id === 'space' || onScreen !== wholeSpace)
            .map(([id, name, detail]) => (
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
        </div>
      )}

      <form
        className="rail-in"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {asking && (
          <p className="rail-asking">
            <CornerDownRight size={12} />
            <span className="truncate">“{asking.quote}”</span>
            <button
              type="button"
              aria-label="Stop asking about this"
              onClick={() => setUi({ asking: null })}
            >
              <X size={12} />
            </button>
          </p>
        )}
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={asking ? 'Ask about your selection' : 'Ask your agent'}
          aria-label="Ask your agent"
          onChange={(e) => {
            setText(e.target.value);
            mentions.track(e);
          }}
          onSelect={mentions.track}
          onKeyDown={(e) => {
            if (mentions.onKey(e)) return;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
            if (e.key === 'Escape') (setMenu(null), setText(''), setUi({ asking: null }));
          }}
        />
        <div className="rail-in-row">
          <button
            type="button"
            className="chip"
            aria-label={`It reads: ${asking ? 'your selection' : scope.label}. Change`}
            aria-expanded={menu === 'sees'}
            ref={seesButton}
            onClick={() => setMenu(menu === 'sees' ? null : 'sees')}
          >
            <small>reads</small> {asking ? 'Selection' : scope.label} <ChevronDown size={11} />
          </button>
          <button
            type="button"
            className="chip"
            title="Attach a file from your computer. It's kept as a private page you can find later."
            onClick={() => attach.current?.click()}
          >
            <Paperclip size={11} /> Attach
          </button>
          <input
            ref={attach}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (!files.length) return;
              void bringIn(files, { spaceId: space.id, visibility: 'private' }).then((r) => {
                if (r.made.length)
                  setUi({ barExtras: [...ui.barExtras, ...r.made.map((m) => m.id)].slice(-6) });
                if (r.skipped.length) notify(`Could not read ${r.skipped.join(', ')}.`);
              });
            }}
          />
          {ui.barExtras.map((id) => (
            <span key={id} className="chip added">
              {resource(id)?.title ?? 'Page'}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => setUi({ barExtras: ui.barExtras.filter((x) => x !== id) })}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button className="send" type="submit" aria-label="Ask" disabled={!text.trim()}>
            <ArrowUp size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}
