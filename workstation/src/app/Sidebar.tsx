import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Lock,
  LogOut,
  Moon,
  Plus,
  Search,
  Share2,
  Sun,
  SunMoon,
  Users,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { isPage } from '../../shared/types.ts';
import type { Resource, User } from '../../shared/types.ts';
import { KindIcon, chatTitle, unreadIn } from './util.tsx';
import { sameTarget, useWorkspace, type Target } from './workspace.tsx';
import { waitingOn } from './scope.ts';
import { seenAt } from './saved.ts';

/** The one list on the left: the space, its pages by folder, its channels, and who is in it. */
export function Sidebar() {
  const { s, ui, setUi, space, open, run, user, resource, pick, notify } = useWorkspace();
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState<'space' | 'channel' | 'agent' | 'person' | 'folder' | null>(
    null,
  );
  const [draft, setDraft] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const isOpen = (t: Target) => ui.panes.some((p) => sameTarget(p, t));
  const shared = space.kind === 'project';

  const items = s.resources.filter((r) => r.spaceId === space.id);
  const folders = items.filter((r) => r.kind === 'folder');
  const pages = items.filter((r) => isPage(r.kind));
  const folderIds = new Set(folders.map((f) => f.id));
  const inFolder = (id: string | null) =>
    pages.filter((p) => (p.parentId && folderIds.has(p.parentId) ? p.parentId : null) === id);

  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
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
  const outsiders = s.users.filter(
    (u) =>
      u.kind === 'human' && !s.members.some((m) => m.spaceId === space.id && m.userId === u.id),
  );

  const where = (person: User) => {
    if (person.kind === 'agent') {
      const job = s.jobs.find(
        (j) => j.agentId === person.id && (j.status === 'running' || j.status === 'queued'),
      );
      if (job)
        return `working${resource(job.targetResourceId) ? ` in ${resource(job.targetResourceId)!.title}` : ''}`;
      if (agentState(person.id, s.jobs) === 'waiting') return 'waiting for a yes';
      return person.role === 'personal' ? 'only you' : '';
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
        aria-current={opened ? 'page' : undefined}
        onClick={(e) => open({ type: 'page', id: p.id }, e.metaKey || e.ctrlKey || e.altKey)}
        title={`${p.title}${p.visibility === 'private' && shared ? ' · only you' : ''}${changed ? ` · changed by ${user(p.updatedBy)?.name ?? 'someone'}` : ''}${waiting ? ` · ${waiting} waiting on you` : ''}\nAlt-click to open beside`}
      >
        <KindIcon kind={p.kind} />
        <span className="truncate">{p.title}</span>
        {p.visibility === 'private' && shared && (
          <small className="only">
            <Lock size={10} /> {p.grants?.length ? `you +${p.grants.length}` : 'only you'}
          </small>
        )}
        {waiting > 0 && <b className="count">{waiting}</b>}
      </button>
    );
  };
  const themeIcon =
    ui.theme === 'dark' ? (
      <Moon size={14} />
    ) : ui.theme === 'light' ? (
      <Sun size={14} />
    ) : (
      <SunMoon size={14} />
    );

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
            <button
              role="menuitem"
              onClick={() => {
                setSwitching(false);
                setAdding('space');
              }}
            >
              <Plus size={12} /> New shared space
            </button>
          </div>
        )}
        {form('space', 'Name the shared space')}
      </div>

      <div className="list-scroll">
        <button
          className="list-row"
          aria-current={isOpen({ type: 'graph' }) ? 'page' : undefined}
          onClick={() => open({ type: 'graph' })}
        >
          <Share2 size={14} /> <span>Graph</span>
        </button>
        <h2>
          Pages
          <span>
            <button aria-label="New folder" title="New folder" onClick={() => setAdding('folder')}>
              <KindIcon kind="folder" size={13} />
            </button>
            <button
              aria-label="New page"
              title="New page"
              onClick={() => setUi({ creating: true })}
            >
              <Plus size={14} />
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
          const shut = closed[f.id];
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
        {inFolder(null)
          .filter((p) => p.role === 'orientation')
          .map(pageRow)}
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
            {channels.map((c) => {
              const unread = unreadIn(c, s);
              return (
                <button
                  key={c.id}
                  className={`list-row ${unread ? 'unread' : ''}`}
                  aria-current={isOpen({ type: 'chat', id: c.id }) ? 'page' : undefined}
                  onClick={(e) =>
                    open({ type: 'chat', id: c.id }, e.metaKey || e.ctrlKey || e.altKey)
                  }
                >
                  <KindIcon kind="channel" />
                  <span className="truncate">{chatTitle(c, s)}</span>
                  {unread > 0 && <b className="count">{unread}</b>}
                </button>
              );
            })}
          </>
        )}

        <h2>
          {shared ? 'People and agents' : 'Your agents'}
          <span>
            {shared && outsiders.length > 0 && (
              <button
                aria-label="Add a person"
                title="Add a person"
                onClick={() => setAdding('person')}
              >
                <Users size={13} />
              </button>
            )}
            <button aria-label="New agent" title="New agent" onClick={() => setAdding('agent')}>
              <Plus size={14} />
            </button>
          </span>
        </h2>
        {form('agent', shared ? 'Name an agent for this space' : 'Name your new agent')}
        {adding === 'person' && (
          <div className="list-form people">
            {outsiders.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setAdding(null);
                  void run(() =>
                    api(`/projects/${space.id}/members`, { body: { userId: p.id } }),
                  ).then((ok) => ok && notify(`${p.name} can now open ${space.name}.`));
                }}
              >
                <Actor user={p} jobs={s.jobs} size={18} /> Add {p.name}
              </button>
            ))}
            <button onClick={() => setAdding(null)}>Cancel</button>
          </div>
        )}
        {shared &&
          people.map((p) => {
            const dm = dmWith(p);
            const unread = dm ? unreadIn(dm, s) : 0;
            const online = s.presence.some((x) => x.userId === p.id && x.online);
            return (
              <button
                key={p.id}
                className={`list-row person ${unread ? 'unread' : ''}`}
                aria-current={dm && isOpen({ type: 'chat', id: dm.id }) ? 'page' : undefined}
                title={`Message ${p.name}`}
                onClick={async (e) => {
                  const beside = e.metaKey || e.ctrlKey || e.altKey;
                  const chat =
                    dm ??
                    (await run(() => api<{ id: string }>('/dms', { body: { userId: p.id } })));
                  if (chat) open({ type: 'chat', id: chat.id }, beside);
                }}
              >
                <span className={`dot-wrap ${online ? 'online' : ''}`}>
                  <Actor user={p} jobs={s.jobs} size={20} />
                </span>
                <span className="truncate">{p.name}</span>
                <small className="truncate">{where(p)}</small>
                {unread > 0 && <b className="count">{unread}</b>}
              </button>
            );
          })}
        {agents.map((a) => (
          <button
            key={a.id}
            className="list-row person"
            aria-current={isOpen({ type: 'who', id: a.id }) ? 'page' : undefined}
            onClick={(e) => open({ type: 'who', id: a.id }, e.metaKey || e.ctrlKey || e.altKey)}
          >
            <Character agent={a} size={20} state={agentState(a.id, s.jobs)} />
            <span className="truncate">{a.name}</span>
            <small className="truncate">{where(a)}</small>
          </button>
        ))}
      </div>

      <div className="list-foot">
        <button
          className="list-row"
          onClick={() => pick({ title: 'Find', chats: true, onPick: (t) => open(t) })}
        >
          <Search size={14} /> <span>Find</span> <kbd>⌘K</kbd>
        </button>
        <button className="list-row" onClick={() => setUi({ creating: true })}>
          <Plus size={14} /> <span>New page</span>
        </button>
        <div className="me">
          <Actor user={s.me} jobs={s.jobs} size={22} />
          <span className="truncate">{s.me.name}</span>
          <button
            aria-label={`Theme: ${ui.theme}. Change`}
            title={`Theme: ${ui.theme}`}
            onClick={() =>
              setUi({
                theme: ui.theme === 'system' ? 'light' : ui.theme === 'light' ? 'dark' : 'system',
              })
            }
          >
            {themeIcon}
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
