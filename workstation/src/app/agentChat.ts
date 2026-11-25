import { api } from '../data/client.ts';
import type { Conversation, User } from '../../shared/types.ts';
import type { Workspace } from './workspace.tsx';

/** The chat you have with an agent, if there is one yet. */
export function agentChat(s: Workspace['s'], agent: User): Conversation | undefined {
  return s.conversations.find(
    (c) =>
      c.kind === 'dm' && c.participantIds.includes(agent.id) && c.participantIds.includes(s.me.id),
  );
}

/**
 * Clicking an agent talks to it. Your own agent is in the rail; a workspace agent opens a chat of
 * your own with it. Its settings are one click further, never the first thing.
 */
export async function talkTo(ws: Workspace, agent: User, beside = false) {
  if (agent.id === ws.myAgent?.id) return ws.setUi({ railOpen: true });
  const chat =
    agentChat(ws.s, agent) ??
    (await ws.run(() => api<Conversation>('/dms', { body: { userId: agent.id } })));
  if (chat) ws.open({ type: 'chat', id: chat.id }, beside);
}
