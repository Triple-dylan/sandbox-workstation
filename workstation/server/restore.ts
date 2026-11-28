import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupOptions, listBackups, type BackupOptions } from './backup.ts';
import { loadEnv } from './env.ts';

/**
 * Putting a backup back. A restore is staged while the server runs and applied the next time it
 * starts, before anything opens the database: on a host like Railway the server is the only thing
 * running, so it cannot be stopped first. See docs/BACKUPS.md.
 */

const pendingPath = (dbPath: string) => `${dbPath}.restore-pending`;

/** Why a file is not a usable backup, or null when it is one. */
export function backupProblem(path: string): string | null {
  if (!existsSync(path)) return `${path} does not exist.`;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch {
    return `${path} is not a database.`;
  }
  try {
    const check = db.prepare('pragma integrity_check').get() as { integrity_check?: string };
    if (check?.integrity_check !== 'ok') return `${path} is damaged (${check?.integrity_check}).`;
    for (const table of ['users', 'spaces', 'resources'])
      if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table))
        return `${path} is not a Sandbox database (no ${table} table).`;
    return null;
  } catch {
    return `${path} is not a database.`;
  } finally {
    db.close();
  }
}

/** A backup by name in the backups folder, `latest`, or a path to a file. */
export function findBackup(which: string, options: BackupOptions): string {
  if (which === 'latest') {
    const newest = listBackups(options.dir)[0];
    if (!newest) throw new Error(`There are no backups in ${options.dir} yet.`);
    return newest.path;
  }
  const inFolder = join(options.dir, which);
  if (!which.includes('/') && existsSync(inFolder)) return inFolder;
  return isAbsolute(which) ? which : resolve(which);
}

/** Checks the backup and copies it beside the database, to be put in place at the next start. */
export function stageRestore(dbPath: string, source: string) {
  const problem = backupProblem(source);
  if (problem) throw new Error(problem);
  const pending = pendingPath(dbPath);
  copyFileSync(source, `${pending}.partial`);
  renameSync(`${pending}.partial`, pending);
  return pending;
}

const stamp = (at: Date) => at.toISOString().slice(0, 19).replaceAll(':', '') + 'Z';

/**
 * Run at start-up, before the database is opened. If a restore is staged and still checks out, the
 * current database (with its -wal and -shm files) is kept as `<db>.before-restore-<time>` and the
 * backup takes its place. A staged file that fails the check is set aside and the database is left
 * alone.
 */
export function applyPendingRestore(
  dbPath: string,
  { log = console as Pick<Console, 'log' | 'error'>, at = new Date() } = {},
): { restored: boolean; keptAs?: string } {
  const pending = pendingPath(dbPath);
  if (dbPath === ':memory:' || !existsSync(pending)) return { restored: false };
  const problem = backupProblem(pending);
  if (problem) {
    renameSync(pending, `${dbPath}.restore-failed-${stamp(at)}`);
    log.error(`Restore not applied: ${problem} The database was left as it was.`);
    return { restored: false };
  }
  let keptAs: string | undefined;
  if (existsSync(dbPath)) {
    keptAs = `${dbPath}.before-restore-${stamp(at)}`;
    renameSync(dbPath, keptAs);
    for (const suffix of ['-wal', '-shm'])
      if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, keptAs + suffix);
  }
  renameSync(pending, dbPath);
  log.log(
    `Restored the database from a backup.${keptAs ? ` The one it replaced is kept as ${keptAs}.` : ''}`,
  );
  return { restored: true, ...(keptAs ? { keptAs } : {}) };
}

/** `npm run restore` lists the backups; `npm run restore -- <name|latest|path>` stages one. */
function main(args: string[], env: NodeJS.ProcessEnv) {
  const dbPath =
    env.WORKSTATION_DB ?? fileURLToPath(new URL('../data/workstation.db', import.meta.url));
  const options = backupOptions(dbPath, { ...env, BACKUPS: undefined });
  if (!options)
    throw new Error('This server keeps its database in memory; there is nothing to restore.');
  const which = args[0];
  if (!which) {
    const backups = listBackups(options.dir);
    if (!backups.length) return console.log(`No backups in ${options.dir} yet.`);
    console.log(`Backups in ${options.dir}, newest first:`);
    for (const b of backups) console.log(`  ${b.name}  (${b.takenAt}, ${b.bytes} bytes)`);
    return console.log(
      '\nTo restore one: npm run restore -- <name>   (or: npm run restore -- latest)',
    );
  }
  rmSync(pendingPath(dbPath), { force: true });
  const source = findBackup(which, options);
  stageRestore(dbPath, source);
  console.log(
    `Checked ${source}; it will replace ${dbPath} when the server next starts.\nRestart the server to finish. The current database is kept beside it, not deleted.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    loadEnv();
    main(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
