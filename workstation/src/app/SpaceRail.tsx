import { Lock, Plus } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor } from '../features/agents/Character.tsx';
import type { Space } from '../../shared/types.ts';
import { mentionsIn, unreadIn } from './util.tsx';
import { useWorkspace } from './workspace.tsx';

/** A workspace's mark in the thin rail: its first letters. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase() || '?';

/**
 * The thin rail at the far left: your private space, then every workspace you are in. Picking one
 * fills the list beside it with that place's chats, pages and agents.
 */
export function SpaceRail() {
  const { s, space, setUi, menu } = useWorkspace();
  const go = (x: Space) =>
    x.id !== space.id && setUi({ spaceId: x.id, panes: [], active: 0, selection: [] });

  const waiting = (x: Space) => {
    const chats = s.conversations.filter((c) => c.spaceId === x.id);
    return {
      unread: chats.reduce((n, c) => n + unreadIn(c, s), 0),
      mentions: chats.reduce((n, c) => n + mentionsIn(c, s), 0),
    };
  };

  const tile = (x: Space) => {
    const personal = x.kind === 'personal';
    const name = personal ? 'Your space' : x.name;
    const { unread, mentions } = personal ? { unread: 0, mentions: 0 } : waiting(x);
    return (
      <button
        key={x.id}
        className={`space-tile ${personal ? 'private' : ''} ${unread ? 'unread' : ''}`}
        aria-label={`${name}${personal ? ', only you' : ''}${unread ? `, ${unread} unread` : ''}`}
        aria-current={x.id === space.id ? 'true' : undefined}
        title={personal ? 'Your space · only you' : x.name}
        onClick={() => go(x)}
      >
        {personal ? <Lock size={16} /> : <span>{initials(x.name)}</span>}
        {mentions > 0 && <b className="count mention">@{mentions}</b>}
      </button>
    );
  };

  const mine = s.spaces.filter((x) => x.kind === 'personal');
  const workspaces = s.spaces.filter((x) => x.kind !== 'personal');

  return (
    <nav className="space-rail" aria-label="Spaces">
      {mine.map(tile)}
      <div className="space-tiles">{workspaces.map(tile)}</div>
      <button
        className="space-tile add"
        aria-label="New or join a workspace"
        title="New workspace, or join one with a link"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          menu({ clientX: r.right + 6, clientY: r.top, preventDefault: () => {} }, [
            ...(s.mayStartWorkspace !== false
              ? [{ label: 'New workspace', run: () => setUi({ making: 'workspace' }) }]
              : []),
            { label: 'Join with a link', run: () => setUi({ making: 'join' }) },
          ]);
        }}
      >
        <Plus size={16} />
      </button>
      <button
        className="space-me"
        aria-label={`${s.me.name}: settings and sign out`}
        title={s.me.name}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          menu({ clientX: r.right + 6, clientY: r.bottom - 120, preventDefault: () => {} }, [
            { label: 'Settings', run: () => setUi({ dialog: 'settings' }) },
            { label: 'Shortcuts', run: () => setUi({ dialog: 'shortcuts' }) },
            'line',
            {
              label: 'Sign out',
              run: () => void api('/logout', { body: {} }).then(() => location.reload()),
            },
          ]);
        }}
      >
        <Actor user={s.me} jobs={s.jobs} size={26} />
      </button>
    </nav>
  );
}
