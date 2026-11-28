import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './store.ts';
import type { Seats } from './seats.ts';
import type { Id, User } from '../shared/types.ts';

/**
 * Browser sign-in for the MCP server, so an agent connects with `codex mcp login sandbox`,
 * `claude mcp add --transport http sandbox <url>` or the like instead of a pasted token.
 *
 * It is the OAuth 2.1 flow the MCP spec asks for, and nothing more: the 401 from /mcp points to
 * the protected-resource metadata, which names this app as the authorization server; the client
 * registers itself (dynamic registration, public clients only), sends the person here to sign in
 * and choose which of their agent seats it acts as (or make one), and trades the code (PKCE S256
 * only) for a seat token. That token is an ordinary seat token: it is listed on the seat's page
 * with when it was last used, and revoking it there signs the client out. There are no refresh
 * tokens because seat tokens do not expire.
 */

const CODE_MINUTES = 10;
const sha256 = (text: string) => createHash('sha256').update(text).digest('base64url');
const now = () => new Date().toISOString();
const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

type Client = { id: string; name: string; redirectUris: string[] };
/** An authorize request already checked, waiting for the person's Allow, tied to who saw it. */
type Pending = {
  actorId: Id;
  client: Client;
  redirectUri: string;
  challenge: string;
  state: string | null;
  at: number;
};
type Code = {
  clientId: string;
  redirectUri: string;
  challenge: string;
  actorId: Id;
  agentId: Id;
  at: number;
};

/**
 * Where a client may be sent back: an https address, a loopback address on this machine (any
 * port, as command-line clients pick one), or an app's own reverse-domain scheme (RFC 8252).
 */
export function allowedRedirect(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:')
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  return /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/i.test(url.protocol);
}

/** A loopback address matches whatever port the client is listening on this time. */
function sameRedirect(registered: string, given: string) {
  if (registered === given) return true;
  try {
    const a = new URL(registered);
    const b = new URL(given);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(a.hostname.toLowerCase());
    return (
      loopback &&
      a.protocol === 'http:' &&
      b.protocol === 'http:' &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

export class OAuth {
  private store: Store;
  private seats: Seats;
  private pending = new Map<string, Pending>();
  private codes = new Map<string, Code>();
  constructor(store: Store, seats: Seats) {
    this.store = store;
    this.seats = seats;
    this.store.db.exec(`create table if not exists oauth_clients (
      id text primary key, name text not null, redirect_uris text not null, created_at text not null
    )`);
  }

  /** The metadata a client finds from the 401's header, for /mcp on this origin. */
  static resourceMetadata(origin: string) {
    return `${origin}/.well-known/oauth-protected-resource`;
  }

  private client(id: string): Client | null {
    const row = this.store.db.prepare('select * from oauth_clients where id = ?').get(id) as
      Record<string, string> | undefined;
    return row ? { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) } : null;
  }
  private sweep() {
    const old = Date.now() - CODE_MINUTES * 60_000;
    for (const [k, v] of this.pending) if (v.at < old) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.at < old) this.codes.delete(k);
  }

  /** True when the path was one of these routes and has been answered. */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    origin: string,
    me: User | null,
  ): Promise<boolean> {
    const method = req.method ?? 'GET';
    const json = (status: number, data: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        // Metadata, registration and the token exchange take no cookie, so any page may call them.
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version',
      });
      res.end(JSON.stringify(data));
      return true;
    };
    const page = (status: number, title: string, inner: string) => {
      res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
        'referrer-policy': 'no-referrer',
      });
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${inner}</main></body></html>`,
      );
      return true;
    };
    const oauthError = (error: string, description: string) =>
      json(400, { error, error_description: description });

    if (
      method === 'OPTIONS' &&
      (path.startsWith('/.well-known/oauth-') || path.startsWith('/oauth/'))
    ) {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version',
      });
      res.end();
      return true;
    }

    if (
      method === 'GET' &&
      (path === '/.well-known/oauth-protected-resource' ||
        path === '/.well-known/oauth-protected-resource/mcp')
    )
      return json(200, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ['header'],
        resource_name: 'Sandbox',
      });
    if (
      method === 'GET' &&
      (path === '/.well-known/oauth-authorization-server' ||
        path === '/.well-known/oauth-authorization-server/mcp')
    )
      return json(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });

    if (path === '/oauth/register' && method === 'POST') {
      const input = await readBody(req);
      const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [];
      if (!uris.length || uris.length > 10 || !uris.every(allowedRedirect))
        return oauthError(
          'invalid_redirect_uri',
          'Send redirect_uris: https addresses, or http on localhost.',
        );
      const name =
        String(input.client_name ?? '')
          .trim()
          .slice(0, 60) || 'An MCP client';
      const id = randomUUID();
      this.store.db
        .prepare('insert into oauth_clients values (?, ?, ?, ?)')
        .run(id, name, JSON.stringify(uris), now());
      res.writeHead(201, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      res.end(
        JSON.stringify({
          client_id: id,
          client_name: name,
          redirect_uris: uris,
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      );
      return true;
    }

    if (path === '/oauth/authorize' && method === 'GET') {
      this.sweep();
      const q = new URL(req.url ?? '/', origin).searchParams;
      const client = this.client(q.get('client_id') ?? '');
      const redirectUri = q.get('redirect_uri') ?? '';
      // Until the client and its address check out, nothing is sent back to it.
      if (!client || !client.redirectUris.some((r) => sameRedirect(r, redirectUri)))
        return page(
          400,
          'Sign-in link not valid',
          `<h1>This sign-in link isn't valid</h1><p>Start the sign-in again from the agent.</p>`,
        );
      const back = (params: Record<string, string>) => {
        const to = new URL(redirectUri);
        for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
        if (q.get('state')) to.searchParams.set('state', q.get('state')!);
        res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store' });
        res.end();
        return true;
      };
      if (q.get('response_type') !== 'code') return back({ error: 'unsupported_response_type' });
      const challenge = q.get('code_challenge') ?? '';
      if (!challenge || q.get('code_challenge_method') !== 'S256')
        return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required.' });
      const resource = q.get('resource');
      if (resource && resource.replace(/\/$/, '') !== `${origin}/mcp`)
        return back({ error: 'invalid_target' });
      if (!me || me.kind !== 'human')
        return page(
          401,
          'Sign in to Sandbox',
          `<h1>Sign in to Sandbox first</h1><p>${esc(client.name)} wants to connect to your Sandbox. <a href="/" target="_blank" rel="noopener">Open Sandbox</a>, sign in, then come back to this tab and reload it.</p>`,
        );
      const requestId = randomBytes(18).toString('base64url');
      this.pending.set(requestId, {
        actorId: me.id,
        client,
        redirectUri,
        challenge,
        state: q.get('state'),
        at: Date.now(),
      });
      const seats = this.seats.mine(me.id).filter((s) => !s.agent.retired);
      const spaces = this.store
        .memberSpaces(me.id)
        .map((id) => this.store.space(id))
        .filter((s) => !!s && s.kind === 'project');
      const host = new URL(redirectUri).host || new URL(redirectUri).protocol;
      const choices = [
        ...seats.map(
          (s, i) =>
            `<label class="choice"><input type="radio" name="agent" value="${esc(s.agent.id)}"${i === 0 ? ' checked' : ''}> <span><b>${esc(s.agent.name)}</b><small>${s.spaceIds.length} workspace${s.spaceIds.length === 1 ? '' : 's'}</small></span></label>`,
        ),
        `<label class="choice"><input type="radio" name="agent" value="new"${seats.length ? '' : ' checked'}> <span><b>A new agent</b><input name="name" maxlength="40" value="${esc(client.name)}" aria-label="Its name"><select name="spaceId" aria-label="Its workspace">${spaces.map((s) => `<option value="${esc(s!.id)}">In ${esc(s!.name)}</option>`).join('')}<option value="">In no workspace yet</option></select></span></label>`,
      ].join('');
      return page(
        200,
        `Connect ${client.name}`,
        `<h1>Connect ${esc(client.name)} to Sandbox?</h1>
<p>It will work as the agent you choose: it reads what that agent's workspaces share, posts as it, and suggests page changes for a person to accept. It never gets your own access or your private pages.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${requestId}">
<fieldset><legend>Sign in as</legend>${choices}</fieldset>
<p class="muted">After you allow it, you go back to ${esc(host)}. You can sign it out from the agent's page in Sandbox.</p>
<div class="buttons"><button name="decision" value="deny">Cancel</button><button class="primary" name="decision" value="allow">Allow</button></div>
</form>`,
      );
    }

    if (path === '/oauth/authorize' && method === 'POST') {
      this.sweep();
      // Only this app's own page may answer; a page elsewhere cannot press Allow for someone.
      if (req.headers.origin !== origin)
        return page(403, 'Not allowed', '<h1>Start the sign-in again from the agent.</h1>');
      const form = new URLSearchParams(await readText(req));
      const pending = this.pending.get(form.get('request') ?? '');
      if (!pending || !me || pending.actorId !== me.id)
        return page(
          400,
          'Expired',
          '<h1>This sign-in expired</h1><p>Start it again from the agent.</p>',
        );
      this.pending.delete(form.get('request')!);
      const back = (params: Record<string, string>) => {
        const to = new URL(pending.redirectUri);
        for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
        if (pending.state) to.searchParams.set('state', pending.state);
        res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store' });
        res.end();
        return true;
      };
      if (form.get('decision') !== 'allow') return back({ error: 'access_denied' });
      let agentId = form.get('agent') ?? '';
      try {
        if (agentId === 'new') {
          agentId = this.seats.create(me.id, {
            name: form.get('name') || pending.client.name,
            spaceId: form.get('spaceId') || null,
          }).seat.agent.id;
          // Its first token was made with it; this sign-in gets its own, named for the client.
          const first = this.seats.seat(agentId).tokens[0];
          if (first) this.seats.revokeToken(me.id, agentId, first.id);
        } else {
          const seat = this.seats.mine(me.id).find((s) => s.agent.id === agentId);
          if (!seat || seat.agent.retired) throw new Error('Not your agent.');
        }
      } catch (error) {
        return page(
          400,
          'Could not connect',
          `<h1>That didn't work</h1><p>${esc((error as Error).message)}</p>`,
        );
      }
      const code = randomBytes(32).toString('base64url');
      this.codes.set(sha256(code), {
        clientId: pending.client.id,
        redirectUri: pending.redirectUri,
        challenge: pending.challenge,
        actorId: me.id,
        agentId,
        at: Date.now(),
      });
      return back({ code });
    }

    if (path === '/oauth/token' && method === 'POST') {
      this.sweep();
      const text = await readText(req);
      const input: Record<string, string> = String(req.headers['content-type'] ?? '').includes(
        'json',
      )
        ? safeJson(text)
        : Object.fromEntries(new URLSearchParams(text));
      if (input.grant_type !== 'authorization_code')
        return oauthError('unsupported_grant_type', 'Only authorization_code.');
      const key = sha256(String(input.code ?? ''));
      const code = this.codes.get(key);
      // A code works once, whatever happens next.
      this.codes.delete(key);
      if (
        !code ||
        code.clientId !== input.client_id ||
        code.redirectUri !== input.redirect_uri ||
        sha256(String(input.code_verifier ?? '')) !== code.challenge
      )
        return oauthError('invalid_grant', 'The code is wrong, used or expired.');
      const client = this.client(code.clientId);
      let token;
      try {
        token = this.seats.newToken(
          code.actorId,
          code.agentId,
          `${client?.name ?? 'Client'} sign-in`,
        );
      } catch {
        return oauthError('invalid_grant', 'That agent is no longer available.');
      }
      return json(200, { access_token: token.token, token_type: 'Bearer' });
    }
    return false;
  }
}

async function readText(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function safeJson(text: string): Record<string, any> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
const readBody = async (req: IncomingMessage) => safeJson(await readText(req));

const STYLE = `
:root { color-scheme: light dark; --ink: #1d1d1f; --ink-3: #6e6e73; --line: #d9d9de; --bg: #fafafa; --card: #fff; --accent: #2f6fde; }
@media (prefers-color-scheme: dark) { :root { --ink: #f2f2f4; --ink-3: #a0a0a8; --line: #3a3a40; --bg: #161618; --card: #1f1f22; --accent: #5b8df0; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; padding: 16px; }
main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
h1 { font-size: 19px; margin: 0 0 10px; }
p { margin: 0 0 14px; }
.muted { color: var(--ink-3); font-size: 13px; }
fieldset { border: 0; padding: 0; margin: 0 0 14px; display: grid; gap: 8px; }
legend { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-bottom: 6px; }
.choice { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; cursor: pointer; }
.choice > span { display: grid; gap: 6px; flex: 1; }
.choice small { color: var(--ink-3); }
input[type=text], input:not([type]), select { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); width: 100%; }
.buttons { display: flex; justify-content: flex-end; gap: 8px; }
button { font: inherit; padding: 8px 16px; border-radius: 9px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
a { color: var(--accent); }
`;
