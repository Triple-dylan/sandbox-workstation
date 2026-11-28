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
  const get = async (path: string, as = token.token) => {
    const res = await fetch(base + path, { headers: { authorization: `Bearer ${as}` } });
    return { status: res.status, body: (await res.json()) as any };
  };
  return {
    app,
    store,
    seats,
    base,
    dylan,
    maya,
    sam,
    launch,
    other,
    seat,
    token,
    snap,
    general,
    get,
  };
}

test('api: only a live seat token gets in; a cookie or a revoked token does not', async () => {
  const { app, base, seats, dylan, seat, token, get } = await setup();
  assert.equal((await fetch(`${base}/me`)).status, 401);
  assert.equal((await get('/me', 'sbx_made-up')).status, 401);
  assert.equal((await get('/me', 'not-a-token')).status, 401);
  // A person's session cookie is not a way in here.
  const session = app.store.createSession(dylan.id);
  const withCookie = await fetch(`${base}/me`, { headers: { cookie: `sw_session=${session}` } });
  assert.equal(withCookie.status, 401);
  const me = await get('/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.agent.name, 'Codex');
  assert.equal(me.body.owner.name, 'Dylan');
  assert.equal(me.body.spaces.length, 1);
  seats.revokeToken(dylan.id, seat.agent.id, seats.seat(seat.agent.id).tokens[0].id);
  assert.equal((await get('/me', token.token)).status, 401);
  assert.equal(
    (await get('/nothing-here', seats.newToken(dylan.id, seat.agent.id, 'b').token)).status,
    404,
  );
});

test('api: it reads pages like a member, never its owner’s or anyone’s private pages', async () => {
  const { store, seats, dylan, maya, sam, launch, other, seat, snap, get } = await setup();
  const plan = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Plan',
    body: '# Plan\n\nShip it.',
  });
  const mayaDraft = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Maya draft',
    body: 'secret',
    visibility: 'private',
  });
  const dylanDraft = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Dylan draft',
    body: 'mine',
    visibility: 'private',
  });
  const old = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    title: 'Old',
    body: 'x',
  });
  store.updateResource(maya.id, old.id, { archived: true });
  const personal = snap(dylan.id).spaces.find((s) => s.kind === 'personal')!;
  const diary = store.createResource(dylan.id, { spaceId: personal.id, kind: 'doc', body: 'x' });
  const elsewhere = store.createResource(sam.id, { spaceId: other.id, kind: 'doc', body: 'y' });

  const spaces = await get('/spaces');
  assert.deepEqual(
    spaces.body.map((s: any) => s.name),
    ['Launch'],
  );
  const members = spaces.body[0].members.map((m: any) => m.name);
  for (const name of ['Dylan', 'Maya', 'Codex']) assert.ok(members.includes(name), name);
  assert.ok(spaces.body[0].members.some((m: any) => m.name === 'Maya'));
  assert.ok(!spaces.body[0].members.some((m: any) => m.name === 'Sam'));

  const pages = await get(`/spaces/${launch.id}/pages`);
  const titles = pages.body.map((p: any) => p.title);
  assert.ok(titles.includes('Plan'));
  assert.ok(!titles.includes('Maya draft'));
  assert.ok(!titles.includes('Dylan draft'), 'not its owner’s private page');
  assert.ok(!titles.includes('Old'), 'archived pages are left out');
  assert.ok(!('body' in pages.body[0]), 'the list carries no contents');

  const page = await get(`/pages/${plan.id}`);
  assert.equal(page.body.body, '# Plan\n\nShip it.');
  assert.equal(page.body.updatedBy.name, 'Maya');
  for (const hidden of [mayaDraft, dylanDraft, diary, elsewhere])
    assert.equal((await get(`/pages/${hidden.id}`)).status, 403);
  assert.equal((await get(`/spaces/${other.id}/pages`)).status, 403);
  assert.equal((await get(`/spaces/${personal.id}/pages`)).status, 403);

  // A private page opened to it by name is readable, as for a person.
  store.setGrant(dylan.id, dylanDraft.id, seat.agent.id, true);
  assert.equal((await get(`/pages/${dylanDraft.id}`)).body.body, 'mine');

  // Taken out of the workspace, it reads nothing there.
  seats.leave(dylan.id, seat.agent.id, launch.id);
  assert.equal((await get(`/pages/${plan.id}`)).status, 403);
  assert.deepEqual((await get('/spaces')).body, []);
});

test('api: it reads chats and finds what was sent to it', async () => {
  const { store, maya, launch, seat, general, get } = await setup();
  const chats = await get(`/spaces/${launch.id}/chats`);
  assert.ok(chats.body.some((c: any) => c.id === general.id && c.kind === 'channel'));
  // A discussion on a private page it cannot open is not listed.
  const draft = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Draft',
    visibility: 'private',
  });
  const hiddenTalk = store.openDiscussion(maya.id, draft.id);
  assert.ok(
    !(await get(`/spaces/${launch.id}/chats`)).body.some((c: any) => c.id === hiddenTalk.id),
  );
  assert.equal((await get(`/chats/${hiddenTalk.id}/messages`)).status, 403);

  const first = store.postMessage(maya.id, { conversationId: general.id, text: 'Morning all' });
  await new Promise((r) => setTimeout(r, 5));
  const ask = store.postMessage(maya.id, {
    conversationId: general.id,
    text: '@Codex can you check the build?',
    addressedTo: seat.agent.id,
  });
  const messages = await get(`/chats/${general.id}/messages`);
  const mine = messages.body.filter((m: any) => m.author?.name === 'Maya');
  assert.deepEqual(
    mine.map((m: any) => m.text),
    ['Morning all', '@Codex can you check the build?'],
  );
  assert.equal(mine[1].toMe, true);
  assert.equal(mine[0].toMe, false);
  // Paging forward: only what came after a moment it has seen.
  const later = await get(
    `/chats/${general.id}/messages?since=${encodeURIComponent(first.createdAt)}`,
  );
  assert.deepEqual(
    later.body.map((m: any) => m.id),
    [ask.id],
  );
  assert.equal((await get(`/chats/${general.id}/messages?since=yesterday-ish`)).status, 400);

  const inbox = await get('/inbox');
  assert.deepEqual(
    inbox.body.map((m: any) => m.id),
    [ask.id],
  );
  assert.deepEqual((await get(`/inbox?since=${encodeURIComponent(ask.createdAt)}`)).body, []);
});
