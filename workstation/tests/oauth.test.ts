import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { allowedRedirect } from '../server/oauth.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

const REDIRECT = 'http://127.0.0.1:43123/callback';

async function setup() {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-workstation': '1' },
    body: JSON.stringify({ name: 'Dylan' }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  const dylan = app.store.userForToken(decodeURIComponent(cookie.split('=')[1]))!;
  const launch = app.store.createProject(dylan.id, 'Launch');
  const register = async (redirect_uris: string[] = [REDIRECT]) =>
    fetch(`${base}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Codex', redirect_uris }),
    });
  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  };
  const authorizeUrl = (clientId: string, challenge: string, extra: Record<string, string> = {}) =>
    `${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      resource: `${base}/mcp`,
      ...extra,
    })}`;
  /** Opens the consent page signed in, then answers it as the person would. */
  const consent = async (url: string, answer: Record<string, string>) => {
    const pageRes = await fetch(url, { headers: { cookie }, redirect: 'manual' });
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();
    const request = /name="request" value="([^"]+)"/.exec(html)![1];
    const res = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie,
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ request, ...answer }).toString(),
    });
    return { html, res, location: new URL(res.headers.get('location') ?? 'http://none/') };
  };
  const token = (body: Record<string, string>) =>
    fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', ...body }).toString(),
    });
  return { app, base, cookie, dylan, launch, register, pkce, authorizeUrl, consent, token };
}

test('oauth: only safe addresses to send a client back to', () => {
  assert.ok(allowedRedirect('https://claude.ai/api/mcp/auth_callback'));
  assert.ok(allowedRedirect('http://127.0.0.1:5000/cb'));
  assert.ok(allowedRedirect('http://localhost/cb'));
  assert.ok(allowedRedirect('com.example.app:/cb'));
  assert.equal(allowedRedirect('http://example.com/cb'), false);
  assert.equal(allowedRedirect('javascript:alert(1)'), false);
  assert.equal(allowedRedirect('data:text/html,hi'), false);
  assert.equal(allowedRedirect('https://a.example/cb#frag'), false);
  assert.equal(allowedRedirect('not a url'), false);
});

test('oauth: an MCP client finds the sign-in from the 401 and registers itself', async () => {
  const { base, register } = await setup();
  const denied = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 401);
  const header = denied.headers.get('www-authenticate') ?? '';
  const metaUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
  assert.equal(metaUrl, `${base}/.well-known/oauth-protected-resource`);
  const resource = await (await fetch(metaUrl!)).json();
  assert.equal(resource.resource, `${base}/mcp`);
  assert.deepEqual(resource.authorization_servers, [base]);
  assert.equal(
    (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).status,
    200,
    'the path-suffixed form too',
  );
  const server = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(server.issuer, base);
  assert.deepEqual(server.code_challenge_methods_supported, ['S256']);
  assert.equal(server.registration_endpoint, `${base}/oauth/register`);

  assert.equal((await register(['http://evil.example/cb'])).status, 400);
  assert.equal((await register([])).status, 400);
  const made = await register();
  assert.equal(made.status, 201);
  const client = await made.json();
  assert.ok(client.client_id);
  assert.equal(client.token_endpoint_auth_method, 'none');
});

test('oauth: the person signs in, picks the agent, and the client gets a seat token', async () => {
  const { app, base, dylan, launch, register, pkce, authorizeUrl, consent, token } = await setup();
  const { client_id } = await (await register()).json();
  const { verifier, challenge } = pkce();
  const url = authorizeUrl(client_id, challenge);

  // Signed out, the page asks them to sign in and sends nothing back.
  const out = await fetch(url, { redirect: 'manual' });
  assert.equal(out.status, 401);
  assert.match(await out.text(), /Sign in to Sandbox first/);
  // A client or address that doesn't match is never redirected to.
  const wrong = await fetch(
    authorizeUrl(client_id, challenge, { redirect_uri: 'https://x.example/cb' }),
  );
  assert.equal(wrong.status, 400);
  // Without PKCE it is turned away, back at its own address.
  const noPkce = await fetch(
    authorizeUrl(client_id, challenge, { code_challenge_method: 'plain' }),
    {
      redirect: 'manual',
    },
  );
  assert.equal(
    new URL(noPkce.headers.get('location')!).searchParams.get('error'),
    'invalid_request',
  );

  // A page elsewhere cannot press Allow for them.
  const forged = await fetch(`${base}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin: 'https://evil.example',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'request=x&decision=allow&agent=new',
  });
  assert.equal(forged.status, 403);

  const { html, location } = await consent(url, {
    decision: 'allow',
    agent: 'new',
    name: 'Codex',
    spaceId: launch.id,
  });
  assert.match(html, /Connect Codex to Sandbox\?/);
  assert.equal(location.origin + location.pathname, REDIRECT);
  assert.equal(location.searchParams.get('state'), 'xyz');
  const code = location.searchParams.get('code')!;
  assert.ok(code);

  // The code needs the verifier, and works once.
  const exchange = { code, client_id, redirect_uri: REDIRECT, code_verifier: verifier };
  const granted = await token(exchange);
  assert.equal(granted.status, 200);
  const { access_token, token_type } = await granted.json();
  assert.equal(token_type, 'Bearer');
  assert.match(access_token, /^sbx_/);
  assert.equal((await token(exchange)).status, 400, 'a code works once');

  // It is an ordinary seat token: the seat is in Launch, and the token shows on its page.
  const seat = app.seats.mine(dylan.id)[0];
  assert.equal(seat.agent.name, 'Codex');
  assert.deepEqual(seat.spaceIds, [launch.id]);
  assert.deepEqual(
    seat.tokens.map((t) => t.label),
    ['Codex sign-in'],
  );
  const init = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  });
  assert.equal(init.status, 200);
  // Revoking it on the seat's page signs the client out.
  app.seats.revokeToken(dylan.id, seat.agent.id, seat.tokens[0].id);
  assert.equal(app.seats.agentForToken(access_token), null);

  // Signing in again can pick the same agent rather than making another.
  const again = pkce();
  const second = await consent(authorizeUrl(client_id, again.challenge), {
    decision: 'allow',
    agent: seat.agent.id,
  });
  assert.match(second.html, /value="[^"]+" checked/);
  const res = await token({
    code: second.location.searchParams.get('code')!,
    client_id,
    redirect_uri: REDIRECT,
    code_verifier: again.verifier,
  });
  assert.equal(app.seats.agentForToken((await res.json()).access_token)?.id, seat.agent.id);
  assert.equal(app.seats.mine(dylan.id).length, 1);
});

test('oauth: a wrong verifier, or Cancel, gives no token', async () => {
  const { register, pkce, authorizeUrl, consent, token } = await setup();
  const { client_id } = await (await register()).json();
  const { challenge } = pkce();
  const allowed = await consent(authorizeUrl(client_id, challenge), {
    decision: 'allow',
    agent: 'new',
    name: 'Hermes',
    spaceId: '',
  });
  const bad = await token({
    code: allowed.location.searchParams.get('code')!,
    client_id,
    redirect_uri: REDIRECT,
    code_verifier: 'not-the-verifier',
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid_grant');
  const cancelled = await consent(authorizeUrl(client_id, pkce().challenge), { decision: 'deny' });
  assert.equal(cancelled.location.searchParams.get('error'), 'access_denied');
  assert.equal(cancelled.location.searchParams.get('code'), null);
});
