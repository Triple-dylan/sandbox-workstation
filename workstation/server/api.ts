import { AccessError, InputError, type Store } from './store.ts';
import type { Seats } from './seats.ts';
import type { Webhooks } from './webhooks.ts';
import { AllowanceUsed, type SeatAsks } from './seat-asks.ts';
import { changes } from './changes.ts';
import { isPage } from '../shared/types.ts';
import type { Conversation, Id, Message, Resource, User } from '../shared/types.ts';

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
  /** A direct message's other person. */
  with?: Who | null;
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
    if (!chat || !this.canRead(chat)) throw new AccessError('Not available.');
    return chat;
  }
  private canRead(chat: Conversation) {
    if (chat.kind === 'dm') return this.isMyDm(chat) && this.sharesSpace(this.dmOther(chat));
    return (
      chat.kind !== 'agent-private' &&
      this.inSpace(chat.spaceId) &&
      this.store.canReadConversation(this.agent.id, chat)
    );
  }

  // ---------- direct messages: one to one with a person it works with ----------

  private isMyDm(chat: Conversation) {
    return chat.kind === 'dm' && chat.participantIds.includes(this.agent.id);
  }
  private dmOther(chat: Conversation) {
    return chat.participantIds.find((id) => id !== this.agent.id) ?? null;
  }
  /**
   * A person it shares a live workspace with. A direct message stays open only while that holds,
   * so taking the seat out of a workspace also closes its DMs with the people there.
   */
  private sharesSpace(userId: Id | null) {
    const person = userId ? this.store.user(userId) : null;
    if (!person || person.kind !== 'human') return false;
    return this.store
      .memberSpaces(this.agent.id)
      .some((spaceId) => this.inSpace(spaceId) && this.store.isMember(person.id, spaceId));
  }
  private dmInfo(chat: Conversation): ChatInfo {
    return {
      id: chat.id,
      spaceId: null,
      kind: chat.kind,
      title: chat.title,
      pageId: null,
      with: who(this.store.user(this.dmOther(chat) ?? '')),
    };
  }
  /** Its direct messages with people it still shares a workspace with. */
  dms(): ChatInfo[] {
    return this.rows<{ id: Id }>(
      `select c.id from conversations c join participants p on p.conversation_id = c.id where c.kind = 'dm' and p.user_id = ? order by c.created_at, c.rowid`,
      this.agent.id,
    )
      .map((r) => this.store.conversation(r.id)!)
      .filter((c) => this.canRead(c))
      .map((c) => this.dmInfo(c));
  }
  /** Opens (or finds) its direct message with a person it shares a workspace with. */
  openDm(input: { userId?: unknown }) {
    const userId = typeof input.userId === 'string' ? input.userId : '';
    if (!this.sharesSpace(userId))
      throw new AccessError('You can message people you share a workspace with.');
    return this.dmInfo(this.store.openDm(this.agent.id, userId));
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
  private dmIds = new Map<Id, boolean>();
  /** Everything someone says in its DM is said to it. */
  private inMyDm(chatId: Id) {
    if (!this.dmIds.has(chatId)) {
      const chat = this.store.conversation(chatId);
      this.dmIds.set(chatId, !!chat && this.isMyDm(chat));
    }
    return this.dmIds.get(chatId)!;
  }
  /** An answer from one of Sandbox's agents to something this seat asked it. */
  private answersMe(messageId: Id) {
    return (
      this.rows(
        'select 1 from seat_asks where answer_id = ? and seat_id = ?',
        messageId,
        this.agent.id,
      ).length > 0
    );
  }
  protected messageInfo(r: MessageRow): MessageInfo {
    return {
      id: r.id,
      chatId: r.conversation_id,
      author: who(this.store.user(r.author_id)),
      text: r.text,
      replyTo: r.reply_to ?? null,
      toMe:
        r.addressed_to === this.agent.id ||
        (r.author_id !== this.agent.id && this.inMyDm(r.conversation_id)) ||
        this.answersMe(r.id),
      createdAt: r.created_at,
    };
  }
  /**
   * Messages sent to this agent, in every chat it can still read, oldest first: ones addressed to
   * it, and what people say in its direct messages.
   */
  inbox(options: { since?: string; limit?: number } = {}): MessageInfo[] {
    const limit = clampLimit(options.limit);
    const since = readSince(options.since);
    const toMe = `(addressed_to = ? or (author_id != ? and conversation_id in (
      select p.conversation_id from participants p join conversations c on c.id = p.conversation_id
      where p.user_id = ? and c.kind = 'dm')) or id in (
      select answer_id from seat_asks where seat_id = ? and answer_id is not null))`;
    const me = [this.agent.id, this.agent.id, this.agent.id, this.agent.id];
    const rows = since
      ? this.rows<MessageRow>(
          `select ${COLUMNS} from messages where ${toMe} and created_at > ? order by created_at, rowid`,
          ...me,
          since,
        )
      : this.rows<MessageRow>(
          `select ${COLUMNS} from messages where ${toMe} order by created_at desc, rowid desc limit ?`,
          ...me,
          limit * 4,
        ).reverse();
    const readable = new Map<Id, boolean>();
    const canRead = (chatId: Id) => {
      if (!readable.has(chatId)) {
        const chat = this.store.conversation(chatId);
        readable.set(chatId, !!chat && this.canRead(chat));
      }
      return readable.get(chatId)!;
    };
    const kept = rows.filter((r) => canRead(r.conversation_id));
    return (since ? kept.slice(0, limit) : kept.slice(-limit)).map((r) => this.messageInfo(r));
  }

  // ---------- writes: as itself, where it is a member, like a person ----------

  /**
   * Says something in a chat it can read, or replies in a thread there. With `ask` (and the seat's
   * allowance left), it puts the message to one of the workspace's own agents, who answers in its
   * thread.
   */
  post(chatId: Id, input: { text?: unknown; replyTo?: unknown; ask?: unknown }, asks?: SeatAsks) {
    const chat = this.readableChat(chatId);
    const asked = input.ask !== undefined && input.ask !== null && input.ask !== '';
    if (asked && !asks) throw new InputError("Asking Sandbox's agents is not available here.");
    const agent = asked ? asks!.check(this.agent, chat, input.ask) : null;
    const message = this.store.postMessage(this.agent.id, {
      conversationId: chat.id,
      text: typeof input.text === 'string' ? input.text : '',
      replyTo: typeof input.replyTo === 'string' && input.replyTo ? input.replyTo : null,
      ...(agent ? { addressedTo: agent.id } : {}),
    });
    if (agent) asks!.record(message);
    return this.messageInfo({
      id: message.id,
      conversation_id: message.conversationId,
      author_id: message.authorId,
      text: message.text,
      reply_to: message.replyTo,
      addressed_to: message.addressedTo,
      created_at: message.createdAt,
    });
  }
  /** A new doc in a workspace: shared with the space unless asked to keep it private to itself. */
  createDoc(spaceId: Id, input: { title?: unknown; body?: unknown; visibility?: unknown }) {
    this.space(spaceId);
    const page = this.store.createResource(this.agent.id, {
      spaceId,
      kind: 'doc',
      title: typeof input.title === 'string' ? input.title : '',
      body: typeof input.body === 'string' ? input.body : '',
      visibility: input.visibility === 'private' ? 'private' : 'space',
    });
    return this.page(page.id);
  }
  /** Renames a page, or replaces a doc's Markdown. People editing it see the new text at once. */
  editPage(pageId: Id, input: { title?: unknown; body?: unknown }) {
    const page = this.writablePage(pageId);
    const body = typeof input.body === 'string' ? input.body : undefined;
    if (body !== undefined && page.kind !== 'doc')
      throw new InputError('Only a doc takes new text here; change a sheet with its cells.');
    const title = typeof input.title === 'string' ? input.title : undefined;
    if (title === undefined && body === undefined) throw new InputError('Nothing to change.');
    this.store.updateResource(this.agent.id, page.id, {
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
    });
    return this.page(page.id);
  }
  /** Sets cells on a sheet, counted from 0. A linked sheet passes them on as a person's edits do. */
  setCells(pageId: Id, input: { edits?: unknown }) {
    const page = this.writablePage(pageId);
    if (page.kind !== 'sheet') throw new InputError('Cells are only on sheets.');
    if (!Array.isArray(input.edits)) throw new InputError('Send edits: [{ row, col, value }].');
    this.store.setCells(
      this.agent.id,
      page.id,
      input.edits.map((e: any) => ({
        row: Number(e?.row),
        col: Number(e?.col),
        value: String(e?.value ?? ''),
      })),
    );
    return this.page(page.id);
  }
  private writablePage(pageId: Id) {
    const page = this.readablePage(pageId);
    // A workspace's About page is kept by its own agent; a browser page is what its browser shows.
    if (page.role || page.kind === 'browser')
      throw new AccessError('This page is kept by Sandbox.');
    return page;
  }

  /** Sandbox's own agents it may ask in a chat it can read, by id and name. */
  askable(chatId: Id, asks?: SeatAsks) {
    const chat = this.readableChat(chatId);
    return (asks?.askable(chat) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      purpose: a.purpose ?? '',
    }));
  }

  /** A message as this agent would read it, or null if it cannot read that chat. */
  seeMessage(message: Message): MessageInfo | null {
    try {
      this.readableChat(message.conversationId);
    } catch {
      return null;
    }
    return this.messageInfo({
      id: message.id,
      conversation_id: message.conversationId,
      author_id: message.authorId,
      text: message.text,
      reply_to: message.replyTo,
      addressed_to: message.addressedTo,
      created_at: message.createdAt,
    });
  }
  /** A page's details as this agent would see them, or null if it cannot open it. */
  seePage(pageId: Id): PageInfo | null {
    try {
      return this.pageInfo(this.readablePage(pageId));
    } catch {
      return null;
    }
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

/**
 * At most WRITES_PER_MINUTE changes a minute per seat, so a looping agent cannot flood a
 * workspace. Reads are not limited: they change nothing.
 */
const WRITES_PER_MINUTE = 60;
const writes = new Map<Id, { n: number; at: number }>();
function allowWrite(agentId: Id) {
  const seen = writes.get(agentId);
  const fresh = !seen || Date.now() - seen.at > 60_000;
  const next = fresh ? { n: 1, at: Date.now() } : { n: seen.n + 1, at: seen.at };
  writes.set(agentId, next);
  if (writes.size > 5000) writes.clear();
  return next.n <= WRITES_PER_MINUTE;
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
    input?: Record<string, unknown>;
  },
  webhooks?: Webhooks,
  asks?: SeatAsks,
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
    if (a === 'dms' && !b) return ok(outside.dms());
    if (a === 'changes' && !b)
      return ok(
        changes(store, outside, {
          cursor: query.get('cursor'),
          since: query.get('since'),
          limit: Number(query.get('limit')),
        }),
      );
    if (a === 'chats' && b && c === 'agents') return ok(outside.askable(b, asks));
    if (a === 'asks' && !b && asks) return ok(asks.allowance(agent.id));
    if (a === 'webhooks' && !b && webhooks) return ok(webhooks.list(agent.id));
  }
  if (method === 'GET') return { status: 404, data: { error: 'Not found.' } };
  if (!allowWrite(agent.id))
    return { status: 429, data: { error: 'Too many changes. Wait a minute and try again.' } };
  const input = request.input ?? {};
  if (method === 'POST' && a === 'chats' && b && c === 'messages')
    try {
      return ok(outside.post(b, input, asks));
    } catch (error) {
      if (error instanceof AllowanceUsed) return { status: 429, data: { error: error.message } };
      throw error;
    }
  if (method === 'POST' && a === 'spaces' && b && c === 'pages')
    return ok(outside.createDoc(b, input));
  if (method === 'POST' && a === 'dms' && !b) return ok(outside.openDm(input));
  if (method === 'PATCH' && a === 'pages' && b && !c) return ok(outside.editPage(b, input));
  if (method === 'POST' && a === 'pages' && b && c === 'cells')
    return ok(outside.setCells(b, input));
  if (webhooks && a === 'webhooks' && method === 'POST' && !b)
    return ok(webhooks.add(agent.id, bearer(request.authorization)!, input.url));
  if (webhooks && a === 'webhooks' && method === 'DELETE' && b && !c) {
    webhooks.remove(agent.id, b);
    return ok({ ok: true });
  }
  return { status: 404, data: { error: 'Not found.' } };
}
