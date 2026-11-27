import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Where nightly copies of the database go, how many are kept, and the hour (UTC) they are taken. */
export type BackupOptions = { dir: string; keep: number; hour: number };

export type Backup = { name: string; path: string; bytes: number; takenAt: string };

const NAME = /^backup-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z\.db$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Backups are on for any database on disk, in a `backups` folder beside it, unless `BACKUPS=off`.
 * `BACKUP_DIR`, `BACKUP_KEEP` (default 7) and `BACKUP_HOUR` (UTC, default 3) change the defaults.
 */
export function backupOptions(dbPath: string, env: NodeJS.ProcessEnv): BackupOptions | null {
  if (dbPath === ':memory:' || env.BACKUPS?.trim().toLowerCase() === 'off') return null;
  const keep = Number.parseInt(env.BACKUP_KEEP ?? '', 10);
  const hour = Number.parseInt(env.BACKUP_HOUR ?? '', 10);
  return {
    dir: env.BACKUP_DIR?.trim() || join(dirname(dbPath), 'backups'),
    keep: Number.isFinite(keep) && keep >= 1 ? keep : 7,
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 3,
  };
}

/** The finished copies in the folder, newest first. Half-written ones are never listed. */
export function listBackups(dir: string): Backup[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => ({ name, match: NAME.exec(name) }))
    .filter((n): n is { name: string; match: RegExpExecArray } => !!n.match)
    .sort((a, b) => (a.name < b.name ? 1 : -1))
    .map(({ name, match }) => {
      const path = join(dir, name);
      const [, day, h, m, s] = match;
      return { name, path, bytes: statSync(path).size, takenAt: `${day}T${h}:${m}:${s}Z` };
    });
}

const stamp = (at: Date) => at.toISOString().slice(0, 19).replaceAll(':', '') + 'Z';

/**
 * Takes a consistent copy of the database with `VACUUM INTO`, while the app keeps running, then
 * removes the oldest copies beyond `keep`. The copy is written under a temporary name and renamed
 * when complete, so a crash never leaves a broken file that looks like a backup.
 */
export function backupNow(dbPath: string, options: BackupOptions, at = new Date()): Backup {
  mkdirSync(options.dir, { recursive: true });
  const name = `backup-${stamp(at)}.db`;
  const path = join(options.dir, name);
  const partial = `${path}.partial`;
  rmSync(partial, { force: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('pragma busy_timeout = 10000');
    db.prepare('vacuum into ?').run(partial);
  } finally {
    db.close();
  }
  renameSync(partial, path);
  for (const old of listBackups(options.dir).slice(options.keep)) rmSync(old.path, { force: true });
  return { name, path, bytes: statSync(path).size, takenAt: at.toISOString().slice(0, 19) + 'Z' };
}

/** The next time the clock reads `hour`:00 UTC, strictly after `now`. */
export function nextRun(now: Date, hour: number): Date {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** True when there is no copy from the last day, so one should be taken soon after starting. */
export function isDue(dir: string, now = new Date()): boolean {
  const newest = listBackups(dir)[0];
  return !newest || now.getTime() - Date.parse(newest.takenAt) >= DAY_MS;
}

type Log = Pick<Console, 'log' | 'error'>;

/**
 * Takes a backup every night at the set hour, and one shortly after starting when the newest copy
 * is more than a day old (a restart can land on the nightly hour). A failed backup is logged and
 * the app carries on.
 */
export function scheduleBackups(
  dbPath: string,
  options: BackupOptions | null,
  { log = console as Log, startDelayMs = 60_000 }: { log?: Log; startDelayMs?: number } = {},
) {
  if (!options) return { stop() {} };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) run();
    }, ms);
    timer.unref();
    timers.add(timer);
  };
  const take = () => {
    try {
      const backup = backupNow(dbPath, options);
      log.log(`Backup saved: ${backup.path} (${backup.bytes} bytes).`);
    } catch (error) {
      log.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const nightly = () => {
    later(nextRun(new Date(), options.hour).getTime() - Date.now(), () => {
      take();
      nightly();
    });
  };
  log.log(
    `Backups: nightly at ${String(options.hour).padStart(2, '0')}:00 UTC into ${options.dir}, keeping ${options.keep}.`,
  );
  if (isDue(options.dir)) later(startDelayMs, take);
  nightly();
  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
