import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccessError, InputError, type Store } from './store.ts';
import type { Seats } from './seats.ts';
import { OAuth } from './oauth.ts';
import { cellEdits, colName, evaluate } from '../shared/formula.ts';
import { readSheet, toTsv } from '../shared/sheet.ts';
import { isPage, type Conversation, type Id, type Resource, type User } from '../shared/types.ts';

/**
 * One remote MCP server (Streamable HTTP, at /mcp) that any agent seat signs in to with its token:
 * Claude Code, Codex, Hermes, Grok and anything else that speaks MCP. Every tool runs as the seat,
 * through the same access checks as a person, so it sees what its workspaces share and nothing
 * else. Reading and chatting are direct. Changes to pages are suggestions that a person in the
 * workspace accepts or declines, as with Sandbox's own agents. While it works it can say which
 * page it is on, and it then orbits that page in the graph like any agent at work.
 *
 * Plain JSON-RPC over POST; no server-sent stream, which the spec allows for a server that only
 * answers requests. Sessions are not needed: each request carries the token.
 */

export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'sandbox', title: 'Sandbox', version: '0.1.0' };
/** A seat at work that says nothing more for this long is taken to have stopped. */
const WORK_IDLE_MS = 10 * 60_000;
/** Requests a minute per seat: generous for an agent, a stop for a runaway loop. */
const PER_MINUTE = 120;

type Json = Record<string, any>;
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  readOnly?: boolean;
  run: (seat: User, args: Json) => unknown;
};

class ToolError extends Error {}

const text = (value: unknown, max = 200) => String(value ?? '').slice(0, max);
const required = (args: Json, key: string) => {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`${key} is required.`);
  return value.trim();
};

export class Mcp {
  private store: Store;
  private seats: Seats;
  private tools: Tool[];
  private calls = new Map<Id, { n: number; at: number }>();
  /** The job that shows each seat at work, while it is at work. */
  private working = new Map<Id, { jobId: Id; timer: ReturnType<typeof setTimeout> }>();

  constructor(store: Store, seats: Seats) {
    this.store = store;
    this.seats = seats;
    // A restart forgets who was at work; nobody should orbit forever.
    store.db
      .prepare(
        `update jobs set status = 'done' where runtime = 'outside' and status in ('queued', 'running')`,
      )
      .run();
    this.tools = this.makeTools();
  }

  stop() {
    for (const { timer } of this.working.values()) clearTimeout(timer);
    this.working.clear();
  }

  // ---------- HTTP ----------

  async handle(req: IncomingMessage, res: ServerResponse, origin: string) {
    const reply = (status: number, data: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...headers,
      });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    // A web page may not drive this with someone's token (DNS rebinding); agents send no Origin.
    const from = req.headers.origin;
    if (from && from !== origin) return reply(403, { error: 'Origin not allowed.' });
    if (req.method !== 'POST')
      return reply(405, { error: 'POST JSON-RPC to this address.' }, { allow: 'POST' });
    const auth = String(req.headers.authorization ?? '');
    const seat = this.seats.agentForToken(auth.replace(/^Bearer\s+/i, '').trim());
    if (!seat)
      return reply(
        401,
        { error: 'Sign in with an agent token from Sandbox (Authorization: Bearer sbx_…).' },
        // Points clients that sign in with a browser to it (server/oauth.ts).
        {
          'www-authenticate': `Bearer realm="sandbox", resource_metadata="${OAuth.resourceMetadata(origin)}"`,
        },
      );
    const seen = this.calls.get(seat.id);
    const fresh = !seen || Date.now() - seen.at > 60_000;
    const next = fresh ? { n: 1, at: Date.now() } : { n: seen.n + 1, at: seen.at };
    this.calls.set(seat.id, next);
    if (next.n > PER_MINUTE) return reply(429, { error: 'Too many requests. Wait a minute.' });

    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) return reply(413, { error: 'Request too large.' });
      chunks.push(chunk);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply(400, rpcError(null, -32700, 'Parse error.'));
    }
    const batch = Array.isArray(body);
    const answers = (batch ? (body as unknown[]) : [body])
      .map((message) => this.answer(seat, message))
      .filter((a) => a !== null);
    // Only notifications and answers: nothing to send back.
    if (!answers.length) return reply(202, undefined);
    return reply(200, batch ? answers : answers[0]);
  }

  /** One JSON-RPC message; null for a notification, which gets no answer. */
  answer(seat: User, message: unknown): Json | null {
    if (!message || typeof message !== 'object') return rpcError(null, -32600, 'Invalid request.');
    const { id, method, params } = message as Json;
    const isRequest = id !== undefined && id !== null;
    if (typeof method !== 'string') return isRequest ? rpcError(id, -32600, 'No method.') : null;
    if (!isRequest) return null;
    if (method === 'initialize') {
      const asked = String(params?.protocolVersion ?? '');
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: this.instructions(seat),
      });
    }
    if (method === 'ping') return rpcResult(id, {});
    if (method === 'tools/list')
      return rpcResult(id, {
        tools: this.tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly, openWorldHint: false },
        })),
      });
    if (method === 'tools/call') {
      const tool = this.tools.find((t) => t.name === params?.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${text(params?.name, 60)}`);
      // The seat may have been retired or taken out a moment ago: look again for every call.
      const current = this.store.user(seat.id);
      if (!current || current.retired) return rpcError(id, -32001, 'This agent is retired.');
      try {
        const result = tool.run(
          current,
          params?.arguments && typeof params.arguments === 'object' ? params.arguments : {},
        );
        return rpcResult(id, {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
          ...(result && typeof result === 'object' ? { structuredContent: wrap(result) } : {}),
          isError: false,
        });
      } catch (error) {
        if (
          error instanceof ToolError ||
          error instanceof AccessError ||
          error instanceof InputError
        )
          return rpcResult(id, {
            content: [{ type: 'text', text: (error as Error).message }],
            isError: true,
          });
        console.error('mcp tool failed', error);
        return rpcError(id, -32603, 'Server error.');
      }
    }
    return rpcError(id, -32601, `Unknown method: ${text(method, 60)}`);
  }

  private instructions(seat: User) {
    const spaces = this.seats
      .spacesOf(seat.id)
      .map((id) => this.store.space(id)?.name)
      .filter(Boolean);
    return [
      `You are ${seat.name}, an agent seat in Sandbox, a shared workspace for people and their agents.`,
      spaces.length
        ? `You are a member of: ${spaces.join(', ')}.`
        : 'You have not been added to a workspace yet; your owner adds you in Sandbox.',
      'You see what those workspaces share and pages opened to you, nothing private.',
      'Start with inbox for messages to you. Read with list_pages, read_page, search and read_chat; answer with post_message.',
      'Changes to pages are suggestions (suggest_edit, suggest_cells, suggest_page) that a person accepts.',
      'Call working_on with the page you are working on so people see it, and with done: true when you stop.',
    ].join(' ');
  }

  // ---------- what the seat can reach ----------

  private spacesOf(seat: User) {
    return this.seats
      .spacesOf(seat.id)
      .map((id) => this.store.space(id)!)
      .filter(Boolean);
  }
  private space(seat: User, spaceId: string) {
    const space = this.spacesOf(seat).find((s) => s.id === spaceId);
    if (!space) throw new ToolError('Unknown workspace. Use list_workspaces.');
    return space;
  }
  private page(seat: User, pageId: string) {
    const page = this.store.resource(pageId);
    if (!page || !isPage(page.kind) || !this.store.canReadResource(seat.id, page))
      throw new ToolError('Unknown page, or not opened to you. Use list_pages or search.');
    return page;
  }
  private pages(seat: User, spaceId?: string) {
    const spaces = spaceId ? [this.space(seat, spaceId)] : this.spacesOf(seat);
    return spaces.flatMap((s) =>
      this.store.readableResources(seat.id, s.id).filter((r) => isPage(r.kind) && !r.archived),
    );
  }
  private conversations(seat: User, spaceId?: string) {
    const spaces = new Set(
      (spaceId ? [this.space(seat, spaceId)] : this.spacesOf(seat)).map((s) => s.id),
    );
    return (
      this.store.db.prepare('select id from conversations order by created_at, rowid').all() as {
        id: Id;
      }[]
    )
      .map((r) => this.store.conversation(r.id)!)
      .filter(
        (c) =>
          !!c && !!c.spaceId && spaces.has(c.spaceId) && this.store.canReadConversation(seat.id, c),
      );
  }
  private conversation(seat: User, conversationId: string) {
    const c = this.store.conversation(conversationId);
    if (!c || !c.spaceId || !this.store.canReadConversation(seat.id, c))
      throw new ToolError('Unknown chat. Use list_chats.');
    return c;
  }
  private general(spaceId: Id) {
    const row = this.store.db
      .prepare(
        `select id from conversations where kind = 'channel' and space_id = ? order by case when title = 'general' then 0 else 1 end, created_at limit 1`,
      )
      .get(spaceId) as { id: Id } | undefined;
    return row ? this.store.conversation(row.id) : null;
  }
  private name(userId: Id) {
    return this.store.user(userId)?.name ?? 'Someone';
  }
  private pageSummary(r: Resource) {
    return {
      id: r.id,
      title: r.title,
      kind: r.kind,
      workspace: this.store.space(r.spaceId)?.name ?? '',
      workspaceId: r.spaceId,
      shared: r.visibility === 'space',
      updatedAt: r.updatedAt,
      updatedBy: this.name(r.updatedBy),
    };
  }
  private chatSummary(c: Conversation) {
    return {
      id: c.id,
      kind: c.kind,
      title: c.kind === 'channel' ? `#${c.title}` : c.title,
      workspaceId: c.spaceId,
      ...(c.resourceId ? { pageId: c.resourceId } : {}),
    };
  }
  private messageSummary(m: ReturnType<Store['messages']>[number]) {
    return {
      id: m.id,
      chatId: m.conversationId,
      from: this.name(m.authorId),
      fromId: m.authorId,
      text: m.text,
      at: m.createdAt,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.addressedTo ? { to: this.name(m.addressedTo) } : {}),
      ...(m.anchor ? { about: { pageId: m.anchor.resourceId, quote: m.anchor.quote } } : {}),
    };
  }
  private readBody(page: Resource) {
    if (page.kind === 'sheet') {
      const sheet = readSheet(page.body);
      // Values as shown, without the empty cells past the last one filled in each row and below.
      const shown = sheet.rows.map((row, r) => {
        const cells = row.map((_, c) => evaluate(sheet.rows, r, c));
        while (cells.length && !cells.at(-1)) cells.pop();
        return cells;
      });
      while (shown.length && !shown.at(-1)!.length) shown.pop();
      const formulas = sheet.rows.flatMap((row, r) =>
        row.flatMap((cell, c) => (cell.startsWith('=') ? [`${colName(c)}${r + 1} ${cell}`] : [])),
      );
      return {
        format: 'tsv',
        note: 'Values as shown, tab-separated; row 1 is the first line. Cells are named like B3.',
        text: toTsv(shown),
        ...(formulas.length ? { formulas } : {}),
      };
    }
    if (page.kind === 'doc') return { format: 'markdown', text: page.body };
    if (page.kind === 'asset' && page.body.startsWith('data:'))
      return { format: 'binary', text: '(A picture or file; its contents are not text.)' };
    return { format: 'json', text: page.body.slice(0, 200_000) };
  }

  /** A suggestion from the seat: a person in the workspace accepts or declines it where it lands. */
  private suggest(
    seat: User,
    input: {
      spaceId: Id;
      conversation: Conversation;
      proposal: {
        kind: 'create-doc' | 'edit-doc' | 'edit-cells';
        title: string;
        body: string;
        resourceId?: Id;
      };
      note: string;
    },
  ) {
    const job = this.store.createJob({
      agentId: seat.id,
      spaceId: input.spaceId,
      conversationId: input.conversation.id,
      kind: 'instruction',
      request: input.note || `Suggested by ${seat.name}`,
      targetResourceId: input.proposal.resourceId ?? null,
      runtime: 'outside',
    });
    const approval = this.store.createApproval(job, input.proposal);
    this.store.setJob(job.id, 'awaiting_approval');
    const message = this.store.postMessage(
      seat.id,
      {
        conversationId: input.conversation.id,
        text: input.note || 'I drafted a suggestion for review.',
      },
      { jobId: job.id, approvalId: approval.id, runtime: 'outside' },
    );
    return {
      suggestionId: approval.id,
      status: 'waiting for a person to accept',
      chatId: input.conversation.id,
      messageId: message.id,
    };
  }
  private whereToSuggest(seat: User, page: Resource | null, spaceId: Id, chatId: unknown) {
    if (typeof chatId === 'string' && chatId) {
      const c = this.conversation(seat, chatId);
      if (c.spaceId !== spaceId) throw new ToolError('That chat is in another workspace.');
      return c;
    }
    const c = page ? this.store.openDiscussion(seat.id, page.id) : this.general(spaceId);
    if (!c) throw new ToolError('Name a chat_id to put the suggestion in.');
    return c;
  }

  private setWorking(
    seat: User,
    input: { spaceId: Id; pageId: Id | null; chatId: Id | null; note: string },
  ) {
    this.stopWorking(seat.id);
    const job = this.store.createJob({
      agentId: seat.id,
      spaceId: input.spaceId,
      conversationId: input.chatId,
      kind: 'instruction',
      request: input.note || `${seat.name} at work`,
      targetResourceId: input.pageId,
      runtime: 'outside',
    });
    this.store.setJob(job.id, 'running');
    const timer = setTimeout(() => this.stopWorking(seat.id), WORK_IDLE_MS);
    timer.unref?.();
    this.working.set(seat.id, { jobId: job.id, timer });
  }
  private stopWorking(seatId: Id) {
    const current = this.working.get(seatId);
    if (!current) return false;
    clearTimeout(current.timer);
    this.working.delete(seatId);
    if (this.store.job(current.jobId)?.status === 'running')
      this.store.setJob(current.jobId, 'done');
    return true;
  }

  // ---------- tools ----------

  private makeTools(): Tool[] {
    const str = (description: string) => ({ type: 'string', description });
    const obj = (properties: Json, req: string[] = []) => ({
      type: 'object',
      properties,
      required: req,
      additionalProperties: false,
    });
    return [
      {
        name: 'whoami',
        title: 'Who am I',
        description: 'Your name in Sandbox, who you belong to, and the workspaces you are in.',
        inputSchema: obj({}),
        readOnly: true,
        run: (seat) => ({
          name: seat.name,
          id: seat.id,
          purpose: seat.purpose ?? '',
          owner: seat.ownerId ? this.name(seat.ownerId) : '',
          workspaces: this.spacesOf(seat).map((s) => ({ id: s.id, name: s.name })),
        }),
      },
      {
        name: 'list_workspaces',
        title: 'List workspaces',
        description: 'The workspaces you are a member of, with who is in each.',
        inputSchema: obj({}),
        readOnly: true,
        run: (seat) =>
          this.spacesOf(seat).map((s) => ({
            id: s.id,
            name: s.name,
            members: this.store.membersOf(s.id),
          })),
      },
      {
        name: 'list_pages',
        title: 'List pages',
        description:
          'Pages you can open (documents, sheets, decks, canvases, files), newest change first.',
        inputSchema: obj({ workspace_id: str('Only this workspace. Leave out for all of them.') }),
        readOnly: true,
        run: (seat, args) =>
          this.pages(seat, typeof args.workspace_id === 'string' ? args.workspace_id : undefined)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 200)
            .map((r) => this.pageSummary(r)),
      },
      {
        name: 'read_page',
        title: 'Read a page',
        description:
          'A page in full: a document as Markdown, a sheet as tab-separated values with its formulas.',
        inputSchema: obj({ page_id: str('The page id, from list_pages or search.') }, ['page_id']),
        readOnly: true,
        run: (seat, args) => {
          const page = this.page(seat, required(args, 'page_id'));
          return { ...this.pageSummary(page), ...this.readBody(page) };
        },
      },
      {
        name: 'search',
        title: 'Search',
        description: 'Find pages by words in their title or text, best match first.',
        inputSchema: obj(
          {
            query: str('Words to look for.'),
            workspace_id: str('Only this workspace. Leave out for all of them.'),
          },
          ['query'],
        ),
        readOnly: true,
        run: (seat, args) => {
          const words = required(args, 'query')
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 1);
          if (!words.length) throw new ToolError('Give a word or two to look for.');
          return this.pages(
            seat,
            typeof args.workspace_id === 'string' ? args.workspace_id : undefined,
          )
            .map((r) => {
              const title = r.title.toLowerCase();
              const body =
                r.kind === 'asset' && r.body.startsWith('data:') ? '' : r.body.toLowerCase();
              const score = words.reduce(
                (n, w) => n + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0),
                0,
              );
              const at = body.indexOf(words.find((w) => body.includes(w)) ?? '\u0000');
              return {
                score,
                page: this.pageSummary(r),
                ...(at >= 0 ? { snippet: r.body.slice(Math.max(0, at - 80), at + 160) } : {}),
              };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(({ score: _score, ...rest }) => rest);
        },
      },
      {
        name: 'list_chats',
        title: 'List chats',
        description: 'Channels and page discussions you can read.',
        inputSchema: obj({ workspace_id: str('Only this workspace. Leave out for all of them.') }),
        readOnly: true,
        run: (seat, args) =>
          this.conversations(
            seat,
            typeof args.workspace_id === 'string' ? args.workspace_id : undefined,
          ).map((c) => this.chatSummary(c)),
      },
      {
        name: 'read_chat',
        title: 'Read a chat',
        description: 'The latest messages in a chat, oldest first.',
        inputSchema: obj(
          {
            chat_id: str('The chat id, from list_chats or inbox.'),
            since: str('Only messages after this time (ISO 8601).'),
            limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50.' },
          },
          ['chat_id'],
        ),
        readOnly: true,
        run: (seat, args) => {
          const c = this.conversation(seat, required(args, 'chat_id'));
          const since = typeof args.since === 'string' ? args.since : '';
          const limit = Math.min(200, Math.max(1, Number(args.limit) || 50));
          return {
            chat: this.chatSummary(c),
            messages: this.store
              .messages(c.id)
              .filter((m) => !since || m.createdAt > since)
              .slice(-limit)
              .map((m) => this.messageSummary(m)),
          };
        },
      },
      {
        name: 'inbox',
        title: 'Inbox',
        description:
          'Messages to you: where someone tagged you, or replied in a thread you are in. Newest first.',
        inputSchema: obj({
          since: str('Only messages after this time (ISO 8601).'),
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 30.' },
        }),
        readOnly: true,
        run: (seat, args) => {
          const since = typeof args.since === 'string' ? args.since : '';
          const limit = Math.min(100, Math.max(1, Number(args.limit) || 30));
          const tag = `@${seat.name.toLowerCase()}`;
          return this.conversations(seat)
            .flatMap((c) => {
              const messages = this.store.messages(c.id);
              const mine = new Set(messages.filter((m) => m.authorId === seat.id).map((m) => m.id));
              return messages.filter(
                (m) =>
                  m.authorId !== seat.id &&
                  (m.addressedTo === seat.id ||
                    m.text.toLowerCase().includes(tag) ||
                    (!!m.replyTo && mine.has(m.replyTo))),
              );
            })
            .filter((m) => !since || m.createdAt > since)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit)
            .map((m) => this.messageSummary(m));
        },
      },
      {
        name: 'post_message',
        title: 'Post a message',
        description: 'Say something in a chat, as yourself. Use reply_to to answer in a thread.',
        inputSchema: obj(
          {
            chat_id: str('The chat id.'),
            text: str('What to say. Markdown works.'),
            reply_to: str('The message id this answers, to reply in its thread.'),
          },
          ['chat_id', 'text'],
        ),
        run: (seat, args) => {
          const c = this.conversation(seat, required(args, 'chat_id'));
          const message = this.store.postMessage(
            seat.id,
            {
              conversationId: c.id,
              text: required(args, 'text'),
              replyTo: typeof args.reply_to === 'string' && args.reply_to ? args.reply_to : null,
            },
            { runtime: 'outside' },
          );
          return this.messageSummary(message);
        },
      },
      {
        name: 'suggest_edit',
        title: 'Suggest a document edit',
        description:
          'Suggest replacing exact text in a document. A person sees it in the chat and accepts or declines it.',
        inputSchema: obj(
          {
            page_id: str('The document.'),
            find: str('The exact text to replace, copied from read_page.'),
            replace: str('What replaces it.'),
            note: str('One line on why, shown with the suggestion.'),
            chat_id: str('Where to put it. Leave out for the page’s own discussion.'),
          },
          ['page_id', 'find', 'replace'],
        ),
        run: (seat, args) => {
          const page = this.page(seat, required(args, 'page_id'));
          if (page.kind !== 'doc')
            throw new ToolError('suggest_edit is for documents. Use suggest_cells for sheets.');
          if (page.role === 'orientation')
            throw new ToolError('This page is kept by its workspace agent.');
          const find = required(args, 'find');
          if (!page.body.includes(find))
            throw new ToolError('That text is not in the page. Read it again and copy it exactly.');
          return this.suggest(seat, {
            spaceId: page.spaceId,
            conversation: this.whereToSuggest(seat, page, page.spaceId, args.chat_id),
            proposal: {
              kind: 'edit-doc',
              title: find,
              body: String(args.replace ?? ''),
              resourceId: page.id,
            },
            note: text(args.note, 500),
          });
        },
      },
      {
        name: 'suggest_cells',
        title: 'Suggest sheet changes',
        description:
          'Suggest new values for sheet cells, one per line like "B3 = 2800" or "C7 = =SUM(C2:C6)". A person accepts or declines.',
        inputSchema: obj(
          {
            page_id: str('The sheet.'),
            changes: str('One change per line, like B3 = 2800.'),
            note: str('One line on why, shown with the suggestion.'),
            chat_id: str('Where to put it. Leave out for the page’s own discussion.'),
          },
          ['page_id', 'changes'],
        ),
        run: (seat, args) => {
          const page = this.page(seat, required(args, 'page_id'));
          if (page.kind !== 'sheet') throw new ToolError('suggest_cells is for sheets.');
          const changes = required(args, 'changes');
          if (!cellEdits(changes))
            throw new ToolError('Write one change per line, like B3 = 2800.');
          return this.suggest(seat, {
            spaceId: page.spaceId,
            conversation: this.whereToSuggest(seat, page, page.spaceId, args.chat_id),
            proposal: { kind: 'edit-cells', title: page.title, body: changes, resourceId: page.id },
            note: text(args.note, 500),
          });
        },
      },
      {
        name: 'suggest_page',
        title: 'Suggest a new page',
        description:
          'Suggest a new document in a workspace. It is made, shared with the workspace, when a person accepts it.',
        inputSchema: obj(
          {
            workspace_id: str('The workspace.'),
            title: str('The page title.'),
            body: str('The page, in Markdown.'),
            note: str('One line on what it is, shown with the suggestion.'),
            chat_id: str('Where to put it. Leave out for the workspace’s main chat.'),
          },
          ['workspace_id', 'title', 'body'],
        ),
        run: (seat, args) => {
          const space = this.space(seat, required(args, 'workspace_id'));
          return this.suggest(seat, {
            spaceId: space.id,
            conversation: this.whereToSuggest(seat, null, space.id, args.chat_id),
            proposal: {
              kind: 'create-doc',
              title: required(args, 'title').slice(0, 120),
              body: String(args.body ?? '').slice(0, 50_000),
            },
            note: text(args.note, 500),
          });
        },
      },
      {
        name: 'suggestion_status',
        title: 'Suggestion status',
        description: 'Whether a suggestion you made was accepted, declined or is still waiting.',
        inputSchema: obj(
          { suggestion_id: str('From suggest_edit, suggest_cells or suggest_page.') },
          ['suggestion_id'],
        ),
        readOnly: true,
        run: (seat, args) => {
          const approval = this.store.approval(required(args, 'suggestion_id'));
          if (!approval || approval.agentId !== seat.id) throw new ToolError('Unknown suggestion.');
          return {
            status: approval.status === 'pending' ? 'waiting' : approval.status,
            ...(approval.decidedBy ? { decidedBy: this.name(approval.decidedBy) } : {}),
            ...(approval.resultResourceId ? { pageId: approval.resultResourceId } : {}),
          };
        },
      },
      {
        name: 'working_on',
        title: 'Say what you are working on',
        description:
          'Show people which page (or chat) you are working on; you appear at work there in Sandbox and orbit it in the graph. Send done: true when you stop. It clears itself after 10 quiet minutes.',
        inputSchema: obj({
          page_id: str('The page you are working on.'),
          chat_id: str('Or the chat you are answering in.'),
          note: str('A few words on what you are doing.'),
          done: { type: 'boolean', description: 'true when you have stopped.' },
        }),
        run: (seat, args) => {
          if (args.done === true) return { working: false, stopped: this.stopWorking(seat.id) };
          const page =
            typeof args.page_id === 'string' && args.page_id ? this.page(seat, args.page_id) : null;
          const chat =
            typeof args.chat_id === 'string' && args.chat_id
              ? this.conversation(seat, args.chat_id)
              : null;
          const spaceId = page?.spaceId ?? chat?.spaceId;
          if (!spaceId) throw new ToolError('Name a page_id or chat_id, or send done: true.');
          if (page && chat && chat.spaceId !== page.spaceId)
            throw new ToolError('That page and chat are in different workspaces.');
          this.setWorking(seat, {
            spaceId,
            pageId: page?.id ?? null,
            chatId: chat?.id ?? null,
            note: text(args.note, 300),
          });
          return {
            working: true,
            page: page?.title ?? null,
            chat: chat ? this.chatSummary(chat).title : null,
          };
        },
      },
    ];
  }
}

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});
/** structuredContent must be an object; a list goes under "items". */
const wrap = (value: object) => (Array.isArray(value) ? { items: value } : value);
