import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { clearDeadLinks } from '../server/purge.ts';

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

test('dead links: expired and replaced invites and used or expired sign-in links are cleared', async () => {
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    maintenanceDelayMs: 5,
    env: {},
  });
  opened.push(app);
  const { store } = app;
  const db = store.db;
  const count = (table: string) =>
    (db.prepare(`select count(*) n from ${table}`).get() as { n: number }).n;
  const dylan = store.createHuman('Dylan');
  const launch = store.createProject(dylan.id, 'Launch');
  const other = store.createProject(dylan.id, 'Other');

  const replaced = await store.invite(dylan.id, launch.id);
  const current = await store.invite(dylan.id, launch.id, true);
  const stale = await store.invite(dylan.id, other.id);
  db.prepare('update invites set expires_at = ? where token = ?').run(
    new Date(Date.now() - 1000).toISOString(),
    stale.token,
  );
  const used = await store.signInLink(dylan.id);
  await store.useSignInLink(used.token);
  const expired = await store.signInLink(dylan.id);
  db.prepare('update signin_links set expires_at = ? where used = 0').run(
    new Date(Date.now() - 1000).toISOString(),
  );
  const live = await store.signInLink(dylan.id);
  assert.equal(count('invites'), 3);
  assert.equal(count('signin_links'), 3);

  assert.deepEqual(clearDeadLinks(db), { invites: 2, signIns: 2 });
  assert.equal(count('invites'), 1);
  assert.equal(count('signin_links'), 1);
  // What still works keeps working; what was dead says so, exactly as before.
  assert.equal((await store.inviteInfo(current.token)).spaceName, 'Launch');
  await assert.rejects(() => store.inviteInfo(replaced.token), /expired or been replaced/);
  await assert.rejects(() => store.inviteInfo(stale.token), /expired or been replaced/);
  await assert.rejects(() => store.useSignInLink(expired.token), /used or has expired/);
  assert.equal((await store.useSignInLink(live.token)).id, dylan.id);
  assert.deepEqual(clearDeadLinks(db), { invites: 0, signIns: 1 }, 'the link just used goes next');
  assert.equal(
    (await store.invite(dylan.id, launch.id)).token,
    current.token,
    'the live invite stays',
  );
});
