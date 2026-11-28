import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { openDb } from './db.ts';
import { databaseReads, storageFor } from './storage.ts';
import { AccessError, InputError, Store } from './store.ts';
import { AgentEngine } from './agents/engine.ts';
import { Connectors } from './connectors/index.ts';
import { Collab } from './collab.ts';
import { Seats, seatsApi } from './seats.ts';
import { outsideApi } from './api.ts';
import { Webhooks } from './webhooks.ts';
import { SharedBrowsers, type BrowserInput } from './browser/index.ts';
import type { Provider } from './connectors/providers.ts';
import type { AgentRuntime } from './agents/runtime.ts';
import type { Embedder } from './agents/embed.ts';
import { agentLimits, selectEmbedder, selectRuntime } from './env.ts';
import { backupHealth, backupNow, backupOptions, listBackups } from './backup.ts';
import { CANVAS_KINDS, PAGE_KINDS } from '../shared/types.ts';
import { readRange, readSheet } from '../shared/sheet.ts';
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
  /** Turns text into search vectors. Tests pass a stand-in; by default chosen from the environment. */
  embedder?: Embedder | null;
  staticDir?: string | null;
  maintenanceDelayMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Hosts the shared browser may reach although they are private (tests use a local page). */
  browserHosts?: string[];
  /** The browser service to use instead of BROWSER_SERVICE_URL (tests start their own). */
  browserService?: string;
  /** Where linked spreadsheets live. Tests pass stand-ins; by default Google Sheets and Excel. */
  providers?: Provider[];
  /** Checks a Google sign-in credential. Tests pass a stand-in; by default Google's keys are used. */
  verifyGoogle?: (credential: string, clientId: string) => Promise<GoogleAccount>;
  /** Outside agents' webhooks. Tests allow a local receiver and retry sooner. */
  webhooks?: ConstructorParameters<typeof Webhooks>[1];
};

export type GoogleAccount = {
  subject: string;
  name: string;
  email: string | null;
  verified: boolean;
};

const googleClient = new OAuth2Client();
async function verifyWithGoogle(credential: string, clientId: string): Promise<GoogleAccount> {
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
  const p = ticket.getPayload();
  if (!p?.sub) throw new AccessError('Google sign-in could not be verified.');
  return {
    subject: p.sub,
    name: p.name ?? '',
    email: p.email ?? null,
    verified: !!p.email_verified,
  };
}

const segments0 = (path: string) => path.split('/')[2] ?? '';

export function createApp(options: AppOptions) {
  const env = options.env ?? process.env;
  // Hosted copies run by invitation; a local copy lets anyone pick a name.
  const mode: 'open' | 'invite' = env.SIGN_IN === 'invite' ? 'invite' : 'open';
  const store = new Store(openDb(options.dbPath), { closed: mode === 'invite' });
  const runtime = options.runtime ?? selectRuntime(options.env ?? process.env, store);
  const engine = new AgentEngine(store, runtime, {
    maintenanceDelayMs: options.maintenanceDelayMs,
    limits: agentLimits(env),
    embedder:
      options.embedder === undefined
        ? options.runtime
          ? undefined
          : selectEmbedder(env)
        : (options.embedder ?? undefined),
  });
  const connectors = new Connectors(store, env, options.providers);
  const collab = new Collab(store);
  const seats = new Seats(store);
  const webhooks = new Webhooks(store, options.webhooks);
  // Chrome runs in its own service (browser-service/), never inside this app or on its machine.
  const browsers = new SharedBrowsers(store, {
    endpoint: options.browserService ?? (env.BROWSER_SERVICE_URL?.trim() || null),
    allowHosts: options.browserHosts,
  });
  // Where Google and Microsoft send people back after they sign in to link a spreadsheet.
  const callback = (req: IncomingMessage, provider: string) => {
    const origin =
      env.PUBLIC_URL?.trim().replace(/\/$/, '') ||
      `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
    return `${origin}/api/connect/${provider}/callback`;
  };
  const staticDir =
    options.staticDir === undefined
      ? fileURLToPath(new URL('../dist/', import.meta.url))
      : options.staticDir;
  // When set, joining needs this code: the least a hosted copy should ask before real accounts exist.
  const accessCode = env.ACCESS_CODE?.trim() || '';
  // With a Google client ID set, people sign in with Google; device links still work.
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || '';
  const verifyGoogle = options.verifyGoogle ?? verifyWithGoogle;
  // Who may start a workspace: emails and/or @domains. Unset, anyone signed in may.
  const creators = (env.WORKSPACE_CREATORS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const mayStartWorkspace = (userId: Id) => {
    if (!creators.length) return true;
    const email = store.emailOf(userId)?.toLowerCase();
    return !!email && creators.some((c) => (c.startsWith('@') ? email.endsWith(c) : email === c));
  };
  // Who may download the whole database: the people who run this copy, by email. Unset, nobody.
  const backups = backupOptions(options.dbPath, env);
  const backupOwners = (env.BACKUP_OWNERS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const mayDownloadBackup = (userId: Id) => {
    const email = store.emailOf(userId)?.toLowerCase();
    return !!email && backupOwners.includes(email);
  };
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
    ...(runtime.fallback ? { fallback: runtime.fallback } : {}),
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
    // Outside agents sign in with their seat's token, not a cookie, so no browser sends it for them.
    if (segments0(path) === 'v1') {
      const query = new URL(req.url ?? '/', 'http://local').searchParams;
      const { authorization } = req.headers;
      const input = method === 'GET' ? {} : await body(req);
      const result = outsideApi(
        store,
        seats,
        { method, path, query, authorization, input },
        webhooks,
      );
      return send(res, result.status, result.data);
    }
    if (method !== 'GET' && req.headers['x-workstation'] !== '1')
      return send(res, 403, { error: 'Missing request header.' });
    if (path === '/api/config' && method === 'GET')
      return send(res, 200, {
        accessCode: !!accessCode,
        mode,
        googleClientId: googleClientId || null,
      });
    if (path === '/api/auth/google' && method === 'POST') {
      if (!googleClientId) return send(res, 404, { error: 'Google sign-in is not set up here.' });
      const input = await body(req);
      slowDown(req);
      let account: GoogleAccount;
      try {
        account = await verifyGoogle(String(input.credential ?? ''), googleClientId);
      } catch {
        throw new AccessError('Google sign-in could not be verified.');
      }
      if (!account.verified) throw new AccessError('Use a Google account with a verified email.');
      const invite = typeof input.invite === 'string' ? input.invite : '';
      let user = store.googleUser(account.subject);
      // Anyone with a verified Google account may sign up; what they can reach is still only
      // their own space and the workspaces they start or are invited to.
      if (!user) user = store.createGoogleUser(account.subject, account.name, account.email);
      if (invite) store.acceptInvite(user.id, invite);
      const token = store.createSession(user.id);
      return send(res, 200, { ok: true }, { 'set-cookie': cookieFor(req, token) });
    }
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
      else if (googleClientId) throw new AccessError('Sign in with Google.');
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
    if (path === '/api/backup' && method === 'GET') {
      if (!backups) return send(res, 404, { error: 'Backups are off on this server.' });
      if (!mayDownloadBackup(me.id))
        throw new AccessError('Only the people who run this server can download its backups.');
      // The newest nightly copy; if there is none yet, one is taken now.
      const newest = listBackups(backups.dir)[0] ?? backupNow(options.dbPath, backups);
      res.writeHead(200, {
        'content-type': 'application/vnd.sqlite3',
        'content-length': newest.bytes,
        'content-disposition': `attachment; filename="sandbox-${newest.name}"`,
        'cache-control': 'no-store',
      });
      await new Promise<void>((resolve, reject) =>
        createReadStream(newest.path).on('error', reject).on('end', resolve).pipe(res),
      );
      return;
    }
    // What Settings shows an owner: the newest copy and how many are kept. Refused for anyone else.
    if (path === '/api/backups' && method === 'GET') {
      if (!backups) return send(res, 404, { error: 'Backups are off on this server.' });
      if (!mayDownloadBackup(me.id))
        throw new AccessError('Only the people who run this server can see its backups.');
      const kept = listBackups(backups.dir);
      const newest = kept[0];
      return send(res, 200, {
        count: kept.length,
        keep: backups.keep,
        newest: newest ? { name: newest.name, takenAt: newest.takenAt, bytes: newest.bytes } : null,
      });
    }
    // Back up now: an owner takes a copy on demand, for example before a risky change.
    if (path === '/api/backup' && method === 'POST') {
      if (!backups) return send(res, 404, { error: 'Backups are off on this server.' });
      if (!mayDownloadBackup(me.id))
        throw new AccessError('Only the people who run this server can take backups.');
      // A copy from the last minute is returned as it is rather than taking another.
      const recent = listBackups(backups.dir)[0];
      const fresh =
        recent && Date.now() - Date.parse(recent.takenAt) < 60_000
          ? recent
          : backupNow(options.dbPath, backups);
      return send(res, 200, { name: fresh.name, takenAt: fresh.takenAt, bytes: fresh.bytes });
    }
    if (path === '/api/snapshot' && method === 'GET')
      return send(res, 200, {
        ...store.snapshot(me.id, [...presence.values()], runtimeInfo),
        signIn: mode,
        mayStartWorkspace: mayStartWorkspace(me.id),
        connectors: connectors.info(me.id),
      });
    if (segments0(path) === 'connect' && method === 'GET') {
      const [, , , provider, step] = path.split('/');
      const query = new URL(req.url ?? '/', 'http://local').searchParams;
      if (step === 'callback') {
        let note = `connected=${provider}`;
        try {
          if (query.get('error')) throw new InputError('Sign-in was cancelled.');
          await connectors.finish(
            me.id,
            provider,
            query.get('code') ?? '',
            query.get('state') ?? '',
            callback(req, provider),
          );
        } catch (error) {
          note = `connect-error=${encodeURIComponent((error as Error).message)}`;
        }
        res.writeHead(302, { location: `/?${note}`, 'cache-control': 'no-store' });
        return res.end();
      }
      res.writeHead(302, {
        location: connectors.start(me.id, provider, callback(req, provider)),
        'cache-control': 'no-store',
      });
      return res.end();
    }
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
    const seatResult = seatsApi(seats, me, method, segments, input);
    if (seatResult !== undefined) return send(res, 200, seatResult);
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
    if (path === '/api/projects' && method === 'POST') {
      if (!mayStartWorkspace(me.id))
        throw new AccessError(
          'Starting workspaces is limited on this workstation. Ask for an invite.',
        );
      return send(res, 200, store.createProject(me.id, str('name')));
    }
    if (segments[0] === 'projects' && segments[2] === 'members' && method === 'POST') {
      store.addMember(me.id, segments[1], str('userId'));
      return send(res, 200, { ok: true });
    }
    if (
      segments[0] === 'projects' &&
      segments[2] === 'members' &&
      segments[3] &&
      method === 'DELETE'
    ) {
      store.removeMember(me.id, segments[1], segments[3]);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'projects' && segments[1] && !segments[2] && method === 'PATCH')
      return send(res, 200, store.renameProject(me.id, segments[1], str('name')));
    if (segments[0] === 'projects' && segments[1] && !segments[2] && method === 'DELETE') {
      store.deleteProject(me.id, segments[1], str('confirm'));
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
              ? {
                  resourceId: input.anchor.resourceId,
                  quote: String(input.anchor.quote ?? ''),
                  ...(readRange(input.anchor.range)
                    ? { range: readRange(input.anchor.range)! }
                    : {}),
                }
              : null,
          replyTo: str('replyTo') || null,
          sharedFrom: str('sharedFrom') || null,
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
    if (segments[0] === 'messages' && segments[1] && !segments[2] && method === 'DELETE') {
      store.deleteMessage(me.id, segments[1]);
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
        Array.isArray(input.edits)
          ? store.setCells(
              me.id,
              segments[1],
              (input.edits as any[]).map((e) => ({
                row: Number(e?.row),
                col: Number(e?.col),
                value: String(e?.value ?? ''),
              })),
            )
          : store.setCell(me.id, segments[1], Number(input.row), Number(input.col), str('value')),
      );
    if (segments[0] === 'collab' && segments[1]) {
      const page = store.resource(segments[1]);
      if (!page || page.kind !== 'doc' || !store.canReadResource(me.id, page))
        throw new AccessError('Not available.');
      if (method === 'GET') {
        const client = new URL(req.url ?? '/', 'http://local').searchParams.get('client') ?? '';
        if (!/^[\w-]{6,64}$/.test(client)) throw new InputError('Unknown editor.');
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        collab.watch(page.id, client, res);
        return;
      }
      if (method === 'POST') {
        if (page.role === 'orientation') throw new AccessError('This page is kept by its agent.');
        return send(res, 200, {
          ok: collab.update(page.id, str('client'), str('update'), str('epoch')),
        });
      }
    }
    if (segments[0] === 'browser' && segments[1]) {
      const page = store.resource(segments[1]);
      if (!page || page.kind !== 'browser' || !store.canReadResource(me.id, page))
        throw new AccessError('Not available.');
      if (segments[2] === 'stream' && method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        try {
          await browsers.watch(page.id, me.id, res);
        } catch (error) {
          res.write(`data: ${JSON.stringify({ t: 'error', text: (error as Error).message })}\n\n`);
          res.end();
        }
        return;
      }
      if (segments[2] === 'input' && method === 'POST') {
        await browsers.input(page.id, me.id, input as BrowserInput);
        return send(res, 200, { ok: true });
      }
    }
    if (segments[0] === 'connections' && segments[1] && method === 'DELETE') {
      connectors.disconnect(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/sheets/link' && method === 'POST')
      return send(
        res,
        200,
        await connectors.link(me.id, {
          spaceId: str('spaceId'),
          url: str('url'),
          parentId: str('parentId') || null,
          visibility: input.visibility === 'private' ? 'private' : 'space',
        }),
      );
    if (segments[0] === 'resources' && segments[1] && segments[2] === 'sync' && method === 'POST') {
      const page = store.resource(segments[1]);
      if (!page || !store.canReadResource(me.id, page)) throw new AccessError('Not available.');
      await connectors.pull(page.id);
      return send(res, 200, { ok: true });
    }
    if (segments[0] === 'resources' && segments[1] && segments[2] === 'layout' && method === 'POST')
      return send(
        res,
        200,
        store.setSheetLayout(me.id, segments[1], {
          formats: input.formats,
          widths: input.widths,
          freeze: input.freeze,
          filter: input.filter,
        }),
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
          ...(typeof input.approvals === 'string' ? { approvals: input.approvals } : {}),
        }),
      );
    if (segments[0] === 'agents' && segments[1] && segments[2] === 'watches') {
      if (method === 'POST')
        return send(res, 200, store.setWatch(me.id, segments[1], str('resourceId'), str('rule')));
      if (method === 'DELETE' && segments[3]) {
        store.dropWatch(me.id, segments[1], segments[3]);
        return send(res, 200, { ok: true });
      }
    }
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
          body: ownLink(str('body'), null),
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
      // A live editor's save from a history that has since been replaced is dropped.
      if (
        method === 'PATCH' &&
        input.collab === true &&
        typeof input.body === 'string' &&
        !collab.acceptsSave(segments[1], str('epoch'), input.body)
      )
        return send(res, 200, store.resource(segments[1]));
      if (method === 'PATCH')
        return send(
          res,
          200,
          store.updateResource(me.id, segments[1], {
            ...(typeof input.title === 'string' ? { title: input.title } : {}),
            // A browser page's contents are only ever what its browser shows.
            ...(typeof input.body === 'string' && store.resource(segments[1])?.kind !== 'browser'
              ? { body: ownLink(input.body, store.resource(segments[1])?.body ?? null) }
              : {}),
            ...('placement' in input ? { placement: placement(input.placement) } : {}),
            ...('style' in input ? { style: str('style') || null } : {}),
            ...('parentId' in input ? { parentId: str('parentId') || null } : {}),
            ...(typeof input.archived === 'boolean' ? { archived: input.archived } : {}),
            ...(typeof input.pinned === 'boolean' ? { pinned: input.pinned } : {}),
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
    if (segments[0] === 'agent-requests' && segments[1] && method === 'POST') {
      if (segments[2] === 'draft')
        return send(res, 200, store.draftAgentRequest(me.id, segments[1]));
      if (segments[2] === 'send')
        return send(res, 200, store.sendAgentRequest(me.id, segments[1], str('text')));
      if (segments[2] === 'decline')
        return send(res, 200, store.declineAgentRequest(me.id, segments[1]));
    }
    if (segments[0] === 'approvals' && segments[1] && segments[2] === 'undo' && method === 'POST')
      return send(res, 200, store.undoApproval(me.id, segments[1]));
    if (segments[0] === 'approvals' && segments[1] && method === 'POST')
      return send(
        res,
        200,
        store.decideApproval(
          me.id,
          segments[1],
          input.decision === 'approved' ? 'approved' : 'declined',
          typeof input.body === 'string' ? input.body : undefined,
        ),
      );
    if (segments[0] === 'jobs' && segments[1] && segments[2] === 'stop' && method === 'POST') {
      store.stopJob(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/routines' && method === 'POST')
      return send(
        res,
        200,
        store.createRoutine(me.id, {
          agentId: str('agentId'),
          instruction: str('instruction'),
          cadence: str('cadence'),
          weekday: input.weekday === undefined ? null : Number(input.weekday),
          time: str('time'),
          tzOffset: Number(input.tzOffset),
          conversationId: str('conversationId') || null,
        }),
      );
    if (segments[0] === 'routines' && segments[1] && method === 'DELETE') {
      store.deleteRoutine(me.id, segments[1]);
      return send(res, 200, { ok: true });
    }
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
              'content-security-policy': googleClientId
                ? // Google's sign-in button loads its script, styles and frame from accounts.google.com.
                  "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; font-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'self'"
                : "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
              // Google's button needs the origin in the referrer.
              'referrer-policy': googleClientId ? 'strict-origin-when-cross-origin' : 'same-origin',
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
      if (path === '/healthz') {
        const ok = databaseReads(store.db);
        const body = {
          ok,
          version: store.version,
          ...storageFor(options.dbPath),
          ...backupHealth(backups),
        };
        return send(
          res,
          ok ? 200 : 503,
          ok ? body : { ...body, error: 'The database is not answering.' },
        );
      }
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
    connectors,
    browsers,
    collab,
    seats,
    webhooks,
    runtime,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      engine.stop();
      webhooks.stop();
      connectors.close();
      collab.stop();
      await browsers.stop();
      for (const res of streams.keys()) res.end();
      await new Promise((resolve) => server.close(resolve));
      store.db.close();
    },
  };
}

/**
 * A sheet's link to Excel or Google Sheets reads and writes with the sign-in of whoever linked it,
 * so only the connector sets it: a body sent from outside keeps the page's own link, or none.
 */
function ownLink(body: string, current: string | null) {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || !('link' in parsed)) {
    const kept = current ? readSheet(current).link : null;
    return kept && parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)
      ? JSON.stringify({ ...parsed, link: kept })
      : body;
  }
  const { link: _ignored, ...rest } = parsed;
  const kept = current ? readSheet(current).link : null;
  return JSON.stringify(kept ? { ...rest, link: kept } : rest);
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
