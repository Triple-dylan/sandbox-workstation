import { nameStyle } from '../features/agents/Character.tsx';
import { useState } from 'react';
import {
  Hash,
  Layers,
  LayoutGrid,
  PanelLeft,
  LogOut,
  MessageSquareText,
  Moon,
  Network,
  Plus,
  Sun,
  Monitor,
  Lock,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';
import { Avatar, Character, agentState } from '../features/agents/Character.tsx';
import { myAgents, projectAgentsOf } from '../features/conversations/audience.ts';
import { CreateSheet } from './CreateSheet.tsx';
import type { Conversation, Space } from '../../shared/types.ts';

export function Rail() {
  const { s, ui, setUi, space, run, openConversation } = useWorkspace();
  const [creating, setCreating] = useState<'project' | 'channel' | null>(null);
  const [name, setName] = useState('');
  const unread = (c: Conversation) => {
    const last = s.lastRead[c.id] ?? '';
    return s.messages.filter(
      (m) => m.conversationId === c.id && m.authorId !== s.me.id && m.createdAt > last,
    ).length;
  };
  const totalUnread = s.conversations.reduce((n, c) => n + unread(c), 0);
  const online = (userId: string) => s.presence.some((p) => p.userId === userId && p.online);
  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
  const discussions = s.conversations.filter(
    (c) =>
      c.kind === 'discussion' &&
      c.spaceId === space.id &&
      s.messages.some((m) => m.conversationId === c.id),
  );
  const people = s.users.filter((u) => u.kind === 'human' && u.id !== s.me.id);
  const mine = myAgents(s);
  const projectAgents = space.kind === 'project' ? projectAgentsOf(s, space.id) : [];
  const roster = [...projectAgents, ...mine.map((m) => m.agent)];
  const agentUnread = (agentId: string) => {
    const own = mine.find((m) => m.agent.id === agentId);
    return own ? unread(own.conversation) : 0;
  };
  const submit = async () => {
    const value = name.trim();
    if (!value) return setCreating(null);
    if (creating === 'project') {
      const created = await run(() => api<Space>('/projects', { body: { name: value } }));
      if (created)
        setUi({
          spaceId: created.id,
          conversationId: null,
          readerId: null,
          selectedId: null,
          nav: false,
        });
    } else if (creating === 'channel') {
      const created = await run(() =>
        api<Conversation>('/channels', { body: { spaceId: space.id, title: value } }),
      );
      if (created) openConversation(created.id);
    }
    setName('');
    setCreating(null);
  };
  const openDm = async (userId: string) => {
    const dm = await run(() => api<Conversation>('/dms', { body: { userId } }));
    if (dm) openConversation(dm.id);
  };
  const Row = ({ c, label, icon }: { c: Conversation; label: string; icon: React.ReactNode }) => {
    const count = unread(c);
    return (
      <button
        className={`rail-row ${ui.conversationId === c.id ? 'active' : ''}`}
        onClick={() => openConversation(c.id)}
      >
        {icon}
        <span className="rail-label">{label}</span>
        {count > 0 && (
          <span className="unread" aria-label={`${count} unread`}>
            {count}
          </span>
        )}
      </button>
    );
  };
  const nameForm = creating && (
    <form
      className="rail-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(e) => e.key === 'Escape' && setCreating(null)}
        placeholder={creating === 'project' ? 'Project name' : 'channel-name'}
        aria-label={creating === 'project' ? 'New project name' : 'New channel name'}
      />
    </form>
  );
  return (
    <nav className="nav" aria-label="Navigation">
      <div className="rail">
        <button
          aria-label="Canvas"
          title="Canvas"
          aria-pressed={ui.surface === 'canvas'}
          onClick={() => setUi({ surface: 'canvas' })}
        >
          <LayoutGrid size={17} />
        </button>
        <button
          aria-label="Graph"
          title="Graph"
          aria-pressed={ui.surface === 'graph'}
          onClick={() => setUi({ surface: 'graph' })}
        >
          <Network size={17} />
        </button>
        <hr />
        <button
          aria-label="Spaces and conversations"
          title="Spaces and conversations"
          aria-expanded={ui.nav}
          onClick={() => setUi({ nav: !ui.nav, create: false })}
        >
          <PanelLeft size={17} />
          {totalUnread > 0 && <span className="unread dot" aria-label={`${totalUnread} unread`} />}
        </button>
        <button
          aria-label="Create"
          title="Create"
          aria-expanded={ui.create}
          onClick={() => setUi({ create: !ui.create, nav: false })}
        >
          <Plus size={18} />
        </button>
        <hr />
        {roster.map((agent) => (
          <button
            key={agent.id}
            className="rail-agent"
            aria-label={`${agent.name}, ${agent.role === 'personal' ? 'private to you' : 'shared with this project'}`}
            title={`${agent.name} · ${agent.role === 'personal' ? 'private to you' : 'shared'}`}
            aria-pressed={ui.agentId === agent.id}
            onClick={() =>
              setUi({
                readerId: null,
                wide: false,
                agentId: ui.agentId === agent.id ? null : agent.id,
              })
            }
          >
            <Character agent={agent} size={22} state={agentState(agent.id, s.jobs)} />
            {agent.role === 'personal' && (
              <Lock className="rail-private" size={9} aria-hidden="true" />
            )}
          </button>
        ))}
        <span className="rail-gap" />
        <button
          aria-label="Project tools"
          title="Project tools"
          aria-pressed={ui.tools}
          onClick={() => setUi({ tools: !ui.tools })}
        >
          <Layers size={17} />
        </button>
        <button aria-label="Account" title={s.me.name} onClick={() => setUi({ nav: !ui.nav })}>
          <Avatar user={s.me} size={24} />
        </button>
      </div>
      {ui.create && <CreateSheet />}
      {ui.nav && !ui.create && (
        <div className="sheet nav-sheet">
          <div className="rail-scroll">
            <section aria-label="Spaces">
              <h2>
                Spaces
                <button
                  className="rail-add"
                  aria-label="New project"
                  onClick={() => setCreating('project')}
                >
                  <Plus size={14} />
                </button>
              </h2>
              {s.spaces.map((x) => (
                <button
                  key={x.id}
                  className={`rail-row space-row ${x.id === space.id ? 'active' : ''}`}
                  onClick={() => setUi({ spaceId: x.id, readerId: null, selectedId: null })}
                >
                  {x.kind === 'personal' ? <Lock size={14} /> : <span className="space-dot" />}
                  <span className="rail-label">{x.name}</span>
                </button>
              ))}
              {creating === 'project' && nameForm}
            </section>
            {space.kind === 'project' && (
              <section aria-label="Channels">
                <h2>
                  Channels
                  <button
                    className="rail-add"
                    aria-label="New channel"
                    onClick={() => setCreating('channel')}
                  >
                    <Plus size={14} />
                  </button>
                </h2>
                {channels.map((c) => (
                  <Row key={c.id} c={c} label={c.title} icon={<Hash size={14} />} />
                ))}
                {creating === 'channel' && nameForm}
                {discussions.map((c) => (
                  <Row
                    key={c.id}
                    c={c}
                    label={s.resources.find((r) => r.id === c.resourceId)?.title ?? c.title}
                    icon={<MessageSquareText size={14} />}
                  />
                ))}
              </section>
            )}
            <section aria-label="Agents">
              <h2>
                Agents
                <button
                  className="rail-add"
                  aria-label="New agent"
                  onClick={() => setUi({ create: true, nav: false })}
                >
                  <Plus size={14} />
                </button>
              </h2>
              {roster.map((agent) => (
                <button
                  key={agent.id}
                  className={`rail-row ${ui.agentId === agent.id ? 'active' : ''}`}
                  onClick={() =>
                    setUi({ readerId: null, wide: false, agentId: agent.id, nav: false })
                  }
                >
                  <Character agent={agent} size={18} state={agentState(agent.id, s.jobs)} />
                  <span className="rail-label">{agent.name}</span>
                  {agent.role === 'personal' && <Lock size={11} aria-label="Private to you" />}
                  {agentUnread(agent.id) > 0 && (
                    <span className="unread" aria-label={`${agentUnread(agent.id)} unread`}>
                      {agentUnread(agent.id)}
                    </span>
                  )}
                </button>
              ))}
            </section>
            <section aria-label="People">
              <h2>People</h2>
              {people.length === 0 && (
                <p className="rail-empty">Others join from this server's address.</p>
              )}
              {people.map((p) => {
                const dm = s.conversations.find(
                  (c) =>
                    c.kind === 'dm' &&
                    c.participantIds.includes(p.id) &&
                    c.participantIds.includes(s.me.id),
                );
                const count = dm ? unread(dm) : 0;
                return (
                  <button
                    key={p.id}
                    className={`rail-row ${dm && ui.conversationId === dm.id ? 'active' : ''}`}
                    onClick={() => void openDm(p.id)}
                  >
                    <span className="presence-wrap">
                      <Avatar user={p} size={18} />
                      <i
                        className={`presence-dot ${online(p.id) ? 'on' : ''}`}
                        aria-label={online(p.id) ? 'online' : 'offline'}
                      />
                    </span>
                    <span className="rail-label" style={nameStyle(p.color)}>
                      {p.name}
                    </span>
                    {count > 0 && (
                      <span className="unread" aria-label={`${count} unread`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          </div>
          <footer className="rail-account">
            <Avatar user={s.me} size={22} />
            <span className="rail-label">{s.me.name}</span>
            <button
              aria-label={`Theme: ${ui.theme}`}
              title={`Theme: ${ui.theme}`}
              onClick={() =>
                setUi({
                  theme: ui.theme === 'system' ? 'light' : ui.theme === 'light' ? 'dark' : 'system',
                })
              }
            >
              {ui.theme === 'dark' ? (
                <Moon size={14} />
              ) : ui.theme === 'light' ? (
                <Sun size={14} />
              ) : (
                <Monitor size={14} />
              )}
            </button>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void api('/logout', { body: {} }).then(() => location.reload())}
            >
              <LogOut size={14} />
            </button>
          </footer>
        </div>
      )}
    </nav>
  );
}
