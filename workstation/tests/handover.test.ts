import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { handOverProject } from '../server/handover.ts';

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
  const sam = store.createHuman('Sam');
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const role = (userId: string) =>
    (
      store.db
        .prepare('select role from members where space_id = ? and user_id = ?')
        .get(launch.id, userId) as { role: string } | undefined
    )?.role;
  return { app, store, dylan, maya, sam, launch, role };
}

test('hand over: the owner gives the workspace to someone in it, and becomes a member', () => {
  const { store, dylan, maya, launch, role } = setup();
  const given = handOverProject(store, dylan.id, launch.id, maya.id, ' Launch ');
  assert.equal(given.ownerId, maya.id);
  assert.equal(role(maya.id), 'owner');
  assert.equal(role(dylan.id), 'member');
  // What only an owner may do is now Maya's, and no longer Dylan's.
  assert.throws(() => store.renameProject(dylan.id, launch.id, 'Mine'), /Only the person/);
  assert.equal(store.renameProject(maya.id, launch.id, 'Launch 2').name, 'Launch 2');
  assert.throws(() => store.removeMember(maya.id, launch.id, maya.id), /can't leave it/);
  // Dylan can now leave like anyone else.
  store.removeMember(dylan.id, launch.id, dylan.id);
  assert.equal(store.isMember(dylan.id, launch.id), false);
  assert.equal(store.isMember(maya.id, launch.id), true);
});

test('hand over: only the owner, only to a person in it, and only after typing its name', () => {
  const { store, dylan, maya, sam, launch, role } = setup();
  const agent = store.projectAgent(launch.id)!;
  assert.throws(
    () => handOverProject(store, maya.id, launch.id, maya.id, 'Launch'),
    /Only the person/,
  );
  assert.throws(() => handOverProject(store, sam.id, launch.id, sam.id, 'Launch'), /Not a member/);
  assert.throws(() => handOverProject(store, dylan.id, launch.id, sam.id, 'Launch'), /who is in/);
  assert.throws(() => handOverProject(store, dylan.id, launch.id, agent.id, 'Launch'), /who is in/);
  assert.throws(() => handOverProject(store, dylan.id, launch.id, dylan.id, 'Launch'), /already/);
  assert.throws(
    () => handOverProject(store, dylan.id, launch.id, maya.id, 'launch'),
    /Type Launch exactly to hand it to Maya/,
  );
  const personal = store.personalSpace(dylan.id)!;
  assert.throws(() => handOverProject(store, dylan.id, personal, maya.id, 'x'), /private space/);
  assert.equal(store.space(launch.id)!.ownerId, dylan.id, 'nothing changed');
  assert.equal(role(dylan.id), 'owner');
  assert.equal(role(maya.id), 'member');
});

test('hand over: from the app, with its own header', async () => {
  const { app, store, dylan, maya, launch } = setup();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const h = { 'content-type': 'application/json', 'x-workstation': '1' };
  const join = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ userId: dylan.id }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  const ask = (headers: Record<string, string>, confirm: string) =>
    fetch(`${base}/api/projects/${launch.id}/owner`, {
      method: 'POST',
      headers: { ...headers, cookie },
      body: JSON.stringify({ userId: maya.id, confirm }),
    });
  assert.equal((await ask({ 'content-type': 'application/json' }, 'Launch')).status, 403);
  assert.equal((await ask(h, 'Nope')).status, 400);
  assert.equal(store.space(launch.id)!.ownerId, dylan.id);
  const done = await ask(h, 'Launch');
  assert.equal(done.status, 200);
  assert.equal(((await done.json()) as { ownerId: string }).ownerId, maya.id);
  assert.equal(store.space(launch.id)!.ownerId, maya.id);
});
