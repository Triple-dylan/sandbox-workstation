import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Diamond,
  FilePlus2,
  Frame,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  Minus,
  MousePointer2,
  Plus,
  Square,
  StickyNote,
  Trash2,
  Type,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { useShareCursor, useTeamCursors } from '../features/presence/cursors.ts';
import { useSpot } from '../app/spot.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, Md, deckSlides, sheetRows } from '../app/util.tsx';
import { DRAG } from '../app/scope.ts';
import { evaluate } from '../../shared/formula.ts';
import { readImage } from '../features/canvas/image.ts';
import { stopSharing, useShared } from '../features/canvas/share.ts';
import { Actor, nameStyle } from '../features/agents/Character.tsx';
import { ApprovalCard, MessageView } from '../features/feed/Feed.tsx';
import { PlanList } from '../features/plan/Plan.tsx';
import { usePageFeed } from './PageFeed.tsx';
import { CANVAS_KINDS, SHAPES, STICKY_COLORS, isPage } from '../../shared/types.ts';
import type { Id, PinBody, Placement, Resource } from '../../shared/types.ts';

type Tool = 'select' | 'note' | 'sticky' | 'shape' | 'frame' | 'arrow' | 'comment';
const WIDTH = 4800;
const HEIGHT = 3200;
const snap = (n: number) => Math.round(n / 8) * 8;
const sizes: Record<string, { width: number; height: number }> = {
  note: { width: 240, height: 48 },
  sticky: { width: 168, height: 168 },
  shape: { width: 176, height: 96 },
  frame: { width: 520, height: 360 },
  embed: { width: 360, height: 280 },
  plan: { width: 400, height: 336 },
};
const textKinds = ['note', 'sticky', 'shape', 'frame'];

/** A window someone is sharing, live on the canvas. Resize it like anything else. */
function ScreenPiece({ piece, onStop }: { piece: Resource; onStop: () => void }) {
  const { s, user } = useWorkspace();
  let by = piece.ownerId;
  try {
    by = JSON.parse(piece.body).by ?? by;
  } catch {
    // Fall back to whoever made it.
  }
  const mine = by === s.me.id;
  const stream = useShared(piece.id, by, mine);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);
  const name = mine ? 'You are' : `${user(by)?.name ?? 'Someone'} is`;
  return (
    <div className="screen">
      <header>
        <i className={stream ? 'live' : ''} />
        <span className="truncate">
          {stream
            ? `${name} sharing a window`
            : mine
              ? 'Sharing has stopped'
              : `Connecting to ${user(by)?.name ?? 'their'} window…`}
        </span>
        {mine && <button onClick={onStop}>{stream ? 'Stop' : 'Remove'}</button>}
      </header>
      {stream ? (
        <video ref={video} autoPlay muted playsInline />
      ) : (
        <p>
          {mine
            ? 'Remove this and share again to bring it back.'
            : 'It appears here once they are sharing.'}
        </p>
      )}
    </div>
  );
}
const inside = (a: Placement, b: Placement) =>
  a.x + a.width / 2 >= b.x &&
  a.x + a.width / 2 <= b.x + b.width &&
  a.y + a.height / 2 >= b.y &&
  a.y + a.height / 2 <= b.y + b.height;
const overlaps = (a: Placement, b: Placement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Where a line from the middle of one box to the middle of another leaves the first box. */
function edge(from: Placement, to: Placement) {
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const dx = to.x + to.width / 2 - cx;
  const dy = to.y + to.height / 2 - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const scale = Math.min(
    dx ? (from.width / 2 + 6) / Math.abs(dx) : Infinity,
    dy ? (from.height / 2 + 6) / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * A page or a channel placed on the canvas as a live window. It is the thing itself: it changes
 * when the page does, sheets can be edited in place, and a channel can be answered from here.
 * It takes whatever shape it is given; what does not fit is a double-click away.
 */
function EmbedCard({ piece }: { piece: Resource }) {
  const { s, resource, run, user } = useWorkspace();
  const [slide, setSlide] = useState(0);
  let link: { resourceId?: Id; conversationId?: Id } = {};
  try {
    link = JSON.parse(piece.body);
  } catch {
    link = {};
  }
  const chat = s.conversations.find((c) => c.id === link.conversationId);
  if (chat) {
    const recent = s.messages.filter((m) => m.conversationId === chat.id && !m.replyTo).slice(-6);
    return (
      <div className="embed window">
        <header>
          <KindIcon kind="channel" size={13} />
          <strong className="truncate">{chat.title}</strong>
          <small>live</small>
        </header>
        <div className="window-feed">
          {recent.map((m) => (
            <p key={m.id}>
              <strong style={nameStyle(user(m.authorId)?.color)}>{user(m.authorId)?.name}</strong>{' '}
              {m.text}
            </p>
          ))}
          {recent.length === 0 && <p className="quiet">Nothing said yet.</p>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('say') as HTMLInputElement;
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            void run(() => api('/messages', { body: { conversationId: chat.id, text } }));
          }}
        >
          <input
            name="say"
            placeholder={`Message #${chat.title}`}
            aria-label={`Message #${chat.title}`}
          />
        </form>
      </div>
    );
  }
  const target = resource(link.resourceId);
  if (!target) return <div className="embed gone">This is no longer available to you.</div>;
  const rows = target.kind === 'sheet' ? sheetRows(target.body) : [];
  const slides = target.kind === 'deck' ? deckSlides(target.body) : [];
  const at = Math.min(slide, Math.max(0, slides.length - 1));
  return (
    <div className="embed window">
      <header>
        <KindIcon kind={target.kind} size={13} />
        <strong className="truncate">{target.title}</strong>
        <small>{target.visibility === 'private' ? 'only you · live' : 'live'}</small>
      </header>
      {target.kind === 'sheet' ? (
        <div className="window-body">
          <table>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <input
                        defaultValue={evaluate(rows, r, c)}
                        key={`${cell}:${evaluate(rows, r, c)}`}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        onFocus={(e) => (e.target.value = cell)}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value === cell) return void (e.target.value = evaluate(rows, r, c));
                          void run(() =>
                            api(`/resources/${target.id}/cells`, {
                              body: { row: r, col: c, value },
                            }),
                          );
                        }}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && (e.target as HTMLInputElement).blur()
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : target.kind === 'asset' && target.body.startsWith('data:') ? (
        <img className="embed-picture" src={target.body} alt={target.title} draggable={false} />
      ) : target.kind === 'deck' ? (
        <div className="window-body slide-window">
          <strong>{slides[at]?.title}</strong>
          <Md text={slides[at]?.body ?? ''} />
          <span className="pager">
            <button
              aria-label="Previous slide"
              disabled={at === 0}
              onClick={() => setSlide(at - 1)}
            >
              ‹
            </button>
            {at + 1} / {slides.length}
            <button
              aria-label="Next slide"
              disabled={at >= slides.length - 1}
              onClick={() => setSlide(at + 1)}
            >
              ›
            </button>
          </span>
        </div>
      ) : target.kind === 'canvas' ? (
        <p>A canvas. Double-click to open it beside.</p>
      ) : (
        <div className="window-body">
          <Md text={target.body} />
        </div>
      )}
    </div>
  );
}

/**
 * A canvas page: a wide board for laying things out. Notes, stickies, shapes, sections and arrows,
 * with documents, sheets and decks placed as live cards. Everyone on the canvas sees the same
 * arrangement. What you select is what your agent is asked about.
 */
export function CanvasPage({ page, active }: { page: Resource; active: boolean }) {
  const { s, ui, setUi, run, pick, open, user, notify, space, menu } = useWorkspace();
  const { feed, ensure } = usePageFeed(page);
  const [tool, setTool] = useState<Tool>('select');
  const [shape, setShape] = useState<(typeof SHAPES)[number]>('rect');
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<Id | null>(null);
  const [arrowFrom, setArrowFrom] = useState<Id | null>(null);
  const [moving, setMoving] = useState<Record<Id, Placement>>({});
  const [marquee, setMarquee] = useState<Placement | null>(null);
  const [commenting, setCommenting] = useState<Id | null>(null);
  const cursors = useTeamCursors(page.id);
  const shareSpot = useShareCursor(page.id);
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  /** The view keeps fitting the room it has until you zoom by hand. */
  const auto = useRef(true);
  const manual = (change: (z: number) => number) => {
    auto.current = false;
    setZoom(change);
  };

  const pieces = s.resources.filter(
    (r) => r.parentId === page.id && (CANVAS_KINDS as readonly string[]).includes(r.kind),
  );
  const placed = pieces.filter((p) => p.placement && p.kind !== 'arrow');
  const at = (p: Resource) => moving[p.id] ?? p.placement!;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const selection = active ? ui.selection.filter((id) => byId.has(id)) : [];
  const select = (ids: Id[]) => setUi({ selection: ids });
  // A piece someone pointed at from a conversation: centred and selected.
  useSpot(page.id, (spot) => {
    const piece = spot.pieceId ? byId.get(spot.pieceId) : undefined;
    const el = scroller.current;
    if (!piece?.placement || !el) return;
    const { x, y, width, height } = piece.placement;
    el.scrollTo({
      left: Math.max(0, (x + width / 2) * zoom - el.clientWidth / 2),
      top: Math.max(0, (y + height / 2) * zoom - el.clientHeight / 2),
      behavior: 'smooth',
    });
    select([piece.id]);
  });
  const comments = feed
    ? s.messages.filter(
        (m) => m.conversationId === feed.id && m.anchor && !m.replyTo && !m.resolved,
      )
    : [];
  const pending = s.approvals.filter(
    (a) =>
      a.status === 'pending' &&
      a.proposal.kind === 'create-doc' &&
      a.proposal.resourceId === page.id,
  );

  const point = (e: { clientX: number; clientY: number }) => {
    const box = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / zoom, y: (e.clientY - box.top) / zoom };
  };
  const centre = (size: { width: number; height: number }) => {
    const el = scroller.current!;
    return {
      x: Math.max(0, snap((el.scrollLeft + el.clientWidth / 2) / zoom - size.width / 2)),
      y: Math.max(0, snap((el.scrollTop + el.clientHeight / 2) / zoom - size.height / 2)),
      ...size,
    };
  };
  const create = async (body: Record<string, unknown>) =>
    run(() =>
      api<Resource>('/resources', { body: { spaceId: page.spaceId, parentId: page.id, ...body } }),
    );
  const patch = (id: Id, body: Record<string, unknown>) =>
    run(() => api(`/resources/${id}`, { method: 'PATCH', body }));
  const remove = (ids: Id[]) => {
    if (!ids.length) return;
    select([]);
    void Promise.all(
      ids.map((id) => api(`/resources/${id}`, { method: 'DELETE' }).catch(() => undefined)),
    ).then(() =>
      run(async () => undefined).then(() =>
        notify(`Removed ${ids.length === 1 ? 'it' : `${ids.length} things`} from the canvas.`, {
          label: 'Undo',
          run: () =>
            void Promise.all(
              ids.map((id) => api(`/resources/${id}/restore`, { body: {} }).catch(() => undefined)),
            ).then(() => run(async () => undefined)),
        }),
      ),
    );
  };

  // Keys act on the canvas only while it is the pane in use and nothing is being typed.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        remove(selection);
      }
      if (e.key === 'Escape') {
        setTool('select');
        setArrowFrom(null);
        setCommenting(null);
        select([]);
      }
      const keys: Record<string, Tool> = {
        v: 'select',
        t: 'note',
        s: 'sticky',
        r: 'shape',
        f: 'frame',
        a: 'arrow',
        c: 'comment',
      };
      if (keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onBackground = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== stage.current) return;
    const start = point(e);
    setCommenting(null);
    if (tool !== 'select' && tool !== 'arrow' && tool !== 'comment') {
      const size = sizes[tool];
      const kind = tool;
      setTool('select');
      void create({
        kind,
        body: kind === 'frame' ? 'Section' : '',
        style: kind === 'shape' ? shape : undefined,
        placement: {
          x: Math.max(0, snap(start.x - (kind === 'frame' ? 0 : size.width / 2))),
          y: Math.max(0, snap(start.y - (kind === 'frame' ? 0 : size.height / 2))),
          ...size,
        },
      }).then((made) => {
        if (!made) return;
        select([made.id]);
        setEditing(made.id);
      });
      return;
    }
    if (tool === 'arrow') return setArrowFrom(null);
    // Dragging across empty canvas selects what the box touches.
    let box: Placement | null = null;
    const move = (ev: PointerEvent) => {
      const now = point(ev);
      box = {
        x: Math.min(start.x, now.x),
        y: Math.min(start.y, now.y),
        width: Math.abs(now.x - start.x),
        height: Math.abs(now.y - start.y),
      };
      if (box.width + box.height > 6) setMarquee(box);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!box || box.width + box.height <= 6) return select([]);
      const drawn = box;
      select(
        placed
          .filter((p) =>
            p.kind === 'frame'
              ? p.placement!.x >= drawn.x &&
                p.placement!.y >= drawn.y &&
                p.placement!.x + p.placement!.width <= drawn.x + drawn.width &&
                p.placement!.y + p.placement!.height <= drawn.y + drawn.height
              : overlaps(p.placement!, drawn),
          )
          .map((p) => p.id),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onPiece = (e: React.PointerEvent, piece: Resource) => {
    if (e.button !== 0 || editing === piece.id) return;
    if (
      (e.target as HTMLElement).closest('button, input, select, textarea, a, .plan, .window-feed')
    )
      return;
    e.stopPropagation();
    if (tool === 'comment') {
      setCommenting(piece.id);
      return setTool('select');
    }
    if (tool === 'arrow') {
      if (!arrowFrom) return setArrowFrom(piece.id);
      if (arrowFrom !== piece.id)
        void create({ kind: 'arrow', body: JSON.stringify({ from: arrowFrom, to: piece.id }) });
      setArrowFrom(null);
      return setTool('select');
    }
    const already = selection.includes(piece.id);
    const chosen = e.shiftKey
      ? already
        ? selection.filter((id) => id !== piece.id)
        : [...selection, piece.id]
      : already
        ? selection
        : [piece.id];
    select(chosen);
    if (e.shiftKey) return;
    // A section carries what sits inside it.
    const carried = new Set(chosen);
    for (const id of chosen) {
      const frame = byId.get(id);
      if (frame?.kind === 'frame' && frame.placement)
        for (const p of placed)
          if (p.kind !== 'frame' && inside(p.placement!, frame.placement)) carried.add(p.id);
    }
    const start = point(e);
    const origin = new Map([...carried].map((id) => [id, byId.get(id)!.placement!]));
    let moved = false;
    let latest: Record<Id, Placement> = {};
    const move = (ev: PointerEvent) => {
      const now = point(ev);
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      if (!moved && Math.hypot(dx, dy) * zoom < 4) return;
      moved = true;
      latest = Object.fromEntries(
        [...origin]
          .filter(([, o]) => !!o)
          .map(([id, o]) => [
            id,
            { ...o, x: Math.max(0, snap(o.x + dx)), y: Math.max(0, snap(o.y + dy)) },
          ]),
      );
      setMoving(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      void Promise.all(
        Object.entries(latest).map(([id, placement]) =>
          api(`/resources/${id}`, { method: 'PATCH', body: { placement } }).catch(() => undefined),
        ),
      )
        .then(() => run(async () => undefined))
        .then(() => setMoving({}));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onResize = (e: React.PointerEvent, piece: Resource) => {
    e.stopPropagation();
    e.preventDefault();
    const start = point(e);
    const origin = piece.placement!;
    let latest = origin;
    const move = (ev: PointerEvent) => {
      const now = point(ev);
      latest = {
        ...origin,
        width: Math.max(72, snap(origin.width + now.x - start.x)),
        height: Math.max(32, snap(origin.height + now.y - start.y)),
      };
      setMoving({ [piece.id]: latest });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (latest !== origin) void patch(piece.id, { placement: latest }).then(() => setMoving({}));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const addImage = async (blob: Blob, where?: { x: number; y: number }) => {
    try {
      const image = await readImage(blob);
      const width = Math.min(360, image.width);
      const size = { width: snap(width), height: snap((width * image.height) / image.width) };
      await create({
        kind: 'image',
        body: image.dataUrl,
        title: (blob as File).name?.replace(/\.\w+$/, '') ?? 'Image',
        placement: where
          ? { x: Math.max(0, snap(where.x)), y: Math.max(0, snap(where.y)), ...size }
          : centre(size),
      });
    } catch {
      notify('That file is not a picture this canvas can show.');
    }
  };
  const viewers = () =>
    s.members
      .filter((m) => m.spaceId === page.spaceId && m.userId !== s.me.id)
      .map((m) => m.userId);
  const stopScreen = (id: Id) => {
    stopSharing(id, viewers());
    void run(() => api(`/resources/${id}`, { method: 'DELETE' }));
  };
  const addPage = () =>
    pick({
      title: 'Put a page on this canvas',
      filter: (r) => isPage(r.kind) && r.id !== page.id && r.spaceId === page.spaceId,
      onPick: (t) =>
        t.type === 'page' &&
        void create({
          kind: 'embed',
          body: JSON.stringify({ resourceId: t.id }),
          placement: centre(sizes.embed),
        }),
    });
  const fit = () => {
    const el = scroller.current!;
    if (!placed.length) return (setZoom(1), el.scrollTo({ left: 0, top: 0 }));
    const x0 = Math.min(...placed.map((p) => p.placement!.x));
    const y0 = Math.min(...placed.map((p) => p.placement!.y));
    const x1 = Math.max(...placed.map((p) => p.placement!.x + p.placement!.width));
    const y1 = Math.max(...placed.map((p) => p.placement!.y + p.placement!.height));
    const next = Math.max(
      0.35,
      Math.min(1, (el.clientWidth - 140) / (x1 - x0), (el.clientHeight - 180) / (y1 - y0)),
    );
    setZoom(next);
    requestAnimationFrame(() =>
      el.scrollTo({ left: Math.max(0, x0 * next - 90), top: Math.max(0, y0 * next - 40) }),
    );
  };
  // Open on whatever is there, rather than an empty corner.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => auto.current && fitRef.current(), 60);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [page.id]);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const saveText = (piece: Resource, text: string, height?: number) => {
    setEditing(null);
    const body = text.trim();
    if (!body && piece.kind === 'note') return remove([piece.id]);
    const grow = height && piece.kind !== 'frame' && height > piece.placement!.height;
    if (body !== piece.body || grow)
      void patch(piece.id, {
        body,
        ...(grow ? { placement: { ...piece.placement!, height: snap(height + 8) } } : {}),
      });
  };

  const one = selection.length === 1 ? byId.get(selection[0]) : undefined;
  const toolButton = (id: Tool, label: string, key: string, icon: React.ReactNode) => (
    <button
      aria-label={`${label} (${key})`}
      title={`${label} · ${key}`}
      aria-pressed={tool === id}
      onClick={() => {
        setTool(id);
        setArrowFrom(null);
      }}
    >
      {icon}
    </button>
  );
  const thread = commenting ? comments.filter((m) => m.anchor!.resourceId === commenting) : [];
  const commentingPiece = byId.get(commenting ?? '');
  const below = placed.reduce((y, p) => Math.max(y, p.placement!.y + p.placement!.height), 0);

  return (
    <div className={`canvas-page tool-${tool}`}>
      <div className="canvas-tools" role="toolbar" aria-label="Canvas tools">
        {toolButton('select', 'Select', 'V', <MousePointer2 size={16} />)}
        {toolButton('note', 'Text', 'T', <Type size={16} />)}
        {toolButton('sticky', 'Sticky note', 'S', <StickyNote size={16} />)}
        {toolButton(
          'shape',
          'Shape',
          'R',
          shape === 'ellipse' ? (
            <Circle size={16} />
          ) : shape === 'diamond' ? (
            <Diamond size={16} />
          ) : (
            <Square size={16} />
          ),
        )}
        {toolButton('frame', 'Section', 'F', <Frame size={16} />)}
        {toolButton('arrow', 'Arrow', 'A', <ArrowUpRight size={16} />)}
        <hr />
        <button
          aria-label="Put a page on the canvas"
          title="Put a page on the canvas"
          onClick={addPage}
        >
          <FilePlus2 size={16} />
        </button>
        <button
          aria-label="Add a picture"
          title="Add a picture"
          onClick={() => file.current?.click()}
        >
          <ImageIcon size={16} />
        </button>
        <button
          aria-label="Add the plan"
          title="Add the plan"
          onClick={() => void create({ kind: 'plan', body: '', placement: centre(sizes.plan) })}
        >
          <ListChecks size={16} />
        </button>
        {toolButton('comment', 'Comment', 'C', <MessageSquare size={16} />)}
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (picked) void addImage(picked);
          }}
        />
      </div>
      {tool === 'shape' && (
        <div className="canvas-sub" role="radiogroup" aria-label="Shape">
          {SHAPES.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={shape === k}
              aria-label={k}
              onClick={() => setShape(k)}
            >
              {k === 'ellipse' ? (
                <Circle size={14} />
              ) : k === 'diamond' ? (
                <Diamond size={14} />
              ) : (
                <Square size={14} />
              )}
            </button>
          ))}
        </div>
      )}
      <p className="canvas-hint" role="status">
        {tool === 'arrow'
          ? arrowFrom
            ? 'Now click what the arrow points to.'
            : 'Click the thing the arrow starts from.'
          : tool === 'comment'
            ? 'Click something to comment on it.'
            : tool !== 'select'
              ? 'Click on the canvas to place it.'
              : selection.length
                ? `${selection.length} selected. Ask your agent about ${selection.length === 1 ? 'it' : 'them'} on the right.`
                : ''}
      </p>
      <div className="canvas-zoom">
        <button
          aria-label="Zoom out"
          onClick={() => manual((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => {
            auto.current = true;
            fit();
          }}
          title="Fit everything"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => manual((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
        >
          <Plus size={13} />
        </button>
      </div>
      <div
        className="canvas-scroll"
        ref={scroller}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          manual((z) => Math.max(0.3, Math.min(1.6, +(z - Math.sign(e.deltaY) * 0.1).toFixed(2))));
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const dragged = e.dataTransfer.getData(DRAG);
          if (dragged) {
            // Something from the list, dropped here, becomes a live window on the canvas.
            try {
              const t = JSON.parse(dragged);
              if (t.type !== 'page' && t.type !== 'chat') return;
              if (t.id === page.id) return;
              e.preventDefault();
              const at = point(e);
              const size = { width: 360, height: 280 };
              void create({
                kind: 'embed',
                body: JSON.stringify(
                  t.type === 'page' ? { resourceId: t.id } : { conversationId: t.id },
                ),
                placement: {
                  x: Math.max(0, snap(at.x - size.width / 2)),
                  y: Math.max(0, snap(at.y - 24)),
                  ...size,
                },
              }).then((made) => made && select([made.id]));
            } catch {
              // Not something from the list.
            }
            return;
          }
          const dropped = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
          if (!dropped) return;
          e.preventDefault();
          void addImage(dropped, point(e));
        }}
      >
        <div className="canvas-size" style={{ width: WIDTH * zoom, height: HEIGHT * zoom }}>
          <div
            className="canvas-stage"
            ref={stage}
            style={{ width: WIDTH, height: HEIGHT, transform: `scale(${zoom})` }}
            onPointerDown={onBackground}
            onPointerMove={(e) => {
              const { x, y } = point(e);
              shareSpot({ kind: 'point', x: Math.round(x), y: Math.round(y) });
            }}
          >
            {placed.length === 0 && pending.length === 0 && (
              <p className="canvas-empty">
                An empty canvas. Pick a tool on the left and click to place it, drop in a picture,
                or put a page here as a live window. You can also drag any page or channel in from
                the list.
              </p>
            )}
            {placed.filter((p) => p.kind === 'frame').map((p) => renderPiece(p))}
            <svg className="canvas-arrows" width={WIDTH} height={HEIGHT}>
              <defs>
                <marker
                  id={`head-${page.id}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {pieces
                .filter((p) => p.kind === 'arrow')
                .map((arrow) => {
                  let ends: { from: Id; to: Id };
                  try {
                    ends = JSON.parse(arrow.body);
                  } catch {
                    return null;
                  }
                  const from = byId.get(ends.from);
                  const to = byId.get(ends.to);
                  if (!from?.placement || !to?.placement) return null;
                  const a = edge(at(from), at(to));
                  const b = edge(at(to), at(from));
                  const chosen = selection.includes(arrow.id);
                  return (
                    <g key={arrow.id} className={chosen ? 'selected' : ''}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        markerEnd={`url(#head-${page.id})`}
                      />
                      <line
                        className="hit"
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          select([arrow.id]);
                        }}
                      />
                    </g>
                  );
                })}
            </svg>
            {placed.filter((p) => p.kind !== 'frame').map((p) => renderPiece(p))}
            {pending.map((a, i) => (
              <div
                key={a.id}
                className="piece ghost"
                style={{ left: 48 + i * 24, top: below + 24 + i * 24, width: 320 }}
              >
                <p className="ghost-head">
                  {user(a.agentId) && <Actor user={user(a.agentId)!} jobs={s.jobs} size={18} />}
                  {user(a.agentId)?.name} made this
                </p>
                <ApprovalCard approvalId={a.id} />
              </div>
            ))}
            {marquee && (
              <div
                className="marquee"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.width,
                  height: marquee.height,
                }}
              />
            )}
            {Object.entries(cursors).map(([id, c]) => {
              const who = user(id);
              return (
                who &&
                c.kind === 'point' && (
                  <span
                    key={id}
                    className="cursor"
                    style={{ left: c.x, top: c.y, ...nameStyle(who.color) }}
                  >
                    <MousePointer2 size={14} fill="currentColor" />
                    <b style={{ background: who.color }}>{who.name}</b>
                  </span>
                )
              );
            })}
            {one && one.placement && !editing && (
              <div
                className="piece-tools"
                style={{ left: at(one).x, top: Math.max(0, at(one).y - 40) }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {one.kind === 'sticky' &&
                  STICKY_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch sticky-${c}`}
                      aria-label={`Make it ${c}`}
                      aria-pressed={one.style === c}
                      onClick={() => void patch(one.id, { style: c })}
                    />
                  ))}
                {one.kind === 'shape' &&
                  SHAPES.map((k) => (
                    <button
                      key={k}
                      aria-label={k}
                      aria-pressed={one.style === k}
                      onClick={() => void patch(one.id, { style: k })}
                    >
                      {k === 'ellipse' ? (
                        <Circle size={13} />
                      ) : k === 'diamond' ? (
                        <Diamond size={13} />
                      ) : (
                        <Square size={13} />
                      )}
                    </button>
                  ))}
                {one.kind === 'note' && (
                  <button
                    aria-pressed={one.style === 'heading'}
                    onClick={() =>
                      void patch(one.id, { style: one.style === 'heading' ? '' : 'heading' })
                    }
                  >
                    Heading
                  </button>
                )}
                <button onClick={() => setCommenting(one.id)}>
                  <MessageSquare size={13} /> Comment
                </button>
                <button aria-label="Remove" title="Remove" onClick={() => remove([one.id])}>
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            {one && !one.placement && (
              <div
                className="piece-tools"
                style={{ left: 16, top: 16 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button onClick={() => remove([one.id])}>
                  <Trash2 size={13} /> Remove arrow
                </button>
              </div>
            )}
            {commentingPiece?.placement && (
              <div
                className="canvas-thread"
                style={{
                  left: at(commentingPiece).x + at(commentingPiece).width + 12,
                  top: at(commentingPiece).y,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {thread.map((m) => (
                  <div key={m.id} className="canvas-comment">
                    <MessageView m={m} quiet />
                    {s.messages
                      .filter((r) => r.replyTo === m.id)
                      .map((r) => (
                        <MessageView key={r.id} m={r} quiet />
                      ))}
                    <button
                      className="link"
                      onClick={() =>
                        void run(() =>
                          api(`/messages/${m.id}/resolve`, { body: { resolved: true } }),
                        )
                      }
                    >
                      <Check size={12} /> Resolve
                    </button>
                  </div>
                ))}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('comment') as HTMLInputElement;
                    const text = input.value.trim();
                    if (!text) return;
                    input.value = '';
                    const chat = await ensure();
                    if (!chat) return;
                    await run(() =>
                      api('/messages', {
                        body: {
                          conversationId: chat.id,
                          text,
                          anchor: {
                            resourceId: commentingPiece.id,
                            quote: (commentingPiece.body.startsWith('{') ||
                            commentingPiece.kind === 'image'
                              ? commentingPiece.title
                              : commentingPiece.body
                            ).slice(0, 120),
                          },
                        },
                      }),
                    );
                  }}
                >
                  <input
                    name="comment"
                    autoFocus
                    placeholder="Comment on this"
                    aria-label="Comment on this"
                  />
                  <button type="button" onClick={() => setCommenting(null)}>
                    Close
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function renderPiece(p: Resource) {
    const place = at(p);
    const chosen = selection.includes(p.id);
    const count = comments.filter((m) => m.anchor!.resourceId === p.id).length;
    const isEditing = editing === p.id;
    const owner = user(p.ownerId);
    let inner: React.ReactNode = null;
    if (textKinds.includes(p.kind))
      inner = isEditing ? (
        <textarea
          autoFocus
          defaultValue={p.body}
          aria-label="Text"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => saveText(p, e.target.value, e.target.scrollHeight)}
          onKeyDown={(e) => {
            if (
              e.key === 'Escape' ||
              (e.key === 'Enter' && (p.kind === 'frame' || e.metaKey || e.ctrlKey))
            )
              (e.target as HTMLTextAreaElement).blur();
            e.stopPropagation();
          }}
        />
      ) : (
        <span className="piece-text">
          {p.body || (p.kind === 'frame' ? 'Section' : p.kind === 'note' ? 'Text' : '')}
        </span>
      );
    else if (p.kind === 'embed') inner = <EmbedCard piece={p} />;
    else if (p.kind === 'screen') inner = <ScreenPiece piece={p} onStop={() => stopScreen(p.id)} />;
    else if (p.kind === 'image') inner = <img src={p.body} alt={p.title} draggable={false} />;
    else if (p.kind === 'plan')
      inner = (
        <div className="plan-card">
          <strong>Plan</strong>
          <PlanList spaceId={page.spaceId} />
        </div>
      );
    else if (p.kind === 'pin') {
      let pin: PinBody | null = null;
      try {
        pin = JSON.parse(p.body);
      } catch {
        pin = null;
      }
      const author = user(pin?.authorId);
      inner = (
        <div className="pin-card">
          <p>“{pin?.quote ?? p.title}”</p>
          <small>
            {author?.name ?? 'Someone'} ·{' '}
            <button
              className="link"
              onClick={() => pin && open({ type: 'chat', id: pin.conversationId }, true)}
            >
              open the conversation
            </button>
          </small>
        </div>
      );
    }
    return (
      <div
        key={p.id}
        data-piece={p.id}
        className={`piece kind-${p.kind} ${p.style ? `${p.kind}-${p.style}` : ''} ${chosen ? 'selected' : ''} ${arrowFrom === p.id ? 'arrow-from' : ''} ${p.visibility === 'private' && space.kind === 'project' && page.visibility === 'space' ? 'is-private' : ''}`}
        style={{ left: place.x, top: place.y, width: place.width, height: place.height }}
        title={
          p.visibility === 'private' && space.kind === 'project' && page.visibility === 'space'
            ? 'Only you see this piece'
            : undefined
        }
        onPointerDown={(e) => onPiece(e, p)}
        onContextMenu={(e) => {
          if (!selection.includes(p.id)) select([p.id]);
          menu(e, [
            { label: 'Comment', run: () => setCommenting(p.id) },
            {
              label: 'Ask your agent about this',
              run: () => setUi({ selection: [p.id], railOpen: true }),
            },
            ...(textKinds.includes(p.kind)
              ? [{ label: 'Edit text', run: () => setEditing(p.id) }]
              : []),
            ...(p.placement && p.kind !== 'screen' && p.kind !== 'plan'
              ? [
                  {
                    label: 'Duplicate',
                    run: () =>
                      void create({
                        kind: p.kind,
                        body: p.body,
                        style: p.style,
                        title: p.title,
                        placement: {
                          ...p.placement!,
                          x: p.placement!.x + 24,
                          y: p.placement!.y + 24,
                        },
                      }),
                  },
                ]
              : []),
            'line',
            { label: 'Remove', danger: true, run: () => remove([p.id]) },
          ]);
        }}
        onDoubleClick={() => {
          if (textKinds.includes(p.kind)) return setEditing(p.id);
          if (p.kind === 'embed')
            try {
              const link = JSON.parse(p.body);
              open(
                link.conversationId
                  ? { type: 'chat', id: link.conversationId }
                  : { type: 'page', id: link.resourceId },
                true,
              );
            } catch {
              // Nothing to open.
            }
        }}
      >
        {p.kind === 'shape' && (
          <svg
            className="shape-bg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {p.style === 'ellipse' ? (
              <ellipse cx="50" cy="50" rx="49" ry="49" />
            ) : p.style === 'diamond' ? (
              <polygon points="50,1 99,50 50,99 1,50" />
            ) : (
              <rect x="1" y="1" width="98" height="98" rx="5" />
            )}
          </svg>
        )}
        {inner}
        {count > 0 && (
          <button
            className="piece-count"
            aria-label={`${count} comment${count === 1 ? '' : 's'}`}
            onClick={() => setCommenting(p.id)}
          >
            {count}
          </button>
        )}
        {chosen && selection.length === 1 && !isEditing && (
          <span className="resize" aria-hidden="true" onPointerDown={(e) => onResize(e, p)} />
        )}
        {p.kind === 'sticky' && owner && owner.id !== s.me.id && (
          <small className="by">{owner.name}</small>
        )}
      </div>
    );
  }
}
