import type { Conversation, Id, Resource, Snapshot, User } from '../../../shared/types.ts';

/**
 * Who a message goes to. The composer always shows one of these; it never changes because
 * someone opened or selected work — only an explicit choice (or Discuss) changes it.
 */
export type Audience =
  | { kind: 'personal-work'; agentId: Id }
  | { kind: 'project-work'; spaceId: Id; agentId: Id }
  | { kind: 'conversation'; conversationId: Id }
  | { kind: 'instruct'; conversationId: Id; agentId: Id }
  | { kind: 'delegate'; conversationId: Id; agentId: Id }
  | { kind: 'private-agent'; conversationId: Id; agentId: Id }
  | { kind: 'person'; userId: Id }
  | { kind: 'discuss'; resourceId: Id; quote?: string };

export const audienceKey = (a: Audience) =>
  a.kind === 'personal-work'
    ? `personal:${a.agentId}`
    : a.kind === 'project-work'
      ? `work:${a.spaceId}:${a.agentId}`
      : a.kind === 'person'
        ? `person:${a.userId}`
        : a.kind === 'discuss'
          ? `discuss:${a.resourceId}`
          : `${a.kind}:${a.conversationId}`;

export type AudienceOption = { audience: Audience; label: string; detail: string; group: string };

const channelsOf = (s: Snapshot, spaceId: Id) =>
  s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === spaceId);

export function privateAgentConversation(s: Snapshot) {
  const agent = s.users.find(
    (u) => u.kind === 'agent' && u.role === 'personal' && u.ownerId === s.me.id,
  );
  const conversation =
    agent &&
    s.conversations.find((c) => c.kind === 'agent-private' && c.participantIds.includes(agent.id));
  return agent && conversation ? { agent, conversation } : null;
}

export function projectAgentOf(s: Snapshot, spaceId: Id): User | undefined {
  return s.users.find((u) => u.kind === 'agent' && u.role === 'project' && u.spaceId === spaceId);
}

export function audienceOptions(
  s: Snapshot,
  spaceId: Id,
  selected: Resource | null,
): AudienceOption[] {
  const space = s.spaces.find((x) => x.id === spaceId);
  const options: AudienceOption[] = [];
  const mine = privateAgentConversation(s);
  if (space?.kind === 'project') {
    const channels = channelsOf(s, spaceId);
    const agent = projectAgentOf(s, spaceId);
    for (const c of channels)
      options.push({
        audience: { kind: 'conversation', conversationId: c.id },
        label: `#${c.title}`,
        detail: `Everyone in ${space.name}`,
        group: 'Project',
      });
    for (const member of s.users.filter(
      (u) => u.kind === 'agent' && u.role === 'project' && u.spaceId === spaceId,
    )) {
      options.push({
        audience: { kind: 'person', userId: member.id },
        label: member.name,
        detail: 'Direct message · private',
        group: 'People and agents',
      });
    }
    if (agent && channels[0]) {
      options.push({
        audience: { kind: 'project-work', spaceId, agentId: agent.id },
        label: agent.name,
        detail: 'New project conversation · shared',
        group: 'Project',
      });
    }
  }
  if (mine) {
    options.push({
      audience: {
        kind: 'private-agent',
        conversationId: mine.conversation.id,
        agentId: mine.agent.id,
      },
      label: 'Your agent',
      detail: 'Private to you',
      group: 'Private',
    });
  }
  if (selected)
    options.push({
      audience: { kind: 'discuss', resourceId: selected.id },
      label: `Discuss “${selected.title.slice(0, 32)}”`,
      detail:
        selected.visibility === 'private'
          ? 'Only you can see this item'
          : 'Everyone who can see this item',
      group: 'Selected work',
    });
  for (const person of s.users.filter((u) => u.kind === 'human' && u.id !== s.me.id))
    options.push({
      audience: { kind: 'person', userId: person.id },
      label: person.name,
      detail: 'Direct message · private',
      group: 'People and agents',
    });
  return options;
}

/** A remembered audience is dropped once its target is gone or no longer visible. */
export function stillValid(s: Snapshot, a: Audience): boolean {
  switch (a.kind) {
    case 'personal-work':
      return s.users.some((u) => u.id === a.agentId && u.ownerId === s.me.id);
    case 'project-work':
      return (
        s.spaces.some((space) => space.id === a.spaceId) &&
        s.users.some((user) => user.id === a.agentId)
      );
    case 'person':
      return s.users.some((u) => u.id === a.userId);
    case 'discuss':
      return s.resources.some((r) => r.id === a.resourceId);
    default:
      return s.conversations.some((c) => c.id === a.conversationId);
  }
}

export function defaultAudience(s: Snapshot, spaceId: Id): Audience | null {
  const space = s.spaces.find((x) => x.id === spaceId);
  const channel = space?.kind === 'project' ? channelsOf(s, spaceId)[0] : undefined;
  if (channel) {
    const agent = projectAgentOf(s, spaceId);
    return agent
      ? { kind: 'project-work', spaceId, agentId: agent.id }
      : { kind: 'conversation', conversationId: channel.id };
  }
  const mine = privateAgentConversation(s);
  return mine ? { kind: 'personal-work', agentId: mine.agent.id } : null;
}

export function describeAudience(
  s: Snapshot,
  audience: Audience,
): { label: string; detail: string; placeholder: string } {
  const user = (id: Id) => s.users.find((u) => u.id === id);
  const conversation = (id: Id) => s.conversations.find((c) => c.id === id);
  switch (audience.kind) {
    case 'personal-work':
      return {
        label: 'Your agent',
        detail: 'Private to you',
        placeholder: 'Start a conversation with your agent',
      };
    case 'project-work':
      return {
        label: user(audience.agentId)?.name ?? 'Project agent',
        detail: 'New project conversation · shared',
        placeholder: 'Ask the project agent',
      };
    case 'conversation': {
      const c = conversation(audience.conversationId);
      return {
        ...conversationLabel(s, c),
        placeholder: `Message ${conversationLabel(s, c).label}`,
      };
    }
    case 'instruct':
      return {
        label: `Ask ${user(audience.agentId)?.name ?? 'agent'}`,
        detail: `Shared in #${conversation(audience.conversationId)?.title ?? 'channel'}`,
        placeholder: `Tell ${user(audience.agentId)?.name ?? 'the agent'} what to do`,
      };
    case 'delegate':
      return {
        label: `Delegate to ${user(audience.agentId)?.role === 'personal' ? 'your agent' : (user(audience.agentId)?.name ?? 'agent')}`,
        detail:
          conversation(audience.conversationId)?.kind === 'agent-private'
            ? 'Private to you'
            : 'Visible to the project',
        placeholder: 'Describe an ongoing responsibility, e.g. “keep the orientation up to date”',
      };
    case 'private-agent':
      return {
        label: 'Your agent',
        detail: 'Private to you',
        placeholder: 'Ask your agent privately',
      };
    case 'person':
      return {
        label: user(audience.userId)?.name ?? 'Person',
        detail: 'Direct message · private',
        placeholder: `Message ${user(audience.userId)?.name ?? ''}`,
      };
    case 'discuss': {
      const r = s.resources.find((x) => x.id === audience.resourceId);
      return {
        label: `Discuss “${r?.title.slice(0, 28) ?? 'item'}”`,
        detail:
          r?.visibility === 'private'
            ? 'Only you can see this item'
            : 'Everyone who can see this item',
        placeholder: 'Comment on this work',
      };
    }
  }
}

export function conversationLabel(s: Snapshot, c: Conversation | undefined) {
  if (!c) return { label: 'Conversation', detail: '' };
  if (c.kind === 'agent-work') {
    const space = s.spaces.find((x) => x.id === c.spaceId);
    return { label: c.title, detail: `Everyone in ${space?.name ?? 'the project'}` };
  }
  if (c.kind === 'channel') {
    const space = s.spaces.find((x) => x.id === c.spaceId);
    return { label: `#${c.title}`, detail: `Everyone in ${space?.name ?? 'the project'}` };
  }
  if (c.kind === 'dm') {
    const other = s.users.find((u) => c.participantIds.includes(u.id) && u.id !== s.me.id);
    return { label: other?.name ?? 'Direct message', detail: 'Direct message · private' };
  }
  if (c.kind === 'agent-private')
    return {
      label: c.title && c.title !== 'Your agent' ? c.title : 'Your agent',
      detail: 'Private to you',
    };
  const r = s.resources.find((x) => x.id === c.resourceId);
  return {
    label: `On “${(r?.title ?? c.title).slice(0, 32)}”`,
    detail: r?.visibility === 'private' ? 'Only you' : 'Everyone who can see this item',
  };
}
