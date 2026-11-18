import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.ts';
import { AccessError, InputError, Store } from './store.ts';
import { AgentEngine } from './agents/engine.ts';
import type { AgentRuntime } from './agents/runtime.ts';
import { selectRuntime } from './env.ts';
import { CANVAS_KINDS, PAGE_KINDS } from '../shared/types.ts';
import type { Id, Presence, User } from '../shared/types.ts';

const COOKIE = 'sw_session';
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export type AppOptions = {
  dbPath: string;
  runtime?: AgentRuntime;
  staticDir?: string | null;
  maintenanceDelayMs?: number;
  env?: NodeJS.ProcessEnv;
};

const segments0 = (path: string) => path.split('/')[2] ?? '';

export function createApp(options: AppOptions) {
  const env = options.env ?? process.env;
  // Hosted copies run by invitation; a local copy lets anyone pick a name.
  const mode: 'open' | 'invite' = env.SIGN_IN === 'invite' ? 'invite' : 'open';
  const store = new Store(openDb(options.dbPath), { closed: mode === 'invite' });
  const runtime = options.runtime ?? selectRuntime(options.env ?? process.env, store);
  const engine = new AgentEngine(store, runtime, {
    maintenanceDelayMs: options.maintenanceDelayMs,
  });
  const staticDir =
    options.staticDir === undefined
      ? fileURLToPath(new URL('../dist/', import.meta.url))
      : options.staticDir;
  // When set, joining needs this code: the least a hosted copy should ask before real accounts exist.
  const accessCode = env.ACCESS_CODE?.trim() || '';
  // A few tries a minute per address on the doors in, so codes and links cannot be guessed.
  const attempts = new Map<string, { n: number; at: number }>();
  const slowDown = (req: IncomingMessage) => {
    const who = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '')
      .split(',')[0]
      .trim();
    const seen = attempts.get(who);
    const fresh = !seen || Date.now() - seen.at > 60_000;
    const next = fresh ? { n: 1, at: Date.now() } : { n: seen.n + 1, at: seen.at };
    attempts.set(who, next);
    if (attempts.size > 5000) attempts.clear();
    if (next.n > 20) throw new InputError('Too many tries. Wait a minute and try again.');
  };
  const cookieFor = (req: IncomingMessage, token: string) =>
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
  const presence = new Map<Id, Presence>();
  const streams = new Map<ServerResponse, Id>();
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  const broadcast = () => {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      for (const res of streams.keys()) res.write(`data: ${store.version}\n\n`);
    }, 40);
  };
  store.onChange(broadcast);
  const heartbeat = setInterval(() => {
    for (const res of streams.keys()) res.write(': keepalive\n\n');
  }, 25_000);
  const runtimeInfo = {
    id: runtime.id,
    label: runtime.label,
    ...(runtime.model ? { model: runtime.model } : {}),
  };

  const cookie = (req: IncomingMessage) =>
    Object.fromEntries(
      (req.headers.cookie ?? '').split(';').map((part) => {
        const [k, ...v] = part.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      }),
    )[COOKIE];

  async function body(req: IncomingMessage) {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new InputError('Request too large.');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new InputError('Invalid JSON.');
    }
  }
  const send = (
    res: ServerResponse,
    status: number,
    data: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(JSON.stringify(data));
  };
  const setPresence = (userId: Id, patch: Partial<Presence>) => {
    const current = presence.get(userId) ?? {
      userId,
      spaceId: null,
      resourceId: null,
      conversationId: null,
      editing: false,
      online: false,
    };
    presence.set(userId, { ...current, ...patch });
    store.changed();
  };

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && req.headers['x-workstation'] !== '1')
      return send(res, 403, { error: 'Missing request header.' });
    if (path === '/api/config' && method === 'GET')
      return send(res, 200, { accessCode: !!accessCode, mode });
    if (segments0(path) === 'invite' && method === 'GET') {
      slowDown(req);
      return send(res, 200, store.inviteInfo(path.split('/')[3] ?? ''));
    }
    if (path === '/api/profiles' && method === 'GET')
      return send(
        res,
        200,
        // With an access code set, the list of people is not shown to someone who has not joined.
        accessCode || mode === 'invite'
          ? []
          : store.profiles().map(({ id, name, color }) => ({ id, name, color })),
      );
    if (path === '/api/join' && method === 'POST') {
      const input = await body(req);
      slowDown(req);
      let user: User | null = null;
      if (typeof input.signin === 'string') user = store.useSignInLink(input.signin);
      else if (mode === 'invite') {
        // A new account needs an invite link, or the setup code for the first people in.
        const invite = typeof input.invite === 'string' ? input.invite : '';
        if (invite) store.inviteInfo(invite);
        else if (!accessCode || String(input.code ?? '').trim() !== accessCode)
          throw new AccessError(
            accessCode ? 'That setup code is not right.' : 'You need an invite link to join.',
          );
        user = store.createHuman(String(input.name ?? ''));
        if (invite) store.acceptInvite(user.id, invite);
      } else {
        if (accessCode && String(input.code ?? '').trim() !== accessCode)
          throw new AccessError('That access code is not right.');
        const named = String(input.name ?? '')
          .trim()
          .toLowerCase();
        const returning = accessCode
          ? store.profiles().find((p) => p.name.toLowerCase() === named)
          : undefined;
        user = input.userId
          ? store.user(String(input.userId))
          : (returning ?? store.createHuman(String(input.name ?? '')));
        if (user && typeof input.invite === 'string' && input.invite)
          store.acceptInvite(user.id, input.invite);
      }
      if (!user || user.kind !== 'human') throw new InputError('Unknown person.');
      const token = store.createSession(user.id);
      return send(res, 200, { ok: true }, { 'set-cookie': cookieFor(req, token) });
    }
    const me: User | null = store.userForToken(cookie(req));
    if (!me) return send(res, 401, { error: 'Sign in first.' });
    if (path === '/api/logout' && method === 'POST') {
      store.endSession(cookie(req));
      return send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Max-Age=0; Path=/` });
    }
    if (path === '/api/snapshot' && method === 'GET')
      return send(res, 200, {
        ...store.snapshot(me.id, [...presence.values()], runtimeInfo),
        signIn: mode,
      });
    if (path === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write(`data: ${store.version}\n\n`);
      streams.set(res, me.id);
      setPresence(me.id, { online: true });
      res.on('close', () => {
        streams.delete(res);
        if (![...streams.values()].includes(me.id))
          setPresence(me.id, { online: false, editing: false });
      });
      return;
    }
    const input = method === 'GET' ? {} : await body(req);
    const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
    const segments = path.split('/').slice(2);
    if (path === '/api/presence' && method === 'POST') {
      setPresence(me.id, {
        spaceId: str('spaceId') || null,
        resourceId: str('resourceId') || null,
        conversationId: str('conversationId') || null,
        editing: !!input.editing,
      });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/cursor' && method === 'POST') {
      // Where someone is on a page, passed straight to the others who can open it. Nothing is stored.
      const page = store.resource(str('resourceId'));
      const n = (key: string) =>
        Math.max(0, Math.min(1_000_000, Math.round(Number(input[key]) || 0)));
      const kind = str('kind') || 'point';
      const spot =
        kind === 'point'
          ? { kind, x: n('x'), y: n('y') }
          : kind === 'text'
            ? { kind, from: n('from'), to: n('to') }
            : kind === 'cell'
              ? { kind, row: n('row'), col: n('col') }
              : kind === 'slide'
                ? { kind, slide: n('slide') }
                : kind === 'gone'
                  ? { kind }
                  : null;
      if (page && spot && store.canReadResource(me.id, page)) {
        const data = JSON.stringify({ userId: me.id, resourceId: page.id, ...spot });
        for (const [stream, userId] of streams)
          if (userId !== me.id && store.canReadResource(userId, page))
            stream.write(`event: cursor\ndata: ${data}\n\n`);
      }
      return send(res, 200, { ok: true });
    }
    if (path === '/api/signal' && method === 'POST') {
      // Passes a connection message to one other person, only if the two share a space.
      const to = str('to');
      const shared = store.memberSpaces(me.id).some((spaceId) => store.isMember(to, spaceId));
      if (shared && input.data && typeof input.data === 'object') {
        const data = JSON.stringify({ from: me.id, data: input.data });
        if (data.length < 60_000)
          for (const [stream, userId] of streams)
            if (userId === to) stream.write(`event: signal\ndata: ${data}\n\n`);
      }
      return send(res, 200, { ok: true });
    }
    if (path === '/api/invites' && method === 'POST')
      return send(res, 200, store.invite(me.id, str('spaceId'), input.fresh === true));
    if (path === '/api/invites/accept' && method === 'POST')
      return send(res, 200, store.acceptInvite(me.id, str('token')));
    if (path === '/api/signin-links' && method === 'POST')
      return send(res, 200, store.signInLink(me.id));
    if (path === '/api/projects' && method === 'POST')
      return send(res, 200, store.createProject(me.id, str('name')));
    if (segments[0] === 'projects' && segments[2] === 'members' && method === 'POST') {
      store.addMember(me.id, segments[1], str('userId'));
      return send(res, 200, { ok: true });
    }
    if (path === '/api/channels' && method === 'POST')
      return send(res, 200, store.createChannel(me.id, str('spaceId'), str('title')));
    if (path === '/api/dms' && method === 'POST')
      return send(res, 200, store.openDm(me.id, str('userId')));
    if (path === '/api/discussions' && method === 'POST')
      return send(res, 200, store.openDiscussion(me.id, str('resourceId')));
    if (path === '/api/messages' && method === 'POST')
      return send(
        res,
        200,
        store.postMessage(me.id, {
          conversationId: str('conversationId'),
          text: str('text'),
          addressedTo: str('addressedTo') || null,
          delegate: input.delegate === true,
          anchor:
            input.anchor && typeof input.anchor.resourceId === 'string'
              ? { resourceId: input.anchor.resourceId, quote: String(input.anchor.quote ?? '') }
              : null,
          replyTo: str('replyTo') || null,
          embed:
            input.embed && typeof input.embed.resourceId === 'string'
              ? {
                  resourceId: input.embed.resourceId,
                  ...(Number.isInteger(input.embed.from) && Number.isInteger(input.embed.to)
                    ? { from: input.embed.from, to: input.embed.to }
                    : {}),
                }
              : null,
          context:
            input.context && Array.isArray(input.context.resourceIds)
              ? {
                  resourceIds: input.context.resourceIds.filter(
                    (x: unknown) => typeof x === 'string',
                  ),
                  spaceId: typeof input.context.spaceId === 'string' ? input.context.spaceId : null,
                  handTo: typeof input.context.handTo === 'string' ? input.context.handTo : null,
                  conversationIds: Array.isArray(input.context.conversationIds)
                    ? input.context.conversationIds.filter((x: unknown) => typeof x === 'string')
                    : [],
                }
              : null,
        }),
      );
    if (
      segments[0] === 'messages' &&
      segments[1] &&
      segments[2] === 'resolve' &&
      method === 'POST'
    ) {
      store.resolveMessage(me.id, segments[1], input.resolved !== false);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'messages' && segments[1] && segments[2] === 'react' && method === 'POST') {
      store.toggleReaction(me.id, segments[1], str('emoji'));
      return send(res, 200, { ok: true });
    }
    if (
      segments[0] === 'conversations' &&
      segments[1] &&
      segments[2] === 'pins' &&
      method === 'POST'
    ) {
      store.setPin(me.id, segments[1], str('resourceId'), input.on !== false);
      return send(res, 200, { ok: true });
    }
    if (
      segments[0] === 'resources' &&
      segments[1] &&
      segments[2] === 'grants' &&
      method === 'POST'
    ) {
      store.setGrant(me.id, segments[1], str('userId'), input.on !== false);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'resources' && segments[1] && segments[2] === 'cells' && method === 'POST')
      return send(
        res,
        200,
        store.setCell(me.id, segments[1], Number(input.row), Number(input.col), str('value')),
      );
    if (path === '/api/reads' && method === 'POST') {
      store.markRead(me.id, str('conversationId'));
      return send(res, 200, { ok: true });
    }
    if (path === '/api/agents' && method === 'POST')
      return send(
        res,
        200,
        store.newAgent(me.id, {
          name: str('name'),
          purpose: str('purpose'),
          instructions: str('instructions'),
          spaceId: str('spaceId') || null,
        }),
      );
    if (path === '/api/skills' && method === 'POST')
      return send(
        res,
        200,
        store.createSkill(me.id, {
          spaceId: str('spaceId'),
          name: str('name'),
          description: str('description'),
          body: str('body'),
        }),
      );
    if (segments[0] === 'skills' && segments[1] && method === 'PATCH')
      return send(
        res,
        200,
        store.updateSkill(me.id, segments[1], {
          ...(typeof input.name === 'string' ? { name: input.name } : {}),
          ...(typeof input.description === 'string' ? { description: input.description } : {}),
          ...(typeof input.body === 'string' ? { body: input.body } : {}),
        }),
      );
    if (segments[0] === 'skills' && segments[1] && method === 'DELETE') {
      store.deleteSkill(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'agents' && segments[1] && segments[2] === 'skills' && method === 'POST') {
      store.setAgentSkill(me.id, segments[1], str('skillId'), input.on !== false);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/goals' && method === 'POST')
      return send(
        res,
        200,
        store.createGoal(me.id, {
          spaceId: str('spaceId'),
          title: str('title'),
          sourceMessageId: str('sourceMessageId') || null,
        }),
      );
    if (segments[0] === 'goals' && segments[1] && method === 'PATCH')
      return send(
        res,
        200,
        store.updateGoal(me.id, segments[1], {
          ...(typeof input.title === 'string' ? { title: input.title } : {}),
          ...('ownerId' in input ? { ownerId: input.ownerId ? String(input.ownerId) : null } : {}),
          ...('agentId' in input ? { agentId: input.agentId ? String(input.agentId) : null } : {}),
          ...('due' in input ? { due: input.due ? String(input.due) : null } : {}),
          ...(typeof input.done === 'boolean' ? { done: input.done } : {}),
        }),
      );
    if (segments[0] === 'goals' && segments[1] && segments[2] === 'move' && method === 'POST') {
      store.moveGoal(me.id, segments[1], input.direction === 'up' ? 'up' : 'down');
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'agents' && segments[1] && segments[2] === 'retire' && method === 'POST')
      return send(res, 200, store.retireAgent(me.id, segments[1]));
    if (segments[0] === 'goals' && segments[1] && method === 'DELETE') {
      store.deleteGoal(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'agents' && segments[1] && method === 'PATCH')
      return send(
        res,
        200,
        store.updateAgent(me.id, segments[1], {
          ...(typeof input.name === 'string' ? { name: input.name } : {}),
          ...(typeof input.purpose === 'string' ? { purpose: input.purpose } : {}),
          ...(typeof input.instructions === 'string' ? { instructions: input.instructions } : {}),
          ...(typeof input.hue === 'number' ? { hue: input.hue } : {}),
          ...(typeof input.form === 'string' ? { form: input.form } : {}),
        }),
      );
    if (path === '/api/folders' && method === 'POST')
      return send(
        res,
        200,
        store.createFolder(me.id, {
          spaceId: str('spaceId'),
          title: str('title'),
          parentId: str('parentId') || null,
        }),
      );
    if (path === '/api/resources' && method === 'POST')
      return send(
        res,
        200,
        store.createResource(me.id, {
          spaceId: str('spaceId'),
          kind: [...PAGE_KINDS, ...CANVAS_KINDS].find((k) => k === input.kind) ?? 'doc',
          title: str('title'),
          body: str('body'),
          visibility: input.visibility === 'private' ? 'private' : 'space',
          parentId: str('parentId') || null,
          placement: placement(input.placement),
          style: str('style') || null,
          source:
            input.source && typeof input.source.name === 'string'
              ? { name: input.source.name, type: String(input.source.type ?? 'file') }
              : null,
        }),
      );
    if (
      segments[0] === 'resources' &&
      segments[1] &&
      segments[2] === 'restore' &&
      method === 'POST'
    )
      return send(res, 200, store.restoreResource(me.id, segments[1]));
    if (segments[0] === 'resources' && segments[1]) {
      if (segments[2] === 'revisions' && method === 'GET')
        return send(res, 200, store.revisions(me.id, segments[1]));
      if (method === 'PATCH')
        return send(
          res,
          200,
          store.updateResource(me.id, segments[1], {
            ...(typeof input.title === 'string' ? { title: input.title } : {}),
            ...(typeof input.body === 'string' ? { body: input.body } : {}),
            ...('placement' in input ? { placement: placement(input.placement) } : {}),
            ...('style' in input ? { style: str('style') || null } : {}),
            ...('parentId' in input ? { parentId: str('parentId') || null } : {}),
            ...(typeof input.archived === 'boolean' ? { archived: input.archived } : {}),
            ...(input.visibility === 'private' || input.visibility === 'space'
              ? { visibility: input.visibility }
              : {}),
          }),
        );
      if (method === 'DELETE') {
        store.deleteResource(me.id, segments[1]);
        return send(res, 200, { ok: true });
      }
    }
    if (segments[0] === 'approvals' && segments[1] && method === 'POST')
      return send(
        res,
        200,
        store.decideApproval(
          me.id,
          segments[1],
          input.decision === 'approved' ? 'approved' : 'declined',
        ),
      );
    if (segments[0] === 'assignments' && segments[2] === 'stop' && method === 'POST') {
      store.stopAssignment(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found.' });
  }

  async function serveStatic(res: ServerResponse, path: string) {
    if (!staticDir) return send(res, 404, { error: 'Not found.' });
    const root = normalize(staticDir.endsWith(sep) ? staticDir : staticDir + sep);
    let file = normalize(join(root, decodeURIComponent(path)));
    if (!file.startsWith(root)) return send(res, 404, { error: 'Not found.' });
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      file = join(root, 'index.html');
    }
    try {
      const content = await readFile(file);
      const page = file.endsWith('index.html');
      res.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        // Built files carry a fingerprint in their name and never change; the page itself is always fresh.
        'cache-control': page ? 'no-cache' : 'public, max-age=31536000, immutable',
        ...(page
          ? {
              'content-security-policy':
                "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
              'referrer-policy': 'same-origin',
              'x-frame-options': 'DENY',
            }
          : {}),
      });
      res.end(content);
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('The app has not been built yet. Run `npm start` (or `npm run build`).');
    }
  }

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    try {
      if (path === '/healthz') return send(res, 200, { ok: true, version: store.version });
      if (path.startsWith('/api/')) await api(req, res, path);
      else await serveStatic(res, path);
    } catch (error) {
      const status =
        error instanceof AccessError || error instanceof InputError ? error.status : 500;
      if (status === 500) console.error(error);
      if (!res.headersSent)
        send(res, status, { error: status === 500 ? 'Server error.' : (error as Error).message });
    }
  });

  let closed = false;
  return {
    server,
    store,
    engine,
    runtime,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      engine.stop();
      for (const res of streams.keys()) res.end();
      await new Promise((resolve) => server.close(resolve));
      store.db.close();
    },
  };
}

function placement(value: any) {
  if (!value || typeof value !== 'object') return null;
  const numbers = ['x', 'y', 'width', 'height'].map((k) => Number(value[k]));
  if (!numbers.every(Number.isFinite)) return null;
  const [x, y, width, height] = numbers;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(48, width),
    height: Math.max(24, height),
  };
}
