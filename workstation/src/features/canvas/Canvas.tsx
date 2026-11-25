import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, GripVertical, Lock, MessageSquareText, Trash2, Users } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Placement, Resource } from '../../../shared/types.ts';
import { GRID, fits, freeSpot, placeNote, snap } from './layout.ts';
import { Avatar, Character, agentState } from '../agents/Character.tsx';

type Draft = { placement: Placement; resourceId: string | null; text: string };

export function Canvas() {
  const { s, space, ui, setUi, run, notify } = useWorkspace();
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
      if (next.width && next.height) setVisible(next);
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
  const placing = useRef<string | null>(null);
  useEffect(() => {
    const id = ui.pendingPlacementId;
    if (!id || !visible.width || !visible.height || placing.current === id || !stage.current)
      return;
    const item = s.resources.find((r) => r.id === id && r.spaceId === space.id);
    if (!item || item.placement) {
      setUi({ pendingPlacementId: null });
      return;
    }
    const rect = stage.current.getBoundingClientRect();
    const overlays = [
      ...(stage.current
        .closest('.surface')
        ?.querySelectorAll('.utilities > *, .composer, .surface-toolbar') ?? []),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height };
    });
    const spot = freeSpot(
      { width: Math.min(288, visible.width - GRID * 2), height: 120 },
      visible,
      [...items.map((r) => r.placement!), ...overlays],
    );
    if (!spot) {
      notify(
        'No clear space is available on Canvas. Minimize a tool or move an item and try again.',
      );
      setUi({ pendingPlacementId: null });
      return;
    }
    placing.current = id;
    void run(() => api(`/resources/${id}`, { method: 'PATCH', body: { placement: spot } })).then(
      () => {
        placing.current = null;
        setUi({ pendingPlacementId: null, selectedId: id });
      },
    );
  }, [ui.pendingPlacementId, visible.width, visible.height, space.id, s.resources]);
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
  const onStageKey = (e: React.KeyboardEvent) => {
    if (e.target !== stage.current || e.key !== 'Enter') return;
    e.preventDefault();
    const spot = placeNote(GRID, GRID, bounds, others(null));
    if (spot) setDraft({ placement: spot, resourceId: null, text: '' });
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
  bounds: { width: number; height: number };
  blockers: Placement[];
}) {
  const { s, space, setUi, run, user, discuss, openResource } = useWorkspace();
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
  const editor =
    item.updatedBy !== s.me.id && Date.now() - Date.parse(item.updatedAt) < 8000
      ? user(item.updatedBy)
      : undefined;
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
      className={`canvas-item kind-${item.kind} ${selected ? 'selected' : ''} ${invalid ? 'invalid' : ''}`}
      style={{
        left: placement.x,
        top: placement.y,
        width: placement.width,
        minHeight: placement.height,
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
            onClick={() => void run(() => api(`/resources/${item.id}`, { method: 'DELETE' }))}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {item.kind === 'note' ? (
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
      ) : (
        <button className="doc-card" onClick={() => openResource(item.id)}>
          <FileText size={15} />
          <strong>{item.title}</strong>
          <span>{item.body.replace(/[#*_>-]/g, '').slice(0, 140)}</span>
        </button>
      )}
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
            <span className="item-edited" style={{ color: editor.color }}>
              {editor.name} edited
            </span>
          )}
        </div>
      )}
      {item.visibility === 'private' && space.kind === 'project' && (
        <Lock className="private-mark" size={12} aria-label="Private" />
      )}
    </div>
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
