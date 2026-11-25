import { useState } from 'react';
import { inviteFrom } from './invite.ts';
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Lock,
  LogOut,
  Plus,
  Search,
  Share2,
  Upload,
  Settings as Cog,
  Users,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { isPage } from '../../shared/types.ts';
import type { Resource, User } from '../../shared/types.ts';
import { KindIcon, chatTitle, unreadIn } from './util.tsx';
import { sameTarget, useWorkspace, type Target } from './workspace.tsx';
import { DRAG, atWork, waitingOn } from './scope.ts';
import { seenAt } from './saved.ts';

/** The one list on the left: the space, its pages by folder, its channels, and who is in it. */
export function Sidebar() {
  const { s, ui, setUi, space, open, run, user, resource, pick, notify, menu, chooseFiles } =
    useWorkspace();
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState<
    'space' | 'join' | 'channel' | 'agent' | 'person' | 'folder' | null
  >(null);
  const [draft, setDraft] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const isOpen = (t: Target) => ui.panes.some((p) => sameTarget(p, t));
  const shared = space.kind === 'project';

  const items = s.resources.filter((r) => r.spaceId === space.id);
  const folders = items.filter((r) => r.kind === 'folder');
  const pages = items.filter((r) => isPage(r.kind) && !r.archived);
  const folderIds = new Set(folders.map((f) => f.id));
  const inFolder = (id: string | null) =>
    pages.filter((p) => (p.parentId && folderIds.has(p.parentId) ? p.parentId : null) === id);

  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
  const previewing =
    ui.preview && 'conversationId' in ui.preview ? ui.preview.conversationId : null;
  const members = s.members
    .filter((m) => m.spaceId === space.id)
    .map((m) => user(m.userId))
    .filter((u): u is User => !!u && !u.retired);
  const people = members.filter((u) => u.kind === 'human' && u.id !== s.me.id);
  const mine = s.users.filter(
    (u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === s.me.id && !u.retired,
  );
  const agents = [...members.filter((u) => u.kind === 'agent' && u.role === 'project'), ...mine];
  const dmWith = (person: User) =>
    s.conversations.find((c) => c.kind === 'dm' && c.participantIds.includes(person.id));

  // Everyone has a prime agent. Teammates see it beside the person, and see when it is at work.
  const prime = (person: User) =>
    s.users.find((u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === person.id);
  const primeBusy = (person: User) =>
    s.activity.some((a) => a.agentId === prime(person)?.id && a.status === 'working');
  const where = (person: User) => {
    if (person.kind === 'agent') {
      const job = s.activity.find((a) => a.agentId === person.id && a.status === 'working');
      const job2 = job ? { targetResourceId: job.resourceId } : undefined;
      if (job2)
        return `working${resource(job2.targetResourceId) ? ` in ${resource(job2.targetResourceId)!.title}` : ''}`;
      if (agentState(person.id, s.jobs) === 'waiting') return 'waiting for a yes';
      return '';
    }
    const p = s.presence.find((x) => x.userId === person.id && x.online);
    if (!p) return '';
    const page = resource(p.resourceId);
    const chat = s.conversations.find((c) => c.id === p.conversationId);
    if (page) return `in ${page.title}`;
    if (chat?.kind === 'channel') return `in #${chat.title}`;
    return 'here now';
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
    } else if (kind === 'channel') {
      const made = await run(() =>
        api<{ id: string }>('/channels', { body: { spaceId: space.id, title: name } }),
      );
      if (made) open({ type: 'chat', id: made.id });
    } else if (kind === 'folder') {
      await run(() => api('/folders', { body: { spaceId: space.id, title: name } }));
    } else if (kind === 'agent') {
      const made = await run(() =>
        api<{ id: string }>('/agents', { body: { name, spaceId: shared ? space.id : null } }),
      );
      if (made) open({ type: 'who', id: made.id });
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
        onClick={(e) => open({ type: 'page', id: p.id }, e.metaKey || e.ctrlKey || e.altKey)}
        onContextMenu={(e) =>
          menu(e, [
            { label: 'Open', run: () => open({ type: 'page', id: p.id }) },
            { label: 'Open beside', run: () => open({ type: 'page', id: p.id }, true) },
            'line',
            ...folders
              .filter((f) => f.id !== p.parentId && !f.role)
              .slice(0, 5)
              .map((f) => ({
                label: `Move to ${f.title}`,
                run: () =>
                  void run(() =>
                    api(`/resources/${p.id}`, { method: 'PATCH', body: { parentId: f.id } }),
                  ),
              })),
            ...(p.role
              ? []
              : [
                  {
                    label: 'Archive',
                    run: () =>
                      void run(() =>
                        api(`/resources/${p.id}`, { method: 'PATCH', body: { archived: true } }),
                      ).then(() => notify(`“${p.title}” is in the archive. Find it on the graph.`)),
                  },
                ]),
          ])
        }
        title={`${p.title}${p.visibility === 'private' && shared ? ' · only you' : ''}${changed ? ` · changed by ${user(p.updatedBy)?.name ?? 'someone'}` : ''}${waiting ? ` · ${waiting} waiting on you` : ''}\nAlt-click to open beside`}
      >
        <KindIcon kind={p.kind} />
        <span className="truncate">{p.title}</span>
        {p.visibility === 'private' && shared && (
          <small className="only">
            <Lock size={10} /> {p.grants?.length ? `you +${p.grants.length}` : 'only you'}
          </small>
        )}
        {atWork(s, { resourceId: p.id }).map((a) => (
          <span key={a.id} className="row-orb" title={`${a.name} is working here`}>
            <Character agent={a} size={20} state="working" />
          </span>
        ))}
        {waiting > 0 && <b className="count">{waiting}</b>}
      </button>
    );
  };

  // A space's main chat is pinned first, above its pages.
  const main = channels.find((c) => c.title === 'general');
  const channelRow = (c: (typeof channels)[number], pinned = false) => {
    const unread = unreadIn(c, s);
    return (
      <button
        key={c.id}
        draggable
        onDragStart={(e) =>
          e.dataTransfer.setData(DRAG, JSON.stringify({ type: 'chat', id: c.id }))
        }
        className={`list-row ${unread ? 'unread' : ''} ${previewing === c.id ? 'share-preview' : ''}`}
        aria-current={isOpen({ type: 'chat', id: c.id }) ? 'page' : undefined}
        onClick={(e) => open({ type: 'chat', id: c.id }, e.metaKey || e.ctrlKey || e.altKey)}
      >
        <KindIcon kind="channel" />
        <span className="truncate">{chatTitle(c, s)}</span>
        {pinned && !unread && <small className="main-chat">Main chat</small>}
        {unread > 0 && <b className="count">{unread}</b>}
      </button>
    );
  };

  return (
    <nav className="sidebar" aria-label="Space">
      <div className="space-head">
        <button
          className="space-name"
          aria-expanded={switching}
          aria-label={`${space.name}. Switch space`}
          onClick={() => setSwitching((v) => !v)}
        >
          <span className="truncate">
            <strong>{space.kind === 'personal' ? 'Your space' : space.name}</strong>
            <small>
              {shared ? (
                <>
                  <Users size={10} /> Shared · {members.filter((m) => m.kind === 'human').length}{' '}
                  people
                </>
              ) : (
                <>
                  <Lock size={10} /> Only you
                </>
              )}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
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
                    setUi({
                      spaceId: x.id,
                      panes: [],
                      active: 0,
                      selection: [],
                    });
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
        <div className="space-tools">
          <button
            className="find"
            onClick={() => pick({ title: 'Find', chats: true, onPick: (t) => open(t) })}
          >
            <Search size={14} /> <span>Find</span> <kbd>⌘K</kbd>
          </button>
          <button
            aria-label="Graph"
            title="Graph: everything in this space"
            aria-pressed={isOpen({ type: 'graph' })}
            onClick={() => open({ type: 'graph' })}
          >
            <Share2 size={15} />
          </button>
          <button aria-label="New page" title="New page" onClick={() => setUi({ creating: true })}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="list-scroll">
        {shared && main && <div className="list-main">{channelRow(main, true)}</div>}
        <h2>
          Pages
          <span>
            <button
              aria-label="Bring in files"
              title="Bring in files: transcripts, documents, decks, sheets, pictures"
              onClick={chooseFiles}
            >
              <Upload size={13} />
            </button>
            <button aria-label="New folder" title="New folder" onClick={() => setAdding('folder')}>
              <KindIcon kind="folder" size={13} />
            </button>
          </span>
        </h2>
        {form('folder', 'Name the folder')}
        {inFolder(null)
          .filter((p) => p.role !== 'orientation')
          .map(pageRow)}
        {folders.map((f) => {
          const inside = inFolder(f.id);
          // The space's own context folder only shows once something is in it.
          if (f.role && inside.length === 0) return null;
          // Folders stay folded unless they hold the page you are on or something for you.
          const wanted = inside.some(
            (p) =>
              isOpen({ type: 'page', id: p.id }) ||
              waitingOn(s, p) > 0 ||
              atWork(s, { resourceId: p.id }).length > 0,
          );
          const shut = closed[f.id] ?? !wanted;
          return (
            <div key={f.id} className="list-folder">
              <button
                className="list-row folder"
                aria-expanded={!shut}
                onClick={() => setClosed((c) => ({ ...c, [f.id]: !shut }))}
              >
                {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span className="truncate">{f.title}</span>
                <small>{inside.length}</small>
              </button>
              {!shut && inside.map(pageRow)}
            </div>
          );
        })}
        {pages.length === 0 && <p className="list-empty">No pages yet.</p>}

        {shared && (
          <>
            <h2>
              Channels
              <button
                aria-label="New channel"
                title="New channel"
                onClick={() => setAdding('channel')}
              >
                <Plus size={14} />
              </button>
            </h2>
            {form('channel', 'Name the channel')}
            {channels.filter((c) => c.id !== main?.id).map((c) => channelRow(c))}
          </>
        )}

        <h2>
          {shared ? 'Team' : 'Your agents'}
          <span>
            {shared && (
              <button
                aria-label="Invite people"
                title="Invite people"
                onClick={() => setUi({ dialog: 'invite' })}
              >
                <Users size={13} />
              </button>
            )}
            <button
              aria-label="New agent"
              title="New agent"
              onClick={() => setUi({ dialog: 'agent' })}
            >
              <Plus size={14} />
            </button>
          </span>
        </h2>
        {form('agent', shared ? 'Name an agent for this space' : 'Name your new agent')}
        <div className="who-strip" role="list">
          {shared &&
            people.map((p) => {
              const dm = dmWith(p);
              const unread = dm ? unreadIn(dm, s) : 0;
              const online = s.presence.some((x) => x.userId === p.id && x.online);
              const here = where(p);
              return (
                <button
                  key={p.id}
                  role="listitem"
                  className={`who-chip ${online ? 'online' : ''}`}
                  aria-current={dm && isOpen({ type: 'chat', id: dm.id }) ? 'page' : undefined}
                  aria-label={`Message ${p.name}${unread ? `, ${unread} unread` : ''}`}
                  title={`${p.name}${here ? ` · ${here}` : ''}${primeBusy(p) ? ` · ${prime(p)!.name} is working` : ''}`}
                  onClick={async (e) => {
                    const beside = e.metaKey || e.ctrlKey || e.altKey;
                    const chat =
                      dm ??
                      (await run(() => api<{ id: string }>('/dms', { body: { userId: p.id } })));
                    if (chat) open({ type: 'chat', id: chat.id }, beside);
                  }}
                >
                  <Actor user={p} jobs={s.jobs} size={26} />
                  {primeBusy(p) && (
                    <span className="chip-orb">
                      <Character agent={prime(p)!} size={20} state="working" />
                    </span>
                  )}
                  {unread > 0 && <b className="count">{unread}</b>}
                </button>
              );
            })}
          {agents.map((a) => {
            const busy = s.activity.some((x) => x.agentId === a.id && x.status === 'working');
            const here = where(a);
            return (
              <button
                key={a.id}
                role="listitem"
                className={`who-chip agent ${busy ? 'busy' : ''}`}
                aria-current={isOpen({ type: 'who', id: a.id }) ? 'page' : undefined}
                aria-label={a.name}
                title={`${a.name} · ${a.role === 'personal' ? 'private to you' : 'shared'}${here ? ` · ${here}` : ''}`}
                onClick={(e) => open({ type: 'who', id: a.id }, e.metaKey || e.ctrlKey || e.altKey)}
              >
                <Character
                  agent={a}
                  size={26}
                  state={busy ? 'working' : agentState(a.id, s.jobs)}
                />
                {a.role === 'personal' && (
                  <i className="chip-lock">
                    <Lock size={8} />
                  </i>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="list-foot">
        <div className="me">
          <Actor user={s.me} jobs={s.jobs} size={22} />
          <span className="truncate">{s.me.name}</span>
          <button
            aria-label="Settings"
            title="Settings"
            onClick={() => setUi({ dialog: 'settings' })}
          >
            <Cog size={14} />
          </button>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void api('/logout', { body: {} }).then(() => location.reload())}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </nav>
  );
}
