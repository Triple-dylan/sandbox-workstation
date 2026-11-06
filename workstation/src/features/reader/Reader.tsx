import { useEffect, useState } from 'react';
import { History, LayoutGrid, Lock, MessageSquareText, Pencil, Users, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { canvasBounds } from '../canvas/Canvas.tsx';
import { freeSpot } from '../canvas/layout.ts';

type Revision = { id: string; authorId: string; body: string; createdAt: string };

export function Reader({ resourceId }: { resourceId: string }) {
  const { s, space, setUi, resource, user, run, discuss } = useWorkspace();
  const item = resource(resourceId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  useEffect(() => {
    if (!editing && item) {
      setTitle(item.title);
      setBody(item.body);
    }
  }, [item, editing]);
  if (!item) return null;
  const close = () => setUi({ readerId: null });
  const save = async () => {
    await run(() => api(`/resources/${item.id}`, { method: 'PATCH', body: { title, body } }));
    setEditing(false);
  };
  const place = () => {
    const others = s.resources
      .filter((r) => r.spaceId === item.spaceId && r.placement && r.id !== item.id)
      .map((r) => r.placement!);
    const spot = freeSpot({ width: 288, height: 120 }, canvasBounds, others);
    if (!spot) return;
    void run(() => api(`/resources/${item.id}`, { method: 'PATCH', body: { placement: spot } }));
    setUi({ surface: 'canvas' });
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
        {item.role === 'orientation' ? 'Maintained by the project agent · ' : ''}
        {item.visibility === 'private' ? 'Private' : `Shared with ${space.name}`}
        {editor ? ` · edited by ${editor.name}` : ''}
      </p>
      <div className="reader-tools" role="toolbar" aria-label="Document actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </button>
        )}
        <button onClick={() => discuss(item.id)}>
          <MessageSquareText size={13} /> Discuss
        </button>
        {!item.placement && item.kind !== 'folder' && (
          <button onClick={place}>
            <LayoutGrid size={13} /> Place on canvas
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
