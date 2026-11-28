import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

/**
 * Whether the database will survive a redeploy. A container's own disk (overlay)
 * and memory-backed file systems are thrown away with the container; a mounted
 * volume or an ordinary disk is kept. Linux reports mounts in /proc/self/mountinfo;
 * elsewhere the answer is unknown (null).
 */
export type StorageInfo = { persistent: boolean | null; storage: string };

const THROWN_AWAY = new Set(['overlay', 'tmpfs', 'ramfs', 'aufs']);

type Mount = { point: string; fs: string };

/** Mount points and file system types from /proc/self/mountinfo text. */
export function parseMountinfo(text: string): Mount[] {
  const mounts: Mount[] = [];
  for (const line of text.split('\n')) {
    const [before, after] = line.split(' - ');
    if (!before || !after) continue;
    const point = before.split(' ')[4];
    const fs = after.split(' ')[0];
    if (point && fs) mounts.push({ point: unescape(point), fs });
  }
  return mounts;
}

// mountinfo writes spaces, tabs, newlines and backslashes in octal (\040).
function unescape(path: string) {
  return path.replace(/\\([0-7]{3})/g, (_, code: string) => String.fromCharCode(parseInt(code, 8)));
}

/** The mount that holds `dir`: the longest mount point that is `dir` or above it. */
export function mountFor(dir: string, mounts: Mount[]): Mount | undefined {
  let best: Mount | undefined;
  for (const mount of mounts) {
    const point = mount.point === '/' ? '/' : mount.point.replace(/\/+$/, '');
    const inside = point === '/' || dir === point || dir.startsWith(point + sep);
    // Later lines win on a tie: they are mounted over the earlier ones.
    if (inside && (!best || point.length >= best.point.length)) best = { point, fs: mount.fs };
  }
  return best;
}

export function storageInfo(dbPath: string, mountinfo?: string): StorageInfo {
  if (dbPath === ':memory:' || dbPath === '') return { persistent: false, storage: 'memory' };
  let text = mountinfo;
  if (text === undefined) {
    try {
      text = readFileSync('/proc/self/mountinfo', 'utf8');
    } catch {
      return { persistent: null, storage: 'unknown' };
    }
  }
  const mount = mountFor(folderOf(dbPath), parseMountinfo(text));
  if (!mount) return { persistent: null, storage: 'unknown' };
  return { persistent: !THROWN_AWAY.has(mount.fs), storage: mount.fs };
}

// The folder that holds the database, as an absolute path. (Only dirname, join and sep:
// the in-page build stands in for node:path with just those.)
function folderOf(dbPath: string) {
  return dirname(dbPath.startsWith('/') ? dbPath : join(process.cwd(), dbPath));
}

const cache = new Map<string, StorageInfo>();

/** storageInfo, read once per database path (mounts don't change while the server runs). */
export function storageFor(dbPath: string): StorageInfo {
  let info = cache.get(dbPath);
  if (!info) cache.set(dbPath, (info = storageInfo(dbPath)));
  return info;
}

/** The startup warning, or null when the data will be kept (or memory was asked for). */
export function storageWarning(dbPath: string, info: StorageInfo): string | null {
  if (info.persistent !== false || dbPath === ':memory:') return null;
  return (
    `Warning: ${folderOf(dbPath)} is on storage that is thrown away (${info.storage}), ` +
    `so everything is lost on the next deploy. Attach a volume there (see docs/WEBAPP.md).`
  );
}

/** Whether the database answers a read that touches the file. Used by /healthz. */
export function databaseReads(db: { prepare(sql: string): { get(): unknown } }): boolean {
  try {
    db.prepare('select count(*) from sqlite_master').get();
    return true;
  } catch {
    return false;
  }
}
