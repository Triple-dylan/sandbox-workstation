import { useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { api } from '../data/client.ts';
import { PAGE_KINDS, type PageKind } from '../../shared/types.ts';
import { KindIcon, kindName } from './util.tsx';
import { useWorkspace } from './workspace.tsx';

const blurb: Record<PageKind, string> = {
  doc: 'Writing, notes, briefs',
  sheet: 'Rows, numbers, simple sums',
  deck: 'Slides to present',
  canvas: 'A board to lay things out and connect them',
};

export function NewPage() {
  const { s, space, setUi, run, open } = useWorkspace();
  const [kind, setKind] = useState<PageKind>('doc');
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState('');
  const [mine, setMine] = useState(false);
  const shared = space.kind === 'project';
  const folders = s.resources.filter((r) => r.spaceId === space.id && r.kind === 'folder');
  const close = () => setUi({ creating: false });
  const create = async () => {
    const made = await run(() =>
      api<{ id: string }>('/resources', {
        body: {
          spaceId: space.id,
          kind,
          title: title.trim(),
          body: '',
          parentId: folder || null,
          visibility: mine ? 'private' : 'space',
        },
      }),
    );
    if (made) {
      close();
      open({ type: 'page', id: made.id });
    }
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="new-page"
        role="dialog"
        aria-label="New page"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2>New page</h2>
        <div className="kinds" role="radiogroup" aria-label="Kind of page">
          {PAGE_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
            >
              <KindIcon kind={k} size={18} />
              <strong>{kindName[k]}</strong>
              <small>{blurb[k]}</small>
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={title}
          maxLength={120}
          placeholder="Title"
          aria-label="Title"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="new-row">
          {folders.length > 0 && (
            <select value={folder} aria-label="Folder" onChange={(e) => setFolder(e.target.value)}>
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          )}
          {shared ? (
            <span className="seg" role="radiogroup" aria-label="Who can open it">
              <button
                type="button"
                role="radio"
                aria-checked={!mine}
                onClick={() => setMine(false)}
              >
                <Users size={12} /> Everyone in {space.name}
              </button>
              <button type="button" role="radio" aria-checked={mine} onClick={() => setMine(true)}>
                <Lock size={12} /> Only you
              </button>
            </span>
          ) : (
            <small>
              <Lock size={11} /> Only you can see pages in your own space.
            </small>
          )}
        </div>
        <div className="new-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
