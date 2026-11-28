import { AccessError, InputError, type Store } from './store.ts';
import type { Seats } from './seats.ts';
import { isPage } from '../shared/types.ts';
import type { Conversation, Id, Resource, User } from '../shared/types.ts';

/**
 * The outside-agent API under /api/v1: how an agent that runs somewhere else (Codex, Hermes, a
 * Grok bot, a script) reads and writes a workspace over plain HTTP, signed in with its seat's token
 * (`Authorization: Bearer sbx_…`, see seats.ts).
 *
 * The agent reads as itself, through the same access checks as everyone: the workspaces its owner
 * brought it into, what they share and pages opened to it by name. Never its owner's private pages
 * and nothing in spaces it has not joined. `OutsideAgent` holds those reads so the MCP server can
 * offer the same ones as tools.
 */

const PAGE_LIMIT = 100;
const COLUMNS = 'id, conversation_id, author_id, text, reply_to, addressed_to, created_at';
type MessageRow = {
  id: Id;
  conversation_id: Id;
  author_id: Id;
  text: string;
  reply_to: Id | null;
  addressed_to: Id | null;
  created_at: string;
};

type Who = { id: Id; name: string; kind: User['kind'] };
const who = (user: User | null): Who | null =>
  user ? { id: user.id, name: user.name, kind: user.kind } : null;

export type PageInfo = {
  id: Id;
  spaceId: Id;
  kind: Resource['kind'];
  title: string;
  visibility: Resource['visibility'];
  parentId: Id | null;
  pinned: boolean;
  updatedAt: string;
  updatedBy: Who | null;
};
export type ChatInfo = {
  id: Id;
  spaceId: Id | null;
  kind: Conversation['kind'];
  title: string;
  /** A discussion's page. */
  pageId: Id | null;
};
export type MessageInfo = {
  id: Id;
  chatId: Id;
  author: Who | null;
  text: string;
  replyTo: Id | null;
  /** True when this message was sent to this agent: it waits for this agent to answer. */
  toMe: boolean;
  createdAt: string;
};

export class OutsideAgent {
  private store: Store;
  readonly agent: User;
  constructor(store: Store, agent: User) {
    this.store = store;
    this.agent = agent;
  }

  private rows<T>(sql: string, ...args: (string | number)[]) {
    return this.store.db.prepare(sql).all(...args) as T[];
  }

  /** The shared workspaces this agent has joined, with who is in each. */
  spaces() {
    return this.rows<{ id: Id; name: string }>(
      `select s.id, s.name from members m join spaces s on s.id = m.space_id where m.user_id = ? and s.kind = 'project' and s.deleted_at is null order by s.created_at, s.rowid`,
      this.agent.id,
    ).map((space) => ({
      id: space.id,
      name: space.name,
      members: this.rows<Who & { retired: number }>(
        `select u.id, u.name, u.kind, u.retired from members m join users u on u.id = m.user_id where m.space_id = ? order by u.created_at, u.rowid`,
        space.id,
      )
        .filter((u) => !u.retired)
        .map(({ id, name, kind }) => ({ id, name, kind })),
    }));
  }
  /** A shared workspace it is in, not deleted. Everything it reads lives in one. */
  private inSpace(spaceId: Id | null) {
    return (
      !!spaceId &&
      this.rows(
        `select 1 from members m join spaces s on s.id = m.space_id where m.space_id = ? and m.user_id = ? and s.kind = 'project' and s.deleted_at is null`,
        spaceId,
        this.agent.id,
      ).length > 0
    );
  }
  private space(spaceId: Id) {
    if (!this.inSpace(spaceId)) throw new AccessError('Not available.');
  }

  /** Pages it may open in one workspace, without their contents. */
  pages(spaceId: Id): PageInfo[] {
    this.space(spaceId);
    return this.store
      .readableResources(this.agent.id, spaceId)
      .filter((r) => isPage(r.kind) && !r.archived)
      .map((r) => this.pageInfo(r));
  }
  private pageInfo(r: Resource): PageInfo {
    return {
      id: r.id,
      spaceId: r.spaceId,
      kind: r.kind,
      title: r.title,
      visibility: r.visibility,
      parentId: r.parentId,
      pinned: !!r.pinned,
      updatedAt: r.updatedAt,
      updatedBy: who(this.store.user(r.updatedBy)),
    };
  }
  /** One page with its contents: Markdown for a doc, JSON for a sheet, deck or canvas. */
  page(pageId: Id) {
    const page = this.readablePage(pageId);
    return { ...this.pageInfo(page), body: page.body };
  }
  protected readablePage(pageId: Id) {
    const page = this.store.resource(pageId);
    if (
      !page ||
      !isPage(page.kind) ||
      !this.inSpace(page.spaceId) ||
      !this.store.canReadResource(this.agent.id, page)
    )
      throw new AccessError('Not available.');
    return page;
  }

  /** Chats it may read in one workspace: its channels, discussions of pages it can open, its DMs. */
  chats(spaceId: Id): ChatInfo[] {
    this.space(spaceId);
    return this.rows<{ id: Id }>(
      `select id from conversations where space_id = ? and kind != 'agent-private' order by created_at, rowid`,
      spaceId,
    )
      .map((r) => this.store.conversation(r.id)!)
      .filter((c) => this.store.canReadConversation(this.agent.id, c))
      .map((c) => ({
        id: c.id,
        spaceId: c.spaceId,
        kind: c.kind,
        title: c.title,
        pageId: c.resourceId,
      }));
  }
  protected readableChat(chatId: Id) {
    const chat = this.store.conversation(chatId);
    if (
      !chat ||
      chat.kind === 'agent-private' ||
      !this.inSpace(chat.spaceId) ||
      !this.store.canReadConversation(this.agent.id, chat)
    )
      throw new AccessError('Not available.');
    return chat;
  }
  /**
   * A chat's messages, oldest first. Without `since`, the latest ones; with it, the first ones
   * after that moment, so an agent can page forward by passing the last createdAt it saw.
   */
  messages(chatId: Id, options: { since?: string; limit?: number } = {}): MessageInfo[] {
    const chat = this.readableChat(chatId);
    const limit = clampLimit(options.limit);
    const since = readSince(options.since);
    const rows = since
      ? this.rows<MessageRow>(
          `select ${COLUMNS} from messages where conversation_id = ? and created_at > ? order by created_at, rowid limit ?`,
          chat.id,
          since,
          limit,
        )
      : this.rows<MessageRow>(
          `select ${COLUMNS} from messages where conversation_id = ? order by created_at desc, rowid desc limit ?`,
          chat.id,
          limit,
        ).reverse();
    return rows.map((r) => this.messageInfo(r));
  }
  protected messageInfo(r: MessageRow): MessageInfo {
    return {
      id: r.id,
      chatId: r.conversation_id,
      author: who(this.store.user(r.author_id)),
      text: r.text,
      replyTo: r.reply_to ?? null,
      toMe: r.addressed_to === this.agent.id,
      createdAt: r.created_at,
    };
  }
  /** Messages sent to this agent, in every chat it can still read, oldest first. */
  inbox(options: { since?: string; limit?: number } = {}): MessageInfo[] {
    const limit = clampLimit(options.limit);
    const since = readSince(options.since);
    const rows = since
      ? this.rows<MessageRow>(
          `select ${COLUMNS} from messages where addressed_to = ? and created_at > ? order by created_at, rowid`,
          this.agent.id,
          since,
        )
      : this.rows<MessageRow>(
          `select ${COLUMNS} from messages where addressed_to = ? order by created_at desc, rowid desc limit ?`,
          this.agent.id,
          limit * 4,
        ).reverse();
    const readable = new Map<Id, boolean>();
    const canRead = (chatId: Id) => {
      if (!readable.has(chatId)) {
        const chat = this.store.conversation(chatId);
        readable.set(
          chatId,
          !!chat &&
            chat.kind !== 'agent-private' &&
            this.inSpace(chat.spaceId) &&
            this.store.canReadConversation(this.agent.id, chat),
        );
      }
      return readable.get(chatId)!;
    };
    const kept = rows.filter((r) => canRead(r.conversation_id));
    return (since ? kept.slice(0, limit) : kept.slice(-limit)).map((r) => this.messageInfo(r));
  }

  me() {
    const owner = this.agent.ownerId ? this.store.user(this.agent.ownerId) : null;
    return {
      agent: { id: this.agent.id, name: this.agent.name, purpose: this.agent.purpose ?? '' },
      owner: owner ? { id: owner.id, name: owner.name } : null,
      spaces: this.spaces().map(({ id, name }) => ({ id, name })),
    };
  }
}

function clampLimit(raw: unknown) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, PAGE_LIMIT) : 50;
}
function readSince(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return null;
  const at = Date.parse(String(raw));
  if (!Number.isFinite(at))
    throw new InputError('since must be a date and time, like 2026-11-27T20:00:00Z.');
  return new Date(at).toISOString();
}

/** The token from `Authorization: Bearer sbx_…`. */
export function bearer(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)$/i.exec(value ?? '');
  return match ? match[1] : null;
}

/**
 * Answers one /api/v1 request. `path` is the URL path, `query` its search params. Throws
 * AccessError or InputError like the rest of the API; returns the status and JSON to send.
 */
export function outsideApi(
  store: Store,
  seats: Seats,
  request: {
    method: string;
    path: string;
    query: URLSearchParams;
    authorization: string | string[] | undefined;
  },
): { status: number; data: unknown } {
  const agent = seats.agentForToken(bearer(request.authorization));
  if (!agent) return { status: 401, data: { error: 'Use a live agent seat token.' } };
  const outside = new OutsideAgent(store, agent);
  const { method, query } = request;
  const [, , version, a, b, c] = request.path.split('/');
  if (version !== 'v1') return { status: 404, data: { error: 'Not found.' } };
  const options = { since: query.get('since') ?? undefined, limit: Number(query.get('limit')) };
  const ok = (data: unknown) => ({ status: 200, data });
  if (method === 'GET') {
    if (a === 'me' && !b) return ok(outside.me());
    if (a === 'spaces' && !b) return ok(outside.spaces());
    if (a === 'spaces' && b && c === 'pages') return ok(outside.pages(b));
    if (a === 'spaces' && b && c === 'chats') return ok(outside.chats(b));
    if (a === 'pages' && b && !c) return ok(outside.page(b));
    if (a === 'chats' && b && c === 'messages') return ok(outside.messages(b, options));
    if (a === 'inbox' && !b) return ok(outside.inbox(options));
  }
  return { status: 404, data: { error: 'Not found.' } };
}
