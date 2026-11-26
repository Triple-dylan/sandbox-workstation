import { Choice } from '../app/Choice.tsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Code,
  Minus,
  Redo2,
  Strikethrough,
  Undo2,
  Check,
  Heading1,
  Heading2,
  Highlighter,
  History,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  Quote,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react';
import { EditorContent, Extension, useEditor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import Collaboration from '@tiptap/extension-collaboration';
import { ySyncPluginKey } from 'y-prosemirror';
import { useCollab, type CollabDoc } from '../features/collab/useCollab.ts';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { useFading, useSpot } from '../app/spot.ts';
import { ago } from '../app/util.tsx';
import { Actor, Character, nameStyle } from '../features/agents/Character.tsx';
import { ApprovalCard, MessageView, agentsIn } from '../features/feed/Feed.tsx';
import { PageFeed, usePageFeed } from './PageFeed.tsx';
import { useShareCursor, useTeamCursors } from '../features/presence/cursors.ts';
import type { Id, Message, Resource } from '../../shared/types.ts';

type Revision = { id: string; authorId: string; body: string; createdAt: string };
type Mark = { id: string; quote: string; active: boolean; plain: boolean };

/** Finds a quoted passage in the document as it is now. Returns nothing if the text has gone. */
function locate(doc: PmNode, quote: string) {
  const want = quote.trim();
  if (!want) return null;
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    let needle = want;
    let at = text.indexOf(needle);
    if (at < 0) {
      needle = want.split('\n')[0].slice(0, 80);
      at = needle.length > 3 ? text.indexOf(needle) : -1;
    }
    if (at >= 0) found = { from: pos + 1 + at, to: pos + 1 + at + needle.length };
    return false;
  });
  return found as { from: number; to: number } | null;
}

type Caret = { id: string; name: string; color: string; from: number; to: number };
const caretsKey = new PluginKey('team-carets');
/** Where teammates are in the text: a caret in their colour with their name, and what they have selected. */
const TeamCarets = Extension.create<object, { items: Caret[] }>({
  name: 'teamCarets',
  addStorage() {
    return { items: [] };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: caretsKey,
        props: {
          decorations(state) {
            const end = state.doc.content.size;
            const clamp = (n: number) => Math.max(1, Math.min(end, n));
            const found = storage.items.flatMap((c) => {
              const from = clamp(Math.min(c.from, c.to));
              const to = clamp(Math.max(c.from, c.to));
              const caret = Decoration.widget(
                to,
                () => {
                  const el = document.createElement('span');
                  el.className = 'team-caret';
                  el.style.setProperty('--who', c.color);
                  const tag = document.createElement('span');
                  tag.className = 'team-caret-name';
                  tag.textContent = c.name;
                  el.append(tag);
                  return el;
                },
                { key: `caret-${c.id}-${to}`, side: 1 },
              );
              return from < to
                ? [
                    Decoration.inline(from, to, {
                      class: 'team-selection',
                      style: `--who: ${c.color}`,
                    }),
                    caret,
                  ]
                : [caret];
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});

const marksKey = new PluginKey('comment-marks');
/** Draws comments and highlights over the text without changing the document itself. */
const CommentMarks = Extension.create<object, { items: Mark[] }>({
  name: 'commentMarks',
  addStorage() {
    return { items: [] };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: marksKey,
        props: {
          decorations(state) {
            const found = storage.items.flatMap((item) => {
              const at = locate(state.doc, item.quote);
              return at
                ? [
                    Decoration.inline(at.from, at.to, {
                      class: `cmark ${item.plain ? 'plain' : ''} ${item.active ? 'active' : ''}`,
                      'data-comment': item.id,
                    }),
                  ]
                : [];
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});

const HIGHLIGHT = 'Highlighted';

/**
 * A document. Always editable, saved as you type, stored as Markdown so agents and history read
 * what people see. Comments sit beside the text they are about; the page's own feed is underneath.
 */
export function DocPage({ page }: { page: Resource }) {
  // Everyone typing in the same document at once: their edits merge as they type.
  const locked = page.role === 'orientation';
  const collab = useCollab(page.id, !locked);
  if (!locked && !collab) return <div className="doc-loading" aria-busy="true" />;
  return (
    <DocEditor key={collab ? String(collab.doc.clientID) : 'kept'} page={page} collab={collab} />
  );
}

function DocEditor({ page, collab }: { page: Resource; collab: CollabDoc | null }) {
  const { s, ui, setUi, run, user, ask, notify } = useWorkspace();
  const { feed, ensure } = usePageFeed(page);
  const locked = page.role === 'orientation';
  const [state, setState] = useState<'saved' | 'saving'>('saved');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selection, setSelection] = useState<{ quote: string; top: number; left: number } | null>(
    null,
  );
  const [draft, setDraft] = useState<{
    quote: string;
    mode: 'comment' | 'ask';
    top: number;
  } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftAgent, setDraftAgent] = useState<Id>('mine');
  const [active, setActive] = useState<Id | null>(null);
  const [opened, setOpened] = useState<Id | null>(null);
  // An open comment closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!opened) return;
    const away = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !(e.target as Element).closest?.('.cface-wrap')
      )
        setOpened(null);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', away);
    };
  }, [opened]);
  const [showResolved, setShowResolved] = useState(false);
  const [tops, setTops] = useState<Record<Id, number>>({});
  const [stack, setStack] = useState(false);
  const [tick, setTick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const saved = useRef(page.body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const team = useTeamCursors(page.id);
  const shareNow = useShareCursor(page.id);
  // The editor keeps its first callbacks; this always reaches the current setting.
  const shareRef = useRef(shareNow);
  shareRef.current = shareNow;
  const shareSpot = (spot: Parameters<typeof shareNow>[0]) => shareRef.current(spot);
  // Typing "/" on an empty line offers the blocks you can insert.
  const [slash, setSlash] = useState<{
    top: number;
    left: number;
    query: string;
    from: number;
    to: number;
    at: number;
  } | null>(null);
  const slashKey = useRef<(event: KeyboardEvent) => boolean>(() => false);
  // The same thing held outside React, so a key pressed before the next render still sees it.
  const slashNow = useRef<typeof slash>(null);
  const checkSlash = useRef<(editor: any) => void>(() => undefined);
  const pending = useRef<string | null>(null);

  // Who typed here last, and the editor itself: a save always takes the merged text at that moment.
  const lastLocal = useRef(0);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const now = editorRef.current?.storage.markdown.getMarkdown();
    const body = pending.current === null ? null : (now ?? pending.current);
    pending.current = null;
    if (body === null || body === saved.current) return setState('saved');
    saved.current = body;
    void run(() =>
      api(`/resources/${page.id}`, {
        method: 'PATCH',
        body: { body, collab: !!collab, epoch: collab?.epoch() ?? '' },
      }),
    ).then(() => setState('saved'));
  };
  const editor = useEditor({
    extensions: [
      // The shared history keeps its own undo, per person.
      collab ? StarterKit.configure({ history: false }) : StarterKit,
      ...(collab ? [Collaboration.configure({ document: collab.doc })] : []),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Write here, or type / for headings, lists and tables',
      }),
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true }),
      CommentMarks,
      TeamCarets,
    ],
    content: collab ? undefined : page.body,
    editable: !locked,
    // The first person to open a document with no shared history yet fills it from the saved text.
    onCreate: ({ editor }) => {
      if (collab?.seed) editor.commands.setContent(collab.body ?? page.body);
    },
    editorProps: { handleKeyDown: (_view, event) => slashKey.current(event) },
    onUpdate: ({ editor, transaction }) => {
      // A teammate's typing arriving: shown, not saved again by everyone who sees it.
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) {
        setTick((t) => t + 1);
        // Someone who just typed here saves again once the others' edits have arrived, so the
        // saved text (what agents and search read) has everyone's words, not only their own.
        if (Date.now() - lastLocal.current > 10_000) {
          saved.current = editor.storage.markdown.getMarkdown();
          return;
        }
      } else lastLocal.current = Date.now();
      pending.current = editor.storage.markdown.getMarkdown();
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
      setTick((t) => t + 1);
      checkSlash.current(editor);
    },
    onFocus: ({ editor }) => {
      const { from, to } = editor.state.selection;
      shareSpot({ kind: 'text', from, to });
    },
    onSelectionUpdate: ({ editor }) => {
      {
        const { from, to } = editor.state.selection;
        if (editor.isFocused) shareSpot({ kind: 'text', from, to });
      }
      checkSlash.current(editor);
      const { from, to, empty } = editor.state.selection;
      if (empty || !sheet.current) return setSelection(null);
      const quote = editor.state.doc.textBetween(from, to, '\n').trim();
      if (quote.length < 2) return setSelection(null);
      const box = sheet.current.getBoundingClientRect();
      const start = editor.view.coordsAtPos(from);
      setSelection({
        quote: quote.slice(0, 280),
        top: start.top - box.top,
        left: Math.max(0, Math.min(start.left - box.left, box.width - 440)),
      });
    },
  });
  editorRef.current = editor;
  // Save whatever is unsent when the page closes.
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Teammates' carets, redrawn whenever one moves.
  const carets = Object.entries(team)
    .filter(
      (entry): entry is [string, Extract<(typeof team)[string], { kind: 'text' }>] =>
        entry[1].kind === 'text',
    )
    .map(([id, c]) => ({
      id,
      name: user(id)?.name ?? 'Someone',
      color: user(id)?.color ?? '#888',
      from: c.from,
      to: c.to,
    }));
  const caretKey = carets.map((c) => `${c.id}:${c.from}:${c.to}`).join('|');
  useEffect(() => {
    if (!editor) return;
    editor.storage.teamCarets.items = carets;
    editor.view.dispatch(editor.state.tr.setMeta(caretsKey, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caretKey, editor]);
  // Someone else's change (a teammate, an accepted suggestion) appears unless you have unsent typing.
  useEffect(() => {
    if (!editor || collab) return;
    if (page.body === saved.current || pending.current !== null) return;
    saved.current = page.body;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(page.body, false);
    {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    }
    setTick((t) => t + 1);
  }, [page.body, editor]);

  const all = feed ? s.messages.filter((m) => m.conversationId === feed.id) : [];
  const comments = all.filter((m) => m.anchor?.resourceId === page.id && !m.replyTo);
  const open = comments.filter((m) => !m.resolved);
  const resolved = comments.filter((m) => m.resolved);
  const shown = showResolved ? comments : open;
  const marksSignature = open.map((m) => `${m.id}:${m.anchor!.quote}`).join('|') + `|${active}`;
  useEffect(() => {
    if (!editor) return;
    editor.storage.commentMarks.items = open.map((m) => ({
      id: m.id,
      quote: m.anchor!.quote,
      active: m.id === active,
      plain: m.text === HIGHLIGHT,
    }));
    editor.view.dispatch(editor.state.tr.setMeta(marksKey, true));
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksSignature, editor]);

  useLayoutEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) => setStack(entry.contentRect.width < 560));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);
  // Each comment sits level with its text; ones that would collide are pushed down in order.
  useLayoutEffect(() => {
    if (!sheet.current || stack) return;
    const box = sheet.current.querySelector('.doc-margin')!.getBoundingClientRect();
    const wanted = shown
      .map((m) => {
        const el = sheet.current!.querySelector(`[data-comment="${m.id}"]`);
        return {
          id: m.id,
          top: el ? el.getBoundingClientRect().top - box.top : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.top - b.top);
    const next: Record<Id, number> = {};
    let floor = draft ? draft.top + 150 : 0;
    for (const item of wanted) {
      const card = sheet.current.querySelector<HTMLElement>(`[data-card="${item.id}"]`);
      const top = Math.round(
        Math.max(item.top === Number.MAX_SAFE_INTEGER ? floor : item.top - 6, floor),
      );
      next[item.id] = top;
      floor = top + (card?.offsetHeight ?? 90) + 10;
    }
    const ids = Object.keys(next);
    const moved =
      ids.length !== Object.keys(tops).length ||
      ids.some((id) => Math.abs((tops[id] ?? -999) - next[id]) > 2);
    if (moved) setTops(next);
  });

  // Where a quoted line sits on the sheet, as a band across the text column.
  const bandOf = (quote: string) => {
    if (!editor || !sheet.current) return null;
    const at = locate(editor.state.doc, quote);
    if (!at) return null;
    const box = sheet.current.getBoundingClientRect();
    const text = sheet.current.querySelector('.doc-text')!.getBoundingClientRect();
    const a = editor.view.coordsAtPos(at.from);
    const b = editor.view.coordsAtPos(at.to);
    return {
      top: a.top - box.top + sheet.current.scrollTop - 4,
      left: text.left - box.left - 10,
      width: text.width + 20,
      height: b.bottom - a.top + 8,
    };
  };
  // A line someone pointed at from a conversation: brought into view and lit for a moment.
  const [litQuote, setLit] = useFading<string>(5000);
  useSpot(page.id, (spot) => {
    if (!spot.quote) return;
    const band = bandOf(spot.quote);
    if (!band) return notify('That text has since changed on the page.');
    setLit(spot.quote);
    sheet.current?.scrollTo({ top: Math.max(0, band.top - 140), behavior: 'smooth' });
  });
  const lit = litQuote ? bandOf(litQuote) : null;
  // While you choose where to share something, the line it would land on is lit faintly.
  const previewQuote =
    ui.preview && 'resourceId' in ui.preview && ui.preview.resourceId === page.id
      ? ui.preview.quote
      : undefined;
  const previewBand = previewQuote ? bandOf(previewQuote) : null;

  const projectAgents = useMemo(
    () =>
      feed
        ? agentsIn(feed, s.users)
        : s.users.filter(
            (u) =>
              u.kind === 'agent' &&
              u.role === 'project' &&
              u.spaceId === page.spaceId &&
              !u.retired,
          ),
    [feed, s.users, page.spaceId],
  );
  const begin = (mode: 'comment' | 'ask') => {
    if (!selection) return;
    setDraft({ quote: selection.quote, mode, top: selection.top });
    setDraftText('');
    setDraftAgent(mode === 'comment' ? '' : 'mine');
    setSelection(null);
  };
  const post = async (text: string, quote: string, agentId?: Id) => {
    const chat = await ensure();
    if (!chat) return;
    await run(() =>
      api('/messages', {
        body: {
          conversationId: chat.id,
          text,
          anchor: { resourceId: page.id, quote },
          addressedTo: agentId ?? null,
        },
      }),
    );
  };
  const submitDraft = async () => {
    if (!draft || !draftText.trim()) return;
    const { quote, mode } = draft;
    const text = draftText.trim();
    setDraft(null);
    if (mode === 'comment') {
      flush();
      return void (await post(text, quote, draftAgent || undefined));
    }
    if (mode === 'ask' && draftAgent === 'mine') {
      // Your own agent answers privately, in the rail.
      flush();
      return ask(text, { anchor: { resourceId: page.id, quote } });
    }
    flush();
    await post(text, quote, mode === 'ask' ? draftAgent : undefined);
  };
  const highlight = async () => {
    if (!selection) return;
    const quote = selection.quote;
    setSelection(null);
    await post(HIGHLIGHT, quote);
  };
  const resolve = (m: Message, on: boolean) =>
    void run(() => api(`/messages/${m.id}/resolve`, { body: { resolved: on } }));

  const tool = (label: string, icon: React.ReactNode, on: boolean, act: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={act}
    >
      {icon}
    </button>
  );
  const chain = () => editor!.chain().focus();
  const blocks: { label: string; run: () => void }[] = [
    { label: 'Heading', run: () => chain().setHeading({ level: 1 }).run() },
    { label: 'Subheading', run: () => chain().setHeading({ level: 2 }).run() },
    { label: 'Small heading', run: () => chain().setHeading({ level: 3 }).run() },
    { label: 'Bulleted list', run: () => chain().toggleBulletList().run() },
    { label: 'Numbered list', run: () => chain().toggleOrderedList().run() },
    { label: 'Checklist', run: () => chain().toggleTaskList().run() },
    { label: 'Quote', run: () => chain().toggleBlockquote().run() },
    { label: 'Code', run: () => chain().toggleCodeBlock().run() },
    {
      label: 'Table',
      run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { label: 'Divider', run: () => chain().setHorizontalRule().run() },
  ];
  const offered = slash ? blocks.filter((b) => b.label.toLowerCase().includes(slash.query)) : [];
  const insert = (block: (typeof blocks)[number]) => {
    const now = slashNow.current;
    if (!now || !editor) return;
    editor.chain().focus().deleteRange({ from: now.from, to: now.to }).run();
    block.run();
    slashNow.current = null;
    setSlash(null);
  };
  checkSlash.current = (ed) => {
    const { $from, empty } = ed.state.selection;
    const text = $from.parent.textContent as string;
    if (
      !locked &&
      empty &&
      $from.parent.type.name === 'paragraph' &&
      /^\/[a-z ]*$/i.test(text) &&
      $from.parentOffset === text.length &&
      sheet.current
    ) {
      const box = sheet.current.getBoundingClientRect();
      const at = ed.view.coordsAtPos($from.pos);
      const old = slashNow.current;
      slashNow.current = {
        top: at.bottom - box.top + 6,
        left: Math.max(0, at.left - box.left - 8),
        query: text.slice(1).toLowerCase(),
        from: $from.start(),
        to: $from.pos,
        at: old && old.query === text.slice(1).toLowerCase() ? old.at : 0,
      };
      setSlash(slashNow.current);
    } else {
      slashNow.current = null;
      setSlash(null);
    }
  };
  slashKey.current = (event) => {
    const now = slashNow.current;
    const choices = now ? blocks.filter((x) => x.label.toLowerCase().includes(now.query)) : [];
    if (!now || !choices.length) return false;
    const move = (by: number) => {
      slashNow.current = { ...now, at: (now.at + by + choices.length) % choices.length };
      setSlash(slashNow.current);
    };
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Enter' || event.key === 'Tab') insert(choices[now.at] ?? choices[0]);
    else if (event.key === 'Escape') {
      slashNow.current = null;
      setSlash(null);
    } else return false;
    event.preventDefault();
    return true;
  };
  const by = user(page.updatedBy);

  const card = (m: Message) => {
    const author = user(m.authorId);
    const replies = all.filter((x) => x.replyTo === m.id);
    const gone = editor ? !locate(editor.state.doc, m.anchor!.quote) : false;
    const plain = m.text === HIGHLIGHT;
    const people = [...new Set([m.authorId, ...replies.map((r) => r.authorId)])]
      .map((id) => user(id))
      .filter((u) => !!u);
    const full = (
      <div
        className={`comment ${stack ? '' : 'pop'} ${active === m.id ? 'active' : ''} ${m.resolved ? 'resolved' : ''} ${plain ? 'plain' : ''}`}
        onMouseEnter={() => setActive(m.id)}
        onMouseLeave={() => setActive((a) => (a === m.id ? null : a))}
      >
        <p className="comment-head">
          {author && <Actor user={author} jobs={s.jobs} size={18} />}
          <strong style={nameStyle(author?.color)}>{author?.name}</strong>
          {m.addressedTo && <span className="to">to {user(m.addressedTo)?.name}</span>}
          <time>{ago(m.createdAt)}</time>
        </p>
        {(stack || gone) && (
          <p className="comment-quote">
            “{m.anchor!.quote.slice(0, 90)}”{gone ? ' · this text has since changed' : ''}
          </p>
        )}
        {!plain && <p className="comment-text">{m.text}</p>}
        {replies.map((r) =>
          r.approvalId ? (
            <div key={r.id} className="comment-reply">
              <p className="comment-head">
                {user(r.authorId) && <Actor user={user(r.authorId)!} jobs={s.jobs} size={18} />}
                <strong>{user(r.authorId)?.name}</strong>
              </p>
              <ApprovalCard approvalId={r.approvalId} />
            </div>
          ) : (
            <div key={r.id} className="comment-reply">
              <MessageView m={r} quiet />
            </div>
          ),
        )}
        {s.jobs.some(
          (j) =>
            j.conversationId === m.conversationId &&
            j.agentId === m.addressedTo &&
            (j.status === 'running' || j.status === 'queued') &&
            j.createdAt >= m.createdAt,
        ) && (
          <p className="work">
            <Character agent={user(m.addressedTo)!} size={20} state="working" /> working on it…
          </p>
        )}
        <form
          className="comment-foot"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('reply') as HTMLInputElement;
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            void run(() =>
              api('/messages', { body: { conversationId: m.conversationId, text, replyTo: m.id } }),
            );
          }}
        >
          {!plain && <input name="reply" placeholder="Reply" aria-label="Reply to this comment" />}
          <button type="button" onClick={() => resolve(m, !m.resolved)}>
            <Check size={12} /> {m.resolved ? 'Reopen' : plain ? 'Remove' : 'Resolve'}
          </button>
        </form>
      </div>
    );
    if (stack)
      return (
        <div key={m.id} data-card={m.id}>
          {full}
        </div>
      );
    // Beside the text, a comment is a small mark with the faces of who is in it; it opens on click.
    return (
      <div
        key={m.id}
        data-card={m.id}
        className={`cface-wrap ${opened === m.id ? 'open' : ''}`}
        style={{ top: tops[m.id] ?? 0 }}
      >
        <button
          className={`cface ${active === m.id || opened === m.id ? 'on' : ''} ${m.resolved ? 'resolved' : ''}`}
          aria-expanded={opened === m.id}
          aria-label={`${plain ? 'Highlight' : 'Comment'} by ${author?.name ?? 'someone'}${replies.length ? `, ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}`}
          onClick={() => setOpened(opened === m.id ? null : m.id)}
          onMouseEnter={() => setActive(m.id)}
          onMouseLeave={() => setActive((a) => (a === m.id ? null : a))}
        >
          {people.slice(0, 2).map((u) => (
            <Actor key={u.id} user={u} jobs={s.jobs} size={18} />
          ))}
          {!plain && replies.length + 1 > 1 && <small>{replies.length + 1}</small>}
        </button>
        {opened === m.id && full}
      </div>
    );
  };

  return (
    <div className={`doc ${stack ? 'stack' : ''}`} ref={scroller} data-tick={tick}>
      <div className="doc-tools" role="toolbar" aria-label="Formatting">
        {editor && !locked && (
          <span className="format">
            {tool('Heading', <Heading1 size={15} />, editor.isActive('heading', { level: 1 }), () =>
              chain().toggleHeading({ level: 1 }).run(),
            )}
            {tool(
              'Subheading',
              <Heading2 size={15} />,
              editor.isActive('heading', { level: 2 }),
              () => chain().toggleHeading({ level: 2 }).run(),
            )}
            {tool('Bold', <Bold size={14} />, editor.isActive('bold'), () =>
              chain().toggleBold().run(),
            )}
            {tool('Italic', <Italic size={14} />, editor.isActive('italic'), () =>
              chain().toggleItalic().run(),
            )}
            {tool('Bulleted list', <List size={15} />, editor.isActive('bulletList'), () =>
              chain().toggleBulletList().run(),
            )}
            {tool('Numbered list', <ListOrdered size={15} />, editor.isActive('orderedList'), () =>
              chain().toggleOrderedList().run(),
            )}
            {tool('Checklist', <ListChecks size={15} />, editor.isActive('taskList'), () =>
              chain().toggleTaskList().run(),
            )}
            {tool('Quote', <Quote size={14} />, editor.isActive('blockquote'), () =>
              chain().toggleBlockquote().run(),
            )}
            {tool('Table', <TableIcon size={14} />, editor.isActive('table'), () =>
              chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
            )}
            {tool('Strikethrough', <Strikethrough size={14} />, editor.isActive('strike'), () =>
              chain().toggleStrike().run(),
            )}
            {tool('Code', <Code size={14} />, editor.isActive('code'), () =>
              chain().toggleCode().run(),
            )}
            {tool('Divider', <Minus size={14} />, false, () => chain().setHorizontalRule().run())}
            {tool('Undo', <Undo2 size={14} />, false, () => chain().undo().run())}
            {tool('Redo', <Redo2 size={14} />, false, () => chain().redo().run())}
          </span>
        )}
        <span className="doc-meta">
          {locked ? 'Kept current by the space’s agent' : state === 'saving' ? 'Saving…' : 'Saved'}
          {by ? ` · ${by.name}, ${ago(page.updatedAt)}` : ''}
        </span>
        <button
          aria-expanded={!!revisions}
          onClick={() =>
            revisions
              ? setRevisions(null)
              : void api<Revision[]>(`/resources/${page.id}/revisions`).then(setRevisions, () =>
                  setRevisions([]),
                )
          }
        >
          <History size={13} /> History
        </button>
      </div>
      {revisions && (
        <ol className="revisions">
          {revisions.length === 0 && <li>No earlier versions.</li>}
          {revisions.slice(0, 5).map((r) => (
            <li key={r.id}>
              <strong>{user(r.authorId)?.name ?? 'Someone'}</strong> ·{' '}
              {new Date(r.createdAt).toLocaleString()}
              <span>
                {r.body
                  .replace(/[#*_`>|-]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .slice(0, 120)}
              </span>
              {!locked && (
                <button
                  className="link"
                  onClick={() => {
                    editor?.commands.setContent(r.body, true);
                    setRevisions(null);
                    notify('Restored that version.');
                  }}
                >
                  Restore this version
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="doc-sheet" ref={sheet}>
        {lit && <div className="spot-band" style={lit} aria-hidden />}
        {previewBand && <div className="spot-band preview" style={previewBand} aria-hidden />}
        <div className="doc-text">
          <EditorContent editor={editor} className="markdown reader-body" />
          {slash && offered.length > 0 && (
            <div
              className="slash"
              style={{ top: slash.top, left: slash.left }}
              role="listbox"
              aria-label="Insert"
            >
              {offered.map((b, i) => (
                <button
                  key={b.label}
                  role="option"
                  aria-selected={i === slash.at}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(b)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {selection && !draft && (
            <div
              className="select-tools"
              style={{ top: selection.top - 42, left: selection.left }}
              role="toolbar"
              aria-label="For the selected text"
            >
              {!locked && (
                <>
                  <button
                    aria-label="Bold"
                    aria-pressed={editor?.isActive('bold')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chain().toggleBold().run()}
                  >
                    <Bold size={13} />
                  </button>
                  <button
                    aria-label="Italic"
                    aria-pressed={editor?.isActive('italic')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chain().toggleItalic().run()}
                  >
                    <Italic size={13} />
                  </button>
                  <button
                    aria-label="Strikethrough"
                    aria-pressed={editor?.isActive('strike')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chain().toggleStrike().run()}
                  >
                    <Strikethrough size={13} />
                  </button>
                  <button
                    aria-label="Code"
                    aria-pressed={editor?.isActive('code')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chain().toggleCode().run()}
                  >
                    <Code size={13} />
                  </button>
                  <i />
                </>
              )}
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => begin('comment')}>
                <MessageSquarePlus size={13} /> Comment
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                title="Ask your own agent about this. Only you see the answer."
                onClick={() => {
                  if (!selection) return;
                  setUi({
                    asking: { resourceId: page.id, quote: selection.quote },
                    railOpen: true,
                  });
                  setSelection(null);
                }}
              >
                <Sparkles size={13} /> Ask an agent
              </button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => void highlight()}>
                <Highlighter size={13} /> Highlight
              </button>
            </div>
          )}
        </div>
        <div className="doc-feed">
          <PageFeed page={page} />
        </div>
        <aside className="doc-margin" aria-label="Comments">
          {resolved.length > 0 && (
            <button className="link resolved-toggle" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
            </button>
          )}
          {draft && (
            <form
              className="comment drafting"
              style={stack ? undefined : { top: draft.top - 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                void submitDraft();
              }}
            >
              <p className="comment-quote">“{draft.quote.slice(0, 90)}”</p>
              {projectAgents.length > 0 && (
                <Choice
                  label="Ask an agent to answer here"
                  value={draftAgent}
                  options={[
                    ['', 'Just a comment'],
                    ...projectAgents.map(
                      (a) => [a.id, `Ask ${a.name} to answer here · everyone sees it`] as const,
                    ),
                  ]}
                  onChange={setDraftAgent}
                />
              )}
              <textarea
                autoFocus
                rows={2}
                value={draftText}
                placeholder={draft.mode === 'ask' ? 'What should it do with this?' : 'Comment'}
                aria-label={draft.mode === 'ask' ? 'What should the agent do' : 'Comment'}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), void submitDraft());
                  if (e.key === 'Escape') setDraft(null);
                }}
              />
              <div className="comment-foot">
                <button type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button className="primary" type="submit" disabled={!draftText.trim()}>
                  {draft.mode === 'ask' ? 'Ask' : 'Comment'}
                </button>
              </div>
            </form>
          )}
          {shown.map(card)}
        </aside>
      </div>
    </div>
  );
}
