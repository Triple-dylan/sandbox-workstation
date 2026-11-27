import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { PURGE_AFTER_DAYS, purgeAfterDays, purgeDeletedWorkspaces } from '../server/purge.ts';
import type { Db } from '../server/db.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

const DAY = 86_400_000;

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
  const launch = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, launch.id, maya.id);
  const keep = store.createProject(maya.id, 'Keep');
  store.addMember(maya.id, keep.id, dylan.id);
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: scriptedRuntime.id, label: scriptedRuntime.label });
  return { app, store, dylan, maya, launch, keep, snap };
}

/** A workspace with something in nearly every table: pages, chats, reactions, agents, skills. */
async function fill(s: ReturnType<typeof setup>, spaceId: string) {
  const { store, dylan, maya, snap } = s;
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === spaceId,
  )!;
  const page = store.createResource(dylan.id, { spaceId, kind: 'doc', body: 'Plan\nShip it' });
  store.updateResource(dylan.id, page.id, { body: 'Plan\nShip it soon' });
  const draft = store.createResource(maya.id, {
    spaceId,
    kind: 'doc',
    body: 'Draft',
    visibility: 'private',
  });
  store.setGrant(maya.id, draft.id, dylan.id, true);
  const message = store.postMessage(maya.id, { conversationId: general.id, text: 'Looks good' });
  store.toggleReaction(dylan.id, message.id, '👍');
  store.markRead(dylan.id, general.id);
  store.setPin(dylan.id, general.id, page.id, true);
  store.createChannel(dylan.id, spaceId, 'design');
  store.openDiscussion(dylan.id, page.id);
  const agent = store.projectAgent(spaceId)!;
  const dm = store.openDm(maya.id, agent.id);
  store.postMessage(maya.id, { conversationId: dm.id, text: 'Hi agent' });
  const skill = store.createSkill(dylan.id, { spaceId, name: 'Weekly notes' });
  store.setAgentSkill(dylan.id, agent.id, skill.id, true);
  store.setWatch(dylan.id, agent.id, page.id, 'when it changes');
  store.createGoal(dylan.id, { spaceId, title: 'Launch' });
  store.invite(dylan.id, spaceId);
  store.createRoutine(dylan.id, {
    agentId: agent.id,
    instruction: 'Sum up the week',
    cadence: 'weekly',
    weekday: 1,
    time: '09:00',
    tzOffset: 0,
    conversationId: general.id,
  });
  const job = store.createJob({
    agentId: agent.id,
    spaceId,
    conversationId: general.id,
    kind: 'ask',
    request: 'Hi',
    runtime: 'scripted',
  });
  store.replaceVectors(page.id, 'stamp', [{ text: 'Ship it', vector: new Float32Array([1, 0]) }]);
  store.setDocState(page.id, new Uint8Array([1, 2, 3]));
  store.setBrowserState(spaceId, '{}');
  store.addAgentUsage(spaceId, dylan.id, 10);
  // Let the agents finish answering before the test goes on.
  await s.app.engine.idle();
  return { general, page, draft, message, agent, dm, skill, job };
}

/** Every row anywhere that still holds one of these ids, as "table.column". */
function leftovers(db: Db, ids: string[]) {
  const wanted = new Set(ids);
  const found: string[] = [];
  const tables = db.prepare(`select name from sqlite_master where type = 'table'`).all() as {
    name: string;
  }[];
  for (const { name } of tables)
    for (const row of db.prepare(`select * from ${name}`).all() as Record<string, unknown>[])
      for (const [column, value] of Object.entries(row))
        if (typeof value === 'string' && wanted.has(value)) found.push(`${name}.${column}`);
  return [...new Set(found)];
}

const ago = (db: Db, spaceId: string, days: number) =>
  db
    .prepare('update spaces set deleted_at = ? where id = ?')
    .run(new Date(Date.now() - days * DAY).toISOString(), spaceId);

test('purge: a deleted workspace stays through its grace period, then everything in it goes', async () => {
  const s = setup();
  const { store, dylan, launch } = s;
  const filled = await fill(s, launch.id);
  const ids = [
    launch.id,
    filled.general.id,
    filled.page.id,
    filled.draft.id,
    filled.message.id,
    filled.agent.id,
    filled.dm.id,
    filled.skill.id,
    filled.job.id,
  ];
  store.deleteProject(dylan.id, launch.id, 'Launch');
  assert.deepEqual(purgeDeletedWorkspaces(store.db), [], 'not on the day it is deleted');
  ago(store.db, launch.id, PURGE_AFTER_DAYS - 1);
  assert.deepEqual(purgeDeletedWorkspaces(store.db), [], 'nor a day before the grace period ends');
  assert.ok(leftovers(store.db, [launch.id]).length > 0, 'its rows are still there');
  ago(store.db, launch.id, PURGE_AFTER_DAYS);
  assert.deepEqual(purgeDeletedWorkspaces(store.db), [launch.id]);
  assert.deepEqual(leftovers(store.db, ids), [], 'nothing anywhere still names it');
  assert.deepEqual(purgeDeletedWorkspaces(store.db), [], 'a second run finds nothing');
});

test('purge: workspaces still in use and everyone’s own spaces are untouched', async () => {
  const s = setup();
  const { store, dylan, maya, launch, keep, snap } = s;
  await fill(s, launch.id);
  const kept = await fill(s, keep.id);
  const tables = (db: Db) =>
    Object.fromEntries(
      (db.prepare(`select name from sqlite_master where type = 'table'`).all() as any[]).map(
        (t) => [t.name, (db.prepare(`select * from ${t.name}`).all() as any[]).length],
      ),
    );
  const before = snap(maya.id);
  store.deleteProject(dylan.id, launch.id, 'Launch');
  ago(store.db, launch.id, PURGE_AFTER_DAYS + 5);
  const counts = tables(store.db);
  purgeDeletedWorkspaces(store.db);
  const afterCounts = tables(store.db);
  assert.ok(afterCounts.resources < counts.resources);
  const after = snap(maya.id);
  // Maya's view is what it was once Launch was closed: Keep and her own space, all their pages.
  assert.deepEqual(
    after.spaces.map((x) => x.name),
    before.spaces.filter((x) => x.id !== launch.id).map((x) => x.name),
  );
  assert.deepEqual(
    after.resources.map((r) => r.id).sort(),
    before.resources
      .filter((r) => r.spaceId !== launch.id)
      .map((r) => r.id)
      .sort(),
  );
  assert.ok(after.messages.some((m) => m.conversationId === kept.general.id));
  assert.ok(after.messages.some((m) => m.conversationId === kept.dm.id));
  assert.ok(store.projectAgent(keep.id));
  assert.ok(store.personalAgent(dylan.id) && store.personalAgent(maya.id));
  // A workspace that was never deleted is never purged, however old.
  store.db
    .prepare('update spaces set created_at = ? where id = ?')
    .run(new Date(Date.now() - 400 * DAY).toISOString(), keep.id);
  assert.deepEqual(purgeDeletedWorkspaces(store.db), []);
});

test('purge: the grace period comes from PURGE_AFTER_DAYS, and 0 purges straight away', () => {
  assert.equal(purgeAfterDays({}), PURGE_AFTER_DAYS);
  assert.equal(purgeAfterDays({ PURGE_AFTER_DAYS: '7' }), 7);
  assert.equal(purgeAfterDays({ PURGE_AFTER_DAYS: '0' }), 0);
  assert.equal(purgeAfterDays({ PURGE_AFTER_DAYS: 'soon' }), PURGE_AFTER_DAYS);
  assert.equal(purgeAfterDays({ PURGE_AFTER_DAYS: '-3' }), PURGE_AFTER_DAYS);
  const { store, dylan, launch } = setup();
  store.deleteProject(dylan.id, launch.id, 'Launch');
  assert.deepEqual(purgeDeletedWorkspaces(store.db, { afterDays: 7 }), []);
  assert.deepEqual(purgeDeletedWorkspaces(store.db, { afterDays: 0 }), [launch.id]);
});

test('purge: the server purges on start, using its environment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'purge-'));
  const dbPath = join(dir, 'workstation.db');
  try {
    const first = createApp({ dbPath, staticDir: null, runtime: scriptedRuntime });
    const dylan = first.store.createHuman('Dylan');
    const launch = first.store.createProject(dylan.id, 'Launch');
    first.store.deleteProject(dylan.id, launch.id, 'Launch');
    ago(first.store.db, launch.id, 10);
    await first.close();
    // Ten days is inside the default grace period, so a restart keeps it.
    const second = createApp({ dbPath, staticDir: null, runtime: scriptedRuntime, env: {} });
    assert.ok(second.store.space(launch.id));
    await second.close();
    // With a week's grace, the next start purges it.
    const third = createApp({
      dbPath,
      staticDir: null,
      runtime: scriptedRuntime,
      env: { PURGE_AFTER_DAYS: '7' },
    });
    assert.equal(third.store.space(launch.id), null);
    assert.ok(third.store.personalSpace(dylan.id), 'their own space stays');
    await third.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
