import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import {
  backupHealth,
  backupNow,
  backupOptions,
  isDue,
  listBackups,
  nextRun,
  scheduleBackups,
} from '../server/backup.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sw-backup-'));
  const dbPath = join(dir, 'workstation.db');
  const db = openDb(dbPath);
  db.prepare('insert into users (id, name, color, kind, created_at) values (?, ?, ?, ?, ?)').run(
    'u1',
    'Dylan',
    '#000',
    'human',
    '2026-11-27T00:00:00Z',
  );
  return {
    dir,
    dbPath,
    db,
    done: () => (db.close(), rmSync(dir, { recursive: true, force: true })),
  };
}

test('backup options: beside the database by default, off in memory or when asked', () => {
  assert.deepEqual(backupOptions('/data/workstation.db', {}), {
    dir: '/data/backups',
    keep: 7,
    hour: 3,
  });
  assert.equal(backupOptions(':memory:', {}), null);
  assert.equal(backupOptions('/data/workstation.db', { BACKUPS: 'off' }), null);
  assert.deepEqual(
    backupOptions('/data/workstation.db', {
      BACKUP_DIR: '/backups',
      BACKUP_KEEP: '3',
      BACKUP_HOUR: '23',
    }),
    { dir: '/backups', keep: 3, hour: 23 },
  );
  // Nonsense falls back to the defaults rather than keeping none or never running.
  assert.deepEqual(backupOptions('/data/workstation.db', { BACKUP_KEEP: '0', BACKUP_HOUR: '24' }), {
    dir: '/data/backups',
    keep: 7,
    hour: 3,
  });
});

test('a backup is a working copy of the database, taken while it is open', () => {
  const t = tempDb();
  try {
    const options = { dir: join(t.dir, 'backups'), keep: 7, hour: 3 };
    const backup = backupNow(t.dbPath, options, new Date('2026-11-27T03:00:00Z'));
    assert.equal(backup.name, 'backup-2026-11-27T030000Z.db');
    assert.ok(backup.bytes > 0);
    // Writes after the copy carry on and do not reach it.
    t.db.prepare("update users set name = 'Changed' where id = 'u1'").run();
    const copy = new DatabaseSync(backup.path, { readOnly: true });
    assert.equal(
      (copy.prepare('select name from users where id = ?').get('u1') as { name: string }).name,
      'Dylan',
    );
    copy.close();
    // The copy opens as a normal database with the full schema.
    const reopened = openDb(backup.path);
    assert.ok(reopened.prepare("select 1 from sqlite_master where name = 'resources'").get());
    reopened.close();
  } finally {
    t.done();
  }
});

test('only the newest copies are kept, and half-written files are ignored', () => {
  const t = tempDb();
  try {
    const options = { dir: join(t.dir, 'backups'), keep: 3, hour: 3 };
    for (let day = 20; day <= 25; day++)
      backupNow(t.dbPath, options, new Date(`2026-11-${day}T03:00:00Z`));
    writeFileSync(join(options.dir, 'backup-2026-11-26T030000Z.db.partial'), 'broken');
    writeFileSync(join(options.dir, 'notes.txt'), 'not a backup');
    assert.deepEqual(
      listBackups(options.dir).map((b) => b.name),
      [
        'backup-2026-11-25T030000Z.db',
        'backup-2026-11-24T030000Z.db',
        'backup-2026-11-23T030000Z.db',
      ],
    );
    assert.equal(listBackups(options.dir)[0].takenAt, '2026-11-25T03:00:00Z');
    // Other files in the folder are left alone.
    assert.ok(readdirSync(options.dir).includes('notes.txt'));
    assert.deepEqual(listBackups(join(t.dir, 'missing')), []);
  } finally {
    t.done();
  }
});

test('the nightly time and whether a copy is due', () => {
  assert.equal(
    nextRun(new Date('2026-11-27T01:30:00Z'), 3).toISOString(),
    '2026-11-27T03:00:00.000Z',
  );
  assert.equal(
    nextRun(new Date('2026-11-27T03:00:00Z'), 3).toISOString(),
    '2026-11-28T03:00:00.000Z',
  );
  assert.equal(
    nextRun(new Date('2026-11-30T22:00:00Z'), 3).toISOString(),
    '2026-12-01T03:00:00.000Z',
  );
  const t = tempDb();
  try {
    const options = { dir: join(t.dir, 'backups'), keep: 7, hour: 3 };
    assert.equal(isDue(options.dir), true);
    backupNow(t.dbPath, options, new Date('2026-11-27T03:00:00Z'));
    assert.equal(isDue(options.dir, new Date('2026-11-27T20:00:00Z')), false);
    assert.equal(isDue(options.dir, new Date('2026-11-28T03:00:00Z')), true);
  } finally {
    t.done();
  }
});

test('the schedule takes a copy soon after starting when none is recent, and stops cleanly', async () => {
  const t = tempDb();
  const lines: string[] = [];
  const log = { log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) };
  try {
    const options = { dir: join(t.dir, 'backups'), keep: 7, hour: 3 };
    const schedule = scheduleBackups(t.dbPath, options, { log, startDelayMs: 5 });
    await new Promise((r) => setTimeout(r, 100));
    schedule.stop();
    assert.equal(listBackups(options.dir).length, 1);
    assert.match(lines[0], /^Backups: nightly at 03:00 UTC into .+backups, keeping 7\.$/);
    assert.match(lines[1], /^Backup saved: /);
    // Off: nothing is scheduled.
    scheduleBackups(':memory:', null).stop();
  } finally {
    t.done();
  }
});

test('a failed backup is logged and the app carries on', async () => {
  const t = tempDb();
  const errors: string[] = [];
  try {
    // A folder where the backup folder should be a file cannot be written to.
    const blocked = join(t.dir, 'blocked');
    writeFileSync(blocked, 'a file, not a folder');
    const schedule = scheduleBackups(
      t.dbPath,
      { dir: join(blocked, 'backups'), keep: 7, hour: 3 },
      { log: { log() {}, error: (s: string) => errors.push(s) }, startDelayMs: 1 },
    );
    await new Promise((r) => setTimeout(r, 50));
    schedule.stop();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Backup failed: /);
  } finally {
    t.done();
  }
});

test('only the people who run the server can download the newest backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-backup-app-'));
  const dbPath = join(dir, 'workstation.db');
  const app = createApp({
    dbPath,
    staticDir: null,
    runtime: scriptedRuntime,
    env: { BACKUP_OWNERS: ' Owner@Example.com ' },
  });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const owner = app.store.createGoogleUser('g-owner', 'Dylan', 'owner@example.com');
    const other = app.store.createGoogleUser('g-other', 'Maya', 'maya@example.com');
    const named = app.store.createHuman('Sam');
    const get = (userId?: string) =>
      fetch(`${base}/api/backup`, {
        headers: userId ? { cookie: `sw_session=${app.store.createSession(userId)}` } : {},
      });

    assert.equal((await get()).status, 401);
    assert.equal((await get(other.id)).status, 403);
    assert.equal((await get(named.id)).status, 403);

    // With no copy yet, one is taken now and sent.
    const first = await get(owner.id);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'application/vnd.sqlite3');
    assert.match(
      first.headers.get('content-disposition') ?? '',
      /^attachment; filename="sandbox-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.db"$/,
    );
    const bytes = Buffer.from(await first.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    const saved = listBackups(join(dir, 'backups'));
    assert.equal(saved.length, 1);
    assert.equal(bytes.length, saved[0].bytes);

    // Later downloads send the newest nightly copy rather than making more.
    backupNow(
      dbPath,
      { dir: join(dir, 'backups'), keep: 7, hour: 3 },
      new Date('2099-01-01T03:00:00Z'),
    );
    const second = await get(owner.id);
    assert.match(second.headers.get('content-disposition') ?? '', /2099-01-01T030000Z/);
    await second.arrayBuffer();
    assert.equal(listBackups(join(dir, 'backups')).length, 2);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backup download is off without owners, or with backups off', async () => {
  for (const env of [{}, { BACKUPS: 'off', BACKUP_OWNERS: 'owner@example.com' }]) {
    const dir = mkdtempSync(join(tmpdir(), 'sw-backup-off-'));
    const app = createApp({
      dbPath: join(dir, 'workstation.db'),
      staticDir: null,
      runtime: scriptedRuntime,
      env,
    });
    try {
      await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const owner = app.store.createGoogleUser('g-owner', 'Dylan', 'owner@example.com');
      const res = await fetch(`${base}/api/backup`, {
        headers: { cookie: `sw_session=${app.store.createSession(owner.id)}` },
      });
      assert.equal(res.status, 'BACKUPS' in env ? 404 : 403);
      assert.deepEqual(listBackups(join(dir, 'backups')), []);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the health line says how old the newest backup is', async () => {
  const t = tempDb();
  try {
    const options = { dir: join(t.dir, 'backups'), keep: 7, hour: 3 };
    assert.deepEqual(backupHealth(null), {});
    assert.deepEqual(backupHealth(options), {
      backups: { count: 0, newest: null, ageHours: null, stale: true },
    });
    backupNow(t.dbPath, options, new Date('2026-11-26T03:00:00Z'));
    backupNow(t.dbPath, options, new Date('2026-11-27T03:00:00Z'));
    assert.deepEqual(backupHealth(options, new Date('2026-11-27T15:30:00Z')), {
      backups: { count: 2, newest: '2026-11-27T03:00:00Z', ageHours: 12.5, stale: false },
    });
    // A missed night shows as stale.
    assert.deepEqual(backupHealth(options, new Date('2026-11-28T06:00:00Z')).backups, {
      count: 2,
      newest: '2026-11-27T03:00:00Z',
      ageHours: 27,
      stale: true,
    });

    const app = createApp({ dbPath: t.dbPath, staticDir: null, runtime: scriptedRuntime, env: {} });
    try {
      await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const health = await (await fetch(`${base}/healthz`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.backups.count, 2);
      assert.equal(health.backups.newest, '2026-11-27T03:00:00Z');
      assert.ok(!JSON.stringify(health).includes(t.dir), 'no paths on the public health line');
    } finally {
      await app.close();
    }
    const memory = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
    try {
      await new Promise<void>((resolve) => memory.server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(memory.server.address() as AddressInfo).port}`;
      assert.equal((await (await fetch(`${base}/healthz`)).json()).backups, undefined);
    } finally {
      await memory.close();
    }
  } finally {
    t.done();
  }
});

test('owners can take a backup now, and nobody else can', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-backup-now-'));
  const dbPath = join(dir, 'workstation.db');
  const app = createApp({
    dbPath,
    staticDir: null,
    runtime: scriptedRuntime,
    env: { BACKUP_OWNERS: 'owner@example.com' },
  });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const owner = app.store.createGoogleUser('g-owner', 'Dylan', 'owner@example.com');
    const other = app.store.createGoogleUser('g-other', 'Maya', 'maya@example.com');
    const post = (userId: string, headers: Record<string, string> = { 'x-workstation': '1' }) =>
      fetch(`${base}/api/backup`, {
        method: 'POST',
        headers: { ...headers, cookie: `sw_session=${app.store.createSession(userId)}` },
      });
    const folder = join(dir, 'backups');

    assert.equal((await post(other.id)).status, 403);
    // Without the app's own header (a form posted from another site), nothing happens.
    assert.equal((await post(owner.id, {})).status, 403);
    assert.deepEqual(listBackups(folder), []);

    const first = await post(owner.id);
    assert.equal(first.status, 200);
    const made = await first.json();
    assert.match(made.name, /^backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.db$/);
    assert.ok(made.bytes > 0);
    assert.deepEqual(
      listBackups(folder).map((b) => b.name),
      [made.name],
    );
    // Pressed again within a minute: the same copy, not another.
    assert.equal((await (await post(owner.id)).json()).name, made.name);
    assert.equal(listBackups(folder).length, 1);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Settings can see the newest backup, but only for owners', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-backup-status-'));
  const dbPath = join(dir, 'workstation.db');
  const app = createApp({
    dbPath,
    staticDir: null,
    runtime: scriptedRuntime,
    env: { BACKUP_OWNERS: 'owner@example.com', BACKUP_KEEP: '3' },
  });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const owner = app.store.createGoogleUser('g-owner', 'Dylan', 'owner@example.com');
    const other = app.store.createGoogleUser('g-other', 'Maya', 'maya@example.com');
    const get = (userId: string) =>
      fetch(`${base}/api/backups`, {
        headers: { cookie: `sw_session=${app.store.createSession(userId)}` },
      });

    assert.equal((await fetch(`${base}/api/backups`)).status, 401);
    assert.equal((await get(other.id)).status, 403);
    assert.deepEqual(await (await get(owner.id)).json(), { count: 0, keep: 3, newest: null });

    const made = backupNow(dbPath, backupOptions(dbPath, { BACKUP_KEEP: '3' })!);
    const status = await (await get(owner.id)).json();
    assert.deepEqual(status, {
      count: 1,
      keep: 3,
      newest: { name: made.name, takenAt: made.takenAt, bytes: made.bytes },
    });
    assert.ok(!JSON.stringify(status).includes(dir), 'no paths');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
