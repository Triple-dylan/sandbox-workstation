import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
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
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { ago } from '../app/util.tsx';
import { Actor, Character, nameStyle } from '../features/agents/Character.tsx';
import { ApprovalCard, MessageView, agentsIn } from '../features/feed/Feed.tsx';
import { PageFeed, usePageFeed } from './PageFeed.tsx';
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
  const { s, run, user, ask, myAgent, notify } = useWorkspace();
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
  const [showResolved, setShowResolved] = useState(false);
  const [tops, setTops] = useState<Record<Id, number>>({});
  const [stack, setStack] = useState(false);
  const [tick, setTick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const saved = useRef(page.body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    pending.current = null;
    if (body === null || body === saved.current) return setState('saved');
    saved.current = body;
    void run(() => api(`/resources/${page.id}`, { method: 'PATCH', body: { body } })).then(() =>
      setState('saved'),
    );
  };
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Write here…' }),
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true }),
      CommentMarks,
    ],
    content: page.body,
    editable: !locked,
    onUpdate: ({ editor }) => {
      pending.current = editor.storage.markdown.getMarkdown();
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
      setTick((t) => t + 1);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (empty || !sheet.current) return setSelection(null);
      const quote = editor.state.doc.textBetween(from, to, '\n').trim();
      if (quote.length < 2) return setSelection(null);
      const box = sheet.current.getBoundingClientRect();
      const start = editor.view.coordsAtPos(from);
      setSelection({
        quote: quote.slice(0, 280),
        top: start.top - box.top,
        left: Math.max(0, Math.min(start.left - box.left, box.width - 300)),
      });
    },
  });
  // Save whatever is unsent when the page closes.
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Someone else's change (a teammate, an accepted suggestion) appears unless you have unsent typing.
  useEffect(() => {
    if (!editor) return;
    if (page.body === saved.current || pending.current !== null) return;
    saved.current = page.body;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(page.body, false);
    if (editor.isFocused) {
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
    const observer = new ResizeObserver(([entry]) => setStack(entry.contentRect.width < 820));
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
    if (mode === 'ask' && draftAgent === 'mine') {
      // Your own agent answers privately, in the bar.
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
  const by = user(page.updatedBy);

  const card = (m: Message) => {
    const author = user(m.authorId);
    const replies = all.filter((x) => x.replyTo === m.id);
    const gone = editor ? !locate(editor.state.doc, m.anchor!.quote) : false;
    const plain = m.text === HIGHLIGHT;
    return (
      <div
        key={m.id}
        data-card={m.id}
        className={`comment ${active === m.id ? 'active' : ''} ${m.resolved ? 'resolved' : ''} ${plain ? 'plain' : ''}`}
        style={stack ? undefined : { top: tops[m.id] ?? 0 }}
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
          {revisions.map((r) => (
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
        <div className="doc-text">
          <EditorContent editor={editor} className="markdown reader-body" />
          {selection && !draft && (
            <div
              className="select-tools"
              style={{ top: selection.top - 42, left: selection.left }}
              role="toolbar"
              aria-label="For the selected text"
            >
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => begin('comment')}>
                <MessageSquarePlus size={13} /> Comment
              </button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => begin('ask')}>
                <Sparkles size={13} /> Ask an agent
              </button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => void highlight()}>
                <Highlighter size={13} /> Highlight
              </button>
            </div>
          )}
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
              {draft.mode === 'ask' && (
                <select
                  value={draftAgent}
                  aria-label="Which agent"
                  onChange={(e) => setDraftAgent(e.target.value)}
                >
                  {myAgent && <option value="mine">{myAgent.name} · answers only to you</option>}
                  {projectAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · everyone on this page sees it
                    </option>
                  ))}
                </select>
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
      <PageFeed page={page} />
    </div>
  );
}
