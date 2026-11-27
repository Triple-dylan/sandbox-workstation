import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { sign } from '../server/webhooks.ts';

const closing: (() => Promise<unknown>)[] = [];
after(async () => {
  for (const close of closing) await close();
});

type Got = { headers: IncomingMessage['headers']; body: string; event: any };

/** A stand-in for the agent's own server: records what arrives, answers with the next status. */
async function receiver(statuses: number[] = []) {
  const got: Got[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    got.push({ headers: req.headers, body, event: JSON.parse(body) });
    res.writeHead(statuses.shift() ?? 200);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closing.push(() => new Promise((r) => server.close(r)));
  return { got, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook` };
}

async function setup() {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    webhooks: { allowHosts: ['127.0.0.1'], retryMs: [10, 10], pageSettleMs: 30 },
  });
  closing.push(() => app.close());
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/v1`;
  const { store, seats, webhooks } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const { seat, token } = seats.create(dylan.id, { name: 'Grok', spaceId: launch.id });
  const general = store
    .snapshot(dylan.id, [], { id: scriptedRuntime.id, label: scriptedRuntime.label })
    .conversations.find((c) => c.kind === 'channel' && c.spaceId === launch.id)!;
  const call = async (method: string, path: string, data?: unknown, as = token.token) => {
    const res = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${as}`, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 80));
    await webhooks.idle();
  };
  return { app, store, seats, webhooks, dylan, maya, launch, seat, token, general, call, settle };
}

test('webhooks: an agent registers its own, sees no secret again, and only to safe addresses', async () => {
  const { call } = await setup();
  const { url } = await receiver();
  assert.equal((await call('POST', '/webhooks', { url: 'http://example.com/x' })).status, 400);
  assert.equal((await call('POST', '/webhooks', { url: 'https://10.0.0.5/x' })).status, 400);
  assert.equal((await call('POST', '/webhooks', { url: 'https://localhost/x' })).status, 400);
  assert.equal((await call('POST', '/webhooks', { url: 'not a url' })).status, 400);
  const made = await call('POST', '/webhooks', { url });
  assert.equal(made.status, 200);
  assert.match(made.body.secret, /^whsec_/);
  const listed = await call('GET', '/webhooks');
  assert.equal(listed.body.length, 1);
  assert.ok(!JSON.stringify(listed.body).includes(made.body.secret), 'the secret is shown once');
  for (let i = 0; i < 4; i++) await call('POST', '/webhooks', { url: `${url}?n=${i}` });
  assert.equal((await call('POST', '/webhooks', { url })).status, 400, 'at most five');
  assert.equal((await call('DELETE', `/webhooks/${made.body.id}`)).status, 200);
  assert.equal((await call('GET', '/webhooks')).body.length, 4);
  assert.equal((await call('DELETE', `/webhooks/${made.body.id}`)).status, 403);
});

test('webhooks: new messages it can read arrive signed; its own and hidden ones do not', async () => {
  const { store, maya, launch, seat, general, call, settle } = await setup();
  const { got, url } = await receiver();
  const { secret } = (await call('POST', '/webhooks', { url })).body;
  const ask = store.postMessage(maya.id, {
    conversationId: general.id,
    text: '@Grok any news?',
    addressedTo: seat.agent.id,
  });
  await call('POST', `/chats/${general.id}/messages`, { text: 'Nothing yet.', replyTo: ask.id });
  const draft = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Draft',
    visibility: 'private',
  });
  const hidden = store.openDiscussion(maya.id, draft.id);
  store.postMessage(maya.id, { conversationId: hidden.id, text: 'private note' });
  await settle();
  const messages = got.filter((g) => g.event.type === 'message.created');
  assert.equal(messages.length, 1, 'only the one it can read, and not its own');
  const [first] = messages;
  assert.equal(first.event.data.message.id, ask.id);
  assert.equal(first.event.data.message.toMe, true);
  assert.equal(first.event.agentId, seat.agent.id);
  assert.equal(first.headers['x-sandbox-event'], 'message.created');
  const timestamp = String(first.headers['x-sandbox-timestamp']);
  assert.equal(first.headers['x-sandbox-signature'], sign(secret, timestamp, first.body));
  assert.notEqual(first.headers['x-sandbox-signature'], sign('whsec_wrong', timestamp, first.body));
});

test('webhooks: page changes arrive once they settle, only for pages it can open', async () => {
  const { store, maya, launch, call, settle } = await setup();
  const { got, url } = await receiver();
  await call('POST', '/webhooks', { url });
  const plan = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'a' });
  store.updateResource(maya.id, plan.id, { body: 'ab' });
  store.updateResource(maya.id, plan.id, { body: 'abc' });
  const secret = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 's',
    visibility: 'private',
  });
  store.updateResource(maya.id, secret.id, { body: 'st' });
  await settle();
  const pages = got.filter((g) => g.event.type === 'page.changed');
  assert.equal(pages.length, 1, 'a burst of edits is one event; the private page sends none');
  assert.equal(pages[0].event.data.page.id, plan.id);
  assert.ok(!('body' in pages[0].event.data.page), 'it reads the page for its contents');
});

test('webhooks: a failed delivery is retried; a revoked token or retired seat stops them', async () => {
  const { store, seats, webhooks, dylan, maya, seat, token, general, call, settle } = await setup();
  const { got, url } = await receiver([500]);
  await call('POST', '/webhooks', { url });
  store.postMessage(maya.id, { conversationId: general.id, text: 'one' });
  await settle();
  assert.equal(got.length, 2, 'tried again after the 500');
  assert.equal(webhooks.list(seat.agent.id)[0].lastStatus, 200);
  assert.equal(webhooks.list(seat.agent.id)[0].lastError, null);
  // The token that made it is revoked: it stops, even though the seat has another token.
  const spare = seats.newToken(dylan.id, seat.agent.id, 'spare');
  const first = seats.seat(seat.agent.id).tokens.find((t) => t.label === 'First token')!;
  seats.revokeToken(dylan.id, seat.agent.id, first.id);
  store.postMessage(maya.id, { conversationId: general.id, text: 'two' });
  await settle();
  assert.equal(got.length, 2);
  assert.equal((await call('GET', '/webhooks', undefined, token.token)).status, 401);
  // A webhook made with the spare token works until the seat is retired.
  await call('POST', '/webhooks', { url }, spare.token);
  store.postMessage(maya.id, { conversationId: general.id, text: 'three' });
  await settle();
  assert.equal(got.length, 3);
  seats.retire(dylan.id, seat.agent.id);
  store.postMessage(maya.id, { conversationId: general.id, text: 'four' });
  await settle();
  assert.equal(got.length, 3);
});
