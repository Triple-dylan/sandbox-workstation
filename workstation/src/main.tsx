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
  Image as ImageIcon,
  ListOrdered,
  PenLine,
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
import { PinnedMessage, VisualReference, CanvasPlan } from './CanvasContent';
import { newBlock, writingMarkdown } from './CanvasWriting';
import { CanvasText } from './CanvasText';
import type { WritingBlock } from './model';
import type { CanvasPin, CanvasVisual } from './canvas-content';
import { inspectImage, saveImage } from './image-store';
import { ConversationView } from './Conversation';
import { Composer } from './Composer';
import { WorkActions, type WorkCommand } from './WorkActions';
import { AgentEditor } from './AgentEditor';
import { newAgent } from './agents';
import { resources as repositoryResources, storageKey, type Utility, type Goal } from './model';
import { loadState, type State, type LeftMode } from './state';
import {
  initialObject,
  GRID,
  arrange,
  addNativeObject,
  fits,
  snapped,
  pairSnap,
  minimumFor,
  type CanvasObject,
  type Bounds,
  type Tool,
} from './canvas-layout';
import '@fontsource-variable/dm-sans/index.css';
import './style.css';
import './workspace.css';
import './beside.css';
import './direct.css';

const toolNames: Record<string, string> = {
  document: 'Document',
  browser: 'Browser',
  'agent-settings': 'Agent builder',
  planning: 'Project plan',
};
const toolIcons = {
  document: FileText,
  browser: Globe,
  'agent-settings': SlidersHorizontal,
  planning: ListOrdered,
};
const toolName = (id: Tool) =>
  id.startsWith('pin:')
    ? 'Pinned message'
    : id.startsWith('visual:')
      ? 'Visual reference'
      : id.startsWith('writing:')
        ? 'Writing'
        : toolNames[id];
const toolIcon = (id: Tool) =>
  id.startsWith('pin:')
    ? Pin
    : id.startsWith('visual:')
      ? ImageIcon
      : id.startsWith('writing:')
        ? PenLine
        : toolIcons[id as keyof typeof toolIcons];
function App() {
  const [s, setState] = useState<State>(loadState);
  const patch = useCallback(
    (value: Partial<State>) => setState((old) => ({ ...old, ...value })),
    [],
  );
  const [notice, setNotice] = useState('');
  const [textDraft, setTextDraft] = useState<{
    object: CanvasObject;
    resource: import('./model').Resource;
  } | null>(null);
  const suppressCanvasClickUntil = useRef(0);
  const finishTextOnCanvasClick = useRef(false);
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
  const activeTool = useRef<Tool | null>(null);
  const suppressed = useRef<{
    left: LeftMode;
    utilities: Utility[];
    inspector: State['inspector'];
    width: number;
  } | null>(null);
  const previousViewport = useRef(window.innerWidth);
  const [preview, setPreview] = useState<{
    objects: CanvasObject[];
    valid: boolean;
    display?: CanvasObject[];
  } | null>(null);
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 });
  const stage = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    recovery = useRef<CanvasObject[] | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const replacingVisual = useRef<string | null>(null);
  const latest = useRef(s);
  latest.current = s;
  const [imageDrag, setImageDrag] = useState(false);
  const pendingVisuals = useRef<string[]>([]);
  useEffect(() => {
    const saved = pendingVisuals.current.filter((id) => s.visuals.some((v) => v.id === id));
    if (saved.some((id) => !s.objects.some((o) => o.id === id)))
      setNotice(
        'Image saved to visual references. Make room and reopen it from Open… to place it.',
      );
    pendingVisuals.current = pendingVisuals.current.filter((id) => !saved.includes(id));
  }, [s.visuals, s.objects]);
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
    s.utilities.length && graphExclusion
      ? [{ id: 'reserved-tools' as Tool, ...graphExclusion }]
      : [];
  const blockers = [...s.objects, ...reserved];
  useLayoutEffect(() => {
    if (!utilitiesHost.current) {
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
        setAccount(false);
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
      (left === 'closed' ? 0 : ['chat', 'list'].includes(left) ? s.chatWidth : 260) -
      (inspection ? readerWidth + 12 : 0) -
      (s.utilities.length ? 260 : 0) -
      100 >=
    300;
  const resizeChat = (value: number) => {
    const projected = { ...bounds, width: bounds.width + s.chatWidth - value };
    const exclusion = s.utilities.length
      ? [
          {
            id: 'reserved-tools' as Tool,
            x: projected.width - 260,
            y: 0,
            width: 260,
            height: lastUtilityHeight.current,
          },
        ]
      : [];
    const objects = arrange(s.objects, projected, exclusion);
    if (s.surface === 'canvas' && !objects) {
      setNotice(
        'The conversation cannot grow further without hiding work. Close or rearrange a canvas item first.',
      );
      return;
    }
    patch({ chatWidth: value, ...(s.surface === 'canvas' && objects ? { objects } : {}) });
  };
  const toggleUtilities = () => {
    if (s.utilities.length) {
      patch({ utilities: [] });
      return;
    }
    const exclusion = [
      {
        id: 'reserved-tools' as Tool,
        x: bounds.width - 260,
        y: 0,
        width: 260,
        height: Math.min(bounds.height, lastUtilityHeight.current),
      },
    ];
    const objects = arrange(s.objects, bounds, exclusion);
    if ((s.surface === 'canvas' && !objects) || bounds.width < 580) {
      setNotice(
        'Project tools need more room. Close or rearrange a canvas item, or narrow the conversation. Your current work stays visible.',
      );
      return;
    }
    patch({
      utilities: ['sources', 'agent', 'goals'],
      ...(s.surface === 'canvas' && objects ? { objects } : {}),
    });
    setFocus(null);
  };
  const revealLeft = (left: LeftMode) => {
    if (left !== 'closed' && !roomFor(left, !!s.inspector) && s.inspector) {
      setNotice(
        'Close the reader or project tools before opening this conversation. Your draft and current work are retained.',
      );
      return false;
    } else patch({ left });
    return true;
  };
  const inspect = (id: string, kind: 'document' | 'folder' = 'document', from?: string) => {
    if (!roomFor(s.left, true)) {
      setNotice(
        'The reader needs more room. Close project tools or conversation history to open it without covering work.',
      );
      return false;
    }
    const changes: Partial<State> = {
      inspector:
        kind === 'document'
          ? {
              kind,
              id,
              from:
                from ||
                (resources.find((r) => r.id === id)?.folder === 'private'
                  ? 'private-folder'
                  : resources.find((r) => r.id === id)?.folder === 'research'
                    ? 'research-folder'
                    : 'direction'),
            }
          : { kind, id },
      ...(s.surface === 'graph' ? { graphSubject: id } : {}),
    };
    if (kind === 'document') {
      changes.document = id;
      changes.objects = s.objects.filter((o) => o.id !== 'document');
      if (focus === 'document') setFocus(null);
    }
    if (s.surface === 'canvas') {
      const nextBounds = { ...bounds, width: bounds.width - (s.inspector ? 0 : readerWidth + 12) };
      const next = arrange(
        changes.objects || s.objects,
        nextBounds,
        s.utilities.length
          ? [
              {
                id: 'reserved-tools' as Tool,
                x: nextBounds.width - 260,
                y: 0,
                width: 260,
                height: lastUtilityHeight.current,
              },
            ]
          : [],
      );
      if (!next) {
        setNotice('Make room before opening the reader. Your canvas work is retained.');
        return false;
      }
      changes.objects = next;
    }
    patch(changes);
    return true;
  };
  useEffect(() => {
    const measured = stage.current?.getBoundingClientRect();
    if (measured && Math.abs(measured.width - bounds.width) > 1) return;
    const restoreWidth = previousViewport.current;
    previousViewport.current = window.innerWidth;
    if (suppressed.current && window.innerWidth >= suppressed.current.width) {
      const previous = suppressed.current;
      suppressed.current = null;
      patch({ left: previous.left, utilities: previous.utilities, inspector: previous.inspector });
      return;
    }
    if (!s.inspector && s.utilities.length && bounds.width && bounds.width < 650) {
      if (restoreWidth > window.innerWidth)
        suppressed.current ||= {
          left: s.left,
          utilities: s.utilities,
          inspector: s.inspector,
          width: Math.max(restoreWidth, window.innerWidth),
        };
      if (s.left !== 'closed') patch({ left: 'closed' });
      else patch({ utilities: [] });
      setNotice('Navigation or tools hidden to keep the working surface usable at this width.');
      return;
    }
    if (bounds.width && bounds.width < 310 && s.left !== 'closed') {
      if (restoreWidth > window.innerWidth)
        suppressed.current ||= {
          left: s.left,
          utilities: s.utilities,
          inspector: s.inspector,
          width: Math.max(restoreWidth, window.innerWidth),
        };
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
      const reflowed = arrange(s.objects, bounds, reserved);
      if (reflowed) {
        recovery.current ||= s.objects;
        patch({ objects: reflowed });
        return;
      }
      recovery.current = s.objects;
      setFocus(s.objects.find((o) => o.id === activeTool.current)?.id || s.objects[0].id);
      setNotice(
        'This window is too small for the full arrangement. Active work is temporarily focused; other views return when room is available.',
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
    if (revealLeft('chat')) patch({ selected: id });
  };
  const newChat = () => {
    if (s.inspector && !roomFor('chat', true)) {
      setNotice('Close the reader or project tools before starting another conversation.');
      return;
    }
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
  const placeCanvasContent = (id: Tool, add: Partial<State> = {}) => {
    if (s.objects.some((o) => o.id === id)) {
      patch({ surface: 'canvas', ...add });
      setNotice('Already on your canvas.');
      return true;
    }
    const objects = addNativeObject(id, bounds, s.objects, reserved);
    if (!objects) {
      setNotice(
        'There is no free space for this object. Close or move some work; your existing content is retained.',
      );
      return false;
    }
    patch({ surface: 'canvas', objects, ...add });
    setFocus(null);
    setPicker(false);
    return true;
  };
  const pinMessage = (conversationId: string, messageId: string) => {
    if (
      !s.conversations
        .find((c) => c.id === conversationId)
        ?.messages.some((m) => m.id === messageId)
    )
      return;
    const pin: CanvasPin = s.canvasPins.find(
      (p) => p.conversationId === conversationId && p.messageId === messageId,
    ) || { id: `pin:${crypto.randomUUID()}`, conversationId, messageId };
    placeCanvasContent(pin.id, {
      canvasPins: s.canvasPins.some((p) => p.id === pin.id) ? s.canvasPins : [...s.canvasPins, pin],
    });
  };
  const openMessage = (conversationId: string, messageId: string) => {
    if (s.inspector && !roomFor('chat', true)) {
      setNotice('Close the reader or project tools to view this source conversation.');
      return;
    }
    const c = s.conversations.find((c) => c.id === conversationId),
      m = c?.messages.find((m) => m.id === messageId);
    if (!c || !m) {
      setNotice('The original message is unavailable.');
      return;
    }
    patch({
      selected: c.id,
      left: 'chat',
      threadByConversation: { ...s.threadByConversation, [c.id]: m.replyTo || '' },
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-source-message="${CSS.escape(m.id)}"]`)
          ?.scrollIntoView({ block: 'center' }),
      ),
    );
  };
  const addPinToPlan = (pin: CanvasPin, title: string, actionId: string) => {
    const c = s.conversations.find((c) => c.id === pin.conversationId),
      m = c?.messages.find((m) => m.id === pin.messageId);
    if (!m || c?.kind !== 'channel') {
      setNotice('Share private messages before adding them to the project plan.');
      return false;
    }
    const exists = latest.current.goals.some((g) => g.source?.actionId === actionId);
    const goal: Goal = {
      id: crypto.randomUUID(),
      title,
      done: false,
      due: '',
      source: { conversationId: c.id, messageId: m.id, actionId },
    };
    return placeCanvasContent('planning', { goals: exists ? s.goals : [...s.goals, goal] });
  };
  const chooseVisual = (id?: string) => {
    replacingVisual.current = id || null;
    imageInput.current?.click();
  };
  const importVisuals = async (files: FileList | File[]) => {
    const replacement = replacingVisual.current;
    replacingVisual.current = null;
    for (const file of Array.from(files)) {
      try {
        const dimensions = await inspectImage(file);
        const previous = latest.current.visuals.find((v) => v.id === replacement);
        const id: CanvasVisual['id'] = previous?.id || `visual:${crypto.randomUUID()}`;
        // Publish a new immutable binary revision. Failed metadata saves keep the old pixels intact.
        const imageKey = crypto.randomUUID();
        await saveImage(imageKey, file);
        const visual: CanvasVisual = {
          id,
          imageKey,
          title: previous?.title || file.name.replace(/\.[^.]+$/, ''),
          caption: previous?.caption || '',
          fileName: file.name,
          mimeType: file.type,
          ...dimensions,
          addedAt: new Date().toISOString(),
        };
        const rect = stage.current?.getBoundingClientRect();
        if (!rect) return;
        pendingVisuals.current.push(id);
        const utilitiesRect = utilitiesHost.current?.getBoundingClientRect();
        const excluded = utilitiesRect
          ? {
              x: utilitiesRect.x - rect.x,
              y: utilitiesRect.y - rect.y,
              width: utilitiesRect.width,
              height: utilitiesRect.height,
            }
          : null;
        setState((old) => {
          const excludedObjects = [
            ...(old.utilities.length && excluded
              ? [{ id: 'reserved-tools' as Tool, ...excluded }]
              : []),
          ];
          const objects = old.objects.some((o) => o.id === id)
            ? old.objects
            : addNativeObject(
                id,
                { width: rect.width, height: rect.height },
                old.objects,
                excludedObjects,
              );
          return {
            ...old,
            surface: 'canvas',
            visuals: previous
              ? old.visuals.map((v) => (v.id === id ? visual : v))
              : [...old.visuals, visual],
            objects: objects || old.objects,
          };
        });
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'The image could not be saved. Your existing work is retained.',
        );
      }
      if (replacement) break;
    }
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
    if (
      event.button !== 0 ||
      (!resize && (event.target as HTMLElement).closest('button:not([data-move-handle]),summary'))
    )
      return;
    if (focus) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement,
      pointer = event.pointerId;
    const rect = stage.current!.getBoundingClientRect(),
      start = { x: event.clientX, y: event.clientY };
    let candidate: CanvasObject[] = [item],
      lastValid = item,
      lastDrop = item,
      moved = false,
      ended = false,
      docking = false;
    element.setPointerCapture(pointer);
    const gridRect = (object: CanvasObject) =>
      resize
        ? {
            ...object,
            width: Math.max(minimumFor(item.id).width, Math.round(object.width / GRID) * GRID),
            height: Math.max(minimumFor(item.id).height, Math.round(object.height / GRID) * GRID),
          }
        : snapped(object, object.x, object.y, bounds);
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      moved = true;
      const single = resize
        ? {
            ...item,
            width: Math.max(
              minimumFor(item.id).width,
              Math.min(bounds.width - item.x, item.width + e.clientX - start.x),
            ),
            height: Math.max(
              minimumFor(item.id).height,
              Math.min(bounds.height - item.y, item.height + e.clientY - start.y),
            ),
          }
        : {
            ...item,
            x: Math.max(0, Math.min(bounds.width - item.width, item.x + e.clientX - start.x)),
            y: Math.max(0, Math.min(bounds.height - item.height, item.y + e.clientY - start.y)),
          };
      const valid = fits(single, bounds, blockers);
      if (valid) lastValid = single;
      const grid = gridRect(single);
      const gridValid = fits(grid, bounds, blockers);
      if (gridValid) lastDrop = grid;
      candidate = [grid];
      docking = false;
      if (!resize && e.shiftKey)
        for (const target of s.objects.filter((o) => o.id !== item.id)) {
          const pair = pairSnap(
            item,
            target,
            e.clientX - rect.x,
            e.clientY - rect.y,
            bounds,
            blockers,
          );
          if (pair) {
            candidate = pair;
            docking = true;
            break;
          }
        }
      setPreview({ objects: candidate, valid: gridValid || docking, display: [lastValid] });
    };
    const cleanup = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
      element.removeEventListener('lostpointercapture', cancel);
      if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
      if (moved) suppressCanvasClickUntil.current = performance.now() + 250;
      setPreview(null);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      if (moved) {
        const updates = docking ? candidate : [lastDrop];
        if (
          updates.every((o) =>
            fits(o, bounds, [
              ...blockers.filter((b) => !updates.some((v) => v.id === b.id)),
              ...updates,
            ]),
          )
        )
          patch({ objects: s.objects.map((o) => updates.find((v) => v.id === o.id) || o) });
      }
      cleanup();
    };
    const cancel = () => cleanup();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    element.addEventListener('lostpointercapture', cancel);
  };
  const openAgent = () => {
    if (s.surface === 'graph' && !roomFor(s.left, true)) {
      setNotice('Close a supporting view to make room for the agent builder.');
      return;
    }
    if (s.surface === 'graph')
      patch({
        inspector: { kind: 'agent-settings', id: 'agent' },
      });
    else openTool('agent-settings');
  };
  const runCommand = (id: WorkCommand) => {
    if (id === 'open-plan') {
      placeCanvasContent('planning');
    } else if (id === 'add-visual') {
      chooseVisual();
    } else if (id.startsWith('pin:') || id.startsWith('visual:')) {
      placeCanvasContent(id as Tool);
    } else if (id === 'new-document') {
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
  const textHeight = (object: CanvasObject) => {
    let limit = bounds.height - object.y;
    for (const other of blockers)
      if (
        other.id !== object.id &&
        other.y >= object.y &&
        other.x < object.x + object.width + 16 &&
        other.x + other.width + 16 > object.x
      )
        limit = Math.min(limit, other.y - object.y - 16);
    return Math.max(56, limit);
  };
  const startText = (x: number, y: number) => {
    if (s.surface !== 'canvas' || focus) return;
    if (bounds.width < 96 || bounds.height < 56) return;
    x = Math.max(0, Math.min(bounds.width - 96, x));
    y = Math.max(0, Math.min(bounds.height - 56, y));
    let width = Math.min(420, bounds.width - x),
      height = bounds.height - y;
    for (const other of blockers) {
      if (
        x >= other.x - 16 &&
        x < other.x + other.width + 16 &&
        y >= other.y - 16 &&
        y < other.y + other.height + 16
      )
        return;
      if (other.y < y + 56 && other.y + other.height + 16 > y && other.x > x)
        width = Math.min(width, other.x - x - 16);
    }
    for (const other of blockers)
      if (other.y > y && other.x < x + width + 16 && other.x + other.width + 16 > x)
        height = Math.min(height, other.y - y - 16);
    if (width < 96 || height < 56) return;
    const id = crypto.randomUUID();
    setTextDraft({
      object: { id: `writing:${id}`, x, y, width, height: 56 },
      resource: {
        id,
        title: 'Untitled writing',
        file: 'Untitled writing.md',
        folder: 'private',
        summary: 'Private canvas writing',
        body: '',
        blocks: [newBlock()],
      },
    });
  };
  const changeText = (id: string, blocks: WritingBlock[]) => {
    if (textDraft?.resource.id === id) {
      if (!blocks.some((b) => b.text.trim())) {
        setTextDraft((old) => (old ? { ...old, resource: { ...old.resource, blocks } } : null));
        return;
      }
      const title = (
        blocks.find((b) => b.type === 'heading' && b.text.trim())?.text ||
        blocks.find((b) => b.text.trim())!.text
      )
        .split('\n')[0]
        .slice(0, 64);
      const resource = {
        ...textDraft.resource,
        blocks,
        body: writingMarkdown(blocks),
        title,
        file: `${title}.md`,
        updatedAt: new Date().toISOString(),
      };
      const object = textDraft.object;
      setState((old) => ({
        ...old,
        localResources: [...old.localResources, resource],
        objects: [...old.objects, object],
      }));
      setTextDraft(null);
    } else context.updateWriting(id, blocks);
  };
  const measureText = (id: Tool, height: number) => {
    const rounded = Math.ceil(height);
    if (textDraft?.object.id === id) {
      setTextDraft((old) =>
        old && old.object.height !== rounded
          ? { ...old, object: { ...old.object, height: rounded } }
          : old,
      );
      return;
    }
    setState((old) => {
      const object = old.objects.find((o) => o.id === id);
      if (!object || object.height === rounded) return old;
      const next = { ...object, height: rounded };
      return fits(next, bounds, [...old.objects, ...reserved])
        ? { ...old, objects: old.objects.map((o) => (o.id === id ? next : o)) }
        : old;
    });
  };
  const context = {
    pinMessage,
    resources,
    participants: s.participants,
    updateWriting: (id: string, blocks: WritingBlock[]) => {
      const title = (
        blocks.find((b) => b.type === 'heading' && b.text.trim())?.text ||
        blocks.find((b) => b.text.trim())?.text ||
        'Untitled writing'
      )
        .split('\n')[0]
        .slice(0, 64);
      setState((old) => ({
        ...old,
        localResources: old.localResources.map((r) =>
          r.id === id
            ? {
                ...r,
                title,
                file: `${title}.md`,
                body: writingMarkdown(blocks),
                blocks,
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      }));
    },
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
  const visibleLeft = picker || account ? (s.left === 'chat' ? 'chat' : 'list') : s.left;
  const composerView = (
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
  );
  const workView = (
    <WorkActions
      resources={resources}
      canRestore={!!s.preset}
      canSave={s.objects.length > 0}
      canvasItems={[
        ...s.canvasPins.map((p) => {
          const c = s.conversations.find((c) => c.id === p.conversationId),
            m = c?.messages.find((m) => m.id === p.messageId);
          return {
            id: p.id,
            title: m?.text.slice(0, 65) || 'Unavailable message',
            searchText: m?.text || '',
            detail:
              c?.kind === 'channel' ? `Pinned · #${c.title}` : 'Pinned · private conversation',
          };
        }),
        ...s.visuals.map((v) => ({
          id: v.id,
          title: v.title,
          detail: `Visual · ${v.fileName}`,
          searchText: v.caption,
        })),
      ]}
      onOpen={(id) =>
        resources.find((r) => r.id === id)?.blocks
          ? placeCanvasContent(`writing:${id}`)
          : inspect(id)
      }
      onCommand={runCommand}
      onClose={() => setPicker(false)}
    />
  );
  const accountView = (
    <div className="account-settings">
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
          onChange={(e) => patch({ sendShortcut: e.target.value as State['sendShortcut'] })}
        >
          <option value="enter">Enter</option>
          <option value="modifier">⌘ / Ctrl + Enter</option>
        </select>
      </label>
      <a href="/materials" target="_blank" rel="noreferrer">
        Component proof <ArrowUpRight size={14} />
      </a>
    </div>
  );
  const leftContent = (
    <aside
      className={
        visibleLeft === 'chat'
          ? 'conversation-surface work-surface'
          : `left-extension glass left-${visibleLeft}`
      }
      style={
        visibleLeft === 'chat' || visibleLeft === 'list'
          ? { width: s.chatWidth, flexBasis: s.chatWidth }
          : undefined
      }
      aria-label={
        s.left === 'chat'
          ? 'Conversation history'
          : s.left === 'files'
            ? 'Resource navigation'
            : 'Conversation navigation'
      }
    >
      <div className="extension-header">
        {s.left === 'chat' && !picker && !account && (
          <IconButton
            icon={ArrowLeft}
            label="Back to conversations"
            onClick={() => patch({ left: 'list' })}
          />
        )}
        <strong>
          {picker
            ? 'Open work'
            : account
              ? 'Account'
              : s.left === 'chat'
                ? current.kind === 'channel'
                  ? `# ${current.title}`
                  : current.title
                : s.left === 'people'
                  ? 'New message'
                  : s.left === 'files'
                    ? 'Files'
                    : 'Conversations'}
        </strong>
        {s.left === 'list' && !picker && !account && (
          <IconButton icon={Plus} label="New private chat" onClick={newChat} />
        )}
        <IconButton
          icon={PanelLeftClose}
          label={picker || account ? 'Close disclosure' : 'Hide left navigation'}
          onClick={() =>
            picker || account ? (setPicker(false), setAccount(false)) : patch({ left: 'closed' })
          }
        />
      </div>
      {picker ? (
        workView
      ) : account ? (
        accountView
      ) : s.left === 'chat' ? (
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
            No workspace identity is connected. People search and direct-message delivery become
            available when accounts are connected.
          </p>
          <small>
            Your existing local DM drafts are retained. Entering a name alone cannot establish a
            recipient’s identity or access.
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
              <button aria-label="Start a direct message" onClick={() => revealLeft('people')}>
                <Plus size={15} />
              </button>
            </div>
            {s.conversations
              .filter(
                (c) => c.kind !== 'channel' && c.title.toLowerCase().includes(search.toLowerCase()),
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
                (c) => c.kind === 'channel' && c.title.toLowerCase().includes(search.toLowerCase()),
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
      {visibleLeft === 'chat' && composerView}
    </aside>
  );
  return (
    <Workspace.Provider value={context}>
      <div className="app-shell revised-shell">
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          aria-label="Choose visual references"
          onChange={(e) => {
            if (e.target.files) void importVisuals(e.target.files);
            e.target.value = '';
          }}
        />
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
              active={s.utilities.length > 0}
              onClick={toggleUtilities}
            />
            <div className="account-anchor">
              <button
                className="account-button"
                aria-label="Account and appearance"
                title="Account and appearance"
                onClick={() => {
                  setAccount((v) => !v);
                  setPicker(false);
                }}
              >
                D
              </button>
            </div>
          </div>
        </nav>
        {visibleLeft !== 'closed' && visibleLeft !== 'chat' && leftContent}
        <div className="workspace-main">
          <div className="surface-row">
            {visibleLeft === 'chat' && (
              <>
                {leftContent}
                <WidthDivider
                  label="Resize conversation"
                  value={s.chatWidth}
                  min={320}
                  max={Math.min(520, Math.max(320, window.innerWidth - 440))}
                  setValue={resizeChat}
                />
              </>
            )}
            <main
              ref={stage}
              tabIndex={0}
              aria-description="Click empty space to write. Press Enter to write at the center."
              style={{ backgroundSize: `${GRID}px ${GRID}px` }}
              onClick={(e) => {
                if (performance.now() < suppressCanvasClickUntil.current) return;
                if (finishTextOnCanvasClick.current) {
                  finishTextOnCanvasClick.current = false;
                  return;
                }
                if (s.surface === 'canvas' && e.target === e.currentTarget) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  startText(e.clientX - rect.x, e.clientY - rect.y);
                }
              }}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && e.key === 'Enter') {
                  e.preventDefault();
                  startText(bounds.width / 3, bounds.height / 3);
                }
              }}
              onPointerDown={(e) => {
                finishTextOnCanvasClick.current =
                  e.target === e.currentTarget &&
                  !!document.activeElement?.closest('.canvas-text-object');
                if (
                  s.surface === 'canvas' &&
                  !(e.target as HTMLElement).closest(
                    '.canvas-object, .canvas-text-object, .work-action-anchor',
                  )
                )
                  e.currentTarget.focus();
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = s.surface === 'canvas' ? 'copy' : 'none';
                  if (s.surface === 'canvas') setImageDrag(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setImageDrag(false);
              }}
              onDrop={(e) => {
                if (e.dataTransfer.files.length) {
                  e.preventDefault();
                  setImageDrag(false);
                  if (s.surface !== 'canvas') {
                    setNotice('Switch to Canvas to add a visual reference.');
                    return;
                  }
                  replacingVisual.current = null;
                  void importVisuals(e.dataTransfer.files);
                }
              }}
              onPaste={(e) => {
                if (
                  s.surface === 'canvas' &&
                  e.clipboardData.files.length &&
                  !(e.target as HTMLElement).closest('input,textarea,[contenteditable]')
                ) {
                  e.preventDefault();
                  replacingVisual.current = null;
                  void importVisuals(e.clipboardData.files);
                }
              }}
              className={`primary-surface surface-${s.surface}`}
              data-surface={s.surface}
              aria-label={s.surface === 'graph' ? 'Graph canvas' : 'Working canvas'}
              onContextMenu={(e) => {
                if (
                  s.surface === 'canvas' &&
                  !(e.target as HTMLElement).closest('.canvas-object, .canvas-text-object')
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
                  {[
                    ...s.objects,
                    ...(textDraft && !s.objects.some((o) => o.id === textDraft.object.id)
                      ? [textDraft.object]
                      : []),
                  ]
                    .filter((o) => !focus || o.id === focus)
                    .map((object) => {
                      const rendered = preview?.display?.find((o) => o.id === object.id) || object;
                      if (object.id.startsWith('writing:')) {
                        const resource =
                          resources.find((r) => r.id === object.id.slice(8)) || textDraft?.resource;
                        if (!resource) return null;
                        return (
                          <section
                            key={object.id}
                            className="canvas-text-object"
                            data-object={object.id}
                            aria-label="Writing"
                            style={{
                              left: rendered.x,
                              top: rendered.y,
                              width: rendered.width,
                              height: rendered.height,
                            }}
                            onFocusCapture={() => {
                              activeTool.current = object.id;
                            }}
                          >
                            <CanvasText
                              resource={resource}
                              draft={textDraft?.object.id === object.id}
                              maxHeight={textHeight(object)}
                              onChange={(blocks) => changeText(resource.id, blocks)}
                              onMeasure={(height) => measureText(object.id, height)}
                              onAbandon={() =>
                                setTextDraft((old) => (old?.object.id === object.id ? null : old))
                              }
                              onMove={(e) => beginGesture(e, object)}
                              onResize={(e) => beginGesture(e, object, true)}
                              onStep={(x, y) => {
                                const next = snapped(
                                  object,
                                  object.x + x * GRID,
                                  object.y + y * GRID,
                                  bounds,
                                );
                                if (fits(next, bounds, blockers))
                                  patch({
                                    objects: s.objects.map((o) => (o.id === object.id ? next : o)),
                                  });
                              }}
                              onClose={() => {
                                setTextDraft(null);
                                closeTool(object.id);
                              }}
                            />
                          </section>
                        );
                      }
                      const Icon = toolIcon(object.id),
                        title =
                          object.id === 'document'
                            ? resources.find((r) => r.id === s.document)!.title
                            : toolName(object.id);
                      return (
                        <section
                          key={object.id}
                          className={`canvas-object ${object.id === 'planning' || /^(writing|pin|visual):/.test(object.id) ? 'native-canvas-object' : ''} ${focus === object.id ? 'object-focused' : ''}`}
                          data-object={object.id}
                          onFocusCapture={() => {
                            activeTool.current = object.id;
                          }}
                          onPointerDownCapture={() => {
                            activeTool.current = object.id;
                          }}
                          aria-label={title}
                          style={
                            focus === object.id
                              ? {
                                  left: 0,
                                  top: 0,
                                  width: s.utilities.length ? 'calc(100% - 272px)' : '100%',
                                  height: '100%',
                                }
                              : {
                                  left: rendered.x,
                                  top: rendered.y,
                                  width: rendered.width,
                                  height: rendered.height,
                                }
                          }
                        >
                          <header
                            className="object-header"
                            tabIndex={0}
                            aria-label={`Move ${toolName(object.id).toLowerCase()}`}
                            title="Drag to move; Shift-drag to share an edge; arrow keys to move on the grid"
                            onPointerDown={(e) => beginGesture(e, object)}
                            onKeyDown={(e) => {
                              if ((e.target as HTMLElement).closest('button')) return;
                              const delta = {
                                ArrowLeft: [-GRID, 0],
                                ArrowRight: [GRID, 0],
                                ArrowUp: [0, -GRID],
                                ArrowDown: [0, GRID],
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
                                  : `Focus ${toolName(object.id).toLowerCase()}`
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
                              label={`Close ${toolName(object.id).toLowerCase()}`}
                              onClick={() => closeTool(object.id)}
                            />
                          </header>
                          <div className="object-body">
                            {object.id.startsWith('pin:') ? (
                              <PinnedMessage
                                pin={s.canvasPins.find((p) => p.id === object.id)}
                                onSource={openMessage}
                                onPlan={addPinToPlan}
                              />
                            ) : object.id.startsWith('visual:') ? (
                              <VisualReference
                                visual={s.visuals.find((v) => v.id === object.id)}
                                onChange={(value) =>
                                  patch({
                                    visuals: s.visuals.map((v) =>
                                      v.id === object.id ? { ...v, ...value } : v,
                                    ),
                                  })
                                }
                                onReplace={() => chooseVisual(object.id)}
                              />
                            ) : object.id === 'planning' ? (
                              <CanvasPlan
                                goals={s.goals}
                                onChange={(goals) => patch({ goals })}
                                onSource={openMessage}
                              />
                            ) : object.id === 'document' ? (
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
                              aria-label={`Resize ${toolName(object.id).toLowerCase()}`}
                              onPointerDown={(e) => beginGesture(e, object, true)}
                              onKeyDown={(e) => {
                                const delta = {
                                  ArrowLeft: [-GRID, 0],
                                  ArrowRight: [GRID, 0],
                                  ArrowUp: [0, -GRID],
                                  ArrowDown: [0, GRID],
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
              {imageDrag && (
                <div className="image-drop-overlay" aria-hidden="true">
                  <ImageIcon size={23} />
                  <span>Drop a visual reference</span>
                </div>
              )}
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
                      onClick={() =>
                        patch({
                          inspector: null,
                          ...(s.surface === 'graph' ? { graphSubject: 'root' } : {}),
                        })
                      }
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
            ) : null}
            {s.utilities.length > 0 && (
              <aside
                ref={utilitiesHost}
                className="utility-stack"
                aria-label="Project utilities"
                style={s.inspector ? { right: readerWidth + 12 } : undefined}
              >
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
                    summaryRows={bounds.height < 560 ? 1 : 2}
                    compact={bounds.height < 460}
                    onBrowse={() => inspect('root', 'folder')}
                    onSource={(id) => inspect(id)}
                    onAgent={() => runCommand('edit-agent')}
                    onPlan={() => placeCanvasContent('planning')}
                  />
                ))}
              </aside>
            )}
          </div>
          <div className="workspace-actions">
            {notice && (
              <div className="workspace-feedback" role="status">
                <Info size={14} />
                <span tabIndex={0}>{notice}</span>
                <IconButton icon={X} label="Dismiss notification" onClick={() => setNotice('')} />
              </div>
            )}
            <button
              className="open-work-button glass"
              aria-label="Open work"
              aria-expanded={picker}
              onClick={() => {
                setPicker((v) => !v);
                setAccount(false);
              }}
            >
              <FolderOpen size={16} />
              <span>Open…</span>
              <kbd>⌘K</kbd>
            </button>
          </div>
          {visibleLeft !== 'chat' && composerView}
        </div>
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
  onPlan,
  onBrowse,
  summaryRows,
  compact,
}: {
  kind: Utility;
  goals: Goal[];
  setGoals: (value: Goal[]) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onClose: () => void;
  onSource: (id: string) => void;
  onAgent: () => void;
  onPlan: () => void;
  onBrowse: () => void;
  summaryRows: number;
  compact: boolean;
}) {
  const w = useContext(Workspace);
  const resources = w.resources.filter((r) => r.folder !== 'private');
  const Icon = kind === 'sources' ? BookOpen : kind === 'agent' ? Workflow : Target;
  const label =
    kind === 'sources' ? 'Sources & context' : kind === 'agent' ? 'Project agent' : 'Goals';
  const showAll = kind === 'sources' ? onBrowse : kind === 'agent' ? onAgent : onPlan;
  return (
    <section
      className="utility-card glass"
      aria-label={kind === 'sources' ? 'Sources and context' : label}
    >
      <header className="utility-header">
        <Icon size={16} />
        <strong>{label}</strong>
        <IconButton
          icon={ArrowUpRight}
          label={
            kind === 'sources'
              ? 'View all sources'
              : kind === 'agent'
                ? 'Open agent builder'
                : 'Open project plan on canvas'
          }
          onClick={showAll}
        />
        <IconButton
          icon={collapsed ? ChevronRight : ChevronDown}
          label={compact ? `Open ${kind}` : `${collapsed ? 'Expand' : 'Collapse'} ${kind}`}
          onClick={compact ? showAll : onCollapse}
        />
        <IconButton icon={X} label={`Hide ${kind}`} onClick={onClose} />
      </header>
      {!collapsed && !compact && (
        <div className="utility-card-body">
          {kind === 'sources' ? (
            <>
              <div className="source-rows">
                {resources.slice(0, summaryRows).map((r) => (
                  <button key={r.id} onClick={() => onSource(r.id)}>
                    <FileText size={14} />
                    <span>{r.title}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={onBrowse}>
                View all sources <ArrowUpRight size={12} />
              </button>
            </>
          ) : kind === 'agent' ? (
            <button className="agent-summary" onClick={onAgent}>
              <Workflow size={16} />
              <span>
                <strong>
                  {w.agents.find((a) => a.id === 'project-agent')?.draft.name || 'Project agent'}
                </strong>
                <small>Runtime not connected</small>
              </span>
              <ChevronRight size={13} />
            </button>
          ) : (
            <>
              <div className="compact-goals">
                {goals.slice(0, summaryRows).map((goal) => (
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
                      {goal.due && <small>{goal.due}</small>}
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-button" onClick={onPlan}>
                Open plan <ArrowUpRight size={12} />
              </button>
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
