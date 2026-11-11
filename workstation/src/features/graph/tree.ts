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
