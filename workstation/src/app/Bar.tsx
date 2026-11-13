import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, FilePlus2, Maximize2, MessageSquareReply, Star, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { Character, agentState } from '../features/agents/Character.tsx';
import { MessageView } from '../features/feed/Feed.tsx';
import { chatTitle, scopeOf } from './util.tsx';
import { writeSaved } from './saved.ts';
import { useWorkspace } from './workspace.tsx';
import type { Message } from '../../shared/types.ts';

/**
 * Your own agent, on every screen. It is private to you. What it is asked about follows what is on
 * screen and is always named in the bar; it never decides who a message goes to.
 */
export function Bar({ pill }: { pill: boolean }) {
  const { s, ui, setUi, space, columns, myAgent, myChat, ask, open, run, user, notify } =
    useWorkspace();
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
  const state = agentState(myAgent.id, s.jobs);

  if (pill)
    return (
      <button
        className="bar-pill"
        onClick={() => {
          setUi({ barOpen: true });
          setTimeout(() => box.current?.focus(), 30);
        }}
      >
        <Character agent={myAgent} size={20} state={state} /> Ask your agent
      </button>
    );

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await ask(body);
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
      <form
        className="bar"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button
          type="button"
          className="bar-orb"
          aria-label={
            ui.barOpen ? 'Hide the conversation' : `Show the conversation with ${myAgent.name}`
          }
          aria-expanded={ui.barOpen}
          onClick={() => setUi({ barOpen: !ui.barOpen })}
        >
          <Character agent={myAgent} size={28} state={state} />
        </button>
        <span className="scope" title="What your agent will look at. It follows what is on screen.">
          {scope.label}
          {ui.selection.length > 0 && (
            <button
              type="button"
              aria-label="Clear the selection"
              onClick={() => setUi({ selection: [] })}
            >
              <X size={11} />
            </button>
          )}
        </span>
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={`Ask ${myAgent.name}`}
          aria-label={`Ask ${myAgent.name} about ${scope.label.toLowerCase()}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="send" type="submit" aria-label="Ask" disabled={!text.trim()}>
          <ArrowUp size={15} />
        </button>
      </form>
    </div>
  );
}
