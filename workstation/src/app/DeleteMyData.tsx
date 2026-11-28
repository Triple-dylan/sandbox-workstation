import { useState } from 'react';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';

/**
 * Settings: a person deletes their data. A second step asks them to type their name, says what
 * goes and what stays, and the server refuses while they started a workspace others are still in.
 */
export function DeleteMyData() {
  const { s, notify } = useWorkspace();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const name = s.me.name;
  const ready = typed.trim() === name && !busy;
  const destroy = () => {
    if (!ready) return;
    setBusy(true);
    void api('/me/delete', { body: { confirm: typed } }).then(
      () => location.reload(),
      (e) => (setBusy(false), notify((e as Error).message)),
    );
  };
  return (
    <div className="setting stack">
      <span>Delete my data</span>
      {asking ? (
        <>
          <small>
            Your own space, your agents, every message you wrote and your private pages go now, for
            good, and you are signed out everywhere. Pages you shared with a workspace stay with it,
            shown as Deleted person. Type your name to delete it all.
          </small>
          <span className="link-out">
            <input
              autoFocus
              value={typed}
              placeholder={name}
              aria-label="Type your name to delete your data"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') destroy();
                if (e.key === 'Escape') (e.stopPropagation(), setAsking(false));
              }}
            />
            <button className="plain" onClick={() => setAsking(false)}>
              Keep
            </button>
            <button className="danger" disabled={!ready} onClick={destroy}>
              Delete
            </button>
          </span>
        </>
      ) : (
        <button className="plain" onClick={() => (setTyped(''), setAsking(true))}>
          Delete my data…
        </button>
      )}
    </div>
  );
}
