import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import {
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
