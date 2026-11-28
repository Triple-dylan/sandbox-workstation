import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { DELETED_NAME, deleteMyData } from '../server/erase.ts';
import type { Db } from '../server/db.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

function setup() {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    maintenanceDelayMs: 5,
    env: {},
  });
  opened.push(app);
  const { store } = app;
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const launch = store.createProject(maya.id, 'Launch');
  store.addMember(maya.id, launch.id, dylan.id);
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: scriptedRuntime.id, label: scriptedRuntime.label });
  const general = snap(maya.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  return { app, store, dylan, maya, launch, general, snap };
}

/** Every row anywhere that still holds one of these values, as "table.column". */
function holding(db: Db, values: string[]) {
  const wanted = new Set(values);
  const found: string[] = [];
  for (const { name } of db
    .prepare(`select name from sqlite_master where type = 'table'`)
    .all() as {
    name: string;
  }[])
    for (const row of db.prepare(`select * from ${name}`).all() as Record<string, unknown>[])
      for (const [column, value] of Object.entries(row))
        if (typeof value === 'string' && wanted.has(value)) found.push(`${name}.${column}`);
  return [...new Set(found)].sort();
}

test('delete my data: their own things go, what they shared stays as a deleted person', async () => {
  const { app, store, dylan, maya, launch, general, snap } = setup();
  const personal = store.personalSpace(dylan.id)!;
  const agent = store.personalAgent(dylan.id)!;
  const diary = store.createResource(dylan.id, {
    spaceId: personal,
    kind: 'doc',
    body: 'Diary\nsecret',
  });
  const shared = store.createResource(dylan.id, { spaceId: launch.id, kind: 'doc', body: 'Plan' });
  const draft = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Draft\nnot yet',
    visibility: 'private',
  });
  store.setGrant(dylan.id, draft.id, maya.id, true);
  const mayaPage = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Hers' });
  const said = store.postMessage(dylan.id, { conversationId: general.id, text: 'My idea' });
  const reply = store.postMessage(maya.id, {
    conversationId: general.id,
    text: 'Nice',
    replyTo: said.id,
  });
  store.toggleReaction(dylan.id, reply.id, '👍');
  const dm = store.openDm(maya.id, dylan.id);
  store.postMessage(maya.id, { conversationId: dm.id, text: 'Hi Dylan' });
  store.postMessage(dylan.id, { conversationId: dm.id, text: 'Hi Maya, my number is 555' });
  store.markRead(dylan.id, general.id);
  store.createRoutine(dylan.id, {
    agentId: store.projectAgent(launch.id)!.id,
    instruction: 'Remind me on Fridays',
    cadence: 'weekly',
    weekday: 5,
    time: '09:00',
    tzOffset: 0,
    conversationId: general.id,
  });
  const goal = store.createGoal(dylan.id, { spaceId: launch.id, title: 'Ship' });
  store.db.prepare('update goals set owner_id = ? where id = ?').run(dylan.id, goal.id);
  const link = await store.signInLink(dylan.id);
  const session = await store.createSession(dylan.id);
  await app.engine.idle();

  assert.throws(() => deleteMyData(store, dylan.id, 'dylan'), /Type Dylan exactly/);
  deleteMyData(store, dylan.id, ' Dylan ');

  // Theirs alone: gone, with nothing anywhere still naming them.
  assert.deepEqual(holding(store.db, [personal, agent.id, diary.id, draft.id, said.id]), []);
  assert.equal(await store.userForToken(session), null, 'signed out everywhere');
  await assert.rejects(() => store.useSignInLink(link.token), /used or has expired/);
  assert.deepEqual(
    holding(store.db, [dylan.id]).filter((c) => !c.startsWith('users.')),
    [
      'goals.created_by',
      'participants.user_id',
      'resources.owner_id',
      'resources.updated_by',
      'revisions.author_id',
    ],
    'only shared work (a page, its history, a goal) and their side of the one-to-one chat point at them',
  );
  const gone = store.user(dylan.id)!;
  assert.equal(gone.name, DELETED_NAME);
  assert.ok(!store.profiles().some((p) => p.id === dylan.id), 'not offered as a person to be');
  await assert.rejects(() => store.createSession(dylan.id), /Unknown person/);
  assert.throws(() => store.openDm(maya.id, dylan.id), /another person/);

  // What Maya sees: the shared page still there as a deleted person's, her own words kept.
  const view = snap(maya.id);
  assert.ok(view.resources.some((r) => r.id === shared.id && r.ownerId === dylan.id));
  assert.ok(view.resources.some((r) => r.id === mayaPage.id));
  assert.ok(!view.resources.some((r) => r.id === draft.id));
  assert.ok(!view.members.some((m) => m.userId === dylan.id));
  const kept = view.messages.find((m) => m.id === reply.id)!;
  assert.equal(kept.replyTo ?? null, null, 'her reply stays, no longer pointing at his message');
  assert.ok(view.messages.some((m) => m.conversationId === dm.id && m.text === 'Hi Dylan'));
  assert.ok(!view.messages.some((m) => m.text.includes('555')));
  assert.equal(store.goals(launch.id)[0].ownerId ?? null, null);
  assert.equal((store.db.prepare('select count(*) n from routines').get() as any).n, 0);
});

test('delete my data: a workspace others are still in must be deleted first; solo ones go with them', () => {
  const { store, dylan, maya, launch } = setup();
  const solo = store.createProject(maya.id, 'Solo');
  const page = store.createResource(maya.id, { spaceId: solo.id, kind: 'doc', body: 'Notes' });
  const old = store.createProject(maya.id, 'Old');
  store.addMember(maya.id, old.id, dylan.id);
  store.deleteProject(maya.id, old.id, 'Old');
  assert.throws(
    () => deleteMyData(store, maya.id, 'Maya'),
    /You started Launch, and others are still in it\. Delete it in People first\./,
  );
  assert.equal(store.user(maya.id)!.name, 'Maya', 'nothing changed');
  assert.ok(store.resource(page.id));
  store.deleteProject(maya.id, launch.id, 'Launch');
  deleteMyData(store, maya.id, 'Maya');
  // Every workspace she started goes now, deleted ones without waiting for the purge.
  assert.deepEqual(holding(store.db, [solo.id, old.id, launch.id, page.id]), []);
  assert.ok(store.personalSpace(dylan.id), 'others keep their own spaces');
});

test('delete my data: only a person can ask, only for themselves, from the app', async () => {
  const { app, store, dylan, maya } = setup();
  const agent = store.personalAgent(dylan.id)!;
  assert.throws(() => deleteMyData(store, agent.id, agent.name), /Unknown person/);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const h = { 'content-type': 'application/json', 'x-workstation': '1' };
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ userId: dylan.id }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  // Without the app's own header (a form on another site), nothing happens.
  const forged = await fetch(`${base}/api/me/delete`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'Dylan' }),
  });
  assert.equal(forged.status, 403);
  const wrong = await fetch(`${base}/api/me/delete`, {
    method: 'POST',
    headers: { ...h, cookie },
    body: JSON.stringify({ confirm: 'Maya' }),
  });
  assert.equal(wrong.status, 400);
  assert.equal(store.user(maya.id)!.name, 'Maya');
  const done = await fetch(`${base}/api/me/delete`, {
    method: 'POST',
    headers: { ...h, cookie },
    body: JSON.stringify({ confirm: 'Dylan' }),
  });
  assert.equal(done.status, 200);
  assert.match(done.headers.get('set-cookie') ?? '', /Max-Age=0/);
  assert.equal((await fetch(`${base}/api/snapshot`, { headers: { cookie } })).status, 401);
  assert.equal(store.user(dylan.id)!.name, DELETED_NAME);
  assert.equal(store.user(maya.id)!.name, 'Maya');
});
