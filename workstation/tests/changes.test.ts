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
  const { seat, token } = seats.create(dylan.id, { name: 'Codex', spaceId: launch.id });
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: scriptedRuntime.id, label: scriptedRuntime.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  const elsewhere = snap(sam.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === other.id,
  )!;
  const get = async (path: string) => {
    const res = await fetch(base + path, { headers: { authorization: `Bearer ${token.token}` } });
    return { status: res.status, body: (await res.json()) as any };
  };
  const tick = () => new Promise((r) => setTimeout(r, 3));
  return { store, dylan, maya, sam, launch, other, seat, general, elsewhere, get, tick };
}

test('changes: from a cursor it gets what is new and it can see, in order, once', async () => {
  const { store, maya, sam, launch, other, seat, general, elsewhere, get, tick } = await setup();
  const start = await get('/changes');
  assert.equal(start.status, 200);
  assert.deepEqual(start.body.changes, [], 'with no cursor it starts now');
  await tick();

  const hello = store.postMessage(maya.id, { conversationId: general.id, text: 'Morning' });
  await tick();
  const plan = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'a' });
  await tick();
  store.updateResource(maya.id, plan.id, { body: 'ab' });
  const secret = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 's',
    visibility: 'private',
  });
  store.postMessage(sam.id, { conversationId: elsewhere.id, text: 'not yours' });
  store.createResource(sam.id, { spaceId: other.id, kind: 'doc', body: 'x' });
  const dm = store.openDm(maya.id, seat.agent.id);
  await tick();
  const direct = store.postMessage(maya.id, { conversationId: dm.id, text: 'Just you' });

  const first = await get(`/changes?cursor=${start.body.cursor}`);
  const summary = first.body.changes.map((c: any) => [c.type, c.message?.id ?? c.page?.id]);
  assert.deepEqual(summary, [
    ['message.created', hello.id],
    ['page.changed', plan.id],
    ['message.created', direct.id],
  ]);
  assert.equal(first.body.changes[2].message.toMe, true);
  assert.ok(!JSON.stringify(first.body).includes(secret.id), 'no private page, not even its id');
  assert.equal(first.body.more, false);

  // Nothing new: nothing again.
  const again = await get(`/changes?cursor=${first.body.cursor}`);
  assert.deepEqual(again.body.changes, []);

  // A shared page deleted, and one archived, are reported gone; a deleted private one is not.
  store.deleteResource(maya.id, plan.id);
  const notes = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'n' });
  await tick();
  store.updateResource(maya.id, notes.id, { archived: true });
  store.deleteResource(maya.id, secret.id);
  const gone = await get(`/changes?cursor=${again.body.cursor}`);
  assert.deepEqual(
    gone.body.changes.map((c: any) => [c.type, c.page.id]),
    [
      ['page.removed', plan.id],
      ['page.removed', notes.id],
    ],
  );
});

test('changes: small pages page through everything without gaps, even at the same moment', async () => {
  const { store, maya, general, get } = await setup();
  const since = new Date(Date.now() - 1000).toISOString();
  const sent = [];
  for (let i = 0; i < 7; i++)
    sent.push(store.postMessage(maya.id, { conversationId: general.id, text: `m${i}` }).id);
  const got: string[] = [];
  let page = await get(`/changes?since=${encodeURIComponent(since)}&limit=2`);
  for (let i = 0; i < 20; i++) {
    got.push(
      ...page.body.changes
        .filter((c: any) => c.type === 'message.created' && c.message.author?.name === 'Maya')
        .map((c: any) => c.message.id),
    );
    if (!page.body.more) break;
    page = await get(`/changes?cursor=${page.body.cursor}&limit=2`);
  }
  assert.equal(page.body.more, false, 'it reaches the end');
  assert.deepEqual(got.sort(), [...sent].sort());
  assert.equal(new Set(got).size, sent.length, 'none twice');
  assert.equal((await get('/changes?cursor=not-ours')).status, 400);
  assert.equal((await get('/changes?since=whenever')).status, 400);
});
