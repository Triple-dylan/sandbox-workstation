import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Network, PanelLeft, SquarePen } from 'lucide-react';
import { api, useSession } from '../data/client.ts';
import type { Conversation, Snapshot } from '../../shared/types.ts';
import { Join } from './Join.tsx';
import { initialUi, WorkspaceContext, type Ui, type Workspace } from './workspace.tsx';
import { Rail } from './Rail.tsx';
import { Canvas } from '../features/canvas/Canvas.tsx';
import { Graph } from '../features/graph/Graph.tsx';
import { ConversationPanel } from '../features/conversations/ConversationPanel.tsx';
import { Composer } from '../features/conversations/Composer.tsx';
import { Reader } from '../features/reader/Reader.tsx';
import { MemberView } from '../features/agents/MemberView.tsx';
import { Utilities } from '../features/agents/Utilities.tsx';
import { Avatar } from '../features/agents/Character.tsx';
import { defaultAudience } from '../features/conversations/audience.ts';

const uiKey = (userId: string) => `sw-ui-v2:${userId}`;
const loadUi = (userId: string): Ui => {
  try {
    return { ...initialUi, ...JSON.parse(localStorage.getItem(uiKey(userId)) ?? '{}') };
  } catch {
    return initialUi;
  }
};

export function App() {
  const { session, refresh } = useSession();
  if (session.status === 'loading') return <div className="boot" aria-busy="true" />;
  if (session.status === 'signed-out') return <Join onJoined={refresh} />;
  if (session.status === 'offline')
    return (
      <main className="join">
        <div className="join-card">
          <h1>Can't reach the workstation server</h1>
          <p className="join-note">Start it with `npm start` in `workstation/`, then reload.</p>
        </div>
      </main>
    );
  return <Shell key={session.snapshot.me.id} s={session.snapshot} refresh={refresh} />;
}

function Shell({ s, refresh }: { s: Snapshot; refresh: () => Promise<void> }) {
  const [ui, setUiState] = useState<Ui>(() => {
    const saved = loadUi(s.me.id);
    const spaceId = new URLSearchParams(window.location.search).get('space');
    return spaceId && s.spaces.some((space) => space.id === spaceId)
      ? {
          ...saved,
          spaceId,
          conversationId: null,
          memberId: null,
          readerId: null,
          selectedId: null,
          railHidden: false,
        }
      : saved;
  });
  const [notice, setNotice] = useState('');
  const setUi = useCallback(
    (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) =>
      setUiState((old) => ({ ...old, ...(typeof patch === 'function' ? patch(old) : patch) })),
    [],
  );
  useEffect(() => localStorage.setItem(uiKey(s.me.id), JSON.stringify(ui)), [ui, s.me.id]);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        ui.theme === 'system' ? (query.matches ? 'dark' : 'light') : ui.theme);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [ui.theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const space =
    s.spaces.find((x) => x.id === ui.spaceId) ??
    s.spaces.find((x) => x.kind === 'personal') ??
    s.spaces[0];
  // Drop view state that points at things this person can no longer see.
  // Close views whose record disappeared (deleted, unshared). Only ids seen before count as gone:
  // something just created may not be in this snapshot yet.
  const previous = useRef(s);
  useEffect(() => {
    const before = previous.current;
    previous.current = s;
    const first = before === s;
    const gone = (id: string | null, list: (x: Snapshot) => { id: string }[]) =>
      !!id && (first || list(before).some((x) => x.id === id)) && !list(s).some((x) => x.id === id);
    setUi((old) => {
      const patch: Partial<Ui> = {};
      if (gone(old.conversationId, (x) => x.conversations)) patch.conversationId = null;
      if (gone(old.memberId, (x) => x.users)) patch.memberId = null;
      if (gone(old.readerId, (x) => x.resources)) patch.readerId = null;
      if (gone(old.selectedId, (x) => x.resources)) patch.selectedId = null;
      return patch;
    });
  }, [s, setUi]);

  useEffect(() => {
    void api('/presence', {
      body: { spaceId: space.id, surface: ui.surface, resourceId: ui.readerId ?? ui.selectedId },
    }).catch(() => {});
  }, [space.id, ui.surface, ui.readerId, ui.selectedId]);

  const workspace = useMemo<Workspace>(() => {
    const user = (id: string | null | undefined) => s.users.find((u) => u.id === id);
    const resource = (id: string | null | undefined) => s.resources.find((r) => r.id === id);
    const run = async <T,>(work: () => Promise<T>) => {
      try {
        const result = await work();
        void refresh();
        return result;
      } catch (error) {
        setNotice((error as Error).message);
        return undefined;
      }
    };
    return {
      s,
      ui,
      setUi,
      space,
      user,
      resource,
      notify: setNotice,
      run,
      openConversation: (id) => {
        const chat = s.conversations.find((c) => c.id === id);
        setUi({
          conversationId: id,
          memberId: null,
          readerId: null,
          ...(chat?.spaceId ? { spaceId: chat.spaceId } : {}),
        });
        void api('/reads', { body: { conversationId: id } }).then(refresh, () => {});
      },
      openResource: (id) => setUi({ readerId: id, selectedId: id }),
      openDirect: async (userId) => {
        const existing = s.conversations.find(
          (c) =>
            (c.kind === 'dm' || c.kind === 'agent-private') && c.participantIds.includes(userId),
        );
        const chat = existing ?? (await run(() => api<Conversation>('/dms', { body: { userId } })));
        if (chat) setUi({ conversationId: chat.id, memberId: null, readerId: null });
      },
      openAgentWork: async (agentId) => {
        const agent = user(agentId);
        if (!agent) return;
        if (agent.role === 'personal') {
          const chat = s.conversations.find(
            (c) => c.kind === 'agent-private' && c.participantIds.includes(agentId),
          );
          if (chat) setUi({ conversationId: chat.id, memberId: null, readerId: null });
          return;
        }
        const existing = s.conversations
          .filter(
            (c) =>
              c.kind === 'agent-work' &&
              c.spaceId === agent.spaceId &&
              c.participantIds.includes(agentId),
          )
          .at(-1);
        const chat =
          existing ??
          (await run(() =>
            api<Conversation>('/agent-work', {
              body: { spaceId: agent.spaceId, agentId, title: agent.name },
            }),
          ));
        if (chat)
          setUi({
            spaceId: agent.spaceId!,
            conversationId: chat.id,
            memberId: null,
            readerId: null,
          });
      },
      discuss: (resourceId, quote) =>
        setUi((old) => ({
          audience: { ...old.audience, [space.id]: { kind: 'discuss', resourceId, quote } },
          selectedId: resourceId,
          conversationId: null,
          memberId: null,
        })),
    };
  }, [s, ui, setUi, space, refresh]);

  const activeChat = s.conversations.find((c) => c.id === ui.conversationId);
  const member = ui.memberId === s.me.id ? s.me : undefined;
  const workSurface = !activeChat && !member;

  const [creatingProject, setCreatingProject] = useState(false);
  const newChat = () => {
    const audience = defaultAudience(s, space.id);
    setUi((old) => ({
      conversationId: null,
      memberId: null,
      readerId: null,
      audience: audience ? { ...old.audience, [space.id]: audience } : old.audience,
    }));
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),
    );
  };
  const railDrag = useRef<{ x: number; width: number } | null>(null);
  const resizeRail = (width: number) =>
    setUi({ railWidth: Math.round(Math.max(150, Math.min(380, width))) });
  return (
    <WorkspaceContext.Provider value={workspace}>
      <div
        className={`shell ${ui.railHidden ? 'rail-hidden' : ''}`}
        style={{ '--rail-width': `${ui.railWidth}px` } as React.CSSProperties}
      >
        <nav className="app-strip" aria-label="App navigation">
          <button
            aria-label={ui.railHidden ? 'Show navigation' : 'Hide navigation'}
            title={ui.railHidden ? 'Show navigation' : 'Hide navigation'}
            aria-expanded={!ui.railHidden}
            aria-controls="workstation-navigation"
            onClick={() => setUi({ railHidden: !ui.railHidden })}
          >
            <PanelLeft size={19} />
          </button>
          <button aria-label="New chat" title="New chat" onClick={newChat}>
            <SquarePen size={19} />
          </button>
          <button
            className="app-profile"
            aria-label="Open my profile"
            title={s.me.name}
            aria-pressed={!!member}
            onClick={() => setUi({ memberId: member ? null : s.me.id })}
          >
            <Avatar user={s.me} size={28} />
          </button>
        </nav>
        {!ui.railHidden && (
          <div className="rail-slot">
            <Rail
              creatingProject={creatingProject}
              onProjectFormClose={() => setCreatingProject(false)}
            />
            <div
              className="rail-resize"
              role="separator"
              aria-label="Resize navigation"
              aria-orientation="vertical"
              aria-valuemin={150}
              aria-valuemax={380}
              aria-valuenow={ui.railWidth}
              tabIndex={0}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                railDrag.current = {
                  x: e.clientX,
                  width: e.currentTarget.parentElement!.clientWidth,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (railDrag.current)
                  resizeRail(railDrag.current.width + e.clientX - railDrag.current.x);
              }}
              onLostPointerCapture={() => {
                railDrag.current = null;
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                resizeRail(
                  e.currentTarget.parentElement!.clientWidth + (e.key === 'ArrowRight' ? 16 : -16),
                );
              }}
            />
          </div>
        )}
        <main
          className={`surface ${workSurface ? '' : 'conversation-surface'}`}
          aria-label={
            activeChat
              ? 'Conversation'
              : member
                ? 'Member'
                : ui.surface === 'canvas'
                  ? 'Canvas'
                  : 'Graph'
          }
        >
          <div className="surface-toolbar">
            <div className="view-switch" role="group" aria-label="Workspace view">
              <button
                aria-pressed={workSurface && ui.surface === 'canvas'}
                onClick={() =>
                  setUi({ surface: 'canvas', conversationId: null, memberId: null, readerId: null })
                }
              >
                <LayoutGrid size={15} /> Canvas
              </button>
              <button
                aria-pressed={workSurface && ui.surface === 'graph'}
                onClick={() =>
                  setUi({ surface: 'graph', conversationId: null, memberId: null, readerId: null })
                }
              >
                <Network size={15} /> Graph
              </button>
            </div>
          </div>
          {workSurface && (
            <div className="work-surface">
              {ui.surface === 'canvas' ? <Canvas /> : <Graph key={`graph:${space.id}`} />}
              <Utilities key={`tools:${space.id}`} />
              {ui.readerId && (
                <div className="surface-reader" aria-label="Document on workspace">
                  <Reader key={ui.readerId} resourceId={ui.readerId} />
                </div>
              )}
              <Composer key={`composer:${space.id}`} />
            </div>
          )}
          {activeChat && !member && (
            <ConversationPanel key={activeChat.id} conversationId={activeChat.id} />
          )}
          {member && <MemberView key={member.id} member={member} />}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
