import type { SimulationNodeDatum } from 'd3-force';
import { isPage } from '../../../shared/types.ts';
import type { Resource, Snapshot, Space } from '../../../shared/types.ts';
import type { GraphFilter } from '../../app/saved.ts';

export type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: 'root' | 'group' | Resource['kind'];
  resourceId?: string;
  parentId: string | null;
  depth: number;
  /** Only the viewer (and anyone they added) can see this. */
  private?: boolean;
  role?: Resource['role'];
  /** Direct children. */
  childCount: number;
  /** In the everything view: the space this node belongs to, entered when it is clicked. */
  spaceId?: string;
};
export type GraphLink = { source: string; target: string };

export const noFilter: GraphFilter = { kind: 'all', mine: false, recent: false };
export function passes(r: Resource, filter: GraphFilter, meId: string, since: string) {
  if (!!r.archived !== !!filter.archive) return false;
  if (filter.kind !== 'all' && r.kind !== filter.kind) return false;
  if (filter.mine && r.ownerId !== meId && r.updatedBy !== meId) return false;
  if (filter.recent && r.updatedAt < since) return false;
  return true;
}

/** Space → folders → pages. What sits on a canvas belongs to that canvas and is not drawn here. */
export function graphOf(
  s: Snapshot,
  space: Space,
  filter: GraphFilter = noFilter,
  since = '',
): { nodes: GraphNode[]; links: GraphLink[] } {
  const items = s.resources.filter((r) => r.spaceId === space.id);
  const pages = items.filter((r) => isPage(r.kind) && passes(r, filter, s.me.id, since));
  const filtering = filter.kind !== 'all' || filter.mine || filter.recent || !!filter.archive;
  const used = new Set(pages.map((p) => p.parentId));
  const folders = items.filter(
    (r) => r.kind === 'folder' && (used.has(r.id) || (!filtering && !r.role)),
  );
  const root: GraphNode = {
    id: space.id,
    label: space.kind === 'personal' ? 'Your space' : space.name,
    kind: 'root',
    parentId: null,
    depth: 0,
    childCount: 0,
  };
  const nodes: GraphNode[] = [root];
  const folderIds = new Set(folders.map((f) => f.id));
  for (const r of [...folders, ...pages])
    nodes.push({
      id: r.id,
      label: (r.title || 'Untitled').slice(0, 60),
      kind: r.kind,
      resourceId: r.id,
      parentId: r.parentId && folderIds.has(r.parentId) ? r.parentId : space.id,
      depth: 1,
      private: r.visibility === 'private' && space.kind === 'project',
      role: r.role,
      childCount: 0,
    });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (n: GraphNode, seen = 0): number =>
    n.parentId && seen < 32 ? depthOf(byId.get(n.parentId)!, seen + 1) + 1 : 0;
  for (const n of nodes) {
    n.depth = depthOf(n);
    if (n.parentId) byId.get(n.parentId)!.childCount++;
  }
  const links = nodes.filter((n) => n.parentId).map((n) => ({ source: n.parentId!, target: n.id }));
  return { nodes, links };
}

/**
 * How pages relate beyond the folder they sit in: one names another, or a canvas shows another as
 * a card. Drawn as quiet lines.
 */
export function relationsOf(s: Snapshot, space: Space): GraphLink[] {
  const items = s.resources.filter((r) => r.spaceId === space.id);
  const pages = items.filter((r) => isPage(r.kind) && !r.role && !r.archived);
  const named = pages.filter((r) => r.title.length >= 5);
  const links: GraphLink[] = [];
  for (const from of pages) {
    if (from.kind === 'canvas') continue;
    const text = from.body.toLowerCase();
    for (const to of named)
      if (to.id !== from.id && text.includes(to.title.toLowerCase()))
        links.push({ source: from.id, target: to.id });
  }
  for (const card of items)
    if (card.kind === 'embed' && card.parentId) {
      try {
        const target = JSON.parse(card.body).resourceId as string;
        if (pages.some((p) => p.id === target)) links.push({ source: card.parentId, target });
      } catch {
        // A card with nothing to show draws no line.
      }
    }
  return links.slice(0, 80);
}

/** Every space you can see as one map: spaces as hubs, their folders and loose pages around them. */
export function overviewOf(s: Snapshot): { nodes: GraphNode[]; links: GraphLink[] } {
  const root: GraphNode = {
    id: 'everything',
    label: 'Everything you can see',
    kind: 'root',
    parentId: null,
    depth: 0,
    childCount: s.spaces.length,
  };
  const nodes: GraphNode[] = [root];
  for (const space of s.spaces) {
    const items = s.resources.filter((r) => r.spaceId === space.id);
    const tops = items.filter(
      (r) =>
        !r.parentId &&
        !r.archived &&
        (r.kind === 'folder' || isPage(r.kind)) &&
        r.role !== 'orientation',
    );
    nodes.push({
      id: space.id,
      label: space.kind === 'personal' ? 'Your space' : space.name,
      kind: 'folder',
      parentId: root.id,
      depth: 1,
      private: space.kind === 'personal',
      childCount: items.filter((r) => isPage(r.kind)).length,
      spaceId: space.id,
    });
    for (const r of tops.slice(0, 9))
      nodes.push({
        id: r.id,
        label: r.title,
        kind: r.kind,
        resourceId: isPage(r.kind) ? r.id : undefined,
        parentId: space.id,
        depth: 2,
        private: space.kind === 'personal' || r.visibility === 'private',
        childCount: items.filter((x) => x.parentId === r.id).length,
        spaceId: space.id,
      });
  }
  const links = nodes.filter((n) => n.parentId).map((n) => ({ source: n.parentId!, target: n.id }));
  return { nodes, links };
}
