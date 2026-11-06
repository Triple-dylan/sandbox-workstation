import { useState } from 'react';
import {
  Hash,
  LayoutGrid,
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
import { privateAgentConversation, projectAgentOf } from '../features/conversations/audience.ts';
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
  const online = (userId: string) => s.presence.some((p) => p.userId === userId && p.online);
  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
  const discussions = s.conversations.filter(
    (c) =>
      c.kind === 'discussion' &&
      c.spaceId === space.id &&
      s.messages.some((m) => m.conversationId === c.id),
  );
  const people = s.users.filter((u) => u.kind === 'human' && u.id !== s.me.id);
  const mine = privateAgentConversation(s);
  const projectAgent = space.kind === 'project' ? projectAgentOf(s, space.id) : undefined;
  const submit = async () => {
    const value = name.trim();
    if (!value) return setCreating(null);
    if (creating === 'project') {
      const created = await run(() => api<Space>('/projects', { body: { name: value } }));
      if (created)
        setUi({ spaceId: created.id, conversationId: null, readerId: null, selectedId: null });
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
    <nav className="rail" aria-label="Navigation">
      <div className="rail-surfaces" role="group" aria-label="Surface">
        <button
          aria-pressed={ui.surface === 'canvas'}
          onClick={() => setUi({ surface: 'canvas' })}
          title="Canvas"
        >
          <LayoutGrid size={16} /> Canvas
        </button>
        <button
          aria-pressed={ui.surface === 'graph'}
          onClick={() => setUi({ surface: 'graph' })}
          title="Graph"
        >
          <Network size={16} /> Graph
        </button>
      </div>
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
          <h2>Agents</h2>
          {projectAgent && (
            <button
              className="rail-row"
              onClick={() => setUi({ readerId: null })}
              title="Shows its work and approvals"
            >
              <Character
                agent={projectAgent}
                size={18}
                state={agentState(projectAgent.id, s.jobs)}
              />
              <span className="rail-label">{projectAgent.name}</span>
            </button>
          )}
          {mine && (
            <Row
              c={mine.conversation}
              label="Your agent"
              icon={
                <Character agent={mine.agent} size={18} state={agentState(mine.agent.id, s.jobs)} />
              }
            />
          )}
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
                <span className="rail-label" style={{ color: p.color }}>
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
    </nav>
  );
}
