import React, {
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  MessagesSquare,
  Network,
  PanelsTopLeft,
  FolderOpen,
  FileText,
  Search,
  Lock,
  UserRound,
  Layers,
  Globe,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Calendar,
  Target,
  Sun,
  Moon,
  Monitor,
  Info,
  SlidersHorizontal,
  Workflow,
  BookOpen,
  PanelLeftClose,
  Pin,
} from 'lucide-react';
import {
  IconButton,
  useTheme,
  Workspace,
  DocumentView,
  BrowserProof,
  Materials,
  WidthDivider,
} from './components';
import { Graph } from './Graph';
import { ConversationView } from './Conversation';
import { Composer } from './Composer';
import { WorkActions, type WorkCommand } from './WorkActions';
import { AgentEditor } from './AgentEditor';
import { newAgent } from './agents';
import { resources as repositoryResources, storageKey, type Utility, type Goal } from './model';
import { loadState, type State, type LeftMode } from './state';
import {
  initialObject,
  fits,
  snapped,
  pairSnap,
  minimum,
  type CanvasObject,
  type Bounds,
  type Tool,
} from './canvas-layout';
import '@fontsource-variable/dm-sans/index.css';
import './style.css';
import './workspace.css';

const toolNames: Record<Tool, string> = {
  document: 'Document',
  browser: 'Browser',
  'agent-settings': 'Agent builder',
};
const toolIcons = { document: FileText, browser: Globe, 'agent-settings': SlidersHorizontal };
function App() {
  const [s, setState] = useState<State>(loadState);
  const patch = useCallback(
    (value: Partial<State>) => setState((old) => ({ ...old, ...value })),
    [],
  );
  const [notice, setNotice] = useState('');
  const resources = useMemo(
    () => [...repositoryResources, ...s.localResources],
    [s.localResources],
  );
  const reply = s.threadByConversation[s.selected] || null;
  const setReply = (id: string | null) =>
    setState((old) => ({
      ...old,
      threadByConversation: { ...old.threadByConversation, [old.selected]: id || '' },
    }));
  const [account, setAccount] = useState(false),
    [picker, setPicker] = useState(false);
  const [search, setSearch] = useState(''),
    [focus, setFocus] = useState<Tool | null>(null);
  const [utilityCollapsed, setUtilityCollapsed] = useState<Utility[]>([]);
  const [preview, setPreview] = useState<{ objects: CanvasObject[]; valid: boolean } | null>(null);
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 });
  const stage = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    recovery = useRef<CanvasObject[] | null>(null);
  const [readerWidth, setReaderWidth] = useState(400);
  const utilitiesHost = useRef<HTMLElement>(null);
  const [graphExclusion, setGraphExclusion] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const lastUtilityHeight = useRef(540);
  const reserved: CanvasObject[] =
    !s.inspector && s.utilities.length && graphExclusion
      ? [{ id: 'reserved-tools' as Tool, ...graphExclusion }]
      : [];
  const blockers = [...s.objects, ...reserved];
  useLayoutEffect(() => {
    if (s.inspector || !utilitiesHost.current) {
      setGraphExclusion(null);
      return;
    }
    const measure = () => {
      const a = stage.current?.getBoundingClientRect(),
        b = utilitiesHost.current?.getBoundingClientRect();
      if (b) lastUtilityHeight.current = b.height;
      if (a && b)
        setGraphExclusion((old) =>
          old && old.x === b.x - a.x && old.y === b.y - a.y && old.height === b.height
            ? old
            : { x: b.x - a.x, y: b.y - a.y, width: b.width, height: b.height },
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(utilitiesHost.current);
    if (stage.current) observer.observe(stage.current);
    measure();
    return () => observer.disconnect();
  }, [s.surface, s.inspector, s.utilities, utilityCollapsed]);
  const current = s.conversations.find((c) => c.id === s.selected) || s.conversations[0];
  const draftKey = reply ? `${s.selected}::${reply}` : s.selected;
  useTheme(s.theme);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      setNotice('Local storage is full. These changes have not been saved.');
    }
  }, [s]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.isComposing) {
        e.preventDefault();
        setPicker((v) => !v);
      }
      if (e.key === 'Escape') {
        setAccount(false);
        setPicker(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const roomFor = (left: LeftMode, inspection: boolean) =>
    window.innerWidth -
      (left === 'closed' ? 0 : left === 'chat' ? 360 : 260) -
      (inspection ? readerWidth : s.utilities.length ? 260 : 0) -
      100 >=
    320;
  const revealLeft = (left: LeftMode) => {
    if (left !== 'closed' && !roomFor(left, !!s.inspector) && s.inspector) {
      patch({ left, inspector: null });
      setNotice(
        'Reader closed to keep the conversation and working surface usable at this width. Its reading position is retained.',
      );
    } else patch({ left });
  };
  const inspect = (id: string, kind: 'document' | 'folder' = 'document', from?: string) => {
    const changes: Partial<State> = {
      inspector: kind === 'document' ? { kind, id, from } : { kind, id },
    };
    if (kind === 'document') {
      changes.document = id;
      changes.objects = s.objects.filter((o) => o.id !== 'document');
      if (focus === 'document') setFocus(null);
    }
    if (!roomFor(s.left, true) && s.left !== 'closed') {
      changes.left = 'closed';
      setNotice(
        'Conversation navigation hidden to keep the graph and reader usable. Your draft is retained.',
      );
    }
    patch(changes);
  };
  useEffect(() => {
    const measured = stage.current?.getBoundingClientRect();
    if (measured && Math.abs(measured.width - bounds.width) > 1) return;
    if (!s.inspector && s.utilities.length && bounds.width && bounds.width < 650) {
      if (s.left !== 'closed') patch({ left: 'closed' });
      else patch({ utilities: [] });
      setNotice('Navigation or tools hidden to keep the working surface usable at this width.');
      return;
    }
    if (bounds.width && bounds.width < 310 && s.left !== 'closed') {
      patch({ left: 'closed' });
      setNotice('Conversation navigation hidden to keep the working surface readable.');
      return;
    }
    if (bounds.width && bounds.width < 310 && s.inspector && readerWidth > 340) {
      setReaderWidth(340);
      return;
    }
    if (bounds.width && bounds.width < 300 && (s.inspector || s.utilities.length)) {
      patch({ inspector: null, utilities: [] });
      setNotice(
        'Supporting tools hidden to keep the working surface readable. Reopen them from the rail.',
      );
      return;
    }
    if (s.surface !== 'canvas' || !bounds.width || !s.objects.length) return;
    if (
      recovery.current &&
      recovery.current.every((o) => fits(o, bounds, [...recovery.current!, ...reserved]))
    ) {
      patch({ objects: recovery.current });
      recovery.current = null;
      setFocus(null);
      return;
    }
    if (!s.objects.every((o) => fits(o, bounds, blockers)) && !focus) {
      recovery.current = s.objects;
      setFocus(s.objects.at(-1)!.id);
      setNotice(
        'This arrangement needs more room. The selected tool is focused; the other tools and their positions are retained.',
      );
    }
  }, [
    bounds.width,
    bounds.height,
    s.surface,
    s.left,
    s.inspector,
    s.utilities.length,
    s.objects,
    focus,
    readerWidth,
    graphExclusion,
    patch,
  ]);
  const navigate = (surface: 'canvas' | 'graph') => {
    patch({ surface, ...(surface === 'graph' ? { graphSubject: 'root' } : {}) });
    setPicker(false);
  };
  const select = (id: string) => {
    patch({ selected: id });
    revealLeft('chat');
  };
  const newChat = () => {
    const empty = s.conversations.find(
      (c) =>
        c.kind === 'private' &&
        c.title === 'New chat' &&
        !c.messages.length &&
        !s.drafts[c.id]?.trim() &&
        !s.attachments[c.id]?.length,
    );
    const id = empty?.id || crypto.randomUUID();
    setState((old) => ({
      ...old,
      selected: id,
      conversations: empty
        ? old.conversations
        : [...old.conversations, { id, title: 'New chat', kind: 'private', messages: [] }],
      left: 'chat',
      ...(!roomFor('chat', !!s.inspector) ? { inspector: null } : {}),
    }));
    setTimeout(() => composer.current?.focus(), 0);
  };
  const send = () => {
    const text = (s.drafts[draftKey] || '').trim();
    if (!text) return;
    if (
      current.kind !== 'private' &&
      (s.attachments[draftKey] || []).some(
        (id) => resources.find((r) => r.id === id)?.folder === 'private',
      )
    ) {
      setNotice(
        'Share private documents before attaching them to a channel or direct message. Your draft is retained.',
      );
      return;
    }
    setState((old) => ({
      ...old,
      conversations: old.conversations.map((c) =>
        c.id === old.selected
          ? {
              ...c,
              title: c.title === 'New chat' ? text.slice(0, 36) : c.title,
              messages: [
                ...c.messages,
                {
                  id: crypto.randomUUID(),
                  text,
                  author: 'You',
                  createdAt: new Date().toISOString(),
                  delivery: 'local' as const,
                  at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  ...(reply ? { replyTo: reply } : {}),
                  sources: old.attachments[draftKey] || [],
                },
              ],
            }
          : c,
      ),
      drafts: { ...old.drafts, [draftKey]: '' },
      attachments: { ...old.attachments, [draftKey]: [] },
      left: 'chat',
      ...(!roomFor('chat', !!s.inspector) ? { inspector: null } : {}),
    }));
    setNotice('Saved on this browser. Delivery is not connected.');
  };
  const openTool = (id: Tool) => {
    if (s.objects.some((o) => o.id === id)) {
      patch({ surface: 'canvas' });
      setFocus(null);
      setPicker(false);
      return;
    }
    const object = initialObject(id, bounds, blockers);
    if (!object) {
      setNotice(
        'There is not enough open canvas space for this tool. Close or move an existing tool; your current work has been retained.',
      );
      return;
    }
    patch({
      surface: 'canvas',
      objects: [...s.objects, object],
      ...(id === 'document' ? { inspector: null } : {}),
    });
    setFocus(null);
    setPicker(false);
  };
  const placeDocument = () => {
    // Closing the inspection releases its width; use the resulting canvas bounds.
    const expanded = {
      width: bounds.width + readerWidth + 12,
      height: bounds.height,
    };
    const object = initialObject('document', expanded, [
      ...s.objects.filter((o) => o.id !== 'document'),
      ...(s.utilities.length
        ? [
            {
              id: 'reserved-tools' as Tool,
              x: expanded.width - 260,
              y: 0,
              width: 260,
              height: lastUtilityHeight.current,
            },
          ]
        : []),
    ]);
    if (!object) {
      setNotice('Make room on the canvas before placing this document. The reader is still open.');
      return;
    }
    patch({
      surface: 'canvas',
      inspector: null,
      objects: [...s.objects.filter((o) => o.id !== 'document'), object],
    });
    setFocus(null);
  };
  const closeTool = (id: Tool) => {
    patch({ objects: s.objects.filter((o) => o.id !== id) });
    if (focus === id) setFocus(null);
    recovery.current = null;
  };
  const beginGesture = (event: React.PointerEvent, item: CanvasObject, resize = false) => {
    if (!resize && (event.target as HTMLElement).closest('button,summary')) return;
    if (focus) return;
    event.preventDefault();
    const rect = stage.current!.getBoundingClientRect(),
      start = { x: event.clientX, y: event.clientY };
    let candidate: CanvasObject[] | null = null,
      valid = false,
      moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      moved = true;
      const single = resize
        ? {
            ...item,
            width: Math.max(
              minimum.width,
              Math.min(
                bounds.width - item.x,
                Math.round((item.width + e.clientX - start.x) / 16) * 16,
              ),
            ),
            height: Math.max(
              minimum.height,
              Math.min(
                bounds.height - item.y,
                Math.round((item.height + e.clientY - start.y) / 16) * 16,
              ),
            ),
          }
        : snapped(item, item.x + e.clientX - start.x, item.y + e.clientY - start.y, bounds);
      candidate = [single];
      valid = fits(single, bounds, blockers);
      if (!resize) {
        for (const target of s.objects.filter((o) => o.id !== item.id)) {
          const pairing = pairSnap(
            item,
            target,
            e.clientX - rect.x,
            e.clientY - rect.y,
            bounds,
            blockers,
          );
          if (pairing) {
            candidate = pairing;
            valid = true;
            break;
          }
        }
      }
      setPreview({ objects: candidate, valid });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      setPreview(null);
    };
    const end = () => {
      if (valid && candidate) {
        const updates = candidate;
        patch({ objects: s.objects.map((o) => updates.find((v) => v.id === o.id) || o) });
      }
      cleanup();
    };
    const cancel = () => cleanup();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cleanup();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
  };
  const openAgent = () => {
    if (s.surface === 'graph')
      patch({
        inspector: { kind: 'agent-settings', id: 'agent' },
        ...(!roomFor(s.left, true) ? { left: 'closed' as const } : {}),
      });
    else openTool('agent-settings');
  };
  const runCommand = (id: WorkCommand) => {
    if (id === 'new-document') {
      const resource = {
        id: crypto.randomUUID(),
        title: 'Untitled document',
        file: 'Untitled document.md',
        summary: 'Private local document',
        folder: 'private' as const,
        body: '',
        updatedAt: new Date().toISOString(),
      };
      setState((old) => ({ ...old, localResources: [...old.localResources, resource] }));
      inspect(resource.id);
    } else if (id === 'new-agent') {
      const a = newAgent();
      setState((old) => ({ ...old, agents: [...old.agents, a], selectedAgent: a.id }));
      openAgent();
    } else if (id === 'browser-connection') {
      openTool('browser');
    } else if (id === 'edit-agent') {
      patch({
        selectedAgent: s.agents.find((a) => a.id === 'project-agent')?.id || s.selectedAgent,
      });
      openAgent();
    } else if (id === 'save-layout') {
      patch({ preset: s.objects.map((o) => ({ ...o })) });
      setNotice('Canvas arrangement saved locally.');
    } else if (s.preset) {
      patch({ surface: 'canvas', objects: s.preset });
      recovery.current = null;
      setFocus(null);
    }
  };
  const context = {
    resources,
    updateResource: (id: string, body: string, title?: string) =>
      setState((old) => ({
        ...old,
        localResources: old.localResources.map((r) =>
          r.id === id
            ? {
                ...r,
                body,
                ...(title !== undefined
                  ? { title, file: `${title || 'Untitled document'}.md` }
                  : {}),
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      })),
    agents: s.agents,
    selectedAgent: s.selectedAgent,
    selectAgent: (id: string) => patch({ selectedAgent: id }),
    updateAgents: (agents: State['agents']) => patch({ agents }),
    selected: s.selected,
    conversations: s.conversations,
    reply,
    setReply,
    doc: s.document,
    openResource: (id: string) =>
      inspect(id, 'document', s.inspector?.kind === 'folder' ? s.inspector.id : undefined),
    subject: s.graphSubject,
    setSubject: (id: string) => patch({ graphSubject: id }),
    autonomy: s.autonomy,
    setAutonomy: (autonomy: string) => patch({ autonomy }),
  };
  return (
    <Workspace.Provider value={context}>
      <div className="app-shell revised-shell">
        <nav className="rail glass" aria-label="Workspace navigation">
          <div className="rail-top">
            <IconButton
              icon={PanelsTopLeft}
              label="Canvas"
              active={s.surface === 'canvas'}
              onClick={() => navigate('canvas')}
            />
            <IconButton
              icon={Network}
              label="Graph"
              active={s.surface === 'graph'}
              onClick={() => navigate('graph')}
            />
            <div className="rail-rule" />
            <IconButton
              icon={MessagesSquare}
              label="Conversations"
              active={s.left === 'list' || s.left === 'chat'}
              onClick={() => revealLeft(s.left === 'list' || s.left === 'chat' ? 'closed' : 'list')}
            />
            <IconButton
              icon={FolderOpen}
              label="Files"
              active={s.left === 'files'}
              onClick={() => revealLeft(s.left === 'files' ? 'closed' : 'files')}
            />
            <IconButton icon={Plus} label="New private chat" onClick={newChat} />
          </div>
          <div className="rail-bottom">
            <IconButton
              icon={Layers}
              label="Project tools"
              active={s.utilities.length > 0 && !s.inspector}
              onClick={() =>
                patch({
                  inspector: null,
                  utilities:
                    s.utilities.length && !s.inspector ? [] : ['sources', 'agent', 'goals'],
                })
              }
            />
            <div className="account-anchor">
              <button
                className="account-button"
                aria-label="Account and appearance"
                title="Account and appearance"
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
                    {(['system', 'light', 'dark'] as const).map((theme, i) => (
                      <IconButton
                        key={theme}
                        icon={[Monitor, Sun, Moon][i]}
                        label={theme[0].toUpperCase() + theme.slice(1)}
                        active={s.theme === theme}
                        onClick={() => patch({ theme })}
                      />
                    ))}
                  </div>
                  <label className="send-preference">
                    Send message with
                    <select
                      aria-label="Send shortcut"
                      value={s.sendShortcut}
                      onChange={(e) =>
                        patch({ sendShortcut: e.target.value as State['sendShortcut'] })
                      }
                    >
                      <option value="enter">Enter</option>
                      <option value="modifier">⌘ / Ctrl + Enter</option>
                    </select>
                  </label>
                  <a href="/materials" target="_blank" rel="noreferrer">
                    Component proof <ArrowUpRight size={14} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </nav>
        {s.left !== 'closed' && (
          <aside
            className={`left-extension glass left-${s.left}`}
            aria-label={
              s.left === 'chat'
                ? 'Conversation history'
                : s.left === 'files'
                  ? 'Resource navigation'
                  : 'Conversation navigation'
            }
          >
            <div className="extension-header">
              {s.left === 'chat' && (
                <IconButton
                  icon={ArrowLeft}
                  label="Back to conversations"
                  onClick={() => patch({ left: 'list' })}
                />
              )}
              <strong>
                {s.left === 'chat'
                  ? current.kind === 'channel'
                    ? `# ${current.title}`
                    : current.title
                  : s.left === 'people'
                    ? 'New message'
                    : s.left === 'files'
                      ? 'Files'
                      : 'Conversations'}
              </strong>
              {s.left === 'list' && (
                <IconButton icon={Plus} label="New private chat" onClick={newChat} />
              )}
              <IconButton
                icon={PanelLeftClose}
                label="Hide left navigation"
                onClick={() => patch({ left: 'closed' })}
              />
            </div>
            {s.left === 'chat' ? (
              <ConversationView />
            ) : s.left === 'files' ? (
              <div className="navigation-content">
                <ResourceRows onOpen={(id) => inspect(id)} />
              </div>
            ) : s.left === 'people' ? (
              <div className="contact-picker">
                <button className="text-button" onClick={() => revealLeft('list')}>
                  <ArrowLeft size={14} />
                  Conversations
                </button>
                <h3>Find a person</h3>
                <p>
                  No workspace identity is connected. People search and direct-message delivery
                  become available when accounts are connected.
                </p>
                <small>
                  Your existing local DM drafts are retained. Entering a name alone cannot establish
                  a recipient’s identity or access.
                </small>
              </div>
            ) : (
              <>
                <label className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Find a conversation"
                    placeholder="Find a conversation"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="conversation-groups">
                  <div className="section-label">
                    <Lock size={13} />
                    Personal
                    <button
                      aria-label="Start a direct message"
                      onClick={() => revealLeft('people')}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  {s.conversations
                    .filter(
                      (c) =>
                        c.kind !== 'channel' &&
                        c.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        className={`conversation-row ${c.id === s.selected ? 'selected' : ''}`}
                        key={c.id}
                        aria-label={c.title}
                        onClick={() => select(c.id)}
                      >
                        {c.kind === 'dm' ? <UserRound size={15} /> : <Lock size={14} />}
                        <span>{c.title}</span>
                        {!!s.drafts[c.id] && <small className="draft-label">Draft</small>}
                      </button>
                    ))}
                  <div className="project-label">
                    <span className="project-mark" />
                    <div>
                      <strong>Workstation</strong>
                      <small>Recorded project discussion</small>
                    </div>
                  </div>
                  {s.conversations
                    .filter(
                      (c) =>
                        c.kind === 'channel' &&
                        c.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        className={`conversation-row ${c.id === s.selected ? 'selected' : ''}`}
                        key={c.id}
                        aria-label={`# ${c.title}`}
                        onClick={() => select(c.id)}
                      >
                        <span className="hash">#</span>
                        <span>{c.title}</span>
                      </button>
                    ))}
                </div>
                <div className="list-footer">
                  <ShieldCheck size={13} />
                  Local records · no live participants
                </div>
              </>
            )}
          </aside>
        )}
        <div className="workspace-main">
          <div className="surface-row">
            <main
              ref={stage}
              className={`primary-surface surface-${s.surface}`}
              data-surface={s.surface}
              aria-label={s.surface === 'graph' ? 'Graph canvas' : 'Working canvas'}
              onContextMenu={(e) => {
                if (
                  s.surface === 'canvas' &&
                  !(e.target as HTMLElement).closest('.canvas-object')
                ) {
                  e.preventDefault();
                  setPicker(true);
                }
              }}
            >
              {s.surface === 'graph' ? (
                <Graph
                  resources={resources}
                  subject={s.graphSubject}
                  exclusion={graphExclusion}
                  setSubject={(id) => patch({ graphSubject: id })}
                  onResource={(id) => inspect(id)}
                  onFolder={(id) => inspect(id, 'folder')}
                  expanded={s.graphExpanded}
                  setExpanded={(graphExpanded) => patch({ graphExpanded })}
                />
              ) : (
                <>
                  {s.objects
                    .filter((o) => !focus || o.id === focus)
                    .map((object) => {
                      const Icon = toolIcons[object.id],
                        title =
                          object.id === 'document'
                            ? resources.find((r) => r.id === s.document)!.title
                            : toolNames[object.id];
                      return (
                        <section
                          key={object.id}
                          className={`canvas-object ${focus === object.id ? 'object-focused' : ''}`}
                          data-object={object.id}
                          aria-label={title}
                          style={
                            focus === object.id
                              ? {
                                  left: 0,
                                  top: 0,
                                  width:
                                    !s.inspector && s.utilities.length
                                      ? 'calc(100% - 272px)'
                                      : '100%',
                                  height: '100%',
                                }
                              : {
                                  left: object.x,
                                  top: object.y,
                                  width: object.width,
                                  height: object.height,
                                }
                          }
                        >
                          <header
                            className="object-header"
                            tabIndex={0}
                            aria-label={`Move ${toolNames[object.id].toLowerCase()}`}
                            onPointerDown={(e) => beginGesture(e, object)}
                            onKeyDown={(e) => {
                              if ((e.target as HTMLElement).closest('button')) return;
                              const delta = {
                                ArrowLeft: [-16, 0],
                                ArrowRight: [16, 0],
                                ArrowUp: [0, -16],
                                ArrowDown: [0, 16],
                              }[e.key];
                              if (delta && !focus) {
                                e.preventDefault();
                                const next = snapped(
                                  object,
                                  object.x + delta[0],
                                  object.y + delta[1],
                                  bounds,
                                );
                                if (fits(next, bounds, blockers))
                                  patch({
                                    objects: s.objects.map((o) => (o.id === next.id ? next : o)),
                                  });
                              }
                            }}
                          >
                            <Icon size={17} />
                            <strong>{title}</strong>
                            <IconButton
                              icon={focus ? Minimize2 : Maximize2}
                              label={
                                focus
                                  ? 'Restore canvas arrangement'
                                  : `Focus ${toolNames[object.id].toLowerCase()}`
                              }
                              onClick={() => {
                                if (focus) {
                                  if (s.objects.every((o) => fits(o, bounds, blockers)))
                                    setFocus(null);
                                  else
                                    setNotice('Make more room before restoring all canvas tools.');
                                } else setFocus(object.id);
                              }}
                            />
                            <IconButton
                              icon={X}
                              label={`Close ${toolNames[object.id].toLowerCase()}`}
                              onClick={() => closeTool(object.id)}
                            />
                          </header>
                          <div className="object-body">
                            {object.id === 'document' ? (
                              <DocumentView />
                            ) : object.id === 'browser' ? (
                              <BrowserProof />
                            ) : (
                              <AgentEditor />
                            )}
                          </div>
                          {!focus && (
                            <button
                              className="resize-handle"
                              aria-label={`Resize ${toolNames[object.id].toLowerCase()}`}
                              onPointerDown={(e) => beginGesture(e, object, true)}
                              onKeyDown={(e) => {
                                const delta = {
                                  ArrowLeft: [-16, 0],
                                  ArrowRight: [16, 0],
                                  ArrowUp: [0, -16],
                                  ArrowDown: [0, 16],
                                }[e.key];
                                if (delta) {
                                  e.preventDefault();
                                  const next = {
                                    ...object,
                                    width: object.width + delta[0],
                                    height: object.height + delta[1],
                                  };
                                  if (fits(next, bounds, blockers))
                                    patch({
                                      objects: s.objects.map((o) => (o.id === next.id ? next : o)),
                                    });
                                }
                              }}
                            />
                          )}
                        </section>
                      );
                    })}
                  {preview && (
                    <div className="placement-layer" aria-hidden="true">
                      {preview.objects.map((o) => (
                        <div
                          key={o.id}
                          className={`placement-preview ${preview.valid ? 'valid' : 'invalid'}`}
                          style={{ left: o.x, top: o.y, width: o.width, height: o.height }}
                        >
                          <span>{preview.valid ? 'Snap here' : 'Keep clear of other work'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="work-action-anchor">
                <button
                  className="open-work-button glass"
                  aria-label="Open work"
                  aria-expanded={picker}
                  onClick={() => setPicker((v) => !v)}
                >
                  <FolderOpen size={16} />
                  <span>Open…</span>
                  <kbd>⌘K</kbd>
                </button>
                {picker && (
                  <WorkActions
                    resources={resources}
                    canRestore={!!s.preset}
                    canSave={s.objects.length > 0}
                    onOpen={(id) => inspect(id)}
                    onCommand={runCommand}
                    onClose={() => setPicker(false)}
                  />
                )}
              </div>
            </main>
            {s.inspector ? (
              <>
                <WidthDivider
                  label="Resize inspection"
                  value={readerWidth}
                  min={340}
                  max={560}
                  setValue={setReaderWidth}
                  reverse
                />
                <aside
                  className="inspection-surface"
                  aria-label="Resource inspection"
                  style={{ width: readerWidth, flexBasis: readerWidth }}
                >
                  <header className="inspection-header">
                    {s.inspector.kind === 'document' && s.inspector.from && (
                      <IconButton
                        icon={ArrowLeft}
                        label="Back to folder"
                        onClick={() =>
                          inspect(
                            s.inspector?.kind === 'document' ? s.inspector.from! : 'root',
                            'folder',
                          )
                        }
                      />
                    )}
                    <strong>
                      {s.inspector.kind === 'folder'
                        ? s.inspector.id === 'research-folder'
                          ? 'Research'
                          : s.inspector.id === 'private-folder'
                            ? 'Private documents'
                            : s.inspector.id === 'direction'
                              ? 'Direction'
                              : 'Resources'
                        : s.inspector.kind === 'agent-settings'
                          ? 'Agent builder'
                          : resources.find((r) => r.id === s.document)!.title}
                    </strong>
                    {s.inspector.kind === 'document' && (
                      <IconButton
                        icon={Pin}
                        label="Place document on canvas"
                        onClick={placeDocument}
                      />
                    )}
                    <IconButton
                      icon={X}
                      label="Close inspection"
                      onClick={() => patch({ inspector: null })}
                    />
                  </header>
                  <div className="inspection-body">
                    {s.inspector.kind === 'folder' ? (
                      <ResourceRows
                        folder={s.inspector.id}
                        onOpen={(id) => inspect(id, 'document', s.inspector!.id)}
                      />
                    ) : s.inspector.kind === 'agent-settings' ? (
                      <AgentEditor />
                    ) : (
                      <DocumentView />
                    )}
                  </div>
                </aside>
              </>
            ) : (
              s.utilities.length > 0 && (
                <aside ref={utilitiesHost} className="utility-stack" aria-label="Project utilities">
                  {s.utilities.map((kind) => (
                    <UtilityCard
                      key={kind}
                      kind={kind}
                      goals={s.goals}
                      setGoals={(goals) => patch({ goals })}
                      collapsed={utilityCollapsed.includes(kind)}
                      onCollapse={() =>
                        setUtilityCollapsed((v) =>
                          v.includes(kind) ? v.filter((x) => x !== kind) : [...v, kind],
                        )
                      }
                      onClose={() => patch({ utilities: s.utilities.filter((u) => u !== kind) })}
                      onSource={(id) => inspect(id)}
                      onAgent={() => runCommand('edit-agent')}
                    />
                  ))}
                </aside>
              )
            )}
          </div>
          <Composer
            current={current}
            draft={s.drafts[draftKey] || ''}
            attachments={s.attachments[draftKey] || []}
            resources={resources}
            reply={current.messages.find((m) => m.id === reply)}
            shortcut={s.sendShortcut}
            inputRef={composer}
            onExitReply={() => setReply(null)}
            onChange={(text) => patch({ drafts: { ...s.drafts, [draftKey]: text } })}
            onSend={send}
            onAttach={(id) =>
              patch({
                attachments: {
                  ...s.attachments,
                  [draftKey]: [...new Set([...(s.attachments[draftKey] || []), id])],
                },
              })
            }
            onRemove={(id) =>
              patch({
                attachments: {
                  ...s.attachments,
                  [draftKey]: (s.attachments[draftKey] || []).filter((x) => x !== id),
                },
              })
            }
            onOpen={(id) => inspect(id)}
          />
        </div>
        {notice && (
          <div className="notice glass" role="status">
            <Info size={16} />
            <span>{notice}</span>
            <IconButton icon={X} label="Dismiss notification" onClick={() => setNotice('')} />
          </div>
        )}
      </div>
    </Workspace.Provider>
  );
}
function ResourceRows({ folder, onOpen }: { folder?: string; onOpen: (id: string) => void }) {
  const { resources } = useContext(Workspace);
  const [query, setQuery] = useState('');
  const group =
    folder === 'direction'
      ? 'direction'
      : folder === 'research-folder'
        ? 'research'
        : folder === 'private-folder'
          ? 'private'
          : null;
  return (
    <div className="resource-navigation">
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="Find a source"
          placeholder="Find a source"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="resource-list">
        {resources
          .filter(
            (r) =>
              (!group || r.folder === group) &&
              `${r.title} ${r.summary}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((r) => (
            <button key={r.id} aria-label={r.title} onClick={() => onOpen(r.id)}>
              <FileText size={21} strokeWidth={1.4} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.summary}</small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
      </div>
    </div>
  );
}
function UtilityCard({
  kind,
  goals,
  setGoals,
  collapsed,
  onCollapse,
  onClose,
  onSource,
  onAgent,
}: {
  kind: Utility;
  goals: Goal[];
  setGoals: (value: Goal[]) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onClose: () => void;
  onSource: (id: string) => void;
  onAgent: () => void;
}) {
  const [adding, setAdding] = useState(false),
    [dateFor, setDateFor] = useState<string | null>(null);
  const w = useContext(Workspace);
  const resources = w.resources.filter((r) => r.folder !== 'private');
  const Icon = kind === 'sources' ? BookOpen : kind === 'agent' ? Workflow : Target;
  return (
    <section
      className="utility-card glass"
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
          icon={collapsed ? ChevronRight : ChevronDown}
          label={`${collapsed ? 'Expand' : 'Collapse'} ${kind}`}
          onClick={onCollapse}
        />
        <IconButton icon={X} label={`Hide ${kind}`} onClick={onClose} />
      </header>
      {!collapsed && (
        <div className="utility-card-body">
          {kind === 'sources' ? (
            <>
              <div className="utility-context">
                <span className="project-mark" />
                <strong>Workstation</strong>
              </div>
              <div className="source-rows">
                {resources.map((r) => (
                  <button key={r.id} onClick={() => onSource(r.id)}>
                    <FileText size={15} />
                    <span>{r.title}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            </>
          ) : kind === 'agent' ? (
            <>
              <button className="agent-summary" onClick={onAgent}>
                <Workflow size={17} />
                <span>
                  <strong>
                    {w.agents.find((a) => a.id === 'project-agent')?.draft.name || 'Project agent'}
                  </strong>
                  <small>Local definition · runtime not connected</small>
                </span>
                <ChevronRight size={14} />
              </button>
              <button className="text-button" onClick={onAgent}>
                Edit agent <ArrowUpRight size={12} />
              </button>
            </>
          ) : (
            <>
              <div className="compact-goals">
                {goals.map((goal) => (
                  <div className={`compact-goal ${goal.done ? 'done' : ''}`} key={goal.id}>
                    <button
                      className="goal-check"
                      aria-label={`${goal.done ? 'Reopen' : 'Complete'} ${goal.title}`}
                      onClick={() =>
                        setGoals(goals.map((g) => (g.id === goal.id ? { ...g, done: !g.done } : g)))
                      }
                    >
                      {goal.done && <Check size={12} />}
                    </button>
                    <div className="goal-content">
                      <span>{goal.title}</span>
                      {(goal.due || dateFor === goal.id) && (
                        <label className="goal-date">
                          <Calendar size={12} />
                          <input
                            type="date"
                            autoFocus={dateFor === goal.id}
                            aria-label={`Due date for ${goal.title}`}
                            value={goal.due}
                            onChange={(e) =>
                              setGoals(
                                goals.map((g) =>
                                  g.id === goal.id ? { ...g, due: e.target.value } : g,
                                ),
                              )
                            }
                            onBlur={() => setDateFor(null)}
                          />
                        </label>
                      )}
                    </div>
                    {!goal.due && dateFor !== goal.id && (
                      <button
                        className="add-date"
                        aria-label={`Set due date for ${goal.title}`}
                        title="Set due date"
                        onClick={() => setDateFor(goal.id)}
                      >
                        <Calendar size={13} />
                      </button>
                    )}
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
                      setGoals([
                        ...goals,
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
                  <Plus size={13} />
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
createRoot(document.getElementById('root')!).render(
  location.pathname === '/materials' ? <Materials /> : <App />,
);
