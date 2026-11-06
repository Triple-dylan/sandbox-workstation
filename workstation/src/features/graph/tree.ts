import type { SimulationNodeDatum } from 'd3-force';
import type { Resource, Snapshot, Space } from '../../../shared/types.ts';

export type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: 'root' | 'group' | Resource['kind'];
  resourceId?: string;
};
export type GraphLink = { source: string; target: string };

export const NOTES_GROUP = 'canvas-notes';

/** Space → folders → docs, with canvas notes gathered under one group. */
export function graphOf(s: Snapshot, space: Space): { nodes: GraphNode[]; links: GraphLink[] } {
  const items = s.resources.filter((r) => r.spaceId === space.id);
  const nodes: GraphNode[] = [{ id: space.id, label: space.name, kind: 'root' }];
  const links: GraphLink[] = [];
  const ids = new Set(items.map((r) => r.id));
  if (items.some((r) => r.kind === 'note')) {
    nodes.push({ id: NOTES_GROUP, label: 'Canvas notes', kind: 'group' });
    links.push({ source: space.id, target: NOTES_GROUP });
  }
  for (const r of items) {
    nodes.push({ id: r.id, label: r.title || 'Untitled', kind: r.kind, resourceId: r.id });
    const parent =
      r.kind === 'note' ? NOTES_GROUP : r.parentId && ids.has(r.parentId) ? r.parentId : space.id;
    links.push({ source: parent, target: r.id });
  }
  return { nodes, links };
}
