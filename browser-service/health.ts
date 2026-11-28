import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How much memory the service is using, read from Linux itself so it matches what Railway counts:
 * the container's total (its memory cgroup) and its limit, Chrome's processes together, and this
 * Node process. Anything Linux doesn't offer (on a laptop, say) is left out rather than guessed.
 */
export type Memory = {
  /** Everything in the container, as the host counts it against the limit. */
  used: number | null;
  /** The container's limit, when it has one. */
  limit: number | null;
  /** Chrome and every process it started, by resident size; shared memory counts in each, so it reads high. */
  chrome: number | null;
  /** This Node process. */
  node: number;
};

export function readMemory(options: { chromePid?: number; proc?: string; cgroup?: string } = {}) {
  const proc = options.proc ?? '/proc';
  const cgroup = options.cgroup ?? '/sys/fs/cgroup';
  return {
    used:
      number(read(join(cgroup, 'memory.current'))) ??
      number(read(join(cgroup, 'memory', 'memory.usage_in_bytes'))),
    limit:
      limitOf(read(join(cgroup, 'memory.max'))) ??
      limitOf(read(join(cgroup, 'memory', 'memory.limit_in_bytes'))),
    chrome: options.chromePid ? treeSize(proc, options.chromePid) : null,
    node: process.memoryUsage().rss,
  } satisfies Memory;
}

/** The health line the service logs: memory first, since that is what creeps. */
export function healthLine(
  memory: Memory,
  pages: { pages: number; workspaces: number },
  closedIdle: number,
  closedForMemory = 0,
) {
  const parts = [
    memory.used === null
      ? null
      : `memory ${mb(memory.used)}${memory.limit === null ? '' : ` of ${mb(memory.limit)}`}`,
    memory.chrome === null ? null : `Chrome ${mb(memory.chrome)}`,
    `service ${mb(memory.node)}`,
    `${pages.pages} ${pages.pages === 1 ? 'page' : 'pages'} open in ${pages.workspaces} ${
      pages.workspaces === 1 ? 'workspace' : 'workspaces'
    }`,
    `${closedIdle} idle ${closedIdle === 1 ? 'page' : 'pages'} closed`,
    closedForMemory
      ? `${closedForMemory} ${closedForMemory === 1 ? 'page' : 'pages'} closed to free memory`
      : null,
  ];
  return `health: ${parts.filter(Boolean).join(', ')}`;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

function read(path: string) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

function number(text: string | null) {
  const n = text === null ? NaN : Number(text);
  return Number.isFinite(n) ? n : null;
}

/** "max", or cgroup v1's near-2^63 "no limit", reads as no limit. */
function limitOf(text: string | null) {
  const n = number(text);
  return n === null || n >= 2 ** 60 ? null : n;
}

/** Resident memory of a process and everything under it, from /proc. */
function treeSize(proc: string, root: number) {
  let entries: string[];
  try {
    entries = readdirSync(proc).filter((name) => /^\d+$/.test(name));
  } catch {
    return null;
  }
  const children = new Map<number, number[]>();
  const size = new Map<number, number>();
  for (const name of entries) {
    const stat = read(join(proc, name, 'stat'));
    if (!stat) continue;
    // The command name is in brackets and may hold spaces; the fields after it are fixed.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const pid = Number(name);
    const parent = Number(fields[1]);
    const pages = Number(fields[21]);
    if (!Number.isFinite(parent) || !Number.isFinite(pages)) continue;
    size.set(pid, pages * PAGE);
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  if (!size.has(root)) return null;
  let total = 0;
  const todo = [root];
  const counted = new Set<number>();
  while (todo.length) {
    const pid = todo.pop()!;
    if (counted.has(pid)) continue;
    counted.add(pid);
    total += size.get(pid) ?? 0;
    todo.push(...(children.get(pid) ?? []));
  }
  return total;
}

/** Linux's page size on the machines this runs on (x86-64 and arm64 servers). */
const PAGE = 4096;

/** How full the container is, 0 to 1, when Linux says both what it uses and its limit. */
export function fullness(memory: Memory) {
  return memory.used !== null && memory.limit ? memory.used / memory.limit : null;
}
