import { AccessError, InputError, type Store } from './store.ts';
import type { Conversation, Id, Message, User } from '../shared/types.ts';

/**
 * Agent seats asking Sandbox's own agents. A seat can put a question to a workspace's agent in a
 * channel or page discussion it can read (`POST /api/v1/chats/:id/messages` with `ask`), and the
 * answer comes back in its thread, marked `toMe` in its inbox and webhooks.
 *
 * That answer is paid for with the workspace's model allowance, so each seat has a daily allowance
 * of its own, in model tokens: its owner sets it (`POST /api/seats/:id/asks`), and once it is used
 * up the seat's asks are turned away until 00:00 UTC. The engine meters a seat like a person, so
 * the workspace's and server's own limits still apply on top. A seat cannot ask anyone's own
 * agent, another seat, or anything at all in a DM, and a change an agent proposes for a seat still
 * waits for a person to approve it.
 */

/** About a dozen answers a day (one answer is about 3-4k tokens). */
export const DEFAULT_SEAT_TOKENS_PER_DAY = 40_000;
const MAX_SEAT_TOKENS_PER_DAY = 2_000_000;

export type SeatAllowance = { tokensPerDay: number; usedToday: number; leftToday: number };

type Row = Record<string, any>;
const now = () => new Date().toISOString();

export class SeatAsks {
  private store: Store;
  private unsubscribe: () => unknown;

  constructor(store: Store) {
    this.store = store;
    store.db.exec(`create table if not exists seat_ask_limits (
      agent_id text primary key, tokens_per_day integer not null, set_by text not null, set_at text not null
    )`);
    store.db.exec(`create table if not exists seat_asks (
      message_id text primary key, seat_id text not null, agent_id text not null,
      conversation_id text not null, thread_id text not null, created_at text not null, answer_id text
    )`);
    store.db.exec('create index if not exists seat_asks_answer on seat_asks (answer_id)');
    this.unsubscribe = store.onChange((event) => {
      if (event.type === 'message') this.noteAnswer(event.message);
    });
  }

  private all(sql: string, ...args: any[]) {
    return this.store.db.prepare(sql).all(...args) as Row[];
  }
  private run(sql: string, ...args: any[]) {
    this.store.db.prepare(sql).run(...args);
  }

  allowance(seatId: Id): SeatAllowance {
    const set = this.all(
      'select tokens_per_day from seat_ask_limits where agent_id = ?',
      seatId,
    )[0];
    const tokensPerDay = set ? Number(set.tokens_per_day) : DEFAULT_SEAT_TOKENS_PER_DAY;
    const usedToday = this.store.agentUsageToday('person', seatId);
    return { tokensPerDay, usedToday, leftToday: Math.max(0, tokensPerDay - usedToday) };
  }

  /** Its owner sets how many model tokens a day the seat may spend asking Sandbox's agents; 0 stops it. */
  setAllowance(actorId: Id, seatId: Id, raw: unknown) {
    const seat = this.ownedSeat(actorId, seatId);
    const tokens = Math.floor(Number(raw));
    if (!Number.isFinite(tokens) || tokens < 0 || tokens > MAX_SEAT_TOKENS_PER_DAY)
      throw new InputError(`Give a number of tokens a day from 0 to ${MAX_SEAT_TOKENS_PER_DAY}.`);
    this.run(
      `insert into seat_ask_limits values (?, ?, ?, ?) on conflict (agent_id) do update set
       tokens_per_day = excluded.tokens_per_day, set_by = excluded.set_by, set_at = excluded.set_at`,
      seat.id,
      tokens,
      actorId,
      now(),
    );
    return this.allowance(seat.id);
  }
  ownedSeat(actorId: Id, seatId: Id) {
    const seat = this.store.user(seatId);
    if (!seat || seat.kind !== 'agent' || seat.role !== 'outside' || seat.ownerId !== actorId)
      throw new AccessError('Not available.');
    return seat;
  }

  /** Sandbox's own agents a seat could ask in this chat: the workspace's agents, nobody's own. */
  askable(chat: Conversation): User[] {
    if ((chat.kind !== 'channel' && chat.kind !== 'discussion') || !chat.spaceId) return [];
    return this.store.projectAgents(chat.spaceId).filter((a) => !a.retired);
  }

  /** Checks an ask before it is posted: the agent is askable here and the seat has allowance left. */
  check(seat: User, chat: Conversation, agentId: unknown) {
    const agent = this.askable(chat).find((a) => a.id === agentId);
    if (!agent) throw new InputError("Ask one of this workspace's agents, in one of its chats.");
    const { tokensPerDay, leftToday } = this.allowance(seat.id);
    if (leftToday <= 0)
      throw new AllowanceUsed(
        tokensPerDay === 0
          ? "This seat's owner has turned off asking Sandbox's agents."
          : "This seat has used today's allowance for Sandbox's agents. It resets at 00:00 UTC.",
      );
    return agent;
  }

  /** Remembers an ask, so its answer can be marked as being for the seat. */
  record(message: Message) {
    this.run(
      'insert or ignore into seat_asks values (?, ?, ?, ?, ?, ?, null)',
      message.id,
      message.authorId,
      message.addressedTo,
      message.conversationId,
      message.replyTo ?? message.id,
      message.createdAt,
    );
  }

  /** The asked agent's next message in the ask's thread is its answer. */
  private noteAnswer(message: Message) {
    if (!message.replyTo) return;
    const ask = this.all(
      `select message_id from seat_asks where agent_id = ? and conversation_id = ? and thread_id = ?
       and answer_id is null and created_at <= ? order by created_at, rowid limit 1`,
      message.authorId,
      message.conversationId,
      message.replyTo,
      message.createdAt,
    )[0];
    if (ask)
      this.run(
        'update seat_asks set answer_id = ? where message_id = ?',
        message.id,
        ask.message_id,
      );
  }

  stop() {
    this.unsubscribe();
  }
}

export class AllowanceUsed extends Error {}

/** `GET` and `POST /api/seats/:id/asks`, for the seat's owner. */
export function seatAsksApi(
  asks: SeatAsks,
  me: User,
  method: string,
  segments: string[],
  input: Record<string, unknown>,
) {
  const [first, seatId, part, more] = segments;
  if (first !== 'seats' || !seatId || part !== 'asks' || more) return undefined;
  if (method === 'GET') return asks.allowance(asks.ownedSeat(me.id, seatId).id);
  if (method === 'POST') return asks.setAllowance(me.id, seatId, input.tokensPerDay);
  return undefined;
}
