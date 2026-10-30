import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { ArrowLeft, ChevronRight, FileText, FolderOpen, Network } from 'lucide-react';
import type { Resource } from './model';
type Node = SimulationNodeDatum & {
  id: string;
  title: string;
  kind: 'project' | 'folder' | 'document';
};
type Edge = SimulationLinkDatum<Node>;
export function Graph({
  resources,
  subject,
  setSubject,
  onResource,
  onFolder,
  expanded,
  setExpanded,
  exclusion,
}: {
  resources: Resource[];
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  subject: string;
  setSubject: (id: string) => void;
  onResource: (id: string) => boolean;
  onFolder: (id: string) => boolean;
  exclusion?: { x: number; y: number; width: number; height: number } | null;
}) {
  const graphIdentity = resources.map((r) => `${r.id}:${r.title}:${r.folder}`).join('|');
  const all = useMemo<Node[]>(
    () => [
      { id: 'root', title: 'Workstation', kind: 'project' },
      { id: 'direction', title: 'Direction', kind: 'folder' },
      { id: 'research-folder', title: 'Research', kind: 'folder' },
      ...(resources.some((r) => r.folder === 'private')
        ? [{ id: 'private-folder', title: 'Private documents', kind: 'folder' as const }]
        : []),
      ...resources.map((r) => ({ id: r.id, title: r.title, kind: 'document' as const })),
    ],
    [graphIdentity],
  );
  const parent = useCallback(
    (id: string) =>
      id === 'root'
        ? ''
        : ['direction', 'research-folder', 'private-folder'].includes(id)
          ? 'root'
          : resources.find((r) => r.id === id)?.folder === 'private'
            ? 'private-folder'
            : resources.find((r) => r.id === id)?.folder === 'research'
              ? 'research-folder'
              : 'direction',
    [graphIdentity],
  );
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 500, height: 500 });
  const [positions, setPositions] = useState<Node[]>([]),
    [edges, setEdges] = useState<Edge[]>([]);

  const runtime = useRef<{
    nodes: Node[];
    simulation: ReturnType<typeof forceSimulation<Node>>;
  } | null>(null);
  const rememberedPositions = useRef<Map<string, Node>>(new Map());
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null),
    suppress = useRef(false);
  const current = all.find((n) => n.id === subject) || all[0];
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const { width, height } = size,
      cx = width / 2,
      cy = height / 2;
    let visible: Node[];
    if (subject === 'root')
      visible = all.filter(
        (n) => n.id === 'root' || n.kind === 'folder' || (expanded && parent(n.id) === 'direction'),
      );
    else if (current.kind === 'folder')
      visible = all.filter(
        (n) => n.id === subject || n.id === parent(subject) || parent(n.id) === subject,
      );
    else
      visible = all.filter(
        (n) =>
          n.id === subject ||
          n.id === parent(subject) ||
          (n.kind === 'document' && parent(n.id) === parent(subject)),
      );
    const priorPositions = rememberedPositions.current;
    const nodes = visible.map((n, i) => ({
      ...n,
      x:
        priorPositions.get(n.id)?.x ??
        (n.id === subject ? cx : cx + Math.cos(i * 2.399) * Math.min(width * 0.3, 190)),
      y:
        priorPositions.get(n.id)?.y ??
        (n.id === subject ? cy : cy + Math.sin(i * 2.399) * Math.min(height * 0.28, 150)),
    }));
    const ids = new Set(nodes.map((n) => n.id));
    const links: Edge[] = nodes
      .filter((n) => n.id !== 'root' && ids.has(parent(n.id)))
      .map((n) => ({ source: parent(n.id), target: n.id }));
    const sim = forceSimulation<Node>(nodes)
      .force(
        'link',
        forceLink<Node, Edge>(links)
          .id((n) => n.id)
          .distance(Math.min(width * 0.3, height * 0.31, 200))
          .strength(0.22),
      )
      .force('charge', forceManyBody().strength(-280))
      .force(
        'collision',
        forceCollide<Node>().radius((n) => (n.kind === 'project' ? 54 : 48)),
      )
      .force(
        'x',
        forceX<Node>(cx).strength((n) => (n.id === subject ? 0.9 : 0.035)),
      )
      .force(
        'y',
        forceY<Node>(cy).strength((n) => (n.id === subject ? 0.9 : 0.035)),
      );
    sim.on('tick', () => {
      for (const n of nodes) {
        if (n.id === subject && drag.current?.id !== subject) {
          n.x! += (cx - n.x!) * 0.35;
          n.y! += (cy - n.y!) * 0.35;
          if (Math.abs(cx - n.x!) < 0.2) n.x = cx;
          if (Math.abs(cy - n.y!) < 0.2) n.y = cy;
        }
        n.x = Math.max(58, Math.min(width - 58, n.x!));
        n.y = Math.max(46, Math.min(height - 47, n.y!));
        if (
          exclusion &&
          n.id !== subject &&
          n.x! + 90 > exclusion.x &&
          n.x! - 90 < exclusion.x + exclusion.width &&
          n.y! + 50 > exclusion.y &&
          n.y! - 35 < exclusion.y + exclusion.height
        ) {
          const left = exclusion.x - 92,
            below = exclusion.y + exclusion.height + 52;
          if (below < height - 50 && Math.abs(below - n.y!) < Math.abs(left - n.x!)) n.y = below;
          else n.x = Math.max(90, left);
          n.vx = 0;
          n.vy = 0;
        }
      }
      setPositions(nodes.map((n) => ({ ...n })));
      setEdges(links.map((l) => ({ ...l })));
    });
    runtime.current = { nodes, simulation: sim };
    return () => {
      sim.stop();
      rememberedPositions.current = new Map(nodes.map((n) => [n.id, { ...n }]));
      runtime.current = null;
    };
  }, [size, subject, expanded, exclusion, all, parent]);
  const begin = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rt = runtime.current,
      n = rt?.nodes.find((n) => n.id === id);
    if (!rt || !n) return;
    drag.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    n.fx = n.x;
    n.fy = n.y;
    rt.simulation.alphaTarget(0.15).restart();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current,
      rt = runtime.current;
    if (!d || !rt || !svg.current) return;
    const n = rt.nodes.find((n) => n.id === d.id)!;
    const rect = svg.current.getBoundingClientRect(),
      x = e.clientX - rect.x,
      y = e.clientY - rect.y;
    d.moved ||= Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5;
    if (d.id === subject) {
      const dx = x - size.width / 2,
        dy = y - size.height / 2,
        scale = Math.min(1, 24 / Math.hypot(dx, dy));
      n.fx = size.width / 2 + dx * scale;
      n.fy = size.height / 2 + dy * scale;
    } else {
      n.fx = Math.max(58, Math.min(size.width - 58, x));
      n.fy = Math.max(46, Math.min(size.height - 47, y));
    }
  };
  const end = () => {
    const d = drag.current,
      rt = runtime.current;
    if (!d || !rt) return;
    const n = rt.nodes.find((n) => n.id === d.id);
    if (n) {
      n.fx = null;
      n.fy = null;
    }
    rt.simulation.alphaTarget(0).alpha(0.8).restart();
    suppress.current = d.moved;
    drag.current = null;
  };
  const activate = (n: Node) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    const opened =
      n.kind === 'document' ? onResource(n.id) : n.kind === 'folder' ? onFolder(n.id) : true;
    if (opened) setSubject(n.id);
  };
  return (
    <div className="graph-view" data-subject={subject}>
      <div className="graph-breadcrumb">
        {subject !== 'root' ? (
          <button onClick={() => setSubject('root')}>
            <ArrowLeft size={14} />
            Full graph
          </button>
        ) : (
          <span>
            <Network size={14} />
            Project context
          </span>
        )}
        <ChevronRight size={12} />
        <strong>{current.title}</strong>
        <span className="graph-scope">Repository sources</span>
      </div>
      <div ref={host} className="graph-stage">
        <svg
          ref={svg}
          width="100%"
          height="100%"
          aria-label={`Knowledge graph centered on ${current.title}`}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <g className="graph-links">
            {edges.map((l, i) => {
              const a = l.source as Node,
                b = l.target as Node;
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
          </g>
          {positions.map((n) => (
            <g
              key={n.id}
              data-node={n.id}
              data-subject={n.id === subject}
              className={`graph-node node-${n.kind} ${n.id === subject ? 'subject' : ''}`}
              transform={`translate(${n.x},${n.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${n.kind}: ${n.title}`}
              onPointerDown={(e) => begin(e, n.id)}
              onClick={() => activate(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(n);
                }
              }}
            >
              <circle className="node-hit" r="36" />
              {n.kind === 'project' ? (
                <>
                  <circle className="hub-halo" r="23" />
                  <circle className="subject-anchor" r="8" />
                </>
              ) : n.kind === 'folder' ? (
                <FolderOpen className="node-folder" x={-14} y={-13} size={28} strokeWidth={1.35} />
              ) : (
                <FileText className="node-file" x={-11} y={-13} size={23} strokeWidth={1.35} />
              )}
              <text textAnchor="middle" y={n.kind === 'project' ? 38 : 34}>
                {n.title}
              </text>
              {n.kind === 'folder' && (
                <text className="node-caption" textAnchor="middle" y="50">
                  {all.filter((x) => parent(x.id) === n.id).length}{' '}
                  {all.filter((x) => parent(x.id) === n.id).length === 1 ? 'source' : 'sources'}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="graph-footer">
        <span>
          <i />
          Folder containment
        </span>
        {subject === 'root' && (
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse' : 'Expand'} direction
          </button>
        )}
        <span className="graph-interaction-hint">Select to explore · drag to arrange</span>
      </div>
    </div>
  );
}
