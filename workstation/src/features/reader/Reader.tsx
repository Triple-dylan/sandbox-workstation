import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  History,
  Italic,
  LayoutGrid,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  MessageSquareText,
  Quote,
  Users,
  X,
} from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { boardSpot } from '../canvas/Canvas.tsx';

type Revision = { id: string; authorId: string; body: string; createdAt: string };

/**
 * A document, edited in place. It is always editable and saves as you type; the stored form stays
 * Markdown, so agents and history read the same text people see.
 */
export function Reader({ resourceId }: { resourceId: string }) {
  const { s, space, setUi, resource, user, run, discuss } = useWorkspace();
  const item = resource(resourceId);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [state, setState] = useState<'saved' | 'saving'>('saved');
  const locked = item?.role === 'orientation';
  const saved = useRef(item?.body ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    pending.current = null;
    if (body === null || body === saved.current) return setState('saved');
    saved.current = body;
    void run(() => api(`/resources/${resourceId}`, { method: 'PATCH', body: { body } })).then(() =>
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
    ],
    content: item?.body ?? '',
    editable: !locked,
    onUpdate: ({ editor }) => {
      pending.current = editor.storage.markdown.getMarkdown();
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
  });
  // Save whatever is unsent when the document closes.
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Someone else's change (a teammate, an agent) appears unless you are in the middle of typing.
  useEffect(() => {
    if (!editor || !item) return;
    if (item.body === saved.current || pending.current !== null || editor.isFocused) return;
    saved.current = item.body;
    editor.commands.setContent(item.body, false);
  }, [item?.body, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const close = () => {
    flush();
    setUi({ readerId: null, wide: false });
  };
  const place = () => {
    const spot = boardSpot(s, item.spaceId, { width: 288, height: 120 });
    if (!spot) return;
    void run(() => api(`/resources/${item.id}`, { method: 'PATCH', body: { placement: spot } }));
    setUi({ surface: 'canvas', wide: true });
  };
  const by = user(item.updatedBy);
  const tool = (label: string, icon: React.ReactNode, active: boolean, act: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={act}
    >
      {icon}
    </button>
  );
  const chain = () => editor!.chain().focus();
  return (
    <article className="reader" aria-label={item.title}>
      <header>
        <input
          className="reader-title"
          defaultValue={item.title}
          key={item.title}
          readOnly={locked}
          aria-label="Title"
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== item.title)
              void run(() => api(`/resources/${item.id}`, { method: 'PATCH', body: { title } }));
          }}
          onKeyDown={(e) => e.key === 'Enter' && editor?.commands.focus('start')}
        />
        <button aria-label="Close reader" onClick={close}>
          <X size={15} />
        </button>
      </header>
      <p className="reader-meta">
        {locked ? 'Kept current by the project agent · ' : ''}
        {item.visibility === 'private' ? 'Only you' : `Shared with ${space.name}`}
        {by ? ` · last edited by ${by.name}` : ''}
        {!locked && (
          <span className="reader-state"> · {state === 'saving' ? 'Saving…' : 'Saved'}</span>
        )}
      </p>
      <div className="reader-tools" role="toolbar" aria-label="Document actions">
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
          </span>
        )}
        <span className="reader-actions">
          <button onClick={() => discuss(item.id)}>
            <MessageSquareText size={13} /> Discuss
          </button>
          {!item.placement && (
            <button onClick={place}>
              <LayoutGrid size={13} /> Put on the board
            </button>
          )}
          {space.kind === 'project' && item.ownerId === s.me.id && !item.role && (
            <button
              onClick={() =>
                void run(() =>
                  api(`/resources/${item.id}`, {
                    method: 'PATCH',
                    body: { visibility: item.visibility === 'private' ? 'space' : 'private' },
                  }),
                )
              }
            >
              {item.visibility === 'private' ? <Users size={13} /> : <Lock size={13} />}
              {item.visibility === 'private' ? 'Share' : 'Make private'}
            </button>
          )}
          <button
            onClick={() =>
              revisions
                ? setRevisions(null)
                : void api<Revision[]>(`/resources/${item.id}/revisions`).then(setRevisions, () =>
                    setRevisions([]),
                  )
            }
            aria-expanded={!!revisions}
          >
            <History size={13} /> History
          </button>
        </span>
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
                  }}
                >
                  Restore this version
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <EditorContent editor={editor} className="markdown reader-body" />
    </article>
  );
}
