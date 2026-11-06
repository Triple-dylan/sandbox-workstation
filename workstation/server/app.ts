import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.ts';
import { AccessError, InputError, Store } from './store.ts';
import { AgentEngine } from './agents/engine.ts';
import type { AgentRuntime } from './agents/runtime.ts';
import { selectRuntime } from './env.ts';
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
};

export type AppOptions = {
  dbPath: string;
  runtime?: AgentRuntime;
  staticDir?: string | null;
  maintenanceDelayMs?: number;
  env?: NodeJS.ProcessEnv;
};

export function createApp(options: AppOptions) {
  const store = new Store(openDb(options.dbPath));
  const runtime = options.runtime ?? selectRuntime(options.env ?? process.env, store);
  const engine = new AgentEngine(store, runtime, {
    maintenanceDelayMs: options.maintenanceDelayMs,
  });
  const staticDir =
    options.staticDir === undefined
      ? fileURLToPath(new URL('../dist/', import.meta.url))
      : options.staticDir;
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
      surface: null,
      resourceId: null,
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
    if (path === '/api/profiles' && method === 'GET')
      return send(
        res,
        200,
        store.profiles().map(({ id, name, color }) => ({ id, name, color })),
      );
    if (path === '/api/join' && method === 'POST') {
      const input = await body(req);
      const user = input.userId
        ? store.user(String(input.userId))
        : store.createHuman(String(input.name ?? ''));
      if (!user || user.kind !== 'human') throw new InputError('Unknown person.');
      const token = store.createSession(user.id);
      return send(
        res,
        200,
        { ok: true },
        { 'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/` },
      );
    }
    const me: User | null = store.userForToken(cookie(req));
    if (!me) return send(res, 401, { error: 'Sign in first.' });
    if (path === '/api/logout' && method === 'POST')
      return send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Max-Age=0; Path=/` });
    if (path === '/api/snapshot' && method === 'GET')
      return send(res, 200, store.snapshot(me.id, [...presence.values()], runtimeInfo));
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
        surface: input.surface === 'graph' ? 'graph' : input.surface === 'canvas' ? 'canvas' : null,
        resourceId: str('resourceId') || null,
        editing: !!input.editing,
      });
      return send(res, 200, { ok: true });
    }
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
        }),
      );
    if (path === '/api/reads' && method === 'POST') {
      store.markRead(me.id, str('conversationId'));
      return send(res, 200, { ok: true });
    }
    if (path === '/api/resources' && method === 'POST')
      return send(
        res,
        200,
        store.createResource(me.id, {
          spaceId: str('spaceId'),
          kind: input.kind === 'doc' ? 'doc' : 'note',
          title: str('title'),
          body: str('body'),
          visibility: input.visibility === 'private' ? 'private' : 'space',
          parentId: str('parentId') || null,
          placement: placement(input.placement),
        }),
      );
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
      res.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
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
