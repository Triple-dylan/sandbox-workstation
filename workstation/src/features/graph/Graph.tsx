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
import { FileText, Folder, StickyNote } from 'lucide-react';
import { useWorkspace } from '../../app/workspace.tsx';
import { Avatar, Character, agentState } from '../agents/Character.tsx';
import { graphOf, type GraphLink, type GraphNode } from './tree.ts';

const rememberedPositions = new Map<string, Map<string, GraphNode>>();

export function Graph() {
  const { s, space, ui, setUi, openResource, openAgentWork, user } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) => {
      if (e.contentRect.width && e.contentRect.height)
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const structure = s.resources
    .filter((r) => r.spaceId === space.id)
    .map((r) => `${r.id}:${r.parentId}:${r.kind}:${r.title}`)
    .join('|');
  const tree = useMemo(() => graphOf(s, space), [structure, space.id, space.name]);
  const subject = tree.nodes.find((node) => node.id === ui.graphFocus[space.id]) ?? tree.nodes[0];
  const parent = tree.links.find((link) => link.target === subject.id)?.source;
  const [graph, setGraph] = useState({ nodes: [] as GraphNode[], links: [] as GraphLink[] });
  const memoryKey = `${s.me.id}:${space.id}`;
  const positions = useRef(rememberedPositions.get(memoryKey) ?? new Map<string, GraphNode>());
  useLayoutEffect(
    () => () => {
      rememberedPositions.set(memoryKey, new Map(positions.current));
    },
    [memoryKey],
  );
  const [toolBounds, setToolBounds] = useState<
    { left: number; top: number; right: number; bottom: number }[]
  >([]);
  useLayoutEffect(() => {
    const graph = host.current;
    const tools = graph?.parentElement?.querySelector('.utilities');
    if (!graph || !tools) return;
    const measure = () => {
      const origin = graph.getBoundingClientRect();
      const next = [...tools.children].map((card) => {
        const b = card.getBoundingClientRect();
        return {
          left: b.left - origin.left,
          top: b.top - origin.top,
          right: b.right - origin.left,
          bottom: b.bottom - origin.top,
        };
      });
      setToolBounds((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(graph);
    observer.observe(tools);
    for (const card of tools.children) observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, []);
  const simulation = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const drag = useRef<{ node: GraphNode; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef<string | null>(null);
  const readerOpen = !!ui.readerId;
  const toolWidth = size.width <= 650 ? 196 : 240;
  const readingWidth = Math.min(580, Math.max(200, size.width - (size.width <= 650 ? 248 : 310)));
  const readingHeight = Math.min(440, size.height - 270);
  const cx = readerOpen
    ? 24 + readingWidth / 2
    : Math.min(size.width / 2, size.width - toolWidth - 94);
  const cy = size.height / 2;
  useLayoutEffect(() => {
    const branch = subject.kind === 'doc' || subject.kind === 'note' ? parent : subject.id;
    const ancestors: string[] = [];
    let ancestor = parent;
    while (ancestor && !ancestors.includes(ancestor)) {
      ancestors.push(ancestor);
      ancestor = tree.links.find((l) => l.target === ancestor)?.source;
    }
    const navigationAncestors = ancestors.filter((id) => id === parent || id === space.id);
    const ids = new Set([
      subject.id,
      ...navigationAncestors,
      ...tree.links.filter((l) => l.source === branch).map((l) => l.target),
    ]);
    const nodes = tree.nodes
      .filter((n) => ids.has(n.id))
      .map((n, i) => ({
        ...n,
        x: positions.current.get(n.id)?.x ?? cx + Math.cos(i * 2.399) * Math.min(cx * 0.6, 190),
        y: positions.current.get(n.id)?.y ?? cy + Math.sin(i * 2.399) * Math.min(cy * 0.6, 150),
      }));
    const links = tree.links.filter((l) => ids.has(l.source) && ids.has(l.target));
    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, SimulationLinkDatum<GraphNode>>(links.map((l) => ({ ...l })))
          .id((n) => n.id)
          .distance(Math.min(size.width * 0.3, size.height * 0.31, 200))
          .strength(0.22),
      )
      .force('charge', forceManyBody().strength(-280))
      .force('collision', forceCollide<GraphNode>().radius(52))
      .force(
        'x',
        forceX<GraphNode>(cx).strength((n) => (n.id === subject.id ? 0.9 : 0.035)),
      )
      .force(
        'y',
        forceY<GraphNode>(cy).strength((n) => (n.id === subject.id ? 0.9 : 0.035)),
      );
    const publish = () => {
      for (const n of nodes) {
        if (n.id === subject.id && drag.current?.node.id !== n.id) {
          n.x += (cx - n.x) * 0.35;
          n.y += (cy - n.y) * 0.35;
          if (Math.hypot(cx - n.x, cy - n.y) < 0.2) {
            n.x = cx;
            n.y = cy;
          }
        }
        const margin = Math.min(cx, 82);
        n.x = Math.max(margin, Math.min(size.width - margin, n.x));
        n.y = Math.max(Math.min(cy, 64), Math.min(size.height - Math.min(cy, 48), n.y));
        if (readerOpen && n.id !== subject.id) {
          const left = cx - readingWidth / 2 - 65,
            right = cx + readingWidth / 2 + 65;
          const top = cy - readingHeight / 2 - 30,
            bottom = cy + readingHeight / 2 + 30;
          if (n.x > left && n.x < right && n.y > top && n.y < bottom) {
            if (n.y < cy) n.y = top;
            else n.y = bottom;
          }
          if (navigationAncestors.includes(n.id)) {
            n.x = 90 + navigationAncestors.indexOf(n.id) * 145;
            n.y = 94;
          }
        }
        for (const box of toolBounds) {
          if (
            n.x + 80 > box.left &&
            n.x - 80 < box.right &&
            n.y + 22 > box.top &&
            n.y - 22 < box.bottom
          ) {
            const left = box.left - 88,
              below = box.bottom + 30;
            if (below < size.height - 120 && Math.abs(below - n.y) < Math.abs(left - n.x))
              n.y = below;
            else n.x = Math.max(82, left);
            n.vx = 0;
            n.vy = 0;
          }
        }
        positions.current.set(n.id, n);
      }
      setGraph({ nodes: nodes.map((n) => ({ ...n })), links });
    };
    simulation.current = sim;
    sim.on('tick', publish);
    publish();
    return () => {
      sim.stop();
      simulation.current = null;
      drag.current = null;
    };
  }, [
    tree,
    subject.id,
    subject.kind,
    parent,
    cx,
    cy,
    size,
    readerOpen,
    readingWidth,
    readingHeight,
    toolBounds,
  ]);
  const focus = (id: string) =>
    setUi((old) => ({
      graphFocus: { ...old.graphFocus, [space.id]: id },
    }));
  const endDrag = (cancelled = false) => {
    const active = drag.current;
    if (!active) return;
    active.node.fx = null;
    active.node.fy = null;
    dragged.current = !cancelled && active.moved ? active.node.id : null;
    drag.current = null;
    simulation.current?.alphaTarget(0).alpha(0.65).restart();
  };
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
    <div
      className="graph"
      ref={host}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (ui.readerId) setUi({ readerId: null });
          else if (parent) focus(parent);
        }
      }}
    >
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
          style={{
            left: Math.round(n.x ?? 0),
            top: Math.round(n.y ?? 0),
            visibility: readerOpen && n.id === subject.id ? 'hidden' : undefined,
          }}
          title={n.label}
          aria-pressed={subject.id === n.id}
          onPointerDown={(e) => {
            dragged.current = null;
            const node = positions.current.get(n.id);
            if (!node || e.button !== 0) return;
            drag.current = { node, x: e.clientX, y: e.clientY, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const active = drag.current;
            if (!active || active.node.id !== n.id || !host.current) return;
            if (!active.moved && Math.hypot(e.clientX - active.x, e.clientY - active.y) < 5) return;
            active.moved = true;
            const rect = host.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const scale = Math.min(1, 24 / Math.hypot(x - cx, y - cy));
            active.node.fx = n.id === subject.id ? cx + (x - cx) * scale : x;
            active.node.fy = n.id === subject.id ? cy + (y - cy) * scale : y;
            simulation.current?.alphaTarget(0.15).restart();
          }}
          onPointerUp={() => endDrag()}
          onPointerCancel={() => endDrag(true)}
          onLostPointerCapture={() => endDrag(true)}
          onClick={(e) => {
            if (e.detail && dragged.current === n.id) return;
            focus(n.id);
            if (n.resourceId) openResource(n.resourceId);
            else setUi({ readerId: null });
          }}
        >
          {n.kind === 'folder' || n.kind === 'group' ? (
            <Folder size={15} />
          ) : n.kind === 'doc' ? (
            <FileText size={15} />
          ) : n.kind === 'note' ? (
            <StickyNote size={15} />
          ) : (
            <i aria-hidden="true" />
          )}
          <span>{n.label}</span>
        </button>
      ))}
      {working.map((j, i) => {
        const n = at.get(j.targetResourceId!);
        const agent = user(j.agentId);
        if (!n || !agent) return null;
        return (
          <button
            key={j.id}
            className="graph-actor graph-agent"
            aria-label={`Open ${agent.name}`}
            onClick={() => void openAgentWork(agent.id)}
            style={{ left: (n.x ?? 0) + 18 + i * 6, top: (n.y ?? 0) - 34 }}
          >
            <Character agent={agent} size={28} state={agentState(agent.id, s.jobs)} />
          </button>
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
