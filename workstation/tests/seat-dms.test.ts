import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

async function setup() {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
  opened.push(app);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/v1`;
  const { store, seats } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const sam = store.createHuman('Sam');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  store.createProject(sam.id, 'Other');
  const { seat, token } = seats.create(dylan.id, { name: 'Hermes', spaceId: launch.id });
  const call = async (method: string, path: string, data?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { app, store, seats, dylan, maya, sam, launch, seat, call };
}

test('seat dms: a teammate messages the seat one to one; it reads and answers there', async () => {
  const { store, maya, seat, call } = await setup();
  const dm = store.openDm(maya.id, seat.agent.id);
  assert.equal(dm.kind, 'dm');
  assert.equal(store.openDm(maya.id, seat.agent.id).id, dm.id, 'the same chat each time');
  const ask = store.postMessage(maya.id, { conversationId: dm.id, text: 'Can you draft the FAQ?' });

  const dms = await call('GET', '/dms');
  assert.equal(dms.status, 200);
  assert.deepEqual(
    dms.body.map((c: any) => [c.id, c.with.name]),
    [[dm.id, 'Maya']],
  );
  const messages = await call('GET', `/chats/${dm.id}/messages`);
  assert.deepEqual(
    messages.body.map((m: any) => [m.text, m.toMe]),
    [['Can you draft the FAQ?', true]],
  );
  const inbox = await call('GET', '/inbox');
  assert.deepEqual(
    inbox.body.map((m: any) => m.id),
    [ask.id],
    'what people say in its DMs waits in its inbox',
  );

  const said = await call('POST', `/chats/${dm.id}/messages`, { text: 'On it.' });
  assert.equal(said.status, 200);
  assert.equal(said.body.toMe, false);
  const seen = store
    .snapshot(maya.id, [], { id: scriptedRuntime.id, label: scriptedRuntime.label })
    .messages.find((m) => m.id === said.body.id)!;
  assert.equal(seen.authorId, seat.agent.id);
  assert.deepEqual(
    (await call('GET', '/inbox')).body.map((m: any) => m.id),
    [ask.id],
    'its own answer is not in its inbox',
  );
});

test('seat dms: it opens DMs only with people it works with, and loses them when it leaves', async () => {
  const { store, seats, dylan, maya, sam, launch, seat, call } = await setup();
  assert.throws(() => store.openDm(sam.id, seat.agent.id), /share a space|another person/);

  const opened = await call('POST', '/dms', { userId: dylan.id });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.with.name, 'Dylan');
  assert.equal((await call('POST', '/dms', { userId: dylan.id })).body.id, opened.body.id);
  assert.equal((await call('POST', '/dms', { userId: sam.id })).status, 403, 'not a stranger');
  assert.equal((await call('POST', '/dms', { userId: seat.agent.id })).status, 403);
  assert.equal((await call('POST', '/dms', {})).status, 403);

  // A DM between two people is not its to read, even if it knows the id.
  const between = store.openDm(dylan.id, maya.id);
  store.postMessage(dylan.id, { conversationId: between.id, text: 'private' });
  assert.equal((await call('GET', `/chats/${between.id}/messages`)).status, 403);
  assert.equal((await call('POST', `/chats/${between.id}/messages`, { text: 'hi' })).status, 403);

  // Taken out of the only workspace it shared with Maya, their DM closes to it.
  const dm = store.openDm(maya.id, seat.agent.id);
  store.postMessage(maya.id, { conversationId: dm.id, text: 'still there?' });
  seats.leave(dylan.id, seat.agent.id, launch.id);
  assert.deepEqual((await call('GET', '/dms')).body, []);
  assert.equal((await call('GET', `/chats/${dm.id}/messages`)).status, 403);
  assert.deepEqual((await call('GET', '/inbox')).body, []);
});
