import { InputError, type Store } from './store.ts';
import type { Id } from '../shared/types.ts';

/**
 * A person downloads their data: what is theirs, as far as they can still read it. Their profile
 * and sign-in email, the spaces they are in, the pages they own, every message they wrote, their
 * private chats with their agents (both sides), their agents, the routines they set and the steps
 * they own or added, and the names of the accounts they linked. Never a token or another person's
 * private page. Everything comes through the same access checks as the app itself.
 */
export function exportMyData(store: Store, userId: Id) {
  const me = store.user(userId);
  if (!me || me.kind !== 'human') throw new InputError('Unknown person.');
  const db = store.db;
  const view = store.snapshot(userId, [], { id: 'export', label: 'export' });
  const spaceIds = JSON.stringify(view.spaces.map((s) => s.id));
  const each = '(select value from json_each(?))';
  const name = new Map(view.users.map((u) => [u.id, u.name]));
  const spaceName = new Map(view.spaces.map((s) => [s.id, s.name]));

  // Agents that answer to them: their own, and any others they made.
  const agents = (
    db
      .prepare(
        `select id, name, purpose, instructions, character, created_at from users
         where kind = 'agent' and owner_id = ? and retired = 0 order by created_at`,
      )
      .all(userId) as Record<string, string | null>[]
  ).map((a) => ({
    id: a.id,
    name: a.name,
    purpose: a.purpose ?? '',
    instructions: a.instructions ?? '',
    character: a.character ?? '',
    createdAt: a.created_at,
  }));

  // Only conversations the app would show them; in their private chats with an agent, both sides.
  const privateChats = new Set(
    view.conversations
      .filter((c) => c.kind === 'agent-private' && c.participantIds.includes(userId))
      .map((c) => c.id),
  );
  const readable = JSON.stringify(view.conversations.map((c) => c.id));
  const messages = (
    db
      .prepare(
        `select id, conversation_id, author_id, text, reply_to, created_at from messages
         where conversation_id in ${each} and (author_id = ? or conversation_id in ${each})
         order by created_at, rowid`,
      )
      .all(readable, userId, JSON.stringify([...privateChats])) as Record<string, string | null>[]
  ).map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    author: m.author_id === userId ? me.name : (name.get(m.author_id!) ?? 'Someone'),
    text: m.text,
    replyTo: m.reply_to,
    createdAt: m.created_at,
  }));
  const used = new Set(messages.map((m) => m.conversationId));
  const conversations = view.conversations
    .filter((c) => used.has(c.id))
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      space: c.spaceId ? (spaceName.get(c.spaceId) ?? null) : null,
    }));

  const pages = view.resources
    .filter((r) => r.ownerId === userId)
    .map((r) => ({
      id: r.id,
      space: spaceName.get(r.spaceId) ?? null,
      kind: r.kind,
      title: r.title,
      body: r.body,
      visibility: r.visibility,
      parentId: r.parentId ?? null,
      updatedAt: r.updatedAt,
    }));

  const routines = (
    db
      .prepare(
        `select id, agent_id, space_id, instruction, cadence, weekday, time, tz_offset, created_at
         from routines where created_by = ? and space_id in ${each} order by created_at`,
      )
      .all(userId, spaceIds) as Record<string, string | number | null>[]
  ).map((r) => ({
    id: r.id,
    agent: name.get(String(r.agent_id)) ?? 'An agent',
    space: spaceName.get(String(r.space_id)) ?? null,
    instruction: r.instruction,
    cadence: r.cadence,
    weekday: r.weekday,
    time: r.time,
    tzOffset: r.tz_offset,
    createdAt: r.created_at,
  }));

  const goals = (
    db
      .prepare(
        `select id, space_id, title, due, done, owner_id, created_by, created_at from goals
         where (owner_id = ? or created_by = ?) and space_id in ${each} order by created_at`,
      )
      .all(userId, userId, spaceIds) as Record<string, string | number | null>[]
  ).map((g) => ({
    id: g.id,
    space: spaceName.get(String(g.space_id)) ?? null,
    title: g.title,
    due: g.due,
    done: !!g.done,
    yours: g.owner_id === userId,
    createdAt: g.created_at,
  }));

  const connections = (
    db
      .prepare('select provider, account from connections where user_id = ? order by provider')
      .all(userId) as { provider: string; account: string }[]
  ).map((c) => ({ provider: c.provider, account: c.account }));
  const emails = (
    db
      .prepare('select email from identities where user_id = ? and email is not null')
      .all(userId) as { email: string }[]
  ).map((r) => r.email);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: me.id,
      name: me.name,
      color: me.color,
      emails,
      createdAt: (
        db.prepare('select created_at from users where id = ?').get(userId) as {
          created_at: string;
        }
      ).created_at,
    },
    spaces: view.spaces.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      yours: s.ownerId === userId,
    })),
    pages,
    conversations,
    messages,
    agents,
    routines,
    goals,
    connections,
  };
}
