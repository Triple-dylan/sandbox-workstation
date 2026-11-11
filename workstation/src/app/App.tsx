import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, useSession } from '../data/client.ts';
import type { Snapshot } from '../../shared/types.ts';
import { Join } from './Join.tsx';
import { initialUi, WorkspaceContext, type Ui, type Workspace } from './workspace.tsx';
import { Rail } from './Rail.tsx';
import { Canvas } from '../features/canvas/Canvas.tsx';
import { Graph } from '../features/graph/Graph.tsx';
import { ConversationPanel } from '../features/conversations/ConversationPanel.tsx';
import { Composer, Peek } from '../features/conversations/Composer.tsx';
import { Reader } from '../features/reader/Reader.tsx';
import { Utilities } from '../features/agents/Utilities.tsx';
import { AgentPanel } from '../features/agents/AgentPanel.tsx';

const UI_KEY = 'sw-ui-v1';
const loadUi = (): Ui => {
  try {
    return { ...initialUi, ...JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') };
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
  return <Shell s={session.snapshot} refresh={refresh} />;
}

function Shell({ s, refresh }: { s: Snapshot; refresh: () => Promise<void> }) {
  const [ui, setUiState] = useState<Ui>(loadUi);
  const [notice, setNotice] = useState('');
  const setUi = useCallback(
    (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) =>
      setUiState((old) => ({ ...old, ...(typeof patch === 'function' ? patch(old) : patch) })),
    [],
  );
  useEffect(() => localStorage.setItem(UI_KEY, JSON.stringify(ui)), [ui]);
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
        setUi({ conversationId: id, nav: false });
        void api('/reads', { body: { conversationId: id } }).then(refresh, () => {});
      },
      openResource: (id) => setUi({ readerId: id, selectedId: id, agentId: null }),
      discuss: (resourceId) =>
        setUi((old) => ({
          audience: { ...old.audience, [space.id]: { kind: 'discuss', resourceId } },
          selectedId: resourceId,
        })),
    };
  }, [s, ui, setUi, space, refresh]);

  const agentOpen = !!ui.agentId && s.users.some((u) => u.id === ui.agentId && u.kind === 'agent');
  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="shell">
        <Rail />
        {!ui.nav && ui.conversationId && (
          <ConversationPanel key={ui.conversationId} conversationId={ui.conversationId} />
        )}
        <main className="surface" aria-label={ui.surface === 'canvas' ? 'Canvas' : 'Graph'}>
          {ui.surface === 'canvas' ? <Canvas /> : <Graph />}
          <div className="dock">
            {notice ? (
              <div className="notice" role="status">
                {notice}
              </div>
            ) : (
              <Peek />
            )}
            <Composer />
          </div>
        </main>
        {(ui.readerId || agentOpen || ui.tools) && (
          <aside
            className={`side ${ui.readerId ? 'reading' : ''}`}
            aria-label={ui.readerId ? 'Reader' : agentOpen ? 'Agent' : 'Project tools'}
          >
            {ui.readerId ? (
              <Reader key={ui.readerId} resourceId={ui.readerId} />
            ) : agentOpen ? (
              <AgentPanel key={ui.agentId} agentId={ui.agentId!} />
            ) : (
              <Utilities />
            )}
          </aside>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
