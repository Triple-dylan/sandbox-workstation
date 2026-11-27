import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AccessError, InputError, type Store } from './store.ts';
import type { Id, User } from '../shared/types.ts';

/**
 * Agent seats: an agent that runs somewhere else (Claude Code, Codex, Hermes, a Grok bot) joins
 * workspaces as itself. It is a member like a person: it reads what the space shares and what is
 * opened to it by name, never anyone's private pages, and nothing in spaces it has not joined.
 * Sandbox's own model never answers for it; it reads and writes through its tokens (see mcp.ts).
 *
 * A seat belongs to the person who made it. Only they add it to their workspaces, make or revoke
 * its tokens, or retire it. A workspace's owner can also take a seat out of their workspace.
 */

/** What a token looks like, so people (and secret scanners) can recognise one. */
export const TOKEN_PREFIX = 'sbx_';
const hash = (token: string) => createHash('sha256').update(token).digest('base64url');
const now = () => new Date().toISOString();

export type SeatToken = {
  id: Id;
  agentId: Id;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export type Seat = {
  agent: User;
  /** The shared workspaces it has joined. */
  spaceIds: Id[];
  /** Live tokens; the token itself was shown once, when made, and is never stored. */
  tokens: SeatToken[];
};

type Row = Record<string, any>;
const toToken = (r: Row): SeatToken => ({
  id: r.id,
  agentId: r.agent_id,
  label: r.label,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at ?? null,
});

export class Seats {
  private store: Store;
  constructor(store: Store) {
    this.store = store;
  }

  private get(sql: string, ...args: any[]) {
    return this.store.db.prepare(sql).get(...args) as Row | undefined;
  }
  private all(sql: string, ...args: any[]) {
    return this.store.db.prepare(sql).all(...args) as Row[];
  }
  private run(sql: string, ...args: any[]) {
    this.store.db.prepare(sql).run(...args);
  }

  /** The seat, if this person owns it. */
  private owned(actorId: Id, agentId: Id) {
    const agent = this.store.user(agentId);
    if (!agent || agent.kind !== 'agent' || agent.role !== 'outside' || agent.ownerId !== actorId)
      throw new AccessError('Not available.');
    return agent;
  }

  /** A new seat and its first token. The token is returned once and only its hash is kept. */
  create(actorId: Id, input: { name: string; purpose?: string; spaceId?: Id | null }) {
    const actor = this.store.user(actorId);
    if (!actor || actor.kind !== 'human') throw new AccessError('Only people make agent seats.');
    const name = String(input.name ?? '')
      .trim()
      .slice(0, 40);
    if (!name) throw new InputError('Give the agent a name.');
    if (input.spaceId) this.checkJoin(actorId, input.spaceId);
    const agentId = this.store.createAgent(name, { ownerId: actorId, role: 'outside' });
    this.run(
      'update users set purpose = ? where id = ?',
      String(input.purpose ?? '').slice(0, 300),
      agentId,
    );
    if (input.spaceId) this.join(actorId, agentId, input.spaceId);
    const token = this.newToken(actorId, agentId, 'First token');
    this.store.changed();
    return { seat: this.seat(agentId), token };
  }

  /** Every seat this person owns, retired ones included so their history stays findable. */
  mine(actorId: Id): Seat[] {
    return this.all(
      `select id from users where kind = 'agent' and role = 'outside' and owner_id = ? order by created_at, rowid`,
      actorId,
    ).map((r) => this.seat(r.id));
  }
  seat(agentId: Id): Seat {
    return {
      agent: this.store.user(agentId)!,
      spaceIds: this.spacesOf(agentId),
      tokens: this.all(
        'select * from agent_tokens where agent_id = ? and revoked = 0 order by created_at, rowid',
        agentId,
      ).map(toToken),
    };
  }
  spacesOf(agentId: Id) {
    return this.all(
      `select m.space_id from members m join spaces s on s.id = m.space_id where m.user_id = ? and s.kind = 'project' and s.deleted_at is null order by s.created_at`,
      agentId,
    ).map((r) => r.space_id as Id);
  }

  private checkJoin(actorId: Id, spaceId: Id) {
    const space = this.store.requireMember(actorId, spaceId);
    if (space.kind !== 'project')
      throw new InputError('Agent seats join shared workspaces, not your private space.');
    return space;
  }
  /** Its owner brings the seat into a workspace they are in. It is then a member like anyone. */
  join(actorId: Id, agentId: Id, spaceId: Id) {
    const agent = this.owned(actorId, agentId);
    if (agent.retired) throw new InputError('This agent is retired.');
    this.checkJoin(actorId, spaceId);
    this.run('insert or ignore into members values (?, ?, ?)', spaceId, agentId, 'agent');
    this.store.changed();
  }
  /** Its owner takes it out, or the workspace's owner does. It loses that workspace at once. */
  leave(actorId: Id, agentId: Id, spaceId: Id) {
    const agent = this.store.user(agentId);
    const space = this.store.space(spaceId);
    if (!agent || agent.role !== 'outside' || !space) throw new AccessError('Not available.');
    if (agent.ownerId !== actorId && space.ownerId !== actorId)
      throw new AccessError(`Only its owner or the person who started ${space.name} can do that.`);
    this.run('delete from members where space_id = ? and user_id = ?', spaceId, agentId);
    this.store.changed();
  }

  /** Another token, for another machine or tool. Shown once. */
  newToken(actorId: Id, agentId: Id, rawLabel: string) {
    const agent = this.owned(actorId, agentId);
    if (agent.retired) throw new InputError('This agent is retired.');
    const label =
      String(rawLabel ?? '')
        .trim()
        .slice(0, 60) || 'Token';
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const tokenId = randomUUID();
    this.run(
      'insert into agent_tokens (id, token_hash, agent_id, label, created_at) values (?, ?, ?, ?, ?)',
      tokenId,
      hash(token),
      agentId,
      label,
      now(),
    );
    this.store.changed();
    return { id: tokenId, label, token };
  }
  revokeToken(actorId: Id, agentId: Id, tokenId: Id) {
    this.owned(actorId, agentId);
    this.run('update agent_tokens set revoked = 1 where id = ? and agent_id = ?', tokenId, agentId);
    this.store.changed();
  }

  /** Retiring stops it for good: every token stops working and it leaves its workspaces' work. */
  retire(actorId: Id, agentId: Id) {
    this.owned(actorId, agentId);
    this.store.retireAgent(actorId, agentId);
    this.run('update agent_tokens set revoked = 1 where agent_id = ?', agentId);
    this.store.changed();
    return this.seat(agentId);
  }

  /** The seat a token signs in as, while it is live and the seat is not retired. */
  agentForToken(token: string | undefined | null) {
    if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
    const row = this.get(
      'select id, agent_id from agent_tokens where token_hash = ? and revoked = 0',
      hash(token),
    );
    if (!row) return null;
    const agent = this.store.user(row.agent_id);
    if (!agent || agent.kind !== 'agent' || agent.role !== 'outside' || agent.retired) return null;
    const owner = agent.ownerId ? this.store.user(agent.ownerId) : null;
    if (!owner) return null;
    this.run('update agent_tokens set last_used_at = ? where id = ?', now(), row.id);
    return agent;
  }
}

/**
 * The seat routes under /api/seats, for the person who owns them (signed in with their cookie).
 * Returns undefined when the path is not a seat route.
 */
export function seatsApi(
  seats: Seats,
  me: User,
  method: string,
  segments: string[],
  input: Record<string, unknown>,
) {
  if (segments[0] !== 'seats') return undefined;
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const [, agentId, part, partId] = segments;
  if (!agentId && method === 'GET') return seats.mine(me.id);
  if (!agentId && method === 'POST')
    return seats.create(me.id, {
      name: str('name'),
      purpose: str('purpose'),
      spaceId: str('spaceId') || null,
    });
  if (agentId && part === 'spaces' && !partId && method === 'POST') {
    seats.join(me.id, agentId, str('spaceId'));
    return seats.seat(agentId);
  }
  if (agentId && part === 'spaces' && partId && method === 'DELETE') {
    seats.leave(me.id, agentId, partId);
    return { ok: true };
  }
  if (agentId && part === 'tokens' && !partId && method === 'POST')
    return seats.newToken(me.id, agentId, str('label'));
  if (agentId && part === 'tokens' && partId && method === 'DELETE') {
    seats.revokeToken(me.id, agentId, partId);
    return { ok: true };
  }
  if (agentId && part === 'retire' && method === 'POST') return seats.retire(me.id, agentId);
  return undefined;
}
