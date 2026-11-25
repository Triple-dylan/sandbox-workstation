import { useState } from 'react';
import { inviteFrom } from './invite.ts';
import { ChevronDown, Link2, Lock, Map as MapIcon, Pin, Plus, Search, Users } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { isPage } from '../../shared/types.ts';
import type { Conversation, Resource, User } from '../../shared/types.ts';
import { KindIcon, chatTitle, unreadIn } from './util.tsx';
import { sameTarget, useWorkspace, type MenuItem, type Target } from './workspace.tsx';
import { DRAG, atWork, waitingOn } from './scope.ts';
import { seenAt } from './saved.ts';

/** How many recent pages the list shows before "Show all". Pinned pages always show. */
const RECENT = 8;

/**
 * The list on the left, in three parts: chats, pages and agents. Everything you can add starts
 * from the one "New" button at the top; people live behind the workspace's member count.
 */
export function Sidebar() {
  const { s, ui, setUi, space, open, run, user, resource, pick, notify, menu, chooseFiles } =
    useWorkspace();
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState<'space' | 'join' | 'channel' | null>(null);
  const [draft, setDraft] = useState('');
  const [all, setAll] = useState(false);
  const isOpen = (t: Target) => ui.panes.some((p) => sameTarget(p, t));
  const shared = space.kind === 'project';
  const beside = (e: React.MouseEvent) => e.metaKey || e.ctrlKey || e.altKey;

  const pages = s.resources.filter(
    (r) => r.spaceId === space.id && isPage(r.kind) && !r.archived && r.role !== 'orientation',
  );
  const pinned = pages.filter((p) => p.pinned);
  const recent = pages
    .filter((p) => !p.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // The page you are on always shows, even when it is not among the most recent.
  const shownRecent = all
    ? recent
    : recent.filter((p, i) => i < RECENT || isOpen({ type: 'page', id: p.id }));

  const members = s.members
    .filter((m) => m.spaceId === space.id)
    .map((m) => user(m.userId))
    .filter((u): u is User => !!u && !u.retired);
  const people = members.filter((u) => u.kind === 'human');
  const mine = s.users.filter(
    (u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === s.me.id && !u.retired,
  );
  const agents = [...members.filter((u) => u.kind === 'agent' && u.role === 'project'), ...mine];

  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
  const main = channels.find((c) => c.title === 'general');
  const dms = shared
    ? s.conversations.filter(
        (c) =>
          c.kind === 'dm' &&
          c.participantIds.some((id) => id !== s.me.id && people.some((p) => p.id === id)),
      )
    : [];
  const chats = [
    ...(main ? [main] : []),
    ...channels.filter((c) => c.id !== main?.id).sort((a, b) => a.title.localeCompare(b.title)),
    ...dms,
  ];
  const previewing =
    ui.preview && 'conversationId' in ui.preview ? ui.preview.conversationId : null;

  const agentStatus = (a: User) => {
    const job = s.activity.find((x) => x.agentId === a.id && x.status === 'working');
    if (job) {
      const page = resource(job.resourceId);
      return page ? `in ${page.title}` : 'working';
    }
    if (agentState(a.id, s.jobs) === 'waiting') return 'needs a yes';
    return '';
  };

  const submit = async () => {
    const name = draft.trim();
    if (!name || !adding) return;
    setDraft('');
    const kind = adding;
    setAdding(null);
    if (kind === 'space') {
      const made = await run(() => api<{ id: string }>('/projects', { body: { name } }));
      if (made) setUi({ spaceId: made.id, panes: [], active: 0 });
    } else if (kind === 'join') {
      const token = inviteFrom(name);
      if (!token) return notify('That does not look like an invite link.');
      const joined = await run(() =>
        api<{ id: string; name: string }>('/invites/accept', { body: { token } }),
      );
      if (joined) {
        setUi({ spaceId: joined.id, panes: [], active: 0 });
        notify(`You joined ${joined.name}.`);
      }
    } else {
      const made = await run(() =>
        api<{ id: string }>('/channels', { body: { spaceId: space.id, title: name } }),
      );
      if (made) open({ type: 'chat', id: made.id });
    }
  };
  const form = (kind: NonNullable<typeof adding>, placeholder: string) =>
    adding === kind && (
      <form
        className="list-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
          onBlur={() => !draft.trim() && setAdding(null)}
        />
      </form>
    );

  const newMenu = (e: React.MouseEvent) =>
    menu(e, [
      { label: 'Page', run: () => setUi({ creating: true }) },
      { label: 'File from your computer', run: chooseFiles },
      { label: 'Pasted text', run: () => setUi({ dialog: 'paste' }) },
      'line',
      ...(shared
        ? [
            { label: 'Channel', run: () => setAdding('channel') },
            { label: 'Agent', run: () => setUi({ dialog: 'agent' }) },
            { label: 'Invite people', run: () => setUi({ dialog: 'people' }) },
          ]
        : [{ label: 'Agent', run: () => setUi({ dialog: 'agent' }) }]),
    ] satisfies MenuItem[]);

  const patchPage = (p: Resource, body: Record<string, unknown>) =>
    run(() => api(`/resources/${p.id}`, { method: 'PATCH', body }));

  const pageRow = (p: Resource) => {
    const opened = isOpen({ type: 'page', id: p.id });
    const waiting = waitingOn(s, p);
    // Changed by someone else since you last looked: the title goes bold, like an unread channel.
    const changed = !opened && p.updatedBy !== s.me.id && p.updatedAt > seenAt(p.id);
    return (
      <button
        key={p.id}
        className={`list-row ${changed ? 'unread' : ''}`}
        draggable
        onDragStart={(e) =>
          e.dataTransfer.setData(DRAG, JSON.stringify({ type: 'page', id: p.id }))
        }
        aria-current={opened ? 'page' : undefined}
        onClick={(e) => open({ type: 'page', id: p.id }, beside(e))}
        onContextMenu={(e) =>
          menu(e, [
            { label: 'Open', run: () => open({ type: 'page', id: p.id }) },
            { label: 'Open beside', run: () => open({ type: 'page', id: p.id }, true) },
            'line',
            {
              label: p.pinned ? 'Unpin' : 'Pin for everyone and their agents',
              run: () => void patchPage(p, { pinned: !p.pinned }),
            },
            {
              label: 'Archive',
              run: () =>
                void patchPage(p, { archived: true }).then(() =>
                  notify(`“${p.title}” is in the archive. Find it on the map.`),
                ),
            },
          ])
        }
        title={`${p.title}${p.pinned ? ' · pinned: every agent here reads it' : ''}${p.visibility === 'private' && shared ? ' · only you' : ''}${changed ? ` · changed by ${user(p.updatedBy)?.name ?? 'someone'}` : ''}${waiting ? ` · ${waiting} waiting on you` : ''}`}
      >
        {p.pinned ? <Pin size={14} aria-label="Pinned" /> : <KindIcon kind={p.kind} />}
        <span className="truncate">{p.title}</span>
        {p.visibility === 'private' && shared && (
          <small className="only">
            <Lock size={10} /> {p.grants?.length ? `you +${p.grants.length}` : 'only you'}
          </small>
        )}
        {atWork(s, { resourceId: p.id }).map((a) => (
          <span key={a.id} className="row-orb" title={`${a.name} is working here`}>
            <Character agent={a} size={18} state="working" />
          </span>
        ))}
        {waiting > 0 && <b className="count">{waiting}</b>}
      </button>
    );
  };

  const chatRow = (c: Conversation) => {
    const unread = unreadIn(c, s);
    const other = c.kind === 'dm' ? user(c.participantIds.find((id) => id !== s.me.id)!) : null;
    const online = other && s.presence.some((x) => x.userId === other.id && x.online);
    return (
      <button
        key={c.id}
        draggable
        onDragStart={(e) =>
          e.dataTransfer.setData(DRAG, JSON.stringify({ type: 'chat', id: c.id }))
        }
        className={`list-row ${unread ? 'unread' : ''} ${previewing === c.id ? 'share-preview' : ''}`}
        aria-current={isOpen({ type: 'chat', id: c.id }) ? 'page' : undefined}
        onClick={(e) => open({ type: 'chat', id: c.id }, beside(e))}
      >
        {other ? (
          <span className={`dot-wrap ${online ? 'online' : ''}`}>
            <Actor user={other} jobs={s.jobs} size={16} />
          </span>
        ) : (
          <KindIcon kind="channel" />
        )}
        <span className="truncate">{chatTitle(c, s)}</span>
        {unread > 0 && <b className="count">{unread}</b>}
      </button>
    );
  };

  const agentRow = (a: User) => {
    const status = agentStatus(a);
    return (
      <button
        key={a.id}
        className="list-row agent"
        aria-current={isOpen({ type: 'who', id: a.id }) ? 'page' : undefined}
        title={`${a.name} · ${a.role === 'personal' ? 'private to you' : `shared with ${space.name}`}`}
        onClick={(e) => open({ type: 'who', id: a.id }, beside(e))}
      >
        <Character agent={a} size={18} state={status ? 'working' : agentState(a.id, s.jobs)} />
        <span className="truncate">{a.name}</span>
        {status ? (
          <small>{status}</small>
        ) : (
          a.role === 'personal' &&
          shared && (
            <small>
              <Lock size={10} /> you
            </small>
          )
        )}
      </button>
    );
  };

  return (
    <nav className="sidebar" aria-label="Space">
      <div className="space-head">
        <div className="space-top">
          <button
            className="space-name"
            aria-expanded={switching}
            aria-label={`${space.name}. Switch workspace`}
            onClick={() => setSwitching((v) => !v)}
          >
            <strong className="truncate">
              {space.kind === 'personal' ? 'Your space' : space.name}
            </strong>
            <ChevronDown size={14} />
          </button>
          <button className="new" aria-label="New" onClick={newMenu}>
            <Plus size={14} /> New
          </button>
        </div>
        {shared ? (
          <button className="space-people" onClick={() => setUi({ dialog: 'people' })}>
            <Users size={12} /> {people.length} {people.length === 1 ? 'person' : 'people'}
          </button>
        ) : (
          <span className="space-people">
            <Lock size={12} /> Only you
          </span>
        )}
        {switching && (
          <div className="space-menu" role="menu">
            {s.spaces.map((x) => (
              <button
                key={x.id}
                role="menuitemradio"
                aria-checked={x.id === space.id}
                onClick={() => {
                  setSwitching(false);
                  if (x.id !== space.id)
                    setUi({ spaceId: x.id, panes: [], active: 0, selection: [] });
                }}
              >
                {x.kind === 'personal' ? <Lock size={12} /> : <Users size={12} />}
                <span className="truncate">{x.kind === 'personal' ? 'Your space' : x.name}</span>
              </button>
            ))}
            {s.mayStartWorkspace !== false && (
              <button
                role="menuitem"
                onClick={() => {
                  setSwitching(false);
                  setAdding('space');
                }}
              >
                <Plus size={12} /> New workspace
              </button>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setSwitching(false);
                setAdding('join');
              }}
            >
              <Link2 size={12} /> Join with an invite link
            </button>
          </div>
        )}
        {form('space', 'Name the workspace')}
        {form('join', 'Paste an invite link')}
        <button
          className="list-find"
          onClick={() => pick({ title: 'Find', chats: true, onPick: (t) => open(t) })}
        >
          <Search size={14} /> <span>Find anything</span> <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="list-scroll">
        {shared && (
          <>
            <h2>Chats</h2>
            {form('channel', 'Name the channel')}
            {chats.map(chatRow)}
          </>
        )}

        <h2>Pages</h2>
        {pinned.map(pageRow)}
        {shownRecent.map(pageRow)}
        {pages.length === 0 && (
          <button className="list-row quiet" onClick={() => setUi({ creating: true })}>
            <Plus size={14} /> Make the first page
          </button>
        )}
        {recent.length > RECENT && (
          <button className="list-row quiet" onClick={() => setAll((v) => !v)}>
            {all ? 'Show recent only' : `Show all ${pages.length}`}
          </button>
        )}
        {pages.length > 0 && (
          <button
            className="list-row quiet"
            aria-current={isOpen({ type: 'graph' }) ? 'page' : undefined}
            onClick={(e) => open({ type: 'graph' }, beside(e))}
          >
            <MapIcon size={14} /> See as a map
          </button>
        )}

        <h2>Agents</h2>
        {agents.map(agentRow)}
      </div>

      <div className="list-foot">
        <button
          className="me"
          aria-label={`${s.me.name}: settings and sign out`}
          onClick={(e) =>
            menu(e, [
              { label: 'Settings', run: () => setUi({ dialog: 'settings' }) },
              { label: 'Shortcuts', run: () => setUi({ dialog: 'shortcuts' }) },
              'line',
              {
                label: 'Sign out',
                run: () => void api('/logout', { body: {} }).then(() => location.reload()),
              },
            ])
          }
        >
          <Actor user={s.me} jobs={s.jobs} size={22} />
          <span className="truncate">{s.me.name}</span>
        </button>
      </div>
    </nav>
  );
}
