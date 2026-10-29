import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { GridviewReact, type IGridviewPanelProps } from 'dockview-react';
import { Orientation, type GridviewApi, type SerializedGridviewComponent } from 'dockview';
import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MessageSquare,
  MessagesSquare,
  Network,
  FolderOpen,
  FileText,
  BookOpen,
  Search,
  Lock,
  Users,
  UserRound,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Globe,
  Ellipsis,
  Maximize2,
  Minimize2,
  Link,
  ShieldCheck,
  Calendar,
  Target,
  ArrowUpRight,
  Sun,
  Moon,
  Monitor,
  Info,
  AlertCircle,
  RotateCcw,
  Bookmark,
  SlidersHorizontal,
  Workflow,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { accessibleSplitters } from './splitters';
import { createPortal } from 'react-dom';
import { Graph } from './Graph';
import {
  resources,
  initialConversations,
  initialGoals,
  storageKey,
  canSplit,
  placementAt,
  type Pane,
  type Utility,
  type Conversation,
  type Goal,
  type Theme,
} from './model';
import 'dockview/dist/styles/dockview.css';
import '@fontsource-variable/dm-sans/index.css';
import './style.css';

type Saved = {
  layout?: SerializedGridviewComponent;
  conversations: Conversation[];
  selected: string;
  drafts: Record<string, string>;
  attachments: Record<string, string[]>;
  document: string;
  theme: Theme;
  goals: Goal[];
  utilities: Utility[];
  history: boolean;
  preset?: SerializedGridviewComponent;
  autonomy: string;
  graphSubject: string;
  graphExpanded: boolean;
};
function readSaved(): Partial<Saved> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean: Partial<Saved> = {};
    const validConversations =
      Array.isArray(raw.conversations) &&
      raw.conversations.length &&
      raw.conversations.every(
        (c: any) =>
          c &&
          typeof c.id === 'string' &&
          typeof c.title === 'string' &&
          ['private', 'channel', 'dm'].includes(c.kind) &&
          Array.isArray(c.messages) &&
          c.messages.every(
            (m: any) =>
              m &&
              typeof m.id === 'string' &&
              typeof m.author === 'string' &&
              typeof m.text === 'string' &&
              typeof m.at === 'string',
          ),
      );
    if (validConversations) clean.conversations = raw.conversations;
    if ((clean.conversations || initialConversations).some((c) => c.id === raw.selected))
      clean.selected = raw.selected;
    if (raw.drafts && typeof raw.drafts === 'object' && !Array.isArray(raw.drafts))
      clean.drafts = Object.fromEntries(
        Object.entries(raw.drafts).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>;
    if (raw.attachments && typeof raw.attachments === 'object')
      clean.attachments = Object.fromEntries(
        Object.entries(raw.attachments).filter(
          ([, value]) =>
            Array.isArray(value) && value.every((id) => resources.some((r) => r.id === id)),
        ),
      ) as Record<string, string[]>;
    if (resources.some((r) => r.id === raw.document)) clean.document = raw.document;
    if (['system', 'light', 'dark'].includes(raw.theme)) clean.theme = raw.theme;
    if (
      Array.isArray(raw.goals) &&
      raw.goals.every(
        (g: any) =>
          g &&
          typeof g.id === 'string' &&
          typeof g.title === 'string' &&
          typeof g.done === 'boolean' &&
          typeof g.due === 'string',
      )
    )
      clean.goals = raw.goals;
    if (
      Array.isArray(raw.utilities) &&
      raw.utilities.every((u: string) => ['sources', 'agent', 'goals'].includes(u))
    )
      clean.utilities = [...new Set(raw.utilities)] as Utility[];
    if (typeof raw.history === 'boolean') clean.history = raw.history;
    if (raw.layout?.grid) clean.layout = raw.layout;
    if (raw.preset?.grid) clean.preset = raw.preset;
    if (['ask', 'autonomous'].includes(raw.autonomy)) clean.autonomy = raw.autonomy;
    if (
      ['root', 'direction', 'research-folder', ...resources.map((r) => r.id)].includes(
        raw.graphSubject,
      )
    )
      clean.graphSubject = raw.graphSubject;
    if (typeof raw.graphExpanded === 'boolean') clean.graphExpanded = raw.graphExpanded;
    return clean;
  } catch {
    return {};
  }
}
const boot = readSaved();
const readingPositions: Record<string, number> = {};
const names: Record<Pane, string> = {
  conversation: 'Conversation',
  graph: 'Context graph',
  document: 'Document',
  explorer: 'Folder',
  browser: 'Browser',
  'agent-settings': 'Agent settings',
};
const icons: Record<Pane, LucideIcon> = {
  conversation: MessageSquare,
  graph: Network,
  document: FileText,
  explorer: FolderOpen,
  browser: Globe,
  'agent-settings': SlidersHorizontal,
};
function relocate(
  api: GridviewApi,
  id: Pane,
  direction: 'left' | 'right' | 'above' | 'below',
  reference: string,
) {
  const before = api.toJSON(),
    panel = api.getPanel(id);
  if (!panel || !api.getPanel(reference) || id === reference) return false;
  // Resolve the target AFTER removal. Gridview's movePanel can retain a stale
  // location when removing the origin collapses an ancestor split branch.
  try {
    const params = panel.params;
    api.removePanel(panel);
    api.addPanel({
      id,
      component: 'module',
      params,
      minimumWidth: 300,
      minimumHeight: 184,
      position: { referencePanel: reference, direction },
    });
    if (api.minimumWidth > api.width + 1 || api.minimumHeight > api.height + 1)
      throw new Error('Insufficient layout capacity');
    return true;
  } catch {
    api.fromJSON(before);
    return false;
  }
}
type WorkspaceContext = {
  selected: string;
  select: (id: string) => void;
  conversations: Conversation[];
  updateConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  drafts: Record<string, string>;
  setDraft: (text: string) => void;
  send: () => void;
  reply: string | null;
  setReply: (id: string | null) => void;
  open: (id: Pane) => void;
  close: (id: Pane) => void;
  openResource: (id: string) => void;
  doc: string;
  subject: string;
  setSubject: (id: string) => void;
  move: (id: Pane, direction: 'left' | 'right' | 'above' | 'below', reference?: string) => void;
  beginDrag: (e: React.PointerEvent, id: Pane) => void;
  focus: (id: Pane) => void;
  focused: string | null;
  setNotice: (text: string) => void;
  autonomy: string;
  setAutonomy: (v: string) => void;
  graphExpanded: boolean;
  setGraphExpanded: (value: boolean) => void;
};
const Workspace = createContext<WorkspaceContext>(null!);
function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  children,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type="button"
      className={`icon-button ${active ? 'active' : ''} ${rest.className || ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon size={19} strokeWidth={1.65} />
      {children}
    </button>
  );
}
function useTheme(theme: Theme) {
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === 'system' ? (query.matches ? 'dark' : 'light') : theme);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}

function App() {
  const [conversations, updateConversations] = useState<Conversation[]>(
    boot.conversations || initialConversations,
  );
  const [selected, setSelected] = useState(boot.selected || 'notes');
  const [drafts, setDrafts] = useState<Record<string, string>>(boot.drafts || {});
  const [attachments, setAttachments] = useState<Record<string, string[]>>(boot.attachments || {});
  const [moduleMenu, setModuleMenu] = useState<{ x: number; y: number } | null>(null);
  const [doc, setDoc] = useState(boot.document || 'plan');
  const [subject, setSubject] = useState(boot.graphSubject || 'root');
  const [graphExpanded, setGraphExpanded] = useState(boot.graphExpanded ?? false);
  const [theme, setTheme] = useState<Theme>(boot.theme || 'system');
  const [goals, setGoals] = useState<Goal[]>(boot.goals || initialGoals);
  const [utilities, setUtilities] = useState<Utility[]>(boot.utilities || []);
  const [history, setHistory] = useState(boot.history ?? false);
  const [navigationWidth, setNavigationWidth] = useState(233);
  const [utilityWidth, setUtilityWidth] = useState(280);
  const [reply, setReply] = useState<string | null>(null);
  const draftKey = reply ? `${selected}::${reply}` : selected;
  const [account, setAccount] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [dm, setDm] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [paneIds, setPaneIds] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState(boot.autonomy || 'ask');
  const [preset, setPreset] = useState(boot.preset);
  const grid = useRef<GridviewApi | null>(null);
  const work = useRef<HTMLDivElement>(null);
  const focusLayout = useRef<SerializedGridviewComponent | null>(null);
  const stateRef = useRef<Saved>(null!);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(140, Math.max(31, el.scrollHeight))}px`;
    }
  }, [drafts, draftKey]);
  const [drag, setDrag] = useState<{
    id: Pane;
    x: number;
    y: number;
    target: string;
    direction: 'left' | 'right' | 'above' | 'below';
    valid: boolean;
    rect: DOMRect;
  } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  useTheme(theme);
  stateRef.current = {
    conversations,
    selected,
    drafts,
    attachments,
    document: doc,
    theme,
    goals,
    utilities,
    history,
    preset,
    autonomy,
    graphSubject: subject,
    graphExpanded,
  };
  const persist = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...stateRef.current,
          layout: focusLayout.current || grid.current?.toJSON(),
        }),
      );
    } catch {
      setNotice('Local storage is full. Your changes have not been saved.');
    }
  }, []);
  useEffect(() => {
    persist();
  }, [
    conversations,
    selected,
    drafts,
    doc,
    theme,
    goals,
    utilities,
    history,
    preset,
    autonomy,
    subject,
    graphExpanded,
    attachments,
    persist,
  ]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccount(false);
        setAddMenu(false);
        setDm(false);
        setModuleMenu(null);
        setReply(null);
      }
    };
    const commands = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.isComposing) {
        e.preventDefault();
        setModuleMenu((v) =>
          v ? null : { x: window.innerWidth / 2 - 130, y: window.innerHeight / 2 - 170 },
        );
      }
    };
    window.addEventListener('keydown', commands);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('keydown', commands);
    };
  }, []);
  const enforceFit = () => {
    const api = grid.current,
      rect = work.current?.getBoundingClientRect();
    if (!api || !rect) return true;
    if (api.minimumWidth > rect.width + 1 || api.minimumHeight > rect.height + 1) {
      if (api.panels.length > 1) {
        focusLayout.current = api.toJSON();
        const active = api.panels.find((p) => p.api.isActive)?.id || api.panels[0].id;
        api.panels.forEach((p) => p.api.setVisible(p.id === active));
        setFocused(active);
        setNotice('Make more room or collapse the side panels before restoring this arrangement.');
        return false;
      }
    }
    return true;
  };
  const restoreFocus = (force = false) => {
    if (grid.current && focusLayout.current) {
      grid.current.fromJSON(focusLayout.current);
      focusLayout.current = null;
      setFocused(null);
      if (!force) return enforceFit();
    }
    return true;
  };
  const close = (id: Pane) => {
    restoreFocus(true);
    const p = grid.current?.getPanel(id);
    if (p) grid.current!.removePanel(p);
    enforceFit();
    persist();
  };
  const findPlacement = () => {
    const api = grid.current!;
    const panels = [...api.panels].sort((a, b) => b.width * b.height - a.width * a.height);
    for (const p of panels) {
      const direction = p.width / p.height > 1.4 ? 'right' : 'below';
      if (canSplit(p.width, p.height, direction))
        return { direction: direction as 'right' | 'below', referencePanel: p.id };
      const other = direction === 'right' ? 'below' : 'right';
      if (canSplit(p.width, p.height, other))
        return { direction: other as 'right' | 'below', referencePanel: p.id };
    }
    return null;
  };
  const open = (id: Pane) => {
    restoreFocus();
    const api = grid.current;
    if (!api) return;
    if (api.getPanel(id)) {
      if (focusLayout.current) {
        api.panels.forEach((p) => p.api.setVisible(p.id === id));
        setFocused(id);
        focusLayout.current.activePanel = id;
      }
      api.getPanel(id)!.api.setActive();
      work.current?.querySelector<HTMLElement>(`[data-pane="${id}"]`)?.focus();
      return;
    }
    if (focusLayout.current) {
      setNotice(
        'Restore the arrangement or close a pane before opening another module. Your existing panes are retained.',
      );
      return;
    }
    const position = findPlacement();
    if (api.panels.length && !position) {
      setNotice(
        'There isn’t enough room for another usable pane. Close a pane or collapse the conversation list or utilities, then try again.',
      );
      return;
    }
    api.addPanel({
      id,
      component: 'module',
      params: { kind: id },
      minimumWidth: 300,
      minimumHeight: 184,
      ...(position ? { position } : {}),
    });
    persist();
  };
  const openResource = (id: string) => {
    setDoc(id);
    const api = grid.current,
      rect = work.current?.getBoundingClientRect();
    // The first source gets a full-height reading region; chat and graph share
    // the adjacent column. Later sources reuse that same viewer.
    if (
      api &&
      !api.getPanel('document') &&
      api.panels.length === 2 &&
      api.getPanel('conversation') &&
      api.getPanel('graph') &&
      rect &&
      rect.width >= 640 &&
      rect.height >= 410 &&
      !focusLayout.current
    ) {
      api.addPanel({
        id: 'document',
        component: 'module',
        params: { kind: 'document' },
        minimumWidth: 300,
        minimumHeight: 184,
        position: { referencePanel: 'conversation', direction: 'right' },
      });
      relocate(api, 'graph', 'below', 'conversation');
      api.getPanel('document')?.api.setActive();
      persist();
      return;
    }
    open('document');
  };
  const select = (id: string) => {
    setSelected(id);
    setReply(null);
    open('conversation');
    if (conversations.find((c) => c.id === id)?.kind === 'channel')
      setUtilities(['sources', 'agent', 'goals']);
  };
  const newChat = () => {
    const empty = conversations.find(
      (c) =>
        c.kind === 'private' &&
        c.title === 'New chat' &&
        !c.messages.length &&
        !drafts[c.id]?.trim(),
    );
    if (empty) {
      setSelected(empty.id);
      setReply(null);
      setHistory(true);
      open('conversation');
      return;
    }
    const id = crypto.randomUUID();
    updateConversations((v) => [...v, { id, title: 'New chat', kind: 'private', messages: [] }]);
    setSelected(id);
    setReply(null);
    setHistory(true);
    open('conversation');
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('#composer')?.focus(), 0);
  };
  const send = () => {
    const text = (drafts[draftKey] || '').trim();
    if (!text) return;
    updateConversations((v) =>
      v.map((c) =>
        c.id === selected
          ? {
              ...c,
              title: c.title === 'New chat' ? text.slice(0, 36) : c.title,
              messages: [
                ...c.messages,
                {
                  id: crypto.randomUUID(),
                  text,
                  author: 'You',
                  at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  sources: attachments[draftKey] || [],
                  ...(reply ? { replyTo: reply } : {}),
                },
              ],
            }
          : c,
      ),
    );
    setDrafts((v) => ({ ...v, [draftKey]: '' }));
    setAttachments((v) => ({ ...v, [draftKey]: [] }));
    open('conversation');
    setNotice('Saved in this local preview. No message was delivered to a person or agent.');
  };
  const move = (id: Pane, direction: 'left' | 'right' | 'above' | 'below', reference?: string) => {
    restoreFocus();
    const api = grid.current;
    const panel = api?.getPanel(id);
    const target = api?.getPanel(reference || api.panels.find((p) => p.id !== id)?.id || '');
    if (!api || !panel || !target) return;
    if (!canSplit(target.width, target.height, direction)) {
      setNotice('That region is too small for this split. Resize it first.');
      return;
    }
    if (!relocate(api, id, direction, target.id))
      setNotice('That placement does not fit. Your previous arrangement has been restored.');
    persist();
  };
  const focus = (id: Pane) => {
    const api = grid.current;
    if (!api) return;
    if (focusLayout.current) {
      restoreFocus();
      return;
    }
    focusLayout.current = api.toJSON();
    setFocused(id);
    for (const p of api.panels) p.api.setVisible(p.id === id);
  };
  const beginDrag = (e: React.PointerEvent, id: Pane) => {
    if ((e.target as HTMLElement).closest('button,summary,input')) return;
    e.preventDefault();
    const startX = e.clientX,
      startY = e.clientY;
    let started = false;
    const update = (event: PointerEvent) => {
      if (!started && Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
      started = true;
      const el = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((el) => el instanceof HTMLElement && el.hasAttribute('data-pane')) as
        HTMLElement | undefined;
      const target = el?.dataset.pane || '';
      const rect = el?.getBoundingClientRect() || new DOMRect();
      const direction = placementAt(
        event.clientX - rect.x,
        event.clientY - rect.y,
        rect.width || 1,
        rect.height || 1,
      );
      const next = {
        id,
        x: event.clientX,
        y: event.clientY,
        target,
        direction,
        valid: !!el && target !== id && canSplit(rect.width, rect.height, direction),
        rect,
      };
      dragRef.current = next;
      setDrag(next);
    };
    const end = (event: PointerEvent) => {
      const d = dragRef.current;
      if (event.type !== 'pointercancel' && d?.valid) move(d.id, d.direction, d.target);
      cleanup();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', key);
      setDrag(null);
      dragRef.current = null;
    };
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key);
  };
  const splittersCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => splittersCleanup.current?.(), []);
  const onReady = ({ api }: { api: GridviewApi }) => {
    grid.current = api;
    if (work.current) splittersCleanup.current = accessibleSplitters(work.current, api);
    api.onDidLayoutChange(() => {
      setPaneIds(api.panels.map((p) => p.id));
      persist();
    });
    if (boot.layout) {
      try {
        api.fromJSON(boot.layout);
      } catch {
        api.clear();
        setNotice(
          'The saved arrangement could not be restored. Your messages and drafts are intact.',
        );
      }
    }
    setPaneIds(api.panels.map((p) => p.id));
  };
  // Use library dimensions for layout, and preserve valid allocations rather than clipping when browser size changes.
  useLayoutEffect(() => {
    if (!work.current) return;
    const observer = new ResizeObserver(() => {
      const api = grid.current,
        el = work.current;
      if (!api || !el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width < 320 && stateRef.current.history) {
        setHistory(false);
        setNotice(
          'Conversation navigation was collapsed to keep your work readable. Reopen it from the rail.',
        );
        return;
      }
      if (width < 320 && stateRef.current.utilities.length) {
        setUtilities([]);
        setNotice(
          'Utilities were collapsed to keep your work readable. Reopen them from the rail.',
        );
        return;
      }
      api.layout(width, height);
      if (api.minimumWidth > width + 1 || api.minimumHeight > height + 1) {
        if (!focusLayout.current && api.panels.length > 1) {
          focusLayout.current = api.toJSON();
          const id = api.panels.find((p) => p.api.isActive)?.id || api.panels[0].id;
          setFocused(id);
          api.panels.forEach((p) => p.api.setVisible(p.id === id));
          setNotice(
            'The window is too small for this arrangement. One pane is focused; restore the arrangement after making more room.',
          );
        }
      }
    });
    observer.observe(work.current);
    return () => observer.disconnect();
  }, []);
  const context: WorkspaceContext = {
    selected,
    select,
    conversations,
    updateConversations,
    drafts,
    setDraft: (text) => setDrafts((v) => ({ ...v, [draftKey]: text })),
    send,
    reply,
    setReply,
    open,
    close,
    openResource,
    doc,
    subject,
    setSubject,
    move,
    beginDrag,
    focus,
    focused,
    setNotice,
    autonomy,
    setAutonomy,
    graphExpanded,
    setGraphExpanded,
  };
  const current = conversations.find((c) => c.id === selected)!;
  return (
    <Workspace.Provider value={context}>
      <div className="app-shell">
        <nav className="rail glass" aria-label="Workspace navigation">
          <div className="rail-top">
            <IconButton
              icon={history ? PanelLeftClose : PanelLeftOpen}
              label={history ? 'Hide conversation list' : 'Show conversation list'}
              active={history}
              onClick={() => setHistory((v) => !v)}
            />
            <div className="rail-rule" />
            <IconButton icon={Plus} label="New private chat" onClick={newChat} />
            <IconButton
              icon={MessagesSquare}
              label="Conversations"
              active={paneIds.includes('conversation')}
              onClick={() => {
                setHistory(true);
                open('conversation');
              }}
            />
            <IconButton
              icon={Network}
              label="Open context graph"
              active={paneIds.includes('graph')}
              onClick={() => {
                setSubject('root');
                open('graph');
              }}
            />
            <IconButton
              icon={FolderOpen}
              label="Browse project resources"
              active={paneIds.includes('explorer')}
              onClick={() => open('explorer')}
            />
          </div>
          <div className="rail-bottom">
            <IconButton
              icon={Layers}
              label={utilities.length ? 'Hide right-side utilities' : 'Show right-side utilities'}
              active={utilities.length > 0}
              onClick={() => setUtilities((v) => (v.length ? [] : ['sources', 'agent', 'goals']))}
            />
            <div className="account-anchor">
              <button
                className="account-button"
                aria-label="Account and appearance"
                title="Account and appearance"
                aria-expanded={account}
                onClick={() => setAccount((v) => !v)}
              >
                D
              </button>
              {account && (
                <div className="popover account-pop glass">
                  <strong>Local preview</strong>
                  <p>
                    Saved on this browser.
                    <br />
                    No account is connected.
                  </p>
                  <span className="field-label">Appearance</span>
                  <div className="theme-options">
                    {(['system', 'light', 'dark'] as Theme[]).map((t, i) => (
                      <IconButton
                        key={t}
                        icon={[Monitor, Sun, Moon][i]}
                        label={t[0].toUpperCase() + t.slice(1)}
                        active={theme === t}
                        onClick={() => setTheme(t)}
                      />
                    ))}
                  </div>
                  <a href="/materials" target="_blank" rel="noreferrer">
                    Component proof <ArrowUpRight size={14} />
                  </a>
                  <small>Layout proof · stage A</small>
                </div>
              )}
            </div>
          </div>
        </nav>
        {history && (
          <aside
            className="conversation-list glass"
            style={{ width: navigationWidth, flexBasis: navigationWidth }}
            aria-label="Conversation list"
          >
            <div className="list-heading">
              <strong>Conversations</strong>
              <IconButton icon={Plus} label="New private chat" onClick={newChat} />
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Find a conversation"
                placeholder="Find a conversation"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="conversation-groups">
              <div className="section-label">
                <Lock size={13} /> Personal{' '}
                <button
                  onClick={() => setDm(true)}
                  title="Start a direct message"
                  aria-label="Start a direct message"
                >
                  <Plus size={15} />
                </button>
              </div>
              {conversations
                .filter(
                  (c) =>
                    c.kind !== 'channel' && c.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.kind === 'channel' ? `# ${c.title}` : c.title}
                    className={`conversation-row ${selected === c.id ? 'selected' : ''}`}
                    onClick={() => select(c.id)}
                  >
                    {c.kind === 'dm' ? <UserRound size={16} /> : <MessageSquare size={16} />}
                    <span>{c.title}</span>
                    {!!drafts[c.id] && <i aria-label="Has a draft" />}
                  </button>
                ))}
              <div className="project-label">
                <span className="project-mark" />
                <div>
                  <strong>Workstation</strong>
                  <small>Project · recorded requirements</small>
                </div>
              </div>
              {conversations
                .filter(
                  (c) =>
                    c.kind === 'channel' && c.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.kind === 'channel' ? `# ${c.title}` : c.title}
                    className={`conversation-row ${selected === c.id ? 'selected' : ''}`}
                    onClick={() => select(c.id)}
                  >
                    <span className="hash">#</span>
                    <span>{c.title}</span>
                    {!!drafts[c.id] && <i aria-label="Has a draft" />}
                  </button>
                ))}
            </div>
            <div className="list-footer">
              <ShieldCheck size={14} />
              <span>Local records, no live participants</span>
            </div>
          </aside>
        )}
        {history && (
          <WidthDivider
            label="Resize conversation list"
            value={navigationWidth}
            min={200}
            max={320}
            setValue={setNavigationWidth}
          />
        )}
        <div className="main-area">
          <div className="workspace-row">
            <main
              ref={work}
              className="work-region"
              aria-label="Work area"
              onContextMenu={(e) => {
                if (!(e.target as HTMLElement).closest('.work-pane')) {
                  e.preventDefault();
                  setModuleMenu({ x: e.clientX, y: e.clientY });
                }
              }}
            >
              <GridviewReact
                orientation={Orientation.HORIZONTAL}
                components={moduleComponents}
                onReady={onReady}
                className="work-grid"
              />
            </main>
            {utilities.length > 0 && (
              <>
                <WidthDivider
                  label="Resize utility column"
                  value={utilityWidth}
                  min={240}
                  max={360}
                  setValue={setUtilityWidth}
                  reverse
                />
                <UtilityColumn
                  utilities={utilities}
                  width={utilityWidth}
                  goals={goals}
                  setGoals={setGoals}
                  onClose={(id) => setUtilities((v) => v.filter((x) => x !== id))}
                />
              </>
            )}
          </div>
          <form
            className="composer glass"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="sr-only" htmlFor="composer">
              {current?.kind === 'channel'
                ? `Message #${current.title}`
                : current?.kind === 'dm'
                  ? `Message ${current.recipient}`
                  : 'Message in private chat'}
            </label>
            {reply && (
              <div className="reply-target">
                <MessageSquare size={14} />
                Replying in thread
                <IconButton icon={X} label="Exit thread reply" onClick={() => setReply(null)} />
              </div>
            )}
            {!!attachments[draftKey]?.length && (
              <div className="draft-sources">
                {attachments[draftKey].map((id) => (
                  <span key={id}>
                    <FileText size={13} />
                    {resources.find((r) => r.id === id)?.title}
                    <IconButton
                      icon={X}
                      label={`Remove ${resources.find((r) => r.id === id)?.title} attachment`}
                      onClick={() =>
                        setAttachments((v) => ({
                          ...v,
                          [draftKey]: v[draftKey].filter((x) => x !== id),
                        }))
                      }
                    />
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={composerRef}
              id="composer"
              placeholder={
                current?.kind === 'channel'
                  ? `Message #${current.title}…`
                  : current?.kind === 'dm'
                    ? `Message ${current.recipient}…`
                    : 'Message…'
              }
              rows={1}
              value={drafts[draftKey] || ''}
              onChange={(e) => setDrafts((v) => ({ ...v, [draftKey]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="composer-actions">
              <div className="add-anchor">
                <IconButton
                  icon={Plus}
                  label="Attach context"
                  active={addMenu}
                  onClick={() => setAddMenu((v) => !v)}
                />
                {addMenu && (
                  <div className="popover add-pop glass">
                    <span className="field-label">Attach a repository source</span>
                    {resources.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => {
                          setAttachments((v) => ({
                            ...v,
                            [draftKey]: [...new Set([...(v[draftKey] || []), r.id])],
                          }));
                          setAddMenu(false);
                        }}
                      >
                        <FileText size={17} />
                        {r.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="composer-audience">
                <span className="status-dot" />
                {current?.kind === 'channel'
                  ? 'Project channel'
                  : current?.kind === 'dm'
                    ? 'Direct message draft'
                    : 'Private chat'}
              </span>
              <button
                className="send-button"
                type="submit"
                aria-label="Send message"
                disabled={!drafts[draftKey]?.trim()}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
        </div>
        {notice && (
          <div className="notice glass" role="status">
            <Info size={17} />
            <span>{notice}</span>
            <IconButton icon={X} label="Dismiss notification" onClick={() => setNotice('')} />
          </div>
        )}
        {drag && (
          <>
            <div className="drag-chip glass" style={{ left: drag.x + 14, top: drag.y + 14 }}>
              {names[drag.id]}{' '}
              <span>
                {drag.valid ? `Snap ${drag.direction}` : 'Choose another region · Esc to cancel'}
              </span>
            </div>
            {drag.valid && (
              <div className="snap-preview" style={snapStyle(drag.rect, drag.direction)} />
            )}
          </>
        )}
        {dm && (
          <div className="menu-backdrop" onPointerDown={() => setDm(false)}>
            <form
              className="dm-pop glass"
              onPointerDown={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget),
                  recipient = String(data.get('recipient') || '').trim();
                if (!recipient) return;
                const existing = conversations.find(
                  (c) => c.kind === 'dm' && c.recipient === recipient,
                );
                if (existing) select(existing.id);
                else {
                  const id = crypto.randomUUID();
                  updateConversations((v) => [
                    ...v,
                    { id, title: recipient, recipient, kind: 'dm', messages: [] },
                  ]);
                  setSelected(id);
                  open('conversation');
                }
                setDm(false);
              }}
            >
              <div className="list-heading">
                <strong>Direct message</strong>
                <IconButton
                  icon={X}
                  label="Close direct message form"
                  onClick={() => setDm(false)}
                />
              </div>
              <label>
                Person or email
                <input name="recipient" autoFocus required placeholder="Name or email" />
              </label>
              <p>
                This opens a local draft. Contact lookup and delivery need the identity service.
              </p>
              <button className="primary" type="submit">
                Open draft <ArrowRight size={16} />
              </button>
            </form>
          </div>
        )}
        {moduleMenu && (
          <div className="menu-backdrop transparent" onPointerDown={() => setModuleMenu(null)}>
            <div
              className="popover module-picker glass"
              style={{
                left: Math.max(15, Math.min(window.innerWidth - 285, moduleMenu.x)),
                top: Math.max(15, Math.min(window.innerHeight - 360, moduleMenu.y)),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="field-label">Open a module</span>
              {(['conversation', 'graph', 'explorer', 'browser', 'agent-settings'] as Pane[]).map(
                (id) => {
                  const Icon = icons[id];
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        open(id);
                        setModuleMenu(null);
                      }}
                    >
                      <Icon size={17} />
                      {names[id]}
                    </button>
                  );
                },
              )}
              <div className="menu-rule" />
              <span className="field-label">Documents</span>
              {resources.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    openResource(r.id);
                    setModuleMenu(null);
                  }}
                >
                  <FileText size={17} />
                  {r.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="layout-actions">
          <details>
            <summary aria-label="Layout actions" title="Layout actions">
              <Ellipsis size={18} />
            </summary>
            <div className="popover layout-pop glass">
              <button
                onClick={(e) => {
                  (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                  setModuleMenu({ x: window.innerWidth - 300, y: window.innerHeight - 390 });
                }}
              >
                <Plus size={16} />
                Open a module <kbd>⌘K</kbd>
              </button>
              <button
                onClick={() => {
                  if (grid.current) {
                    setPreset(focusLayout.current || grid.current.toJSON());
                    setNotice('Personal layout preset saved in this browser.');
                  }
                }}
              >
                <Bookmark size={16} />
                Save arrangement
              </button>
              <button
                disabled={!preset}
                onClick={() => {
                  if (preset && grid.current) {
                    restoreFocus();
                    grid.current.fromJSON(preset);
                    enforceFit();
                    persist();
                  }
                }}
              >
                <RotateCcw size={16} />
                Restore arrangement
              </button>
              <button
                onClick={() => {
                  restoreFocus();
                  grid.current?.clear();
                  persist();
                }}
              >
                <X size={16} />
                Close work panes
              </button>
            </div>
          </details>
        </div>
      </div>
    </Workspace.Provider>
  );
}
function snapStyle(rect: DOMRect, d: 'left' | 'right' | 'above' | 'below'): React.CSSProperties {
  const horizontal = d === 'left' || d === 'right';
  return {
    left: rect.x + (d === 'right' ? rect.width / 2 : 0) + 5,
    top: rect.y + (d === 'below' ? rect.height / 2 : 0) + 5,
    width: (horizontal ? rect.width / 2 : rect.width) - 10,
    height: (horizontal ? rect.height : rect.height / 2) - 10,
  };
}

function Module({ params, containerApi }: IGridviewPanelProps<{ kind: Pane }>) {
  const w = useContext(Workspace);
  const kind = params.kind;
  const Icon = icons[kind];
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenu(false);
        document.querySelector<HTMLButtonElement>(`[data-menu="${kind}"] button`)?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest(`[data-menu="${kind}"]`)) setMenu(false);
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menu, kind]);
  const reference = containerApi.panels.find((p) => p.id !== kind)?.id;
  const resource = resources.find((r) => r.id === w.doc)!;
  const c = w.conversations.find((c) => c.id === w.selected)!;
  const title =
    kind === 'document'
      ? resource.title
      : kind === 'conversation'
        ? c?.kind === 'channel'
          ? `# ${c.title}`
          : c?.title
        : kind === 'explorer'
          ? w.subject === 'research-folder'
            ? 'Research'
            : 'Project resources'
          : names[kind];
  return (
    <section className={`work-pane pane-${kind}`} data-pane={kind} tabIndex={-1} aria-label={title}>
      <header className="module-header" onPointerDown={(e) => w.beginDrag(e, kind)}>
        <Icon size={17} />
        <strong title={title}>{title}</strong>
        <div className="module-actions">
          <IconButton
            icon={w.focused === kind ? Minimize2 : Maximize2}
            label={
              w.focused === kind ? 'Restore arrangement' : `Focus ${names[kind].toLowerCase()}`
            }
            onClick={() => w.focus(kind)}
          />
          <div className="module-menu-anchor" data-menu={kind}>
            <IconButton
              icon={Ellipsis}
              label={`Arrange ${names[kind].toLowerCase()}`}
              onClick={() => setMenu((v) => !v)}
            />
            {menu &&
              createPortal(
                <div
                  className="popover pane-pop glass"
                  data-menu={kind}
                  style={{
                    position: 'fixed',
                    right: Math.max(
                      12,
                      window.innerWidth -
                        (document
                          .querySelector(`[data-pane="${kind}"] .module-header`)
                          ?.getBoundingClientRect().right || window.innerWidth),
                    ),
                    top:
                      (document
                        .querySelector(`[data-pane="${kind}"] .module-header`)
                        ?.getBoundingClientRect().bottom || 40) + 4,
                  }}
                >
                  <span className="field-label">
                    Relative to {reference ? names[reference as Pane] : 'another pane'}
                  </span>
                  {(['left', 'right', 'above', 'below'] as const).map((d, i) => (
                    <button
                      key={d}
                      disabled={!reference}
                      onClick={() => {
                        w.move(kind, d);
                        setMenu(false);
                      }}
                    >
                      {React.createElement([ArrowLeft, ArrowRight, ArrowUp, ArrowDown][i], {
                        size: 15,
                      })}
                      Move {d}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
          <IconButton
            icon={X}
            label={`Close ${names[kind].toLowerCase()}`}
            onClick={() => w.close(kind)}
          />
        </div>
      </header>
      <div className="module-body">
        {kind === 'conversation' ? (
          <ConversationView />
        ) : kind === 'graph' ? (
          <Graph
            subject={w.subject}
            setSubject={w.setSubject}
            expanded={w.graphExpanded}
            setExpanded={w.setGraphExpanded}
            onResource={w.openResource}
            onFolder={() => w.open('explorer')}
          />
        ) : kind === 'document' ? (
          <DocumentView />
        ) : kind === 'explorer' ? (
          <Explorer />
        ) : kind === 'agent-settings' ? (
          <AgentSettings />
        ) : (
          <BrowserProof />
        )}
      </div>
    </section>
  );
}
const moduleComponents = { module: Module };
function ConversationView() {
  const w = useContext(Workspace);
  const conversation = w.conversations.find((c) => c.id === w.selected)!;
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.id, conversation?.messages.length]);
  if (!conversation) return null;
  const roots = conversation.messages.filter((m) => !m.replyTo);
  const replies = conversation.messages.filter((m) => m.replyTo === w.reply);
  const root = conversation.messages.find((m) => m.id === w.reply);
  return (
    <div className="conversation-view">
      <div className="conversation-scope">
        {conversation.kind === 'channel' ? <Users size={14} /> : <Lock size={14} />}
        <span>
          {conversation.kind === 'channel'
            ? 'Recorded project discussion'
            : conversation.kind === 'dm'
              ? `Only you and ${conversation.recipient} when connected`
              : 'Private conversation'}
          {conversation.kind === 'channel' && ' · imported excerpts'}
        </span>
      </div>
      <div className="transcript">
        {root ? (
          <>
            <button className="text-button thread-back" onClick={() => w.setReply(null)}>
              <ArrowLeft size={14} />
              Back to conversation
            </button>
            <MessageItem message={root} />
            <div className="thread-divider">Thread</div>
            {replies.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </>
        ) : roots.length ? (
          roots.map((m) => (
            <div key={m.id}>
              <MessageItem message={m} />
              <button className="reply-button" onClick={() => w.setReply(m.id)}>
                <MessageSquare size={13} />
                {conversation.messages.filter((r) => r.replyTo === m.id).length || 'Reply'}
                {conversation.messages.some((r) => r.replyTo === m.id) ? ' replies' : ''}
              </button>
            </div>
          ))
        ) : (
          <div className="conversation-empty">
            <MessageSquare size={26} strokeWidth={1.2} />
            <strong>
              {conversation.kind === 'dm'
                ? 'Start a direct message'
                : 'Your conversation starts here'}
            </strong>
            <p>
              {conversation.kind === 'dm'
                ? 'No project is required. This draft stays in your personal conversations.'
                : 'Write in the floating composer. Your draft stays with this conversation.'}
            </p>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="local-footnote">
        Messages are stored locally · no delivery or agent connected
      </div>
    </div>
  );
}
function MessageItem({ message }: { message: Conversation['messages'][number] }) {
  const w = useContext(Workspace);
  return (
    <article className="message">
      <div className="message-avatar">{message.author === 'You' ? 'D' : 'D'}</div>
      <div>
        <div className="message-meta">
          <strong>{message.author}</strong>
          <time>{message.at}</time>
        </div>
        <p>{message.text}</p>
        {Array.isArray(message.sources) && message.sources.length > 0 && (
          <div className="message-sources">
            {message.sources.map((id) => (
              <button key={id} onClick={() => w?.openResource(id)}>
                <FileText size={13} />
                {resources.find((r) => r.id === id)?.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function DocumentView() {
  const w = useContext(Workspace),
    r = resources.find((r) => r.id === w.doc)!;
  const [text, setText] = useState(''),
    [error, setError] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    positions = useRef(readingPositions);
  useEffect(() => {
    let active = true;
    setText('');
    setError(false);
    fetch(`/resources/${encodeURIComponent(r.file)}`)
      .then((r) => {
        if (!r.ok) throw Error();
        return r.text();
      })
      .then((t) => {
        if (active) {
          setText(t);
          requestAnimationFrame(() => {
            if (scroll.current) scroll.current.scrollTop = positions.current[r.id] || 0;
          });
        }
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [r.id]);
  return (
    <div className="document-view">
      <div className="document-toolbar">
        <span>
          <FileText size={14} />
          Markdown source
        </span>
        <a
          href={`/resources/${encodeURIComponent(r.file)}`}
          download={r.file}
          title="Download Markdown source"
        >
          <ArrowDown size={15} />
          <span>Download</span>
        </a>
      </div>
      <div
        ref={scroll}
        className="document-scroll"
        onScroll={(e) => (positions.current[r.id] = e.currentTarget.scrollTop)}
      >
        {error ? (
          <div className="error-state">
            <AlertCircle size={20} />
            <strong>Document could not be loaded</strong>
            <p>Check the local preview server and reopen this source.</p>
          </div>
        ) : text ? (
          <article className="document-content">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  const resource = resources.find(
                    (r) => encodeURI(r.file) === href || r.file === href,
                  );
                  const target = resource
                    ? `/resources/${encodeURIComponent(resource.file)}`
                    : href?.startsWith('http') || href?.startsWith('#')
                      ? href
                      : `https://github.com/Triple-dylan/sandbox-workstation/blob/main/${href || ''}`;
                  return (
                    <a
                      href={target}
                      target={resource ? undefined : '_blank'}
                      rel="noreferrer"
                      onClick={(e) => {
                        if (resource && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          w.openResource(resource.id);
                        }
                      }}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {text}
            </Markdown>
          </article>
        ) : (
          <div className="loading-state">Loading source…</div>
        )}
      </div>
      <div className="document-footer">
        <span className="status-dot" />
        Repository source snapshot · read only <span>Identity: {r.id}</span>
      </div>
    </div>
  );
}
function Explorer() {
  const w = useContext(Workspace);
  const [query, setQuery] = useState('');
  const folder =
    w.subject === 'research-folder' ? 'research' : w.subject === 'direction' ? 'direction' : null;
  return (
    <div className="explorer">
      <div className="explorer-breadcrumb">
        <button onClick={() => w.setSubject('root')}>Workstation</button>
        <ChevronRight size={13} />
        <span>{folder ? 'Research' : 'Resources'}</span>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          placeholder="Find a source"
          aria-label="Find a source"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="resource-list">
        {resources
          .filter(
            (r) =>
              (!folder || r.folder === folder) &&
              `${r.title} ${r.summary}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((r) => (
            <button type="button" key={r.id} onClick={() => w.openResource(r.id)}>
              <FileText size={22} strokeWidth={1.3} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.summary}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
      </div>
      <p className="quiet-note">
        Opening a source reuses the document viewer. Your graph and conversation stay open.
      </p>
    </div>
  );
}
function AgentSettings() {
  const w = useContext(Workspace);
  return (
    <div className="settings-content">
      <div className="status-line">
        <span className="status-dot offline" />
        Runtime not connected
      </div>
      <h2>Personal agent preferences</h2>
      <p>These preferences are saved locally. They do not start an agent.</p>
      <fieldset>
        <legend>Before changing private work</legend>
        {[
          ['ask', 'Ask before applying changes'],
          ['autonomous', 'Allow autonomous changes'],
        ].map(([value, label]) => (
          <label className="radio-row" key={value}>
            <input
              type="radio"
              name="autonomy"
              value={value}
              checked={w.autonomy === value}
              onChange={() => w.setAutonomy(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="context-callout">
        <ShieldCheck size={19} />
        <p>
          Shared work follows the project’s approval policy. Personal preferences cannot override
          it.
        </p>
      </div>
      <div className="integration-state">
        <strong>Project agent</strong>
        <p>
          Assignment, routine execution and source-linked context maintenance require the agent
          service. No agent is running in this proof.
        </p>
      </div>
    </div>
  );
}
function BrowserProof() {
  return (
    <div className="browser-proof">
      <div className="browser-address">
        <Lock size={14} />
        <span>Personal browser session</span>
      </div>
      <div className="integration-state">
        <Globe size={29} strokeWidth={1.2} />
        <h2>Browser session not connected</h2>
        <p>
          Interactive browsing needs an isolated browser service. An arbitrary iframe cannot provide
          authenticated browsing safely.
        </p>
        <p>This independent pane can be snapped and resized. It is not a working browser.</p>
        <a
          href="https://docs.browserless.io/baas/monitor-sessions/embedding-live-url"
          target="_blank"
          rel="noreferrer"
        >
          Session feasibility reference <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

function WidthDivider({
  label,
  value,
  min,
  max,
  setValue,
  reverse = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  setValue: (v: number) => void;
  reverse?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div
      className="width-divider"
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setValue(clamp(value + (e.key === 'ArrowLeft' ? -16 : 16) * (reverse ? -1 : 1)));
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setValue(min);
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const start = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const element = e.currentTarget;
        const move = (event: PointerEvent) =>
          setValue(clamp(value + (event.clientX - start) * (reverse ? -1 : 1)));
        const end = () => {
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerup', end);
          element.removeEventListener('pointercancel', end);
        };
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', end);
        element.addEventListener('pointercancel', end);
      }}
    />
  );
}
function UtilityColumn({
  utilities,
  width,
  goals,
  setGoals,
  onClose,
}: {
  utilities: Utility[];
  width: number;
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  onClose: (id: Utility) => void;
}) {
  const host = useRef<HTMLElement>(null);
  const [weights, setWeights] = useState<Record<Utility, number>>({
    sources: 1.03,
    agent: 0.78,
    goals: 1.05,
  });
  const [collapsed, setCollapsed] = useState<Utility[]>([]);
  const resize = (index: number, delta: number) => {
    if (!host.current) return;
    const [a, b] = [utilities[index], utilities[index + 1]],
      children = host.current.querySelectorAll<HTMLElement>('.utility');
    const ah = children[index].getBoundingClientRect().height,
      bh = children[index + 1].getBoundingClientRect().height,
      total = ah + bh,
      next = Math.max(130, Math.min(total - 130, ah + delta)),
      sum = weights[a] + weights[b];
    setWeights((v) => ({ ...v, [a]: (sum * next) / total, [b]: (sum * (total - next)) / total }));
  };
  const row = (u: Utility) => (collapsed.includes(u) ? '44px' : `minmax(130px,${weights[u]}fr)`);
  return (
    <aside
      ref={host}
      className="utilities"
      style={{
        width,
        flexBasis: width,
        gridTemplateRows: utilities
          .flatMap((u, i) => (i < utilities.length - 1 ? [row(u), '10px'] : [row(u)]))
          .join(' '),
      }}
      aria-label="Project utilities"
    >
      {utilities.map((u, index) => (
        <React.Fragment key={u}>
          <UtilityModule
            kind={u}
            collapsed={collapsed.includes(u)}
            toggleCollapsed={() =>
              setCollapsed((v) => (v.includes(u) ? v.filter((x) => x !== u) : [...v, u]))
            }
            goals={goals}
            setGoals={setGoals}
            onClose={() => onClose(u)}
          />
          {index < utilities.length - 1 && (
            <div
              className="utility-divider"
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label={`Resize ${u} and ${utilities[index + 1]}`}
              aria-valuemin={0}
              aria-valuenow={Math.round(
                host.current?.querySelectorAll('.utility')[index]?.getBoundingClientRect().height ||
                  130,
              )}
              aria-valuemax={Math.round(host.current?.clientHeight || 1000)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!collapsed.includes(u) && !collapsed.includes(utilities[index + 1]))
                    resize(index, e.key === 'ArrowUp' ? -16 : 16);
                }
              }}
              onPointerDown={(e) => {
                if (collapsed.includes(u) || collapsed.includes(utilities[index + 1])) return;
                e.preventDefault();
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                let last = e.clientY;
                const move = (event: PointerEvent) => {
                  resize(index, event.clientY - last);
                  last = event.clientY;
                };
                const end = () => {
                  el.removeEventListener('pointermove', move);
                  el.removeEventListener('pointerup', end);
                  el.removeEventListener('pointercancel', end);
                };
                el.addEventListener('pointermove', move);
                el.addEventListener('pointerup', end);
                el.addEventListener('pointercancel', end);
              }}
            />
          )}
        </React.Fragment>
      ))}
    </aside>
  );
}
function UtilityModule({
  kind,
  collapsed,
  toggleCollapsed,
  goals,
  setGoals,
  onClose,
}: {
  kind: Utility;
  collapsed: boolean;
  toggleCollapsed: () => void;
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  onClose: () => void;
}) {
  const w = useContext(Workspace),
    [adding, setAdding] = useState(false);
  const Icon = kind === 'sources' ? BookOpen : kind === 'agent' ? Workflow : Target;
  return (
    <section
      className={`utility glass utility-${kind} ${collapsed ? 'collapsed' : ''}`}
      aria-label={
        kind === 'sources' ? 'Sources and context' : kind === 'agent' ? 'Project agent' : 'Goals'
      }
    >
      <header className="utility-header">
        <Icon size={16} />
        <strong>
          {kind === 'sources' ? 'Sources & context' : kind === 'agent' ? 'Project agent' : 'Goals'}
        </strong>
        <IconButton
          icon={collapsed ? ChevronDown : ChevronUp}
          label={`${collapsed ? 'Expand' : 'Collapse'} ${kind}`}
          onClick={toggleCollapsed}
        />
        <IconButton icon={X} label={`Hide ${kind}`} onClick={onClose} />
      </header>
      {!collapsed && (
        <div className="utility-body">
          {kind === 'sources' ? (
            <>
              <div className="utility-context">
                <span className="project-mark" />
                <strong>Workstation</strong>
                <span>Project</span>
              </div>
              <div className="source-rows">
                {resources.map((r) => (
                  <button type="button" key={r.id} onClick={() => w.openResource(r.id)}>
                    <FileText size={15} />
                    <span>{r.title}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              <div className="utility-note">
                <Link size={13} />
                <span>Repository snapshots · {resources.length} sources</span>
              </div>
            </>
          ) : kind === 'agent' ? (
            <>
              <div className="agent-identity">
                <div className="agent-symbol">
                  <Workflow size={21} strokeWidth={1.4} />
                </div>
                <div>
                  <strong>Project agent</strong>
                  <span>
                    <span className="status-dot offline" />
                    Not connected
                  </span>
                </div>
                <IconButton
                  icon={Settings2}
                  label="Open agent settings"
                  onClick={() => w.open('agent-settings')}
                />
              </div>
              <p>
                Context maintenance and shared approvals become available when a runtime is
                connected.
              </p>
              <button className="text-button" onClick={() => w.open('agent-settings')}>
                Preferences <ArrowUpRight size={13} />
              </button>
            </>
          ) : (
            <>
              <div className="goal-list">
                {goals.map((g) => (
                  <div className={`goal ${g.done ? 'done' : ''}`} key={g.id}>
                    <button
                      aria-label={`${g.done ? 'Reopen' : 'Complete'} ${g.title}`}
                      className="goal-check"
                      onClick={() =>
                        setGoals((v) => v.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)))
                      }
                    >
                      {g.done && <Check size={13} />}
                    </button>
                    <div>
                      <span>{g.title}</span>
                      <label className="goal-date">
                        <Calendar size={12} />
                        <input
                          type="date"
                          aria-label={`Due date for ${g.title}`}
                          value={g.due}
                          onChange={(e) =>
                            setGoals((v) =>
                              v.map((x) => (x.id === g.id ? { ...x, due: e.target.value } : x)),
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {adding ? (
                <form
                  className="new-goal"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = String(new FormData(e.currentTarget).get('title') || '').trim();
                    if (title) {
                      setGoals((v) => [
                        ...v,
                        { id: crypto.randomUUID(), title, done: false, due: '' },
                      ]);
                      setAdding(false);
                    }
                  }}
                >
                  <input name="title" aria-label="New goal" placeholder="Goal" autoFocus required />
                  <button className="icon-button" aria-label="Save goal">
                    <Check size={16} />
                  </button>
                  <IconButton icon={X} label="Cancel goal" onClick={() => setAdding(false)} />
                </form>
              ) : (
                <button className="text-button" onClick={() => setAdding(true)}>
                  <Plus size={14} />
                  Add goal
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Materials() {
  const [theme, setTheme] = useState<Theme>('system');
  useTheme(theme);
  return (
    <main className="materials">
      <header>
        <span>Stage A · component and material proof</span>
        <h1>Space to work. Structure that holds.</h1>
        <p>Glass defines the shell. Content stays crisp. Controls explain the action.</p>
        <div className="theme-options">
          {(['system', 'light', 'dark'] as Theme[]).map((t, i) => (
            <IconButton
              key={t}
              icon={[Monitor, Sun, Moon][i]}
              label={t}
              active={theme === t}
              onClick={() => setTheme(t)}
            />
          ))}
        </div>
        <a href="/">
          Open layout proof <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="material-grid">
        <section className="material-specimen glass">
          <div className="utility-header">
            <BookOpen size={17} />
            <strong>Sources & context</strong>
            <IconButton icon={Ellipsis} label="Source options" />
          </div>
          <div className="source-rows">
            {resources.map((r) => (
              <div key={r.id}>
                <FileText size={16} />
                <span>{r.title}</span>
                <ArrowUpRight size={13} />
              </div>
            ))}
          </div>
          <div className="utility-note">Source references retain canonical identity.</div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <Workflow size={17} />
            <strong>Project agent</strong>
          </div>
          <div className="material-statuses">
            <p>
              <span className="status-dot" />
              Ready
            </p>
            <p>
              <span className="status-dot warning" />
              Awaiting approval
            </p>
            <p>
              <span className="status-dot offline" />
              Disconnected
            </p>
            <div className="context-callout">
              <ShieldCheck size={20} />
              <p>Apply proposed changes to the shared document?</p>
            </div>
            <div className="button-row">
              <button className="primary">Review changes</button>
              <button className="secondary">Reject</button>
            </div>
          </div>
        </section>
        <section className="material-specimen reading">
          <div className="utility-header">
            <FileText size={17} />
            <strong>Document surface</strong>
          </div>
          <article className="document-content">
            <span className="eyebrow">Reading surface</span>
            <h2>Context should travel with the work.</h2>
            <p>
              People decide what is private and shared. Agents maintain useful orientation,
              references and history as work happens.
            </p>
            <blockquote>Legibility comes before translucency.</blockquote>
            <a href="/resources/Rebuild%20Plan.md">Read the approved plan</a>
          </article>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <MessageSquare size={17} />
            <strong>Conversation</strong>
          </div>
          <MessageItem message={initialConversations[0].messages[1]} />
          <div className="sample-composer">
            <textarea aria-label="Example composer" placeholder="Message…" />
            <div>
              <IconButton icon={Plus} label="Attach context" />
              <button className="send-button" aria-label="Send example">
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <Network size={17} />
            <strong>Node grammar</strong>
          </div>
          <div className="grammar">
            <span className="grammar-hub" />
            <div>
              <strong>Project</strong>
              <small>Anchored subject, spring return</small>
            </div>
            <FolderOpen size={25} />
            <div>
              <strong>Folder</strong>
              <small>Contained branch, opens explorer</small>
            </div>
            <FileText size={24} />
            <div>
              <strong>Document</strong>
              <small>Canonical file, reuses viewer</small>
            </div>
          </div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <AlertCircle size={17} />
            <strong>Recovery and focus</strong>
          </div>
          <div className="material-statuses">
            <div className="error-state">
              <strong>Connection interrupted</strong>
              <p>Your draft is safe. Reconnect to resume delivery.</p>
              <button className="secondary">Reconnect</button>
            </div>
            <p>Keyboard focus</p>
            <button className="secondary focus-example">
              Open document <ArrowUpRight size={15} />
            </button>
            <p className="quiet-note">
              Reduced motion and reduced transparency follow system preferences.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  location.pathname === '/materials' ? <Materials /> : <App />,
);
