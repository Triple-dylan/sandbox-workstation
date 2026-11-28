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
  const other = store.createProject(sam.id, 'Other');
  const { seat, token } = seats.create(dylan.id, { name: 'Hermes', spaceId: launch.id });
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: scriptedRuntime.id, label: scriptedRuntime.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  const call = async (method: string, path: string, data?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { app, store, dylan, maya, sam, launch, other, seat, snap, general, call };
}

test('api writes: it speaks in chats as itself, never in ones it cannot read', async () => {
  const { store, maya, launch, seat, snap, general, call } = await setup();
  const ask = store.postMessage(maya.id, {
    conversationId: general.id,
    text: '@Hermes summarise the plan?',
    addressedTo: seat.agent.id,
  });
  const said = await call('POST', `/chats/${general.id}/messages`, {
    text: 'Three steps left.',
    replyTo: ask.id,
  });
  assert.equal(said.status, 200);
  assert.equal(said.body.author.name, 'Hermes');
  assert.equal(said.body.replyTo, ask.id);
  const seen = snap(maya.id).messages.find((m) => m.id === said.body.id)!;
  assert.equal(seen.authorId, seat.agent.id, 'teammates see it from the seat');
  assert.equal((await call('POST', `/chats/${general.id}/messages`, { text: '  ' })).status, 400);
  const draft = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Draft',
    visibility: 'private',
  });
  const hidden = store.openDiscussion(maya.id, draft.id);
  assert.equal((await call('POST', `/chats/${hidden.id}/messages`, { text: 'hi' })).status, 403);
});

test('api writes: it makes and edits docs and sheets where it is a member', async () => {
  const { store, maya, launch, other, seat, snap, call } = await setup();
  const made = await call('POST', `/spaces/${launch.id}/pages`, {
    title: 'Release notes',
    body: '# Release notes\n\n- Seats',
  });
  assert.equal(made.status, 200);
  assert.equal(made.body.kind, 'doc');
  assert.equal(made.body.visibility, 'space');
  assert.ok(store.canReadResource(maya.id, store.resource(made.body.id)!));
  const scratch = await call('POST', `/spaces/${launch.id}/pages`, {
    title: 'Scratch',
    body: 'mine',
    visibility: 'private',
  });
  assert.equal(store.canReadResource(maya.id, store.resource(scratch.body.id)!), false);
  assert.equal((await call('POST', `/spaces/${other.id}/pages`, { title: 'x' })).status, 403);

  const plan = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Old' });
  const edited = await call('PATCH', `/pages/${plan.id}`, { body: 'New', title: 'Plan v2' });
  assert.equal(edited.status, 200);
  assert.equal(store.resource(plan.id)!.body, 'New');
  assert.equal(store.resource(plan.id)!.title, 'Plan v2');
  assert.equal(store.resource(plan.id)!.updatedBy, seat.agent.id);
  assert.equal((await call('PATCH', `/pages/${plan.id}`, {})).status, 400);

  const sheet = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'sheet',
    body: JSON.stringify({ rows: [['Item', 'Cost']] }),
  });
  assert.equal((await call('PATCH', `/pages/${sheet.id}`, { body: '{}' })).status, 400);
  const cells = await call('POST', `/pages/${sheet.id}/cells`, {
    edits: [
      { row: 1, col: 0, value: 'Domain' },
      { row: 1, col: 1, value: '12' },
    ],
  });
  assert.equal(cells.status, 200);
  assert.deepEqual(JSON.parse(store.resource(sheet.id)!.body).rows, [
    ['Item', 'Cost'],
    ['Domain', '12'],
  ]);
  assert.equal((await call('POST', `/pages/${plan.id}/cells`, { edits: [] })).status, 400);

  // Not someone's private page, and not the page the workspace's own agent keeps.
  const secret = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 's',
    visibility: 'private',
  });
  assert.equal((await call('PATCH', `/pages/${secret.id}`, { body: 'x' })).status, 403);
  const about = snap(maya.id).resources.find(
    (r) => r.spaceId === launch.id && r.role === 'orientation',
  )!;
  assert.equal((await call('PATCH', `/pages/${about.id}`, { body: 'x' })).status, 403);
});

test('api writes: a looping agent is slowed down; its reads are not', async () => {
  const { general, call } = await setup();
  let last = 0;
  for (let i = 0; i < 61; i++)
    last = (await call('POST', `/chats/${general.id}/messages`, { text: `n${i}` })).status;
  assert.equal(last, 429);
  assert.equal((await call('GET', '/me')).status, 200);
});
