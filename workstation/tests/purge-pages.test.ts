import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { PURGE_AFTER_DAYS, purgeDeletedPages } from '../server/purge.ts';
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
  const snap = (userId: string) =>
    store.snapshot(userId, [], { id: scriptedRuntime.id, label: scriptedRuntime.label });
  const general = snap(dylan.id).conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === launch.id,
  )!;
  return { app, store, dylan, maya, launch, general, snap };
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
  return [...new Set(found)].sort();
}

/** Makes these deleted rows look as if they were deleted this many days ago. */
const ago = (db: Db, ids: string[], days: number) => {
  const at = new Date(Date.now() - days * DAY).toISOString();
  for (const id of ids) db.prepare('update resources set updated_at = ? where id = ?').run(at, id);
};

test('purge pages: a deleted page stays through its grace period, then it and its history go', async () => {
  const { app, store, dylan, maya, launch, general, snap } = setup();
  const page = store.createResource(dylan.id, { spaceId: launch.id, kind: 'doc', body: 'Plan\nA' });
  store.updateResource(dylan.id, page.id, { body: 'Plan\nB' });
  store.setGrant(dylan.id, page.id, maya.id, true);
  store.setPin(dylan.id, general.id, page.id, true);
  const talk = store.openDiscussion(dylan.id, page.id);
  const said = store.postMessage(maya.id, { conversationId: talk.id, text: 'About the plan' });
  store.toggleReaction(dylan.id, said.id, '👍');
  store.markRead(dylan.id, talk.id);
  const agent = store.projectAgent(launch.id)!;
  store.setWatch(dylan.id, agent.id, page.id, 'when it changes');
  store.replaceVectors(page.id, 'stamp', [{ text: 'Plan', vector: new Float32Array([1, 0]) }]);
  store.setDocState(page.id, new Uint8Array([1, 2, 3]));
  const kept = store.createResource(dylan.id, { spaceId: launch.id, kind: 'doc', body: 'Keep' });
  await app.engine.idle();

  store.deleteResource(dylan.id, page.id);
  assert.deepEqual(purgeDeletedPages(store.db), [], 'not on the day it is deleted');
  ago(store.db, [page.id], PURGE_AFTER_DAYS - 1);
  assert.deepEqual(purgeDeletedPages(store.db), [], 'nor a day before the grace period ends');
  store.restoreResource(dylan.id, page.id);
  assert.ok(
    snap(maya.id).resources.some((r) => r.id === page.id),
    'so it can still be restored',
  );

  store.deleteResource(dylan.id, page.id);
  ago(store.db, [page.id], PURGE_AFTER_DAYS);
  assert.deepEqual(purgeDeletedPages(store.db), [page.id]);
  assert.deepEqual(leftovers(store.db, [page.id, talk.id, said.id]), [], 'nothing names it');
  assert.throws(() => store.restoreResource(dylan.id, page.id), /Not available/);
  assert.ok(
    snap(maya.id).resources.some((r) => r.id === kept.id),
    'live pages stay',
  );
  assert.ok(snap(maya.id).messages.some((m) => m.conversationId === general.id));
  assert.deepEqual(purgeDeletedPages(store.db), [], 'a second run finds nothing');
});

test('purge pages: arrows and cards that went with a page go too; a folder waits for what is in it', () => {
  const { store, dylan, launch } = setup();
  const canvas = store.createResource(dylan.id, { spaceId: launch.id, kind: 'canvas', body: '' });
  const piece = (body: string) =>
    store.createResource(dylan.id, {
      spaceId: launch.id,
      kind: 'sticky',
      body,
      parentId: canvas.id,
      placement: { x: 0, y: 0, width: 100, height: 100 },
    });
  const a = piece('A');
  const b = piece('B');
  const arrow = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'arrow',
    parentId: canvas.id,
    body: JSON.stringify({ from: a.id, to: b.id }),
  });
  store.deleteResource(dylan.id, b.id);
  ago(store.db, [b.id, arrow.id], PURGE_AFTER_DAYS + 1);
  assert.deepEqual(purgeDeletedPages(store.db).sort(), [arrow.id, b.id].sort());
  assert.ok(store.resource(a.id) && store.resource(canvas.id), 'the rest of the canvas stays');

  // A deleted folder that still has a live page in it is kept until that page is gone too.
  const folder = store.createFolder(dylan.id, { spaceId: launch.id, title: 'Vendors' });
  const inside = store.createResource(dylan.id, {
    spaceId: launch.id,
    kind: 'doc',
    body: 'Quote',
    parentId: folder.id,
  });
  store.deleteResource(dylan.id, folder.id);
  ago(store.db, [folder.id], PURGE_AFTER_DAYS + 1);
  assert.deepEqual(purgeDeletedPages(store.db), [], 'its page still points at it');
  store.deleteResource(dylan.id, inside.id);
  assert.deepEqual(purgeDeletedPages(store.db), [], 'nor while its page can still be restored');
  ago(store.db, [inside.id], PURGE_AFTER_DAYS + 1);
  assert.deepEqual(purgeDeletedPages(store.db).sort(), [folder.id, inside.id].sort(), 'then both');
  assert.deepEqual(leftovers(store.db, [folder.id, inside.id]), []);
});

test('purge pages: pages in a deleted workspace wait for the workspace purge', () => {
  const { store, dylan, launch } = setup();
  const page = store.createResource(dylan.id, { spaceId: launch.id, kind: 'doc', body: 'Old' });
  store.deleteResource(dylan.id, page.id);
  ago(store.db, [page.id], PURGE_AFTER_DAYS + 1);
  store.deleteProject(dylan.id, launch.id, 'Launch');
  assert.deepEqual(purgeDeletedPages(store.db), []);
  assert.ok(leftovers(store.db, [page.id]).length > 0);
  assert.deepEqual(purgeDeletedPages(store.db, { afterDays: 0 }), [], 'whatever the grace period');
});
