import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Share2, X } from 'lucide-react';
import { Character } from '../features/agents/Character.tsx';
import { KindIcon, chatTitle } from './util.tsx';
import { api, useSession } from '../data/client.ts';
import { Join } from './Join.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Bar } from './Bar.tsx';
import { Find } from './Find.tsx';
import { NewPage } from './NewPage.tsx';
import { Pane } from '../pages/Pane.tsx';
import { applyTheme } from './theme.ts';
import { scopeOf } from './util.tsx';
import { firstTarget } from './scope.ts';
import { markSeen, markVisit } from './saved.ts';
import {
  WorkspaceContext,
  initialUi,
  sameTarget,
  type Picker,
  type Target,
  type Ui,
  type Workspace,
} from './workspace.tsx';
import type { Snapshot } from '../../shared/types.ts';

const STORE = 'sw-view-v2';
function remembered(): Partial<Ui> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return {
      ...(typeof saved.spaceId === 'string' ? { spaceId: saved.spaceId } : {}),
      ...(Array.isArray(saved.panes) && saved.panes.length
        ? { panes: saved.panes.slice(0, 2) }
        : {}),
      ...(['system', 'light', 'dark'].includes(saved.theme) ? { theme: saved.theme } : {}),
      ...(typeof saved.split === 'number' && saved.split > 0.2 && saved.split < 0.8
        ? { split: saved.split }
        : {}),
    };
  } catch {
    return {};
  }
}

export function App() {
  const { session, refresh } = useSession();
  if (session.status === 'loading') return <div className="boot" aria-busy="true" />;
  if (session.status === 'offline')
    return (
      <div className="boot">
        <p>Can’t reach the workstation. It will reconnect when the server is back.</p>
        <button className="primary" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  if (session.status === 'signed-out') return <Join onJoined={() => void refresh()} />;
  return <Shell s={session.snapshot} refresh={refresh} />;
}

/** Whether a pane can still be shown: the thing it points at exists and this person can see it. */
function alive(t: Target, s: Snapshot) {
  if (t.type === 'page') return s.resources.some((r) => r.id === t.id);
  if (t.type === 'chat') return s.conversations.some((c) => c.id === t.id);
  if (t.type === 'who') return s.users.some((u) => u.id === t.id);
  return true;
}

function Shell({ s, refresh }: { s: Snapshot; refresh: () => Promise<void> }) {
  const [ui, setUiState] = useState<Ui>(() => ({ ...initialUi, ...remembered() }));
  const [notice, setNotice] = useState<{
    text: string;
    action?: { label: string; run: () => void };
  }>();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setUi = useCallback(
    (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) =>
      setUiState((old) => ({ ...old, ...(typeof patch === 'function' ? patch(old) : patch) })),
    [],
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const columns: 1 | 2 = width >= 1160 ? 2 : 1;

  // The space in view: the remembered one if it still exists, else the first shared space, else your own.
  const space =
    s.spaces.find((x) => x.id === ui.spaceId) ??
    s.spaces.find((x) => x.kind === 'project') ??
    s.spaces[0];
  const panes = ui.panes.filter((t) => alive(t, s));
  const shownPanes: Target[] = panes.length ? panes : [firstTarget(s, space)];
  const active = Math.min(ui.active, shownPanes.length - 1);
  useEffect(() => {
    if (shownPanes.length !== ui.panes.length || active !== ui.active || space.id !== ui.spaceId)
      setUi({ panes: shownPanes, active, spaceId: space.id });
  });
  useEffect(() => applyTheme(ui.theme), [ui.theme]);
  // Remember when you were last in a space, and which pages you have looked at.
  useEffect(() => {
    const leave = () => markVisit(space.id);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [space.id]);
  const openPages = shownPanes.flatMap((t) => (t.type === 'page' ? [t.id] : [])).join();
  const stamp = s.resources
    .filter((r) => openPages.includes(r.id))
    .map((r) => r.updatedAt)
    .join();
  useEffect(() => {
    for (const id of openPages.split(',').filter(Boolean)) markSeen(id);
  }, [openPages, stamp]);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({ spaceId: space.id, panes: shownPanes, theme: ui.theme, split: ui.split }),
      );
    } catch {
      // Remembering the view is a convenience only.
    }
  });

  const notify = useCallback<Workspace['notify']>((text, action) => {
    setNotice({ text, action });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(undefined), action ? 8000 : 4200);
  }, []);
  const run = useCallback<Workspace['run']>(
    async (work) => {
      try {
        const result = await work();
        // Wait for the new state, so whatever happens next can rely on it being there.
        await refresh();
        return result;
      } catch (error) {
        notify((error as Error).message || 'That did not work.');
        return undefined;
      }
    },
    [notify, refresh],
  );

  const open = useCallback<Workspace['open']>(
    (target, beside = false) =>
      setUi((old) => {
        const current = old.panes.filter((t) => alive(t, s));
        const at = current.findIndex((t) => sameTarget(t, target));
        // Something in another space takes the whole view to that space.
        const home =
          target.type === 'page'
            ? s.resources.find((r) => r.id === target.id)?.spaceId
            : target.type === 'chat'
              ? s.conversations.find((c) => c.id === target.id)?.spaceId
              : undefined;
        const spaceId = home && s.spaces.some((x) => x.id === home) ? home : old.spaceId;
        if (at >= 0) return { active: at, nav: false, selection: [], spaceId };
        if (beside) {
          const keep = current[Math.min(old.active, current.length - 1)] ?? current[0];
          return { panes: [keep, target], active: 1, nav: false, selection: [], spaceId };
        }
        const next = current.length ? [...current] : [target];
        next[Math.min(old.active, next.length - 1)] = target;
        return { panes: next, nav: false, selection: [], spaceId };
      }),
    [s, setUi],
  );
  const closePane = useCallback<Workspace['closePane']>(
    (index) =>
      setUi((old) => {
        const next = old.panes.filter((_, i) => i !== index);
        return { panes: next, active: 0, selection: [] };
      }),
    [setUi],
  );

  const myAgent = s.users.find(
    (u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === s.me.id && !u.retired,
  );
  const myChat = s.conversations.find(
    (c) => c.kind === 'agent-private' && myAgent && c.participantIds.includes(myAgent.id),
  );
  const scope = scopeOf({ ...ui, panes: shownPanes, active }, s, columns);
  const ask = useCallback<Workspace['ask']>(
    async (text, extra) => {
      if (!myChat) return notify('Your agent is not available.');
      setUi({ barOpen: true });
      await run(() =>
        api('/messages', {
          body: {
            conversationId: myChat.id,
            text,
            anchor: extra?.anchor ?? null,
            context: {
              resourceIds: extra?.resourceIds ?? scope.resourceIds,
              conversationIds: scope.conversationIds,
              spaceId: space.id,
            },
          },
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      myChat?.id,
      scope.resourceIds.join(),
      scope.conversationIds.join(),
      space.id,
      run,
      notify,
      setUi,
    ],
  );

  // Tell the others where you are, so presence in the list is true.
  const here = shownPanes[active];
  const hereKey = `${space.id}:${here.type}:${'id' in here ? here.id : ''}`;
  useEffect(() => {
    void api('/presence', {
      body: {
        spaceId: space.id,
        resourceId: here.type === 'page' ? here.id : null,
        conversationId: here.type === 'chat' ? here.id : null,
      },
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPicker((p) =>
          p ? null : { title: 'Find', chats: true, onPick: (target) => open(target) },
        );
      }
      if (e.key === 'Escape') {
        if (picker) setPicker(null);
        else if (ui.creating) setUi({ creating: false });
        else if (ui.nav) setUi({ nav: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picker, ui.creating, ui.nav, open, setUi]);

  const value = useMemo<Workspace>(
    () => ({
      s,
      ui: { ...ui, panes: shownPanes, active, spaceId: space.id },
      setUi,
      space,
      columns,
      user: (id) => s.users.find((u) => u.id === id),
      resource: (id) => s.resources.find((r) => r.id === id),
      notify,
      run,
      open,
      closePane,
      pick: setPicker,
      myAgent,
      myChat,
      ask,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, ui, space, columns, notify, run, open, closePane, ask],
  );

  const visible = columns === 1 ? [shownPanes[active]] : shownPanes;
  const panesBox = useRef<HTMLDivElement>(null);
  const dragSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = panesBox.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) =>
      setUi({ split: Math.max(0.28, Math.min(0.72, (ev.clientX - box.left) / box.width)) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** What a pane is called, for the tabs shown when only one fits. */
  const label = (t: Target) => {
    if (t.type === 'page') {
      const page = s.resources.find((r) => r.id === t.id);
      return {
        title: page?.title ?? 'Page',
        icon: <KindIcon kind={page?.kind ?? 'doc'} size={13} />,
      };
    }
    if (t.type === 'chat') {
      const chat = s.conversations.find((c) => c.id === t.id);
      return {
        title: chat ? chatTitle(chat, s) : 'Conversation',
        icon: chat?.kind === 'channel' ? <KindIcon kind="channel" size={13} /> : null,
      };
    }
    if (t.type === 'who') {
      const who = s.users.find((u) => u.id === t.id);
      return {
        title: who?.name ?? 'Person',
        icon: who?.kind === 'agent' ? <Character agent={who} size={20} /> : null,
      };
    }
    return { title: 'Graph', icon: <Share2 size={13} /> };
  };
  const chatOnly = visible.every((t) => t.type === 'chat');
  return (
    <WorkspaceContext.Provider value={value}>
      <div className={`shell ${ui.nav ? 'nav-open' : ''}`}>
        <Sidebar />
        {ui.nav && (
          <button
            className="scrim"
            aria-label="Close the list"
            onClick={() => setUi({ nav: false })}
          />
        )}
        <main className={`middle panes-${visible.length}`}>
          {columns === 1 && shownPanes.length > 1 && (
            <div className="pane-switch" role="tablist" aria-label="Open pages">
              {shownPanes.map((t, i) => (
                <span key={i} className="pane-tab" data-on={i === active}>
                  <button
                    role="tab"
                    aria-selected={i === active}
                    onClick={() => setUi({ active: i, selection: [] })}
                  >
                    {label(t).icon}
                    <span className="truncate">{label(t).title}</span>
                  </button>
                  <button aria-label={`Close ${label(t).title}`} onClick={() => closePane(i)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="panes" ref={panesBox}>
            {visible.map((t) => {
              const index = shownPanes.indexOf(t);
              return (
                <Fragment key={`${t.type}:${'id' in t ? t.id : ''}`}>
                  {index === 1 && visible.length === 2 && (
                    <div
                      className="split"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Drag to resize the two pages. Double-click to even them out."
                      title="Drag to resize · double-click to even out"
                      onPointerDown={dragSplit}
                      onDoubleClick={() => setUi({ split: 0.5 })}
                    >
                      <button
                        aria-label="Swap the two pages"
                        title="Swap sides"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          setUi((old) => ({
                            panes: [...old.panes].reverse(),
                            active: old.active === 0 ? 1 : 0,
                            split: 1 - old.split,
                          }))
                        }
                      >
                        <ArrowLeftRight size={12} />
                      </button>
                    </div>
                  )}
                  <Pane
                    target={t}
                    index={index}
                    active={index === active}
                    alone={shownPanes.length === 1}
                    grow={
                      visible.length === 2 ? (index === 0 ? ui.split : 1 - ui.split) : undefined
                    }
                  />
                </Fragment>
              );
            })}
          </div>
          <Bar pill={chatOnly && !ui.barOpen} />
        </main>
        {picker && <Find picker={picker} close={() => setPicker(null)} />}
        {ui.creating && <NewPage />}
        {notice && (
          <div className="notice" role="status">
            <span>{notice.text}</span>
            {notice.action && (
              <button
                className="link"
                onClick={() => {
                  notice.action!.run();
                  setNotice(undefined);
                }}
              >
                {notice.action.label}
              </button>
            )}
            <button aria-label="Dismiss" onClick={() => setNotice(undefined)}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
