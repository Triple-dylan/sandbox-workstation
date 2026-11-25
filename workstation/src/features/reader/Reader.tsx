import { useEffect, useState } from 'react';
import { History, LayoutGrid, Lock, MessageSquareText, Pencil, Users, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';

type Revision = { id: string; authorId: string; body: string; createdAt: string };

export function Reader({ resourceId }: { resourceId: string }) {
  const { s, ui, space, setUi, resource, user, run, discuss, openResource } = useWorkspace();
  const item = resource(resourceId);
  const [editing, setEditing] = useState(!!ui.readerDrafts[resourceId]);
  const [title, setTitle] = useState(ui.readerDrafts[resourceId]?.title ?? item?.title ?? '');
  const [body, setBody] = useState(ui.readerDrafts[resourceId]?.body ?? item?.body ?? '');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  useEffect(() => {
    if (!editing && item) {
      setTitle(item.title);
      setBody(item.body);
    }
  }, [item, editing]);
  useEffect(() => {
    if (editing)
      setUi((old) => ({ readerDrafts: { ...old.readerDrafts, [resourceId]: { title, body } } }));
  }, [editing, title, body, resourceId, setUi]);
  const clearDraft = () =>
    setUi((old) => {
      const drafts = { ...old.readerDrafts };
      delete drafts[resourceId];
      return { readerDrafts: drafts };
    });
  if (!item) return null;
  const itemSpace = s.spaces.find((candidate) => candidate.id === item.spaceId);
  const close = () => setUi({ readerId: null });
  if (item.kind === 'folder') {
    const children = s.resources.filter((r) => r.parentId === item.id);
    return (
      <article className="reader" aria-label={item.title}>
        <header>
          <h2>{item.title}</h2>
          <button aria-label="Close reader" onClick={close}>
            <X size={15} />
          </button>
        </header>
        <div className="reader-tools">
          {children.length === 0 && <p>This folder is empty.</p>}
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => {
                if (child.spaceId === space.id)
                  setUi((old) => ({
                    graphFocus: { ...old.graphFocus, [space.id]: child.id },
                  }));
                openResource(child.id);
              }}
            >
              {child.title}
            </button>
          ))}
        </div>
      </article>
    );
  }
  const save = async () => {
    const saved = await run(() =>
      api(`/resources/${item.id}`, { method: 'PATCH', body: { title, body } }),
    );
    if (saved) {
      setEditing(false);
      clearDraft();
    }
  };
  const place = () => {
    setUi({
      surface: 'canvas',
      conversationId: null,
      spaceId: item.spaceId,
      readerId: null,
      selectedId: item.id,
      pendingPlacementId: item.id,
    });
  };
  const editor = user(item.updatedBy);
  return (
    <article className="reader" aria-label={item.title}>
      <header>
        {editing ? (
          <input
            className="reader-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
          />
        ) : (
          <h2>{item.title}</h2>
        )}
        <button aria-label="Close reader" onClick={close}>
          <X size={15} />
        </button>
      </header>
      <p className="reader-meta">
        {item.role === 'orientation' && itemSpace?.kind === 'project'
          ? 'Maintained by the project agent · '
          : ''}
        {item.visibility === 'private'
          ? 'Private'
          : `Shared with ${itemSpace?.name ?? 'the project'}`}
        {editor ? ` · edited by ${editor.name}` : ''}
      </p>
      <div className="reader-tools" role="toolbar" aria-label="Document actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()}>
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                clearDraft();
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </button>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            const body = e.currentTarget.closest('.reader')?.querySelector('.reader-body');
            const selection = window.getSelection();
            const quote =
              body &&
              selection?.anchorNode &&
              selection.focusNode &&
              body.contains(selection.anchorNode) &&
              body.contains(selection.focusNode)
                ? selection.toString().trim().slice(0, 200)
                : undefined;
            discuss(item.id, quote);
          }}
        >
          <MessageSquareText size={13} /> Discuss
        </button>
        {!item.placement && (
          <button onClick={() => void place()}>
            <LayoutGrid size={13} /> Place on canvas
          </button>
        )}
        {itemSpace?.kind === 'project' && item.ownerId === s.me.id && !item.role && (
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
      </div>
      {revisions && (
        <ol className="revisions">
          {revisions.length === 0 && <li>No earlier versions.</li>}
          {revisions.map((r) => (
            <li key={r.id}>
              <strong>{user(r.authorId)?.name ?? 'Someone'}</strong> ·{' '}
              {new Date(r.createdAt).toLocaleString()}
              <span>{r.body.slice(0, 120)}</span>
            </li>
          ))}
        </ol>
      )}
      {editing ? (
        <textarea
          className="reader-edit"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Body"
        />
      ) : (
        <div className="markdown reader-body">
          <Markdown remarkPlugins={[remarkGfm]}>{item.body || '*Empty*'}</Markdown>
        </div>
      )}
    </article>
  );
}
