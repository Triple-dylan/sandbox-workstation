import { useState } from 'react';
import { ChevronDown, Lock, Pin, Plus, Search, Share2, Users } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { isPage } from '../../shared/types.ts';
import type { Conversation, Resource, User } from '../../shared/types.ts';
import { KindIcon, chatTitle, mentionsIn, unreadIn } from './util.tsx';
import { sameTarget, useWorkspace, type MenuItem, type Target } from './workspace.tsx';
import { DRAG, atWork, waitingOn } from './scope.ts';
import { seenAt } from './saved.ts';
import { agentChat, talkTo } from './agentChat.ts';
import {
  JoinWorkspace,
  NewAgent,
  NewChannel,
  NewPage,
  NewWorkspace,
  PeoplePanel,
} from './ListForms.tsx';

/** How many recent pages the list shows before "Show all". Pinned pages always show. */
const RECENT = 8;

/**
 * The list on the left, in three parts: chats, pages and agents. Everything you can add starts
 * from the one "New" button at the top; people live behind the workspace's member count.
 */
export function Sidebar() {
  const ws = useWorkspace();
  const { s, ui, setUi, space, open, run, user, resource, pick, notify, menu } = ws;
  const [joining, setJoining] = useState<'space' | 'join' | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
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
  // The workspace's own agent first: it is the one to ask about anything here.
  const agents = [
    ...members
      .filter((u) => u.kind === 'agent' && u.role === 'project')
      .sort((a, b) => Number(b.id === space.agentId) - Number(a.id === space.agentId)),
    ...mine,
  ];
  const overview = s.resources.find(
    (r) => r.spaceId === space.id && r.role === 'orientation' && !r.archived,
  );

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
    const watched = s.watches
      .filter((w) => w.agentId === a.id)
      .map((w) => resource(w.resourceId)?.title)
      .filter(Boolean);
    if (watched.length)
      return `watching ${watched[0]}${watched.length > 1 ? ` +${watched.length - 1}` : ''}`;
    return '';
  };

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
        {mentionsIn(c, s) > 0 ? (
          <b className="count mention" title="You were mentioned">
            @{unread}
          </b>
        ) : (
          unread > 0 && <b className="count">{unread}</b>
        )}
      </button>
    );
  };

  const agentRow = (a: User) => {
    const status = agentStatus(a);
    return (
      <button
        key={a.id}
        className="list-row agent"
        aria-current={
          isOpen({ type: 'who', id: a.id }) ||
          (agentChat(s, a) && isOpen({ type: 'chat', id: agentChat(s, a)!.id }))
            ? 'page'
            : undefined
        }
        title={`${a.name} · ${a.id === space.agentId ? `${space.name}'s own agent: ask it anything here` : a.role === 'personal' ? 'private to you' : `shared with ${space.name}`}`}
        onClick={(e) => void talkTo(ws, a, beside(e))}
        onContextMenu={(e) =>
          menu(e, [
            { label: `Chat with ${a.name}`, run: () => void talkTo(ws, a) },
            { label: 'Settings', run: () => open({ type: 'who', id: a.id }, true) },
          ])
        }
      >
        <Character
          agent={a}
          size={18}
          state={status && !status.startsWith('watching') ? 'working' : agentState(a.id, s.jobs)}
        />
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

  // Each part of the list adds its own kind of thing, with a + that shows on hover.
  const heading = (title: string, add: string, run: () => void) => (
    <h2 className="list-head">
      {title}
      <button aria-label={add} title={add} onClick={run}>
        <Plus size={14} />
      </button>
    </h2>
  );

  return (
    <nav className="sidebar" aria-label="Space">
      <div className="space-head">
        <button
          className="space-name"
          aria-label={`${space.name}. Switch workspace`}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            menu({ clientX: r.left, clientY: r.bottom + 4, preventDefault: () => {} }, [
              ...s.spaces.map((x) => ({
                label: x.kind === 'personal' ? 'Your space' : x.name,
                checked: x.id === space.id,
                run: () =>
                  x.id !== space.id &&
                  setUi({ spaceId: x.id, panes: [], active: 0, selection: [] }),
              })),
              'line',
              ...(s.mayStartWorkspace !== false
                ? [{ label: 'New workspace', run: () => setJoining('space') }]
                : []),
              { label: 'Join with a link', run: () => setJoining('join') },
            ] satisfies MenuItem[]);
          }}
        >
          <strong className="truncate">
            {space.kind === 'personal' ? 'Your space' : space.name}
          </strong>
          <ChevronDown size={14} />
        </button>
        {shared ? (
          <button
            className="space-people"
            aria-expanded={peopleOpen}
            onClick={() => setPeopleOpen((v) => !v)}
          >
            <Users size={12} /> {people.length} {people.length === 1 ? 'person' : 'people'}
          </button>
        ) : (
          <span className="space-people">
            <Lock size={12} /> Only you
          </span>
        )}
        {peopleOpen && shared && <PeoplePanel onClose={() => setPeopleOpen(false)} />}
        {joining === 'space' && <NewWorkspace onClose={() => setJoining(null)} />}
        {joining === 'join' && <JoinWorkspace onClose={() => setJoining(null)} />}
        <div className="list-tools">
          <button
            className="list-find"
            onClick={() => pick({ title: 'Find', chats: true, onPick: (t) => open(t) })}
          >
            <Search size={14} /> <span>Find anything</span> <kbd>⌘K</kbd>
          </button>
          <button
            className="list-graph"
            aria-label="Graph"
            title="Graph: everything in this space (Alt G)"
            aria-pressed={isOpen({ type: 'graph' })}
            onClick={(e) => open({ type: 'graph' }, beside(e))}
          >
            <Share2 size={15} />
          </button>
        </div>
      </div>

      <div className="list-scroll">
        {shared && (
          <>
            {heading('Chats', 'New channel', () => setUi({ making: 'channel' }))}
            {ui.making === 'channel' && <NewChannel />}
            {chats.map(chatRow)}
          </>
        )}

        {heading('Pages', 'New page', () => setUi({ creating: true }))}
        {ui.creating && <NewPage />}
        {overview && pageRow(overview)}
        {pinned.map(pageRow)}
        {shownRecent.map(pageRow)}
        {pages.length === 0 && !ui.creating && (
          <button className="list-row quiet" onClick={() => setUi({ creating: true })}>
            <Plus size={14} /> Make the first page
          </button>
        )}
        {recent.length > RECENT && (
          <button className="list-row quiet" onClick={() => setAll((v) => !v)}>
            {all ? 'Show recent only' : `Show all ${pages.length}`}
          </button>
        )}

        {heading('Agents', 'New agent', () => setUi({ making: 'agent' }))}
        {ui.making === 'agent' && <NewAgent />}
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
