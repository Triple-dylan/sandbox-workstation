import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Simulation } from 'd3-force';
import {
  AlignLeft,
  Compass,
  FileText,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  ListChecks,
  Lock,
  Pin,
} from 'lucide-react';
import { useWorkspace } from '../../app/workspace.tsx';
import { Avatar, Character, agentState } from '../agents/Character.tsx';
import { NOTES_GROUP, graphOf, overviewOf, relationsOf, type GraphNode } from './tree.ts';
import {
  createCampaignOsSimulation,
  enforceHierarchyOrbits,
  type ForceSimLink,
  type ForceSimNode,
} from './force-sim.ts';
import {
  DEFAULT_GRAPH_PHYSICS,
  DRAG_ALPHA_TARGET,
  HUB_ORBIT_MAX,
  IDLE_DRIFT_RAD_PER_SEC,
  IDLE_SIMMER_ALPHA,
  STRUCTURAL_MEMBER_DISTANCE,
  getNodeDiameter,
  hubOrbitAspectY,
  hubOrbitRadius,
} from './physics-config.ts';

type SimNode = ForceSimNode & { data: GraphNode };
const ROOT_LEASH = 46;
/** Above this many nodes, page labels wait for hover or focus. */
const QUIET_LABELS = 28;

/** Constellation model from CampaignOS: centre pinned, folder hubs on a tilted ring, members orbiting their hub. */
function build(
  nodes: GraphNode[],
  previous: Map<string, { x: number; y: number }>,
  relations: { source: string; target: string }[] = [],
  /** Extra room between a hub and its members, for maps with few, long-named hubs. */
  room = 1,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, GraphNode[]>();
  for (const n of nodes)
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const hubs = nodes.filter((n) => n.depth === 1 && (n.kind === 'folder' || n.kind === 'group'));
  const sim: SimNode[] = [];
  const made = new Map<string, SimNode>();
  const add = (n: GraphNode, extra: Partial<ForceSimNode>, seed: { x: number; y: number }) => {
    const isCentre = n.kind === 'root';
    const isHub = hubs.includes(n);
    const degree = (children.get(n.id)?.length ?? 0) + (n.parentId ? 1 : 0);
    const known = previous.get(n.id);
    const node: SimNode = {
      id: n.id,
      data: n,
      radius: getNodeDiameter(degree, isHub, isCentre) / 2,
      isHub,
      isCandidate: false,
      isCampaignCenter: isCentre,
      degree,
      orbitRadius: 0,
      orbitAspectY: 1,
      x: known?.x ?? seed.x,
      y: known?.y ?? seed.y,
      ...extra,
    };
    sim.push(node);
    made.set(n.id, node);
    return node;
  };
  const root = nodes.find((n) => n.kind === 'root')!;
  add(root, {}, { x: 0, y: 0 });
  const top = nodes.filter((n) => n.depth === 1);
  top.forEach((n, i) => {
    const angle = (i / Math.max(1, top.length)) * Math.PI * 2 - Math.PI / 2;
    if (hubs.includes(n)) {
      const orbitRadius = hubOrbitRadius(n.id);
      const orbitAspectY = hubOrbitAspectY(n.id);
      add(
        n,
        { orbitRadius, orbitAspectY },
        { x: Math.cos(angle) * orbitRadius, y: Math.sin(angle) * orbitRadius * orbitAspectY },
      );
    } else {
      // Loose files at the top level orbit the centre on its upper side, clear of its label.
      const loose = top.filter((x) => !hubs.includes(x));
      const hierarchyAngle = -Math.PI / 2 + (loose.indexOf(n) - (loose.length - 1) / 2) * 0.7;
      add(
        n,
        {
          hierarchyParentId: root.id,
          hierarchyRadius: 170,
          hierarchyAngle,
          hierarchyStrength: 0.5,
        },
        { x: Math.cos(hierarchyAngle) * 170, y: Math.sin(hierarchyAngle) * 170 },
      );
    }
  });
  const place = (parent: GraphNode) => {
    const kids = children.get(parent.id) ?? [];
    const p = made.get(parent.id)!;
    const outward = Math.atan2(p.y ?? 0, p.x ?? 0);
    kids.forEach((kid, i) => {
      if (made.has(kid.id)) return place(kid);
      const spread = kids.length === 1 ? 0 : (i / (kids.length - 1) - 0.5) * Math.PI * 1.25;
      const hierarchyAngle = outward + spread;
      const hierarchyRadius =
        STRUCTURAL_MEMBER_DISTANCE * room +
        p.radius +
        Math.floor(i / 9) * 46 +
        (kids.length > 5 ? (i % 2) * 34 : 0);
      add(
        kid,
        { hierarchyParentId: parent.id, hierarchyRadius, hierarchyAngle, hierarchyStrength: 0.34 },
        {
          x: (p.x ?? 0) + Math.cos(hierarchyAngle) * hierarchyRadius,
          y: (p.y ?? 0) + Math.sin(hierarchyAngle) * hierarchyRadius,
        },
      );
      place(kid);
    });
  };
  place(root);
  const links: ForceSimLink[] = sim
    .filter((n) => n.data.parentId && byId.has(n.data.parentId))
    .map((n) => ({ source: n.data.parentId!, target: n.id, structural: true }));
  for (const r of relations)
    if (made.has(r.source) && made.has(r.target))
      links.push({ source: r.source, target: r.target, structural: false });
  return { sim, links };
}

export function Graph() {
  const { s, space, ui, setUi, openResource, user } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [, setFrame] = useState(0);
  const simulation = useRef<Simulation<ForceSimNode, ForceSimLink> | null>(null);
  const places = useRef(new Map<string, { x: number; y: number }>());
  const drift = useRef(0);
  const dragging = useRef(false);
  const suppressClick = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  const everything = ui.graphScope === 'everything' && s.spaces.length > 1;
  const structure = s.resources
    .filter((r) => everything || r.spaceId === space.id)
    .map((r) => `${r.id}:${r.parentId}:${r.kind}:${r.title}:${r.visibility}`)
    .join('|');
  const mentions = everything
    ? ''
    : s.resources
        .filter((r) => r.spaceId === space.id && r.kind !== 'image')
        .map((r) => r.body.length)
        .join(',');
  // Rebuild only when the tree's shape changes, not on every keystroke or presence update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tree = useMemo(
    () => (everything ? overviewOf(s) : graphOf(s, space)),
    [structure, space.id, space.name, everything],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const relations = useMemo(() => (everything ? [] : relationsOf(s, space)), [structure, mentions]);
  const rootId = tree.nodes[0].id;
  useEffect(() => {
    setFocus(null);
    places.current.clear();
  }, [space.id, everything]);
  const graph = useMemo(
    () => build(tree.nodes, places.current, relations, everything ? 1.5 : 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, relations],
  );

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sim = createCampaignOsSimulation(graph.sim, graph.links, DEFAULT_GRAPH_PHYSICS, drift);
    let last = performance.now();
    sim
      .alpha(0.9)
      // Gentle simmer forever: the ring drifts slowly instead of freezing into a static map.
      .alphaTarget(reduced ? 0 : IDLE_SIMMER_ALPHA)
      .on('tick', () => {
        const now = performance.now();
        if (!reduced && !dragging.current)
          drift.current += IDLE_DRIFT_RAD_PER_SEC * Math.min(0.1, (now - last) / 1000);
        last = now;
        enforceHierarchyOrbits(graph.sim);
        for (const n of graph.sim) places.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        setFrame((f) => (f + 1) % 1_000_000);
      })
      .restart();
    simulation.current = sim;
    return () => {
      sim.stop();
    };
  }, [graph]);

  // Fit the whole constellation in view. This frames the map; it is not a user zoom.
  const k = Math.min(
    1,
    (size.width / 2 - 70) / (HUB_ORBIT_MAX + 150),
    (size.height / 2 - 56) / (HUB_ORBIT_MAX * 0.8 + 150),
  );
  const scale = Math.max(0.32, k);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const sx = (n: ForceSimNode) => cx + (n.x ?? 0) * scale;
  const sy = (n: ForceSimNode) => cy + (n.y ?? 0) * scale;

  const byId = new Map(graph.sim.map((n) => [n.id, n]));
  const within = (id: string, ancestor: string) => {
    for (let n = byId.get(id); n; n = n.data.parentId ? byId.get(n.data.parentId) : undefined)
      if (n.id === ancestor) return true;
    return false;
  };
  const level = (n: SimNode): 'focus' | 'near' | 'far' => {
    const target = hover ?? focus;
    if (!target) return 'near';
    if (n.id === target) return 'focus';
    if (within(n.id, target) || within(target, n.id)) return 'near';
    return 'far';
  };

  const activate = (n: SimNode) => {
    if (n.data.kind === 'root') return setFocus(null);
    // In the everything view a space is a doorway: step into it.
    if (everything && n.data.spaceId && n.data.kind !== 'doc')
      return setUi({ spaceId: n.data.spaceId, graphScope: 'space', readerId: null });
    if (everything && n.data.spaceId && n.data.resourceId) {
      setUi({ spaceId: n.data.spaceId, graphScope: 'space' });
      return openResource(n.data.resourceId);
    }
    if (n.data.kind === 'folder' || n.data.kind === 'group')
      return setFocus((f) => (f === n.id ? null : n.id));
    if (!n.data.resourceId) return;
    // Documents open beside the graph; things that live on the board take you to them there.
    if (n.data.kind === 'doc') openResource(n.data.resourceId);
    else setUi({ surface: 'canvas', selectedId: n.data.resourceId, readerId: null });
  };

  const beginDrag = (e: React.PointerEvent, n: SimNode) => {
    if (e.button !== 0) return;
    const rect = host.current!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const origin = { x: n.x ?? 0, y: n.y ?? 0 };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 4) return;
      moved = true;
      dragging.current = true;
      if (n.isCampaignCenter) {
        // The centre can be nudged, never carried off; it springs back on release.
        const pull = Math.hypot(dx, dy);
        const leash = ROOT_LEASH / scale;
        const f = pull > leash ? leash / pull : 1;
        n.fx = origin.x + dx * f;
        n.fy = origin.y + dy * f;
      } else {
        n.fx = (ev.clientX - rect.left - cx) / scale;
        n.fy = (ev.clientY - rect.top - cy) / scale;
      }
      simulation.current?.alphaTarget(DRAG_ALPHA_TARGET).restart();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('blur', end);
      n.fx = null;
      n.fy = null;
      dragging.current = false;
      simulation.current?.alphaTarget(IDLE_SIMMER_ALPHA).alpha(0.5).restart();
      if (moved) suppressClick.current = n.id;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
  };

  const anchorFor = (resourceId: string | null) =>
    (resourceId && byId.get(resourceId)) || byId.get(everything ? '' : rootId);
  const working = s.jobs.filter(
    (j) =>
      (everything || j.spaceId === space.id) &&
      (j.status === 'running' || j.status === 'queued' || j.status === 'awaiting_approval'),
  );
  const visitors = s.presence.filter(
    (p) => p.online && p.spaceId === space.id && p.resourceId && p.userId !== s.me.id,
  );
  const quiet = graph.sim.length > QUIET_LABELS;
  const glyph = (n: SimNode) => {
    const d = n.data;
    if (d.kind === 'root') return null;
    if (d.kind === 'folder') return <Folder size={18} />;
    if (d.kind === 'group') return <LayoutGrid size={17} />;
    if (d.role === 'orientation') return <Compass size={13} />;
    if (d.kind === 'note') return <AlignLeft size={10} />;
    if (d.kind === 'pin') return <Pin size={10} />;
    if (d.kind === 'image') return <ImageIcon size={10} />;
    if (d.kind === 'plan') return <ListChecks size={11} />;
    return <FileText size={12} />;
  };
  const privateCount = tree.nodes.filter((n) => n.private).length;

  return (
    <div
      className="graph"
      ref={host}
      onClick={(e) => {
        if (e.target === host.current || (e.target as Element).tagName === 'svg') {
          setFocus(null);
          setUi({ readerId: null });
        }
      }}
    >
      <svg width={size.width} height={size.height} aria-hidden="true">
        {graph.links.map((l) => {
          const a = l.source as SimNode;
          const b = l.target as SimNode;
          if (typeof a === 'string' || typeof b === 'string') return null;
          const far = level(a) === 'far' || level(b) === 'far';
          return (
            <line
              key={`${a.id}-${b.id}-${l.structural ? 's' : 'r'}`}
              x1={sx(a)}
              y1={sy(a)}
              x2={sx(b)}
              y2={sy(b)}
              className={`graph-link ${far ? 'far' : ''} ${b.data.private ? 'is-private' : ''} ${l.structural ? '' : 'relation'}`}
            />
          );
        })}
      </svg>
      {graph.sim.map((n) => {
        const d = n.data;
        const lv = level(n);
        const hub = n.isHub || n.isCampaignCenter;
        // Things on the board are many and wordy; they name themselves when you look at them.
        const boardItem = d.parentId === NOTES_GROUP;
        const labelled =
          hub || lv === 'focus' || (focus !== null && lv === 'near') || (!quiet && !boardItem);
        const diameter = Math.max(12, n.radius * 2 * Math.max(0.72, scale));
        return (
          <button
            key={n.id}
            className={`graph-node kind-${d.kind} level-${lv} ${hub ? 'is-hub' : ''} ${d.private ? 'is-private' : ''} ${ui.readerId && ui.readerId === d.resourceId ? 'active' : ''}`}
            style={{ left: sx(n), top: sy(n), '--d': `${diameter}px` } as React.CSSProperties}
            aria-pressed={n.isHub ? focus === n.id : undefined}
            aria-label={`${d.label}${d.private ? ', only you' : ''}${n.isHub ? `, ${d.childCount} inside` : ''}`}
            onPointerDown={(e) => beginDrag(e, n)}
            onPointerEnter={() => !dragging.current && setHover(n.id)}
            onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
            onClick={() => {
              if (suppressClick.current === n.id) {
                suppressClick.current = null;
                return;
              }
              activate(n);
            }}
          >
            <span className="graph-disc">{glyph(n)}</span>
            {labelled && (
              <span className="graph-label">
                {d.private && <Lock size={10} aria-hidden="true" />}
                {d.label}
                {n.isHub && d.childCount > 0 && <small>{d.childCount}</small>}
              </span>
            )}
          </button>
        );
      })}
      {working.map((j, i) => {
        const n = anchorFor(j.targetResourceId) ?? byId.get(j.spaceId);
        const agent = user(j.agentId);
        if (!n || !agent) return null;
        return (
          <span
            key={j.id}
            className="graph-actor"
            style={{ left: sx(n) + n.radius * 0.7 + i * 10, top: sy(n) - n.radius - 26 }}
          >
            <Character agent={agent} size={32} state={agentState(agent.id, s.jobs)} />
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
            style={{ left: sx(n) - n.radius - 22 - i * 12, top: sy(n) - n.radius - 16 }}
            title={`${person.name} is here`}
          >
            <Avatar user={person} size={20} />
          </span>
        );
      })}
      {s.spaces.length > 1 && (
        <div className="graph-scope" role="group" aria-label="What the graph shows">
          <button aria-pressed={!everything} onClick={() => setUi({ graphScope: 'space' })}>
            {space.name}
          </button>
          <button aria-pressed={everything} onClick={() => setUi({ graphScope: 'everything' })}>
            Everything
          </button>
        </div>
      )}
      <p className="graph-legend">
        <span>
          <i className="legend-shared" />{' '}
          {everything ? 'Shared' : space.kind === 'project' ? `Shared with ${space.name}` : 'Yours'}
        </span>
        {(everything || space.kind === 'project') && (
          <span>
            <i className="legend-private" /> Only you
            {!everything && privateCount ? ` · ${privateCount}` : ''}
          </span>
        )}
        {relations.length > 0 && (
          <span>
            <i className="legend-relation" /> Mentions
          </span>
        )}
      </p>
    </div>
  );
}
