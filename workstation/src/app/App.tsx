import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Share2, X } from 'lucide-react';
import { Character } from '../features/agents/Character.tsx';
import { AGENT_LOOKS, setAgentLook } from '../features/agents/Looks.tsx';
import { KindIcon, chatTitle } from './util.tsx';
import { api, useSession } from '../data/client.ts';
import { Join } from './Join.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SpaceRail } from './SpaceRail.tsx';
import { Rail } from './Rail.tsx';
import { Find } from './Find.tsx';
import { Pane } from '../pages/Pane.tsx';
import { applyTheme } from './theme.ts';
import { scopeOf } from './util.tsx';
import { DRAG, firstTarget } from './scope.ts';
import { markSeen, markVisit } from './saved.ts';
import { AgentLooks, PasteText, Settings, Shortcuts } from './Dialogs.tsx';
import { clearLink, linkToken } from './Join.tsx';
import { bringIn } from '../features/import/bringIn.ts';
import { isPage } from '../../shared/types.ts';
import {
  WorkspaceContext,
  initialUi,
  sameTarget,
  type MenuItem,
  type Picker,
  type Target,
  type Ui,
  type Workspace,
} from './workspace.tsx';
import type { Snapshot } from '../../shared/types.ts';
import { StartOrJoin } from './Welcome.tsx';

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
      ...(saved.prefs && typeof saved.prefs === 'object'
        ? {
            prefs: {
              ...initialUi.prefs,
              ...saved.prefs,
              // Before the list hid itself on pages this was on or off; on becomes the new default.
              list: saved.prefs.list === false ? 'hidden' : (saved.prefs.list ?? 'auto'),
            },
          }
        : {}),
      ...(typeof saved.split === 'number' && saved.split > 0.2 && saved.split < 0.8
        ? { split: saved.split }
        : {}),
    };
  } catch {
    return {};
  }
}

/** Whether this person chose to look around their private space before joining a workspace. */
const skipKey = (userId: string) => `sw-start-skipped:${userId}`;
function skippedStart(userId: string) {
  try {
    return localStorage.getItem(skipKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const { session, refresh } = useSession();
  const [skipped, setSkipped] = useState(false);
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
  const s = session.snapshot;
  // Someone in no workspace yet chooses to start one or join one, unless an invite link is
  // already taking them into one.
  if (
    !s.spaces.some((x) => x.kind === 'project') &&
    !linkToken('invite') &&
    !skipped &&
    !skippedStart(s.me.id)
  )
    return (
      <StartOrJoin
        s={s}
        onDone={refresh}
        onSkip={() => {
          try {
            localStorage.setItem(skipKey(s.me.id), '1');
          } catch {
            // Private browsing: the choice lasts until reload.
          }
          setSkipped(true);
        }}
      />
    );
  return <Shell s={s} refresh={refresh} />;
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
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dropping, setDropping] = useState(false);
  // A drag over the window fires dragover again and again; when those stop (dropped, cancelled,
  // or carried out of the window) the hint goes. Leave events alone are not reliable for this.
  const dragGone = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
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
  // Your agent's rail takes room beside the middle on wide windows; on narrow ones it lies over it.
  const railDocks = width >= 1180;
  useEffect(() => {
    if (!railDocks) setUi({ railOpen: false });
  }, [railDocks, setUi]);
  const columns: 1 | 2 = width - (railDocks && ui.railOpen ? 384 : 56) >= 1080 ? 2 : 1;

  // The space in view: the remembered one if it still exists, else the first shared space, else your own.
  const space =
    s.spaces.find((x) => x.id === ui.spaceId) ??
    s.spaces.find((x) => x.kind === 'project') ??
    s.spaces[0];
  const myAgent = s.users.find(
    (u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === s.me.id && !u.retired,
  );
  const myChat = s.conversations.find(
    (c) => c.kind === 'agent-private' && myAgent && c.participantIds.includes(myAgent.id),
  );
  // Your agent's conversation lives only in the rail, never as a page in the middle.
  const isMyChat = (t: Target) => t.type === 'chat' && t.id === myChat?.id;
  const panes = ui.panes.filter((t) => alive(t, s) && !isMyChat(t));
  const shownPanes: Target[] = panes.length ? panes : [firstTarget(s, space)];
  const active = Math.min(ui.active, shownPanes.length - 1);
  // The list steps aside while you work on a page, unless you chose to keep it open.
  const onPage = shownPanes[active]?.type === 'page';
  const listShown = ui.prefs.list === 'shown' || (ui.prefs.list === 'auto' && !onPage);
  const toggleList = useCallback(
    () =>
      setUi((old) => ({
        peek: false,
        prefs: { ...old.prefs, list: listShown ? (onPage ? 'auto' : 'hidden') : 'shown' },
      })),
    [listShown, onPage, setUi],
  );
  // Hidden, it slides out over the page while the pointer is on the left edge, and goes when it
  // leaves; a short wait each way keeps a pointer passing by from flashing it.
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peekSoon = (on: boolean) => {
    clearTimeout(peekTimer.current);
    if (listShown) return;
    peekTimer.current = setTimeout(() => setUi({ peek: on }), on ? 90 : 280);
  };
  useEffect(() => {
    if (listShown && ui.peek) setUi({ peek: false });
  }, [listShown, ui.peek, setUi]);
  useEffect(() => {
    if (shownPanes.length !== ui.panes.length || active !== ui.active || space.id !== ui.spaceId)
      setUi({ panes: shownPanes, active, spaceId: space.id });
  });
  useEffect(() => applyTheme(ui.theme), [ui.theme]);
  // Already signed in and opened an invite link: join that space and go to it.
  useEffect(() => {
    const token = linkToken('invite');
    clearLink();
    if (!token) return;
    void run(() => api<{ id: string; name: string }>('/invites/accept', { body: { token } })).then(
      (joined) => {
        if (!joined) return;
        setUi({ spaceId: joined.id, panes: [], active: 0 });
        notify(`You joined ${joined.name}.`);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.size = ui.prefs.size;
    root.dataset.density = ui.prefs.density;
    root.dataset.accent = ui.prefs.accent === null ? 'off' : 'on';
    if (ui.prefs.accent === null) root.style.removeProperty('--accent');
    else root.style.setProperty('--accent', `hsl(${ui.prefs.accent} 55% 48%)`);
    setAgentLook(AGENT_LOOKS.includes(ui.prefs.agentLook) ? ui.prefs.agentLook : 'orbs');
  }, [ui.prefs]);
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
        JSON.stringify({
          spaceId: space.id,
          panes: shownPanes,
          theme: ui.theme,
          split: ui.split,
          prefs: ui.prefs,
        }),
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
  // Back from signing in to Google or Microsoft to link a spreadsheet.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const done = q.get('connected');
    const failed = q.get('connect-error');
    if (!done && !failed) return;
    history.replaceState(null, '', location.pathname);
    notify(
      failed
        ? `Not connected: ${failed}`
        : `${done === 'google' ? 'Google Sheets' : 'Excel'} is connected. Paste a link under Pages, + → Linked.`,
    );
  }, [notify]);
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
        if (target.type === 'chat' && target.id === myChat?.id)
          return { railOpen: true, nav: false };
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
    [s, setUi, myChat?.id],
  );
  const jump = useCallback<Workspace['jump']>(
    (spot, note) => {
      const found = s.resources.find((r) => r.id === spot.resourceId);
      // A piece of a board opens the board, centred on that piece.
      const board =
        found && !isPage(found.kind) ? s.resources.find((r) => r.id === found.parentId) : undefined;
      const page = board ?? found;
      if (!page) return notify('That page is no longer available to you.');
      open({ type: 'page', id: page.id }, true);
      setUi({
        focus: {
          ...spot,
          ...(board ? { resourceId: board.id, pieceId: found!.id } : {}),
          note: note ?? spot.note,
          at: Date.now(),
        },
      });
    },
    [s, open, setUi, notify],
  );
  const closePane = useCallback<Workspace['closePane']>(
    (index) =>
      setUi((old) => {
        const next = old.panes.filter((_, i) => i !== index);
        return { panes: next, active: 0, selection: [] };
      }),
    [setUi],
  );

  const scope = scopeOf({ ...ui, panes: shownPanes, active }, s, columns);
  const ask = useCallback<Workspace['ask']>(
    async (text, extra) => {
      if (!myChat) return notify('Your agent is not available.');
      setUi({ railOpen: true });
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
              handTo: extra?.handTo ?? null,
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
        setPicker((p) => (p ? null : finder()));
      }
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement).closest?.(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (mod && e.key === '\\') (e.preventDefault(), toggleList());
      if (mod && e.key === ',') (e.preventDefault(), setUi({ dialog: 'settings' }));
      if (mod && e.key === '/') (e.preventDefault(), setUi({ dialog: 'shortcuts' }));
      if (e.altKey && !mod && e.code === 'KeyN') (e.preventDefault(), setUi({ creating: true }));
      if (e.altKey && !mod && e.code === 'KeyG') (e.preventDefault(), open({ type: 'graph' }));
      if (e.key === '?' && !typing && !mod) setUi({ dialog: 'shortcuts' });
      if (e.key === 'Escape') {
        if (menuAt) setMenuAt(null);
        else if (picker) setPicker(null);
        else if (ui.dialog) setUi({ dialog: null });
        else if (ui.creating) setUi({ creating: false });
        else if (ui.making) setUi({ making: null });
        else if (ui.nav || ui.peek) setUi({ nav: false, peek: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // A menu opened from the peeking list keeps it out; once the menu is gone, so is the list, unless
  // the pointer is back on it.
  useEffect(() => {
    if (!menuAt && ui.peek && !document.querySelector('.left:hover')) setUi({ peek: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAt]);

  const bring = useCallback<Workspace['bring']>(
    async (files, parentId) => {
      if (!files.length) return;
      notify(`Bringing in ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
      const result = await bringIn(files, { spaceId: space.id, parentId });
      await refresh();
      if (result.made.length === 1) open({ type: 'page', id: result.made[0].id });
      notify(
        [
          result.made.length
            ? `Added ${result.made.length === 1 ? `“${result.made[0].title}”` : `${result.made.length} pages`} to ${space.kind === 'personal' ? 'your space' : space.name}.`
            : '',
          result.skipped.length
            ? `Could not read ${result.skipped.join(', ')}. Text, Markdown, transcripts (.vtt, .srt), CSV, Word, PowerPoint and pictures work.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    },
    [space.id, space.kind, space.name, notify, refresh, open],
  );
  /** Find, with the things you can do offered alongside what you can open. */
  const finder = (): Picker => {
    // Find opens from the list's own Find field when the list is showing, as if the field grew.
    const field = document.querySelector('.sidebar .list-find')?.getBoundingClientRect();
    return {
      title: 'Find',
      chats: true,
      anchor: field && field.width ? { left: field.left, top: field.top } : undefined,
      onPick: (target) => open(target),
      actions: [
        { label: 'New page', hint: 'Alt N', run: () => setUi({ creating: true }) },
        { label: 'Bring in a file', run: () => fileInput.current?.click() },
        { label: 'Paste text', run: () => setUi({ dialog: 'paste' }) },
        ...(space.kind === 'project'
          ? [{ label: 'New channel', run: () => setUi({ making: 'channel' as const }) }]
          : []),
        { label: 'New agent', run: () => setUi({ making: 'agent' }) },
        { label: 'Open the graph', hint: 'Alt G', run: () => open({ type: 'graph' }) },
        { label: 'Ask your agent', hint: '⌘J', run: () => setUi({ railOpen: true }) },
        { label: 'Settings', hint: '⌘,', run: () => setUi({ dialog: 'settings' }) },
        { label: 'Shortcuts', hint: '⌘/', run: () => setUi({ dialog: 'shortcuts' }) },
      ],
    };
  };

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
      jump,
      closePane,
      pick: (p) => setPicker(p.title === 'Find' && !p.actions ? finder() : p),
      menu: (event, items) => {
        event.preventDefault();
        setMenuAt({ x: event.clientX, y: event.clientY, items });
      },
      bring,
      chooseFiles: () => fileInput.current?.click(),
      commands: () => finder().actions ?? [],
      myAgent,
      myChat,
      ask,
      list: { shown: listShown, toggle: toggleList },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, ui, space, columns, notify, run, open, jump, closePane, ask, bring, listShown, toggleList],
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
  return (
    <WorkspaceContext.Provider value={value}>
      <div
        className={`shell ${ui.nav || ui.peek || ui.creating || ui.making ? 'nav-open' : ''} ${listShown ? '' : 'list-hidden'}`}
        onDragOver={(e) => {
          const types = [...e.dataTransfer.types];
          // Something dragged from the list can be dropped on the middle to open it beside.
          if (types.includes(DRAG)) return e.preventDefault();
          if (!types.includes('Files')) return;
          e.preventDefault();
          setDropping(true);
          clearTimeout(dragGone.current);
          dragGone.current = setTimeout(() => setDropping(false), 250);
        }}
        onDrop={(e) => {
          clearTimeout(dragGone.current);
          setDropping(false);
          if (e.defaultPrevented) return;
          const dragged = e.dataTransfer.getData(DRAG);
          if (dragged) {
            try {
              const t = JSON.parse(dragged) as Target;
              if (!(e.target as HTMLElement).closest('.left')) open(t, true);
            } catch {
              // Not something from the list.
            }
            return;
          }
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          void bring([...e.dataTransfer.files]);
        }}
      >
        <div
          className="left"
          onMouseEnter={() => peekSoon(true)}
          onMouseLeave={() => !menuAt && peekSoon(false)}
        >
          <SpaceRail />
          <Sidebar />
        </div>
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
        </main>
        <Rail docked={railDocks} />
        {picker && <Find picker={picker} close={() => setPicker(null)} />}
        {ui.dialog === 'settings' && <Settings />}
        {ui.dialog === 'shortcuts' && <Shortcuts />}
        {ui.dialog === 'paste' && <PasteText />}
        {ui.dialog === 'looks' && <AgentLooks />}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Bring in files"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void bring(files);
          }}
        />
        {dropping && (
          <div className="drop-hint">
            Drop to add to {space.kind === 'personal' ? 'your space' : space.name}
          </div>
        )}
        {menuAt && (
          <div
            className="menu-layer"
            onPointerDown={() => setMenuAt(null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              className="context"
              role="menu"
              style={{
                left: Math.min(menuAt.x, window.innerWidth - 220),
                top: Math.min(menuAt.y, window.innerHeight - menuAt.items.length * 32 - 16),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {menuAt.items.map((item, i) =>
                item === 'line' ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={i}
                    role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={item.checked}
                    className={`${item.danger ? 'danger' : ''} ${item.checked ? 'checked' : ''}`}
                    onClick={() => {
                      setMenuAt(null);
                      item.run();
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
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
