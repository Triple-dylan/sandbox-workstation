import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
} from 'd3-force';
import { AlignLeft, Compass, FileText, Folder, FolderOpen, LayoutGrid, Lock } from 'lucide-react';
import { useWorkspace } from '../../app/workspace.tsx';
import { Avatar, Character, agentState } from '../agents/Character.tsx';
import { graphOf, visibleGraph, type GraphNode } from './tree.ts';

const ROOT_LEASH = 36;
const PAD = 56;

/** Folds the board's notes away once there are enough of them to crowd the map. */
const AUTO_FOLD = 8;

export function Graph() {
  const { s, space, ui, openResource, user } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [folded, setFolded] = useState<Set<string> | null>(null);
  const [, setFrame] = useState(0);
  const sim = useRef<Simulation<GraphNode, undefined> | null>(null);
  const places = useRef(new Map<string, { x: number; y: number }>());
  const sizeRef = useRef(size);
  sizeRef.current = size;

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
    .map((r) => `${r.id}:${r.parentId}:${r.kind}:${r.title}:${r.visibility}`)
    .join('|');
  // Rebuild only when the tree's shape changes, not on every edit or presence update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const full = useMemo(() => graphOf(s, space), [structure, space.id, space.name]);
  useEffect(() => {
    setFolded(null);
    places.current.clear();
  }, [space.id]);
  const effectiveFolded = useMemo(
    () =>
      folded ??
      new Set(
        full.nodes.filter((n) => n.kind === 'group' && n.childCount > AUTO_FOLD).map((n) => n.id),
      ),
    [folded, full],
  );
  const graph = useMemo(() => visibleGraph(full, effectiveFolded), [full, effectiveFolded]);

  // One live simulation. Positions carry over when the tree changes, so nothing teleports.
  useEffect(() => {
    const { width, height } = sizeRef.current;
    const cx = width / 2;
    const cy = height / 2;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    graph.nodes.forEach((n, i) => {
      const known = places.current.get(n.id);
      const parent = n.parentId ? (places.current.get(n.parentId) ?? { x: cx, y: cy }) : null;
      const angle = i * 2.399963;
      n.x = known?.x ?? (parent ? parent.x + Math.cos(angle) * 90 : cx);
      n.y = known?.y ?? (parent ? parent.y + Math.sin(angle) * 90 : cy);
    });
    const simulation = forceSimulation<GraphNode>(graph.nodes)
      .force(
        'link',
        forceLink<GraphNode, SimulationLinkDatum<GraphNode>>(
          graph.links.map((l) => ({ source: l.source, target: l.target })),
        )
          .id((n) => n.id)
          .distance((l) => ((l.target as GraphNode).depth > 1 ? 96 : 170))
          .strength(0.55),
      )
      .force('charge', forceManyBody<GraphNode>().strength(-420).distanceMax(520))
      .force('collide', forceCollide<GraphNode>(54).strength(0.9))
      .force('x', forceX<GraphNode>(() => sizeRef.current.width / 2).strength(0.035))
      .force('y', forceY<GraphNode>(() => sizeRef.current.height / 2).strength(0.05))
      // The subject is anchored: it can be nudged, and always springs back to the centre.
      .force('anchor', () => {
        const root = byId.get(space.id);
        if (!root || root.fx != null) return;
        root.vx = (root.vx ?? 0) + (sizeRef.current.width / 2 - (root.x ?? 0)) * 0.35;
        root.vy = (root.vy ?? 0) + (sizeRef.current.height / 2 - (root.y ?? 0)) * 0.35;
      })
      .velocityDecay(0.32)
      .on('tick', () => {
        const { width: w, height: h } = sizeRef.current;
        for (const n of graph.nodes) {
          n.x = Math.max(PAD, Math.min(w - PAD, n.x ?? 0));
          n.y = Math.max(PAD - 16, Math.min(h - PAD, n.y ?? 0));
          places.current.set(n.id, { x: n.x, y: n.y });
        }
        setFrame((f) => f + 1);
      });
    sim.current = simulation;
    return () => {
      simulation.stop();
    };
  }, [graph, space.id]);
  useEffect(() => {
    sim.current?.alpha(0.5).restart();
  }, [size.width, size.height]);

  const activate = (n: GraphNode) => {
    if (n.kind === 'folder' || n.kind === 'group') {
      const next = new Set(effectiveFolded);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      setFolded(next);
    } else if (n.resourceId) openResource(n.resourceId);
  };

  const beginDrag = (e: React.PointerEvent, n: GraphNode) => {
    if (e.button !== 0) return;
    const rect = host.current!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const origin = { x: n.x ?? 0, y: n.y ?? 0 };
    let dragged = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      dragged = true;
      if (n.kind === 'root') {
        const pull = Math.hypot(dx, dy);
        const k = pull > ROOT_LEASH ? ROOT_LEASH / pull : 1;
        n.fx = origin.x + dx * k;
        n.fy = origin.y + dy * k;
      } else {
        n.fx = ev.clientX - rect.left;
        n.fy = ev.clientY - rect.top;
      }
      sim.current?.alphaTarget(0.25).restart();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('blur', end);
      n.fx = null;
      n.fy = null;
      sim.current?.alphaTarget(0).alpha(0.4).restart();
      if (dragged) suppressClick.current = n.id;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
  };
  const suppressClick = useRef<string | null>(null);

  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  /** The node to draw an actor at: the resource itself, or its nearest visible ancestor. */
  const anchorFor = (resourceId: string | null) => {
    if (!resourceId) return at.get(space.id);
    const all = new Map(full.nodes.map((n) => [n.id, n]));
    for (let n = all.get(resourceId); n; n = n.parentId ? all.get(n.parentId) : undefined)
      if (at.has(n.id)) return at.get(n.id);
    return at.get(space.id);
  };
  const working = s.jobs.filter(
    (j) =>
      j.spaceId === space.id &&
      (j.status === 'running' || j.status === 'queued' || j.status === 'awaiting_approval'),
  );
  const visitors = s.presence.filter(
    (p) => p.online && p.spaceId === space.id && p.resourceId && p.userId !== s.me.id,
  );
  const glyph = (n: GraphNode) => {
    if (n.kind === 'root') return <i className="graph-core" aria-hidden="true" />;
    if (n.kind === 'folder')
      return effectiveFolded.has(n.id) ? <Folder size={20} /> : <FolderOpen size={20} />;
    if (n.kind === 'group') return <LayoutGrid size={18} />;
    if (n.role === 'orientation') return <Compass size={18} />;
    if (n.kind === 'note') return <AlignLeft size={14} />;
    return <FileText size={18} />;
  };

  return (
    <div className="graph" ref={host}>
      <svg width={size.width} height={size.height} aria-hidden="true">
        {graph.links.map((l) => {
          const a = at.get(l.source);
          const b = at.get(l.target);
          if (!a || !b) return null;
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
      {graph.nodes.map((n) => {
        const isFolded = effectiveFolded.has(n.id);
        const foldable = n.kind === 'folder' || n.kind === 'group';
        return (
          <button
            key={n.id}
            className={`graph-node kind-${n.kind} ${ui.readerId && ui.readerId === n.resourceId ? 'active' : ''} ${n.private ? 'is-private' : ''}`}
            style={{ left: n.x, top: n.y }}
            aria-expanded={foldable ? !isFolded : undefined}
            aria-label={`${n.label}${n.private ? ', only you' : ''}${foldable ? `, ${n.childCount} inside` : ''}`}
            onPointerDown={(e) => beginDrag(e, n)}
            onClick={() => {
              if (suppressClick.current === n.id) {
                suppressClick.current = null;
                return;
              }
              activate(n);
            }}
          >
            <span className="graph-glyph">{glyph(n)}</span>
            <span className="graph-label">
              {n.private && <Lock size={10} aria-hidden="true" />}
              {n.label}
            </span>
            {foldable && n.childCount > 0 && (
              <small>{isFolded ? `${n.childCount} folded` : n.childCount}</small>
            )}
          </button>
        );
      })}
      {working.map((j, i) => {
        const n = anchorFor(j.targetResourceId);
        const agent = user(j.agentId);
        if (!n || !agent) return null;
        return (
          <span
            key={j.id}
            className="graph-actor"
            style={{ left: (n.x ?? 0) + 14 + i * 8, top: (n.y ?? 0) - 40 }}
          >
            <Character agent={agent} size={26} state={agentState(agent.id, s.jobs)} />
          </span>
        );
      })}
      {visitors.map((p, i) => {
        const n = anchorFor(p.resourceId);
        const person = user(p.userId);
        if (!n || !person) return null;
        return (
          <span
            key={p.userId}
            className="graph-actor"
            style={{ left: (n.x ?? 0) - 34 - i * 12, top: (n.y ?? 0) - 34 }}
            title={`${person.name} is here`}
          >
            <Avatar user={person} size={20} />
          </span>
        );
      })}
    </div>
  );
}
