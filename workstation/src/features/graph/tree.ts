import type { SimulationNodeDatum } from 'd3-force';
import type { Resource, Snapshot, Space } from '../../../shared/types.ts';

export type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: 'root' | 'group' | Resource['kind'];
  resourceId?: string;
  parentId: string | null;
  depth: number;
  /** Only the viewer can see this item. */
  private?: boolean;
  role?: Resource['role'];
  /** Direct children, including ones hidden while this node is folded. */
  childCount: number;
  /** In the everything view: the space this node belongs to, entered when it is clicked. */
  spaceId?: string;
};
export type GraphLink = { source: string; target: string };

export const NOTES_GROUP = 'canvas-notes';

/** Space → folders → docs, with canvas notes gathered under one group. */
export function graphOf(s: Snapshot, space: Space): { nodes: GraphNode[]; links: GraphLink[] } {
  const items = s.resources.filter((r) => r.spaceId === space.id);
  const root: GraphNode = {
    id: space.id,
    label: space.name,
    kind: 'root',
    parentId: null,
    depth: 0,
    childCount: 0,
  };
  const nodes: GraphNode[] = [root];
  const ids = new Set(items.map((r) => r.id));
  const onBoard = (r: Resource) =>
    r.kind === 'note' || r.kind === 'pin' || r.kind === 'image' || r.kind === 'plan';
  if (items.some(onBoard))
    nodes.push({
      id: NOTES_GROUP,
      label: 'On the board',
      kind: 'group',
      parentId: space.id,
      depth: 1,
      childCount: 0,
    });
  for (const r of items)
    nodes.push({
      id: r.id,
      label: (r.title || 'Untitled').slice(0, r.kind === 'note' ? 26 : 60),
      kind: r.kind,
      resourceId: r.id,
      parentId: onBoard(r)
        ? NOTES_GROUP
        : r.parentId && ids.has(r.parentId)
          ? r.parentId
          : space.id,
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

/** Items that mention another item by name. These are drawn as quiet relations, not containment. */
export function relationsOf(s: Snapshot, space: Space): GraphLink[] {
  const items = s.resources.filter((r) => r.spaceId === space.id);
  const named = items.filter(
    (r) => (r.kind === 'doc' || r.kind === 'folder') && r.title.length >= 5,
  );
  const links: GraphLink[] = [];
  for (const from of items) {
    if (from.role || (from.kind !== 'doc' && from.kind !== 'note' && from.kind !== 'pin')) continue;
    const text = (from.kind === 'pin' ? from.title : from.body).toLowerCase();
    for (const to of named)
      if (to.id !== from.id && to.id !== from.parentId && text.includes(to.title.toLowerCase()))
        links.push({ source: from.id, target: to.id });
  }
  return links.slice(0, 60);
}

/** Every space you can see as one map: spaces as hubs, their folders and loose documents around them. */
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
      (r) => !r.parentId && (r.kind === 'folder' || r.kind === 'doc') && r.role !== 'orientation',
    );
    nodes.push({
      id: space.id,
      label: space.name,
      kind: 'folder',
      parentId: root.id,
      depth: 1,
      private: space.kind === 'personal',
      childCount: items.filter((r) => r.kind !== 'folder').length,
      spaceId: space.id,
    });
    for (const r of tops.slice(0, 9))
      nodes.push({
        id: r.id,
        label: r.title,
        kind: r.kind,
        resourceId: r.kind === 'doc' ? r.id : undefined,
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
