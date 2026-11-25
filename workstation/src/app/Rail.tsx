import { useEffect, useState } from 'react';
import { ChevronDown, Hash, LayoutGrid, Lock, MessageSquareText, Plus } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';
import { Actor } from '../features/agents/Character.tsx';
import {
  conversationLabel,
  defaultAudience,
  privateAgentConversation,
} from '../features/conversations/audience.ts';
import type { Conversation, Space, User } from '../../shared/types.ts';

export function Rail({
  creatingProject,
  onProjectFormClose,
}: {
  creatingProject: boolean;
  onProjectFormClose: () => void;
}) {
  const { s, ui, setUi, space, run, openConversation, openDirect } = useWorkspace();
  const [creating, setCreating] = useState<{
    kind: 'project' | 'channel' | 'agent';
    spaceId: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (creatingProject) setCreating({ kind: 'project', spaceId: space.id });
  }, [creatingProject]);
  const cancel = () => {
    setCreating(null);
    setName('');
    onProjectFormClose();
  };
  const start = (kind: 'project' | 'channel' | 'agent', spaceId: string) => {
    setName('');
    setCreating({ kind, spaceId });
  };
  const submit = async () => {
    if (!creating || !name.trim() || saving) return;
    setSaving(true);
    const created = await run(async () => {
      if (creating.kind === 'project') {
        const project = await api<Space>('/projects', { body: { name: name.trim() } });
        setUi((old) => ({
          spaceId: project.id,
          conversationId: null,
          memberId: null,
          readerId: null,
          collapsedSpaces: { ...old.collapsedSpaces, [project.id]: false },
        }));
      } else if (creating.kind === 'channel') {
        const chat = await api<Conversation>('/channels', {
          body: { spaceId: creating.spaceId, title: name.trim() },
        });
        setUi({ spaceId: creating.spaceId });
        openConversation(chat.id);
      } else {
        const agent = await api<User>('/agents', {
          body: { spaceId: creating.spaceId, name: name.trim() },
        });
        const chat = await api<Conversation>('/dms', { body: { userId: agent.id } });
        setUi({ spaceId: creating.spaceId });
        openConversation(chat.id);
      }
      return true;
    });
    setSaving(false);
    if (created) cancel();
  };
  const form = creating && (
    <form
      className="rail-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        required
        disabled={saving}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
        }}
        placeholder={
          creating.kind === 'project'
            ? 'Project name'
            : creating.kind === 'agent'
              ? 'Agent name'
              : 'channel-name'
        }
        aria-label={
          creating.kind === 'project'
            ? 'New project name'
            : creating.kind === 'agent'
              ? 'New agent name'
              : 'New channel name'
        }
      />
      <small>Enter to create · Esc to cancel</small>
    </form>
  );
  const row = (chat: Conversation) => {
    const count = s.messages.filter(
      (m) =>
        m.conversationId === chat.id &&
        m.authorId !== s.me.id &&
        m.createdAt > (s.lastRead[chat.id] ?? ''),
    ).length;
    return (
      <button
        key={chat.id}
        className={`rail-row ${ui.conversationId === chat.id && !ui.memberId ? 'active' : ''}`}
        onClick={() => openConversation(chat.id)}
      >
        {chat.kind === 'channel' ? <Hash size={15} /> : <MessageSquareText size={15} />}
        <span className="rail-label">
          {chat.kind === 'channel' ? chat.title : conversationLabel(s, chat).label}
        </span>
        {!!count && (
          <span className="unread" aria-label={`${count} unread`}>
            {count}
          </span>
        )}
      </button>
    );
  };
  return (
    <nav id="workstation-navigation" className="rail" aria-label="Navigation">
      <div className="rail-scroll">
        <div className="navigation-heading">
          <span>Your workspace</span>
          <button
            className="rail-add"
            aria-label="New project"
            title="New project"
            onClick={() => start('project', space.id)}
          >
            <Plus size={17} />
          </button>
        </div>
        {creating?.kind === 'project' && form}
        {[...s.spaces]
          .sort((a, b) => Number(b.kind === 'personal') - Number(a.kind === 'personal'))
          .map((item) => {
            const expanded = !ui.collapsedSpaces[item.id];
            const channels = s.conversations.filter(
              (c) => c.spaceId === item.id && c.kind === 'channel',
            );
            const work = s.conversations.filter(
              (c) =>
                (c.spaceId === item.id && (c.kind === 'agent-work' || c.kind === 'discussion')) ||
                (item.kind === 'personal' &&
                  c.kind === 'agent-private' &&
                  s.messages.some((m) => m.conversationId === c.id)),
            );
            const members = s.users.filter(
              (u) =>
                u.id !== s.me.id &&
                (item.kind === 'personal'
                  ? u.kind === 'human' || u.id === privateAgentConversation(s)?.agent.id
                  : s.members.some((m) => m.spaceId === item.id && m.userId === u.id)),
            );
            return (
              <section key={item.id} aria-label={`${item.name} navigation`}>
                <button
                  className="rail-row space-row"
                  aria-expanded={expanded}
                  onClick={() =>
                    setUi((old) => ({
                      collapsedSpaces: { ...old.collapsedSpaces, [item.id]: expanded },
                    }))
                  }
                >
                  <ChevronDown size={14} className={expanded ? '' : 'collapsed'} />
                  <span className="rail-label">{item.name}</span>
                  {item.kind === 'personal' && <Lock size={12} />}
                </button>
                {expanded && (
                  <div className="rail-nested">
                    <button
                      className={`rail-row ${space.id === item.id && !ui.conversationId && !ui.memberId ? 'active' : ''}`}
                      aria-label={`Open ${item.name} workspace`}
                      onClick={() =>
                        setUi((old) => ({
                          spaceId: item.id,
                          conversationId: null,
                          memberId: null,
                          readerId: null,
                          selectedId: null,
                          audience: { ...old.audience, [item.id]: defaultAudience(s, item.id)! },
                        }))
                      }
                    >
                      <LayoutGrid size={15} />
                      <span className="rail-label">Workspace</span>
                    </button>
                    {item.kind === 'project' && (
                      <>
                        <h2>
                          Channels
                          <button
                            className="rail-add"
                            aria-label={`New channel in ${item.name}`}
                            onClick={() => start('channel', item.id)}
                          >
                            <Plus size={14} />
                          </button>
                        </h2>
                        {channels.map(row)}
                        {creating?.kind === 'channel' && creating.spaceId === item.id && form}
                      </>
                    )}
                    {!!work.length && (
                      <>
                        <h2>Conversations</h2>
                        {work.map(row)}
                      </>
                    )}
                    {!!members.length && (
                      <h2>
                        Direct messages
                        {item.kind === 'project' && item.ownerId === s.me.id && (
                          <button
                            className="rail-add"
                            aria-label={`Deploy agent in ${item.name}`}
                            title="Deploy agent"
                            onClick={() => start('agent', item.id)}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </h2>
                    )}
                    {creating?.kind === 'agent' && creating.spaceId === item.id && form}
                    {members.map((member) => {
                      const chat = s.conversations.find(
                        (c) =>
                          (c.kind === 'dm' || c.kind === 'agent-private') &&
                          c.participantIds.includes(member.id),
                      );
                      const label = member.role === 'personal' ? 'Your agent' : member.name;
                      const count = chat
                        ? s.messages.filter(
                            (m) =>
                              m.conversationId === chat.id &&
                              m.authorId !== s.me.id &&
                              m.createdAt > (s.lastRead[chat.id] ?? ''),
                          ).length
                        : 0;
                      return (
                        <button
                          key={member.id}
                          className={`rail-row ${chat && chat.id === ui.conversationId && !ui.memberId ? 'active' : ''}`}
                          title={`Private conversation with ${label}`}
                          onClick={() => {
                            setUi({ spaceId: item.id });
                            void openDirect(member.id);
                          }}
                        >
                          <Actor user={member} jobs={s.jobs} size={18} />
                          <span className="rail-label">{label}</span>
                          {!!count && (
                            <span className="unread" aria-label={`${count} unread`}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </nav>
  );
}
