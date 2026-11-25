import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../data/client.ts';
import { PAGE_KINDS, type PageKind } from '../../shared/types.ts';
import { KindIcon, kindName } from './util.tsx';
import { useWorkspace } from './workspace.tsx';
import { Dialog } from './Dialogs.tsx';

/** Kinds you make here. A file from your computer comes in through "New → File" instead. */
const MADE = PAGE_KINDS.filter((k) => k !== 'asset');

/** A new page: name it, pick its kind, say who can open it, Enter. */
export function NewPage() {
  const { ui, space, setUi, run, open } = useWorkspace();
  const [kind, setKind] = useState<PageKind>(typeof ui.creating === 'string' ? ui.creating : 'doc');
  const [title, setTitle] = useState('');
  const [mine, setMine] = useState(false);
  const shared = space.kind === 'project';
  const close = () => setUi({ creating: false });
  const create = async () => {
    const made = await run(() =>
      api<{ id: string }>('/resources', {
        body: {
          spaceId: space.id,
          kind,
          title: title.trim(),
          body: '',
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
    <Dialog title="New page" bare anchored onClose={close}>
      <form
        className="new-page"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          className="new-title"
          autoFocus
          value={title}
          maxLength={120}
          placeholder={`Untitled ${kindName[kind].toLowerCase()}`}
          aria-label="Title"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="kind-row" role="radiogroup" aria-label="Kind of page">
          {MADE.map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
            >
              <KindIcon kind={k} size={14} /> {kindName[k]}
            </button>
          ))}
        </div>
        <div className="dialog-foot">
          {shared ? (
            <select
              aria-label="Who can open it"
              value={mine ? 'mine' : 'space'}
              onChange={(e) => setMine(e.target.value === 'mine')}
            >
              <option value="space">Everyone in {space.name}</option>
              <option value="mine">Only you</option>
            </select>
          ) : (
            <small>
              <Lock size={11} /> Only you
            </small>
          )}
          <button className="primary" type="submit">
            Create <kbd aria-hidden="true">↵</kbd>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
