import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.ts';
import { backupNow } from '../server/backup.ts';
import { applyPendingRestore, backupProblem, findBackup, stageRestore } from '../server/restore.ts';

const quiet = { log() {}, error() {} };

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sw-restore-'));
  const dbPath = join(dir, 'workstation.db');
  const options = { dir: join(dir, 'backups'), keep: 7, hour: 3 };
  const db = openDb(dbPath);
  const name = (id: string) =>
    (openDb(dbPath).prepare('select name from users where id = ?').get(id) as { name: string })
      ?.name;
  db.prepare('insert into users (id, name, color, kind, created_at) values (?, ?, ?, ?, ?)').run(
    'u1',
    'Before',
    '#000',
    'human',
    '2026-11-27T00:00:00Z',
  );
  const backup = backupNow(dbPath, options, new Date('2026-11-27T03:00:00Z'));
  db.prepare("update users set name = 'After' where id = 'u1'").run();
  return { dir, dbPath, options, db, backup, name };
}

test('a staged restore goes in place at the next start, keeping the database it replaces', () => {
  const t = setup();
  try {
    assert.equal(backupProblem(t.backup.path), null);
    const pending = stageRestore(t.dbPath, t.backup.path);
    assert.ok(existsSync(pending));
    // The running server's database is not touched until the next start.
    t.db.close();
    assert.equal(t.name('u1'), 'After');
    const result = applyPendingRestore(t.dbPath, {
      log: quiet,
      at: new Date('2026-11-27T12:00:00Z'),
    });
    assert.equal(result.restored, true);
    assert.equal(result.keptAs, `${t.dbPath}.before-restore-2026-11-27T120000Z`);
    assert.equal(t.name('u1'), 'Before');
    assert.ok(!existsSync(pending));
    // What it replaced is kept, with its latest writes.
    const kept = openDb(result.keptAs!);
    assert.equal(
      (kept.prepare("select name from users where id = 'u1'").get() as { name: string }).name,
      'After',
    );
    kept.close();
    // Nothing staged: nothing happens.
    assert.deepEqual(applyPendingRestore(t.dbPath, { log: quiet }), { restored: false });
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('a file that is not a sound Sandbox backup is refused, and the database is left alone', () => {
  const t = setup();
  try {
    const junk = join(t.dir, 'junk.db');
    writeFileSync(junk, 'not a database at all');
    assert.match(backupProblem(junk) ?? '', /not a database/);
    assert.throws(() => stageRestore(t.dbPath, junk), /not a database/);
    assert.match(backupProblem(join(t.dir, 'missing.db')) ?? '', /does not exist/);
    const other = join(t.dir, 'other.db');
    const plain = new DatabaseSync(other);
    plain.exec('create table notes (x)');
    plain.close();
    assert.match(backupProblem(other) ?? '', /not a Sandbox database/);
    // A staged file that went bad before the restart is set aside.
    writeFileSync(`${t.dbPath}.restore-pending`, 'broken');
    const errors: string[] = [];
    t.db.close();
    const result = applyPendingRestore(t.dbPath, {
      log: { log() {}, error: (s: string) => errors.push(s) },
      at: new Date('2026-11-27T12:00:00Z'),
    });
    assert.equal(result.restored, false);
    assert.match(errors[0], /^Restore not applied: /);
    assert.equal(t.name('u1'), 'After');
    assert.ok(readdirSync(t.dir).includes('workstation.db.restore-failed-2026-11-27T120000Z'));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('backups are found by name, as the latest, or by path', () => {
  const t = setup();
  try {
    t.db.close();
    assert.equal(findBackup('latest', t.options), t.backup.path);
    assert.equal(findBackup(t.backup.name, t.options), t.backup.path);
    assert.equal(findBackup(t.backup.path, t.options), t.backup.path);
    const empty = { ...t.options, dir: join(t.dir, 'none') };
    assert.throws(() => findBackup('latest', empty), /no backups/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('npm run restore lists backups and stages one', () => {
  const t = setup();
  t.db.close();
  const script = fileURLToPath(new URL('../server/restore.ts', import.meta.url));
  const run = (...args: string[]) =>
    execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...args], {
      env: { ...process.env, WORKSTATION_DB: t.dbPath },
      encoding: 'utf8',
    });
  try {
    assert.match(run(), new RegExp(`${t.backup.name}`));
    assert.match(run('latest'), /Restart the server to finish/);
    assert.ok(existsSync(`${t.dbPath}.restore-pending`));
    assert.throws(() => run('nope.db'), /does not exist/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});
