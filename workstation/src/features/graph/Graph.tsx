import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
} from 'd3-force';
import { useWorkspace } from '../../app/workspace.tsx';
import { Avatar, Character, agentState } from '../agents/Character.tsx';
import { graphOf, type GraphLink, type GraphNode } from './tree.ts';

function layout(nodes: GraphNode[], links: GraphLink[], width: number, height: number) {
  const depth = new Map<string, number>([[nodes[0].id, 0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const l of links)
      if (depth.has(l.source) && !depth.has(l.target)) {
        depth.set(l.target, depth.get(l.source)! + 1);
        changed = true;
      }
  }
  const sim = forceSimulation<GraphNode>(nodes)
    .force(
      'link',
      forceLink<GraphNode, SimulationLinkDatum<GraphNode>>(
        links.map((l) => ({ source: l.source, target: l.target })),
      )
        .id((n) => n.id)
        .distance(90)
        .strength(0.9),
    )
    .force('charge', forceManyBody().strength(-260))
    .force('collide', forceCollide(34))
    .force('x', forceX(width / 2).strength(0.04))
    .force(
      'y',
      forceY<GraphNode>(
        (n) => 70 + (depth.get(n.id) ?? 1) * Math.max(90, (height - 140) / 4),
      ).strength(0.5),
    )
    .stop();
  nodes[0].fx = width / 2;
  nodes[0].fy = 70;
  for (let i = 0; i < 300; i++) sim.tick();
  for (const n of nodes) {
    n.x = Math.max(40, Math.min(width - 40, n.x ?? 0));
    n.y = Math.max(40, Math.min(height - 40, n.y ?? 0));
  }
}

export function Graph() {
  const { s, space, ui, openResource, user } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const structure = s.resources
    .filter((r) => r.spaceId === space.id)
    .map((r) => `${r.id}:${r.parentId}:${r.kind}:${r.title}`)
    .join('|');
  const graph = useMemo(() => {
    const g = graphOf(s, space);
    layout(g.nodes, g.links, size.width, size.height);
    return g;
    // Re-layout only when the tree's shape or the surface size changes, not on every edit.
  }, [structure, space.id, size.width, size.height]);
  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  const working = s.jobs.filter(
    (j) =>
      j.spaceId === space.id &&
      j.targetResourceId &&
      (j.status === 'running' || j.status === 'queued' || j.status === 'awaiting_approval'),
  );
  const visitors = s.presence.filter(
    (p) => p.online && p.spaceId === space.id && p.resourceId && p.userId !== s.me.id,
  );
  return (
    <div className="graph" ref={host}>
      <svg
        width={size.width}
        height={size.height}
        role="img"
        aria-label={`${space.name} resource graph`}
      >
        {graph.links.map((l) => {
          const a = at.get(l.source)!;
          const b = at.get(l.target)!;
          return (
            <line
              key={`${l.source}-${l.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="graph-link"
            />
          );
        })}
      </svg>
      {graph.nodes.map((n) => (
        <button
          key={n.id}
          className={`graph-node kind-${n.kind} ${ui.readerId === n.resourceId ? 'active' : ''}`}
          style={{ left: n.x, top: n.y }}
          disabled={!n.resourceId}
          onClick={() => n.resourceId && openResource(n.resourceId)}
        >
          <i aria-hidden="true" />
          <span>{n.label.slice(0, 28)}</span>
        </button>
      ))}
      {working.map((j, i) => {
        const n = at.get(j.targetResourceId!);
        const agent = user(j.agentId);
        if (!n || !agent) return null;
        return (
          <span
            key={j.id}
            className="graph-actor"
            style={{ left: (n.x ?? 0) + 18 + i * 6, top: (n.y ?? 0) - 34 }}
          >
            <Character agent={agent} size={28} state={agentState(agent.id, s.jobs)} />
          </span>
        );
      })}
      {visitors.map((p, i) => {
        const n = at.get(p.resourceId!);
        const person = user(p.userId);
        if (!n || !person) return null;
        return (
          <span
            key={p.userId}
            className="graph-actor"
            style={{ left: (n.x ?? 0) - 30 - i * 10, top: (n.y ?? 0) - 30 }}
            title={`${person.name} is here`}
          >
            <Avatar user={person} size={18} />
          </span>
        );
      })}
    </div>
  );
}
