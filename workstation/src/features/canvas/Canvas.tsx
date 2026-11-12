import { nameStyle } from '../agents/Character.tsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FileText,
  GripVertical,
  ListChecks,
  ListPlus,
  Lock,
  MessageSquareText,
  Pin,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { PinBody, Placement, Resource, Snapshot } from '../../../shared/types.ts';
import { GRID, fits, freeSpot, intersects, placeNote, snap } from './layout.ts';
import { readImage } from './image.ts';
import { PlanList } from '../plan/Plan.tsx';
import { conversationLabel } from '../conversations/audience.ts';
import { Avatar, Character, agentState } from '../agents/Character.tsx';

type Draft = { placement: Placement; resourceId: string | null; text: string };

/** Last measured canvas size, so other surfaces can place items into a free spot. */
export const canvasBounds = { width: 960, height: 720 };

const MIN_SIZE: Partial<Record<Resource['kind'], { width: number; height: number }>> = {
  note: { width: 168, height: 48 },
  doc: { width: 216, height: 96 },
  pin: { width: 264, height: 120 },
  image: { width: 96, height: 96 },
  plan: { width: 336, height: 216 },
};

/** A free place on a space's board for something new of the given size. */
export function boardSpot(s: Snapshot, spaceId: string, size: { width: number; height: number }) {
  const others = s.resources
    .filter((r) => r.spaceId === spaceId && r.placement)
    .map((r) => r.placement!);
  return (
    freeSpot(size, canvasBounds, others) ??
    freeSpot(size, { width: canvasBounds.width, height: canvasBounds.height * 3 }, others)
  );
}

/** Adds a picture to the board, sized to its own shape. */
export async function addImage(
  s: Snapshot,
  spaceId: string,
  file: Blob,
  at?: { x: number; y: number },
) {
  const image = await readImage(file);
  const width = 288;
  const height = Math.max(96, Math.ceil(((image.height / image.width) * width) / GRID) * GRID);
  const others = s.resources
    .filter((r) => r.spaceId === spaceId && r.placement)
    .map((r) => r.placement!);
  const wanted = at && { x: Math.max(0, snap(at.x)), y: Math.max(0, snap(at.y)), width, height };
  const placement =
    wanted && fits(wanted, { width: 1e6, height: 1e6 }, others)
      ? wanted
      : boardSpot(s, spaceId, { width, height });
  if (!placement) throw new Error('There is no room on the board for this picture.');
  return api<Resource>('/resources', {
    body: { spaceId, kind: 'image', title: 'Image', body: image.dataUrl, placement },
  });
}

export function Canvas() {
  const { s, space, ui, setUi, run } = useWorkspace();
  const stage = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; placement: Placement; valid: boolean } | null>(
    null,
  );
  const items = s.resources.filter(
    (r) => r.spaceId === space.id && r.placement && r.kind !== 'folder',
  );
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      };
      setVisible(next);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  // Items placed on a wider screen stay reachable (the canvas scrolls) and movable.
  const bounds = items.reduce(
    (b, r) => ({
      width: Math.max(b.width, r.placement!.x + r.placement!.width + GRID),
      height: Math.max(b.height, r.placement!.y + r.placement!.height + GRID),
    }),
    visible,
  );
  useEffect(() => {
    Object.assign(canvasBounds, visible);
  }, [visible]);
  useEffect(() => {
    setDraft(null);
    setEditingId(null);
  }, [space.id]);
  const others = (id: string | null) =>
    items
      .filter((r) => r.id !== id)
      .map((r) => (moving?.id === r.id ? moving.placement : r.placement!));

  const wasWriting = useRef(false);
  const onStagePointerDown = () => {
    wasWriting.current =
      !!stage.current?.contains(document.activeElement) &&
      document.activeElement?.tagName === 'TEXTAREA';
  };
  const onStageClick = (e: React.MouseEvent) => {
    if (e.target !== stage.current) return;
    if (wasWriting.current || editingId || draft) {
      wasWriting.current = false;
      setEditingId(null);
      setDraft(null);
      setUi({ selectedId: null });
      return;
    }
    setUi({ selectedId: null });
    const rect = stage.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + stage.current!.scrollLeft;
    const y = e.clientY - rect.top + stage.current!.scrollTop;
    const placement = placeNote(x, y, bounds, others(null));
    if (!placement) return;
    setDraft({ placement, resourceId: null, text: '' });
  };
  const point = (clientX: number, clientY: number) => {
    const rect = stage.current!.getBoundingClientRect();
    return {
      x: clientX - rect.left + stage.current!.scrollLeft,
      y: clientY - rect.top + stage.current!.scrollTop,
    };
  };
  const dropImages = (files: FileList | File[], at?: { x: number; y: number }) => {
    for (const file of files)
      if (file.type.startsWith('image/')) void run(() => addImage(s, space.id, file, at));
  };
  const onStageKey = (e: React.KeyboardEvent) => {
    if (e.target !== stage.current || e.key !== 'Enter') return;
    e.preventDefault();
    const spot = placeNote(GRID, GRID, bounds, others(null));
    if (spot) setDraft({ placement: spot, resourceId: null, text: '' });
  };

  // Something a teammate placed can land on top of your own arrangement. Move it to free space
  // once, for you only; their board is untouched.
  const relocated = useRef(new Set<string>());
  useEffect(() => {
    const settled: Placement[] = items
      .filter((r) => r.ownPlacement !== false)
      .map((r) => r.placement!);
    for (const r of items) {
      if (r.ownPlacement !== false || relocated.current.has(r.id)) continue;
      if (!settled.some((p) => intersects(r.placement!, p))) {
        settled.push(r.placement!);
        continue;
      }
      const size = { width: r.placement!.width, height: r.placement!.height };
      const spot =
        freeSpot(size, bounds, settled) ??
        freeSpot(size, { ...bounds, height: bounds.height * 3 }, settled);
      if (!spot) continue;
      relocated.current.add(r.id);
      settled.push(spot);
      void api(`/resources/${r.id}`, { method: 'PATCH', body: { placement: spot } }).catch(
        () => {},
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((r) => `${r.id}:${r.ownPlacement}`).join()]);

  const beginResize = (e: React.PointerEvent, item: Resource) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const origin = item.placement!;
    const blockers = others(item.id);
    const least = MIN_SIZE[item.kind] ?? { width: 168, height: 48 };
    let current = { id: item.id, placement: origin, valid: true };
    const move = (ev: PointerEvent) => {
      const next = {
        ...origin,
        width: Math.max(least.width, snap(origin.width + ev.clientX - start.x)),
        height: Math.max(least.height, snap(origin.height + ev.clientY - start.y)),
      };
      current = {
        id: item.id,
        placement: next,
        valid: fits(next, { width: 1e6, height: 1e6 }, blockers),
      };
      setMoving(current);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
      setMoving(null);
      if (commit && current.valid && current.placement !== origin)
        void run(() =>
          api(`/resources/${item.id}`, { method: 'PATCH', body: { placement: current.placement } }),
        );
    };
    const up = () => finish(true);
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
  };

  const beginMove = (e: React.PointerEvent, item: Resource) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const origin = item.placement!;
    const blockers = others(item.id);
    let current = { id: item.id, placement: origin, valid: true };
    setMoving(current);
    const move = (ev: PointerEvent) => {
      const next = {
        ...origin,
        x: snap(origin.x + ev.clientX - start.x),
        y: snap(origin.y + ev.clientY - start.y),
      };
      current = { id: item.id, placement: next, valid: fits(next, bounds, blockers) };
      setMoving(current);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      setMoving(null);
      if (
        commit &&
        current.valid &&
        (current.placement.x !== origin.x || current.placement.y !== origin.y)
      )
        void run(() =>
          api(`/resources/${item.id}`, { method: 'PATCH', body: { placement: current.placement } }),
        );
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
  };

  return (
    <div
      ref={stage}
      className="canvas"
      tabIndex={0}
      aria-label={`${space.name} canvas. Click empty space to write.`}
      onPointerDown={onStagePointerDown}
      onClick={onStageClick}
      onKeyDown={onStageKey}
      onPaste={(e) => {
        if ((e.target as Element).tagName === 'TEXTAREA' && !e.clipboardData.files.length) return;
        if (e.clipboardData.files.length) {
          e.preventDefault();
          dropImages(e.clipboardData.files);
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        dropImages(e.dataTransfer.files, point(e.clientX, e.clientY));
      }}
    >
      {items.length === 0 && !draft && <p className="canvas-hint">Click anywhere to write</p>}
      {items.map((item) => {
        if (draft?.resourceId === item.id) return null;
        const placement = moving?.id === item.id ? moving.placement : item.placement!;
        return (
          <CanvasItem
            key={item.id}
            item={item}
            placement={placement}
            invalid={moving?.id === item.id && !moving.valid}
            editing={editingId === item.id}
            selected={ui.selectedId === item.id}
            onEdit={(on) => setEditingId(on ? item.id : null)}
            onMove={(e) => beginMove(e, item)}
            onResize={(e) => beginResize(e, item)}
            bounds={bounds}
            blockers={others(item.id)}
          />
        );
      })}
      {moving && !moving.valid && (
        <div className="canvas-guide invalid" style={{ ...moving.placement }} aria-hidden="true" />
      )}
      {draft && (
        <DraftNote
          key={`${draft.placement.x},${draft.placement.y}`}
          placement={draft.placement}
          onCreated={(id) => setDraft((d) => d && { ...d, resourceId: id })}
          onDone={() => setDraft(null)}
        />
      )}
    </div>
  );
}

/** Keeps the caret in one textarea from the first keystroke; the note is created on the first non-blank input. */
function DraftNote({
  placement,
  onCreated,
  onDone,
}: {
  placement: Placement;
  onCreated: (id: string) => void;
  onDone: () => void;
}) {
  const { space, run, setUi } = useWorkspace();
  const state = useRef<{ id: string | null; creating: boolean; latest: string; saved: string }>({
    id: null,
    creating: false,
    latest: '',
    saved: '',
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    const st = state.current;
    if (!st.id || st.latest === st.saved) return;
    const body = st.latest;
    st.saved = body;
    void run(() => api(`/resources/${st.id}`, { method: 'PATCH', body: { body } }));
  };
  const commit = async (text: string, height: number) => {
    const st = state.current;
    st.latest = text;
    if (st.id) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
      return;
    }
    if (st.creating || !text.trim()) return;
    st.creating = true;
    const created = await run(() =>
      api<Resource>('/resources', {
        body: { spaceId: space.id, kind: 'note', body: text, placement: { ...placement, height } },
      }),
    );
    st.creating = false;
    if (!created) return;
    st.id = created.id;
    st.saved = text;
    onCreated(created.id);
    setUi({ selectedId: created.id });
    flush();
  };
  return (
    <NoteText
      floating={placement}
      initial=""
      autoFocus
      onCommit={(text, height) => void commit(text, height)}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        flush();
        onDone();
      }}
    />
  );
}

function CanvasItem({
  item,
  placement,
  invalid,
  editing,
  selected,
  onEdit,
  onMove,
  onResize,
  bounds,
  blockers,
}: {
  item: Resource;
  placement: Placement;
  invalid: boolean;
  editing: boolean;
  selected: boolean;
  onEdit: (on: boolean) => void;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  bounds: { width: number; height: number };
  blockers: Placement[];
}) {
  const { s, space, setUi, run, user, discuss, openConversation, notify } = useWorkspace();
  const activeJobs = s.jobs.filter(
    (j) =>
      j.targetResourceId === item.id &&
      (j.status === 'running' || j.status === 'queued' || j.status === 'awaiting_approval'),
  );
  const agents = [...new Set(activeJobs.map((j) => j.agentId))]
    .map((id) => user(id)!)
    .filter(Boolean);
  const viewers = s.presence
    .filter((p) => p.online && p.resourceId === item.id)
    .map((p) => user(p.userId)!)
    .filter(Boolean);
  const fresh = item.updatedBy !== s.me.id && Date.now() - Date.parse(item.updatedAt) < 8000;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => tick((n) => n + 1), 8200);
    return () => clearTimeout(timer);
  }, [fresh, item.updatedAt]);
  const editor = fresh ? user(item.updatedBy) : undefined;
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (text: string, height: number) => {
    if (save.current) clearTimeout(save.current);
    save.current = setTimeout(() => {
      const next = { ...placement, height };
      const grow = next.height !== placement.height && fits(next, bounds, blockers);
      void run(() =>
        api(`/resources/${item.id}`, {
          method: 'PATCH',
          body: { body: text, ...(grow ? { placement: next } : {}) },
        }),
      );
    }, 350);
  };
  return (
    <div
      className={`canvas-item kind-${item.kind} ${selected ? 'selected' : ''} ${invalid ? 'invalid' : ''} ${item.visibility === 'private' && space.kind === 'project' ? 'is-private' : ''}`}
      style={{
        left: placement.x,
        top: placement.y,
        width: placement.width,
        ...(item.kind === 'note' ? { minHeight: placement.height } : { height: placement.height }),
      }}
      data-resource={item.id}
      onClick={(e) => {
        e.stopPropagation();
        setUi({ selectedId: item.id });
      }}
    >
      <div className="item-tools" role="toolbar" aria-label="Item actions">
        <button className="grip" aria-label="Move" onPointerDown={onMove}>
          <GripVertical size={14} />
        </button>
        <button aria-label="Discuss" title="Discuss this" onClick={() => discuss(item.id)}>
          <MessageSquareText size={14} />
        </button>
        {space.kind === 'project' && item.ownerId === s.me.id && (
          <button
            aria-label={item.visibility === 'private' ? 'Share with project' : 'Make private'}
            title={
              item.visibility === 'private'
                ? 'Private — share with project'
                : 'Shared — make private'
            }
            onClick={() =>
              void run(() =>
                api(`/resources/${item.id}`, {
                  method: 'PATCH',
                  body: { visibility: item.visibility === 'private' ? 'space' : 'private' },
                }),
              )
            }
          >
            {item.visibility === 'private' ? <Lock size={14} /> : <Users size={14} />}
          </button>
        )}
        {!item.role && (
          <button
            aria-label="Remove"
            title="Remove"
            onClick={() =>
              void run(() => api(`/resources/${item.id}`, { method: 'DELETE' })).then(
                (done) =>
                  done &&
                  notify(`Removed “${item.title.slice(0, 40)}”.`, {
                    label: 'Undo',
                    run: () => void run(() => api(`/resources/${item.id}/restore`, { body: {} })),
                  }),
              )
            }
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {item.kind === 'note' && (
        <NoteText
          initial={item.body}
          remote={editing ? undefined : item.body}
          onFocusChange={(on) => {
            onEdit(on);
            if (on) setUi({ selectedId: item.id });
          }}
          onCommit={commit}
          label={`Note${item.visibility === 'private' ? ' (private)' : ''}`}
        />
      )}
      {item.kind === 'doc' && (
        <button
          className="doc-card"
          onClick={() =>
            setUi({ readerId: item.id, selectedId: item.id, agentId: null, wide: true })
          }
        >
          <FileText size={15} />
          <strong>{item.title}</strong>
          <span>
            {item.body
              .replace(/^#.*$/m, '')
              .replace(/[#*_>|]|-{3,}/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 140)}
          </span>
        </button>
      )}
      {item.kind === 'image' && <img className="board-image" src={item.body} alt={item.title} />}
      {item.kind === 'pin' && <PinCard item={item} onOpen={openConversation} />}
      {item.kind === 'plan' && (
        <section className="plan-card" aria-label="Plan">
          <header>
            <ListChecks size={15} /> <strong>Plan</strong>
          </header>
          <PlanList spaceId={item.spaceId} />
        </section>
      )}
      <button className="resize" aria-label="Resize" title="Resize" onPointerDown={onResize} />
      {(agents.length > 0 || viewers.length > 0 || editor) && (
        <div className="item-presence">
          {agents.map((a) => (
            <Character key={a.id} agent={a} size={26} state={agentState(a.id, s.jobs)} />
          ))}
          {viewers.map((v) => (
            <span key={v.id} title={`${v.name} is here`}>
              <Avatar user={v} size={18} />
            </span>
          ))}
          {editor && !viewers.some((v) => v.id === editor.id) && (
            <span className="item-edited" style={nameStyle(editor.color)}>
              {editor.name} edited
            </span>
          )}
        </div>
      )}
      {item.visibility === 'private' && space.kind === 'project' && (
        <span className="private-mark">
          <Lock size={10} aria-hidden="true" /> Only you
        </span>
      )}
    </div>
  );
}

function PinCard({ item, onOpen }: { item: Resource; onOpen: (conversationId: string) => void }) {
  const { s, user, run, notify } = useWorkspace();
  let pin: PinBody | null = null;
  try {
    pin = JSON.parse(item.body) as PinBody;
  } catch {
    pin = null;
  }
  if (!pin) return null;
  // The message itself, where it can still be read; the stored quote otherwise.
  const live = s.messages.find((m) => m.id === pin.messageId);
  const author = user(live?.authorId ?? pin.authorId);
  const conversation = s.conversations.find((c) => c.id === pin.conversationId);
  const already = s.goals.some(
    (g) => g.spaceId === item.spaceId && g.sourceMessageId === pin.messageId,
  );
  return (
    <section className="pin-card" aria-label="Pinned message">
      <header>
        <Pin size={13} />
        <strong style={nameStyle(author?.kind === 'human' ? author.color : undefined)}>
          {author?.name ?? 'Someone'}
        </strong>
        <small>
          {conversation ? `from ${conversationLabel(s, conversation).label}` : 'pinned'}
        </small>
      </header>
      <p>{live?.text ?? pin.quote}</p>
      <footer>
        {conversation && (
          <button onClick={() => onOpen(conversation.id)}>
            <MessageSquareText size={12} /> Open
          </button>
        )}
        <button
          disabled={already}
          onClick={() =>
            void run(() =>
              api('/goals', {
                body: {
                  spaceId: item.spaceId,
                  title: (live?.text ?? pin.quote).slice(0, 200),
                  sourceMessageId: pin.messageId,
                },
              }),
            ).then((done) => done && notify('Added to the plan.'))
          }
        >
          <ListPlus size={12} /> {already ? 'In the plan' : 'Add to plan'}
        </button>
      </footer>
    </section>
  );
}

function NoteText({
  floating,
  initial,
  remote,
  autoFocus,
  onCommit,
  onBlur,
  onFocusChange,
  label = 'New note',
}: {
  floating?: Placement;
  initial: string;
  remote?: string;
  autoFocus?: boolean;
  onCommit: (text: string, height: number) => void;
  onBlur?: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (remote !== undefined && document.activeElement !== ref.current) setText(remote);
  }, [remote]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const height = () =>
    Math.max(48, Math.ceil(((ref.current?.scrollHeight ?? 24) + 24) / GRID) * GRID);
  return (
    <textarea
      ref={ref}
      className="note-text"
      style={
        floating
          ? { position: 'absolute', left: floating.x, top: floating.y, width: floating.width }
          : undefined
      }
      aria-label={label}
      value={text}
      autoFocus={autoFocus}
      spellCheck
      onClick={(e) => e.stopPropagation()}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => {
        onFocusChange?.(false);
        onBlur?.(text);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(e.target.value, height());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}
