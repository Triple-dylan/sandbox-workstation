import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { exportMyData } from '../server/export.ts';

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

test('export: their own pages, messages, private agent chats, agents, routines and steps', async () => {
  const { app, store, dylan, maya, launch, general, snap } = setup();
  const personal = store.personalSpace(dylan.id)!;
  const agent = store.personalAgent(dylan.id)!;
  const diary = store.createResource(dylan.id, { spaceId: personal, kind: 'doc', body: 'Diary' });
  const plan = store.createResource(dylan.id, { spaceId: launch.id, kind: 'doc', body: 'Plan' });
  const hers = store.createResource(maya.id, { spaceId: launch.id, kind: 'doc', body: 'Hers' });
  const secret = store.createResource(maya.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Her secret',
    visibility: 'private',
  });
  const said = store.postMessage(dylan.id, { conversationId: general.id, text: 'My idea' });
  store.postMessage(maya.id, { conversationId: general.id, text: 'Her reply' });
  const own = snap(dylan.id).conversations.find(
    (c) => c.kind === 'agent-private' && c.participantIds.includes(agent.id),
  )!;
  store.postMessage(dylan.id, { conversationId: own.id, text: 'Remind me about the plan' });
  const mayaOwn = snap(maya.id).conversations.find(
    (c) => c.kind === 'agent-private' && c.participantIds.includes(maya.id),
  )!;
  store.postMessage(maya.id, { conversationId: mayaOwn.id, text: 'Her private ask' });
  store.createRoutine(dylan.id, {
    agentId: store.projectAgent(launch.id)!.id,
    instruction: 'Sum up Fridays',
    cadence: 'weekly',
    weekday: 5,
    time: '09:00',
    tzOffset: 0,
    conversationId: general.id,
  });
  store.createGoal(dylan.id, { spaceId: launch.id, title: 'Ship' });
  store.createGoal(maya.id, { spaceId: launch.id, title: 'Her step' });
  store.db
    .prepare('insert into connections values (?, ?, ?, ?, ?, ?)')
    .run(dylan.id, 'google', 'dylan@example.com', 'access-token-secret', 'refresh-secret', 0);
  await app.engine.idle();

  const data = exportMyData(store, dylan.id);
  const text = JSON.stringify(data);
  assert.equal(data.profile.name, 'Dylan');
  assert.deepEqual(data.spaces.map((s) => s.name).sort(), ['Launch', 'Personal']);
  assert.deepEqual(
    data.pages
      .map((p) => p.id)
      .filter((id) => [diary.id, plan.id, hers.id].includes(id))
      .sort(),
    [diary.id, plan.id].sort(),
    'their pages, not hers',
  );
  assert.ok(data.messages.some((m) => m.id === said.id && m.author === 'Dylan'));
  assert.ok(
    !data.messages.some((m) => m.text === 'Her reply'),
    'not what others wrote in a channel',
  );
  assert.ok(data.messages.some((m) => m.text === 'Remind me about the plan'));
  assert.ok(
    data.messages.some((m) => m.conversationId === own.id && m.author === agent.name),
    'both sides of their private chat with their agent',
  );
  assert.ok(data.agents.some((a) => a.id === agent.id));
  assert.equal(data.routines[0].instruction, 'Sum up Fridays');
  assert.deepEqual(
    data.goals.map((g) => g.title),
    ['Ship'],
  );
  assert.deepEqual(data.connections, [{ provider: 'google', account: 'dylan@example.com' }]);
  for (const hidden of ['Her secret', 'Her private ask', 'access-token-secret', 'refresh-secret'])
    assert.ok(!text.includes(hidden), `never ${hidden}`);
  assert.ok(!text.includes(secret.id));

  // Once they leave a workspace, what is in it is no longer theirs to read, so it is not exported.
  store.removeMember(dylan.id, launch.id, dylan.id);
  const later = exportMyData(store, dylan.id);
  assert.ok(!later.pages.some((p) => p.id === plan.id));
  assert.ok(!later.messages.some((m) => m.id === said.id));
  assert.deepEqual(later.routines, []);
  assert.ok(later.pages.some((p) => p.id === diary.id));
});

test('export: downloaded from the app as a file, only by the person signed in', async () => {
  const { app, store, dylan } = setup();
  const agent = store.personalAgent(dylan.id)!;
  assert.throws(() => exportMyData(store, agent.id), /Unknown person/);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  assert.equal((await fetch(`${base}/api/me/export`)).status, 401);
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-workstation': '1' },
    body: JSON.stringify({ userId: dylan.id }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  const got = await fetch(`${base}/api/me/export`, { headers: { cookie } });
  assert.equal(got.status, 200);
  assert.match(got.headers.get('content-disposition') ?? '', /attachment; filename="my-data-/);
  assert.equal(((await got.json()) as { profile: { id: string } }).profile.id, dylan.id);
});
