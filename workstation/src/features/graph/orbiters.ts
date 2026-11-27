import type { Activity, Id, Job } from '../../../shared/types.ts';

/** An agent at work, circling the node it is working on. */
export type Orbiter = {
  agentId: Id;
  /** What it was asked, when this person may read it (their own conversation or a page job). */
  request: string | null;
  /** The page it is on, when this person can open it. */
  resourceId: Id | null;
};

/**
 * Which agents circle which graph node. Built only from what the snapshot already lets this person
 * see: `activity` hides pages and conversations they cannot open, and `jobs` holds only jobs from
 * conversations they are in, so the request text never leaks. An agent on a page orbits that page;
 * one with no page (a chat) orbits the space it is in, or the centre. One orb per agent per node.
 */
export function orbitersOf(
  activity: Activity[],
  jobs: Job[],
  has: (nodeId: Id) => boolean,
  rootId: Id,
  /** Only this space's agents; null in the everything view, where a space is its own node. */
  spaceId: Id | null,
): Map<Id, Orbiter[]> {
  const out = new Map<Id, Orbiter[]>();
  for (const a of activity) {
    if (a.status !== 'working' || (spaceId && a.spaceId !== spaceId)) continue;
    const at =
      a.resourceId && has(a.resourceId)
        ? a.resourceId
        : !spaceId && has(a.spaceId)
          ? a.spaceId
          : rootId;
    const here = out.get(at) ?? [];
    if (here.some((o) => o.agentId === a.agentId)) continue;
    const job = jobs.find(
      (j) =>
        j.agentId === a.agentId &&
        j.status === 'running' &&
        j.spaceId === a.spaceId &&
        (j.targetResourceId ?? null) === a.resourceId,
    );
    here.push({
      agentId: a.agentId,
      request: job?.request.trim() || null,
      resourceId: a.resourceId,
    });
    out.set(at, here);
  }
  return out;
}
