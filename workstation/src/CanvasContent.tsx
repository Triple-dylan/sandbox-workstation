import { useContext, useEffect, useState, useLayoutEffect, useRef } from 'react';
import {
  ArrowUpRight,
  Plus,
  Check,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Calendar,
  ListOrdered,
} from 'lucide-react';
import { Workspace, IconButton, ActorIdentity } from './components';
import { getImage } from './image-store';
import type { CanvasPin, CanvasVisual } from './canvas-content';
import type { Goal } from './model';

export function PinnedMessage({
  pin,
  onSource,
  onPlan,
}: {
  pin?: CanvasPin;
  onSource: (conversationId: string, messageId: string) => void;
  onPlan: (pin: CanvasPin, title: string, actionId: string) => boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState('');
  const request = useRef('');
  const submitted = useRef(false);
  const w = useContext(Workspace);
  const c = w.conversations.find((c) => c.id === pin?.conversationId);
  const m = c?.messages.find((m) => m.id === pin?.messageId);
  if (!pin || !c || !m)
    return (
      <div className="canvas-unavailable">
        The original message is unavailable. This pin does not keep a private copy.
      </div>
    );
  return (
    <div className="pinned-message">
      <div className="pin-provenance">
        <ActorIdentity message={m} />
        <span>{c.kind === 'channel' ? `#${c.title}` : 'Private conversation'}</span>
      </div>
      <blockquote>{m.text}</blockquote>
      <div className="pin-actions">
        <button className="text-button" onClick={() => onSource(c.id, m.id)}>
          Open original <ArrowUpRight size={13} />
        </button>
        <button
          className="text-button"
          onClick={() => {
            request.current = crypto.randomUUID();
            submitted.current = false;
            setAdding(true);
          }}
          disabled={c.kind !== 'channel'}
          title={
            c.kind !== 'channel'
              ? 'Share this private message before adding it to the project plan'
              : undefined
          }
        >
          <ListOrdered size={13} />
          Add to plan
        </button>
      </div>
      {adding && (
        <form
          className="pin-next-action"
          onSubmit={(e) => {
            e.preventDefault();
            if (!action.trim() || submitted.current) return;
            submitted.current = true;
            if (onPlan(pin, action.trim(), request.current)) {
              setAdding(false);
              setAction('');
            } else submitted.current = false;
          }}
        >
          <input
            autoFocus
            aria-label="Next action from message"
            placeholder="What is the next action?"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <div className="pin-actions">
            <button className="text-button" type="submit" disabled={!action.trim()}>
              Create step
            </button>
            <button className="text-button" type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {c.kind !== 'channel' && (
        <small className="private-pin-note">
          Private pin · adding it to a shared plan requires sharing first.
        </small>
      )}
    </div>
  );
}
export function VisualReference({
  visual,
  onChange,
  onReplace,
}: {
  visual?: CanvasVisual;
  onChange: (patch: Partial<CanvasVisual>) => void;
  onReplace: () => void;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      source = '';
    setUrl('');
    setError(false);
    if (visual)
      getImage(visual.imageKey)
        .then((blob) => {
          if (!active) return;
          if (!blob) {
            setError(true);
            return;
          }
          source = URL.createObjectURL(blob);
          setUrl(source);
        })
        .catch(() => active && setError(true));
    return () => {
      active = false;
      if (source) URL.revokeObjectURL(source);
    };
  }, [visual?.imageKey, visual?.fileName, visual?.addedAt]);
  if (!visual)
    return <div className="canvas-unavailable">This visual reference is unavailable.</div>;
  return (
    <div className="visual-reference">
      <div className="visual-image">
        {error ? (
          <div className="canvas-unavailable">
            <ImageIcon size={23} />
            <p>The image is unavailable on this browser.</p>
            <button className="text-button" onClick={onReplace}>
              Restore image
            </button>
          </div>
        ) : url ? (
          <img src={url} alt={visual.caption || visual.title} />
        ) : (
          <span className="visual-loading">Loading image…</span>
        )}
      </div>
      <div className="visual-description">
        <input
          aria-label="Visual reference title"
          value={visual.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <textarea
          aria-label="Visual reference caption"
          value={visual.caption}
          onChange={(e) => onChange({ caption: e.target.value })}
          placeholder="What matters about this reference?"
          rows={2}
        />
        <div>
          <small>Private · {visual.fileName}</small>
          <button className="text-button" onClick={onReplace}>
            Replace image
          </button>
        </div>
      </div>
    </div>
  );
}
function StepTitle({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(84, Math.max(23, el.scrollHeight))}px`;
    };
    resize();
    let width = el.parentElement!.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0].contentRect.width;
      if (next !== width) {
        width = next;
        resize();
      }
    });
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
export function CanvasPlan({
  goals,
  onChange,
  onSource,
}: {
  goals: Goal[];
  onChange: (goals: Goal[]) => void;
  onSource: (conversationId: string, messageId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [dateFor, setDateFor] = useState<string | null>(null);
  const move = (index: number, direction: number) => {
    const next = [...goals];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  };
  const change = (id: string, patch: Partial<Goal>) =>
    onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  return (
    <div className="canvas-plan">
      <div className="plan-summary">
        <span>
          {goals.filter((g) => g.done).length} of {goals.length} complete
        </span>
        <small>Same project goals · personal canvas view</small>
      </div>
      <ol>
        {goals.map((g, index) => (
          <li className={g.done ? 'step-done' : ''} key={g.id}>
            <button
              className="plan-check"
              aria-label={`${g.done ? 'Reopen' : 'Complete'} ${g.title}`}
              onClick={() => change(g.id, { done: !g.done })}
            >
              {g.done ? <Check size={13} /> : <span>{String(index + 1).padStart(2, '0')}</span>}
            </button>
            <div className="plan-step">
              <StepTitle
                label={`Step ${index + 1} title`}
                value={g.title}
                onChange={(title) => change(g.id, { title })}
              />
              <div className="plan-step-meta">
                <input
                  aria-label={`Owner for step ${index + 1}`}
                  placeholder="Owner"
                  value={g.owner || ''}
                  onChange={(e) => change(g.id, { owner: e.target.value })}
                />
                {g.due || dateFor === g.id ? (
                  <label>
                    <Calendar size={12} />
                    <input
                      type="date"
                      autoFocus={dateFor === g.id}
                      aria-label={`Due date for step ${index + 1}`}
                      value={g.due}
                      onChange={(e) => change(g.id, { due: e.target.value })}
                      onBlur={() => setDateFor(null)}
                    />
                  </label>
                ) : (
                  <button
                    className="plan-date-button"
                    aria-label={`Set due date for step ${index + 1}`}
                    onClick={() => setDateFor(g.id)}
                  >
                    <Calendar size={13} />
                  </button>
                )}
              </div>
              {g.source && (
                <button
                  className="step-source text-button"
                  onClick={() => onSource(g.source!.conversationId, g.source!.messageId)}
                >
                  From conversation <ArrowUpRight size={12} />
                </button>
              )}
            </div>
            <div className="step-order">
              <IconButton
                icon={ArrowUp}
                label={`Move step ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Move step ${index + 1} down`}
                disabled={index === goals.length - 1}
                onClick={() => move(index, 1)}
              />
            </div>
          </li>
        ))}
      </ol>
      <form
        className="plan-add-step"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onChange([
            ...goals,
            { id: crypto.randomUUID(), title: title.trim(), done: false, due: '' },
          ]);
          setTitle('');
        }}
      >
        <Plus size={15} />
        <input
          aria-label="Next step"
          placeholder="Add a next step…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={!title.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
