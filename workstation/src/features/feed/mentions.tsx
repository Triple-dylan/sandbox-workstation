import { Fragment, useState } from 'react';
import { Actor, Character, agentState } from '../agents/Character.tsx';
import type { Job, User } from '../../../shared/types.ts';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The agent a message speaks to: one tagged with @Name anywhere in it, or one addressed by name at
 * the start the way you would a person ("Scout, can you…").
 */
export function addressed<T extends { name: string }>(text: string, agents: T[]): T | undefined {
  const lower = text.toLowerCase();
  const byLength = [...agents].sort((a, b) => b.name.length - a.name.length);
  return (
    byLength.find((a) =>
      new RegExp(`(^|[^\\w@])@${escape(a.name.toLowerCase())}(?![\\w])`).test(lower),
    ) ??
    byLength.find((a) =>
      new RegExp(`^\\s*(hey\\s+|hi\\s+)?${escape(a.name.toLowerCase())}\\s*[,:]`).test(lower),
    )
  );
}

/** Whether a message tags this person by name. */
export function mentions(text: string, name: string) {
  return new RegExp(`(^|[^\\w@])@${escape(name)}(?![\\w])`, 'i').test(text);
}

/** Marks @Name for people and agents so messages can show who was tagged. */
export function markMentions(text: string, names: string[]) {
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!sorted.length) return text;
  const pattern = new RegExp(`(^|[^\\w@\\[])@(${sorted.map(escape).join('|')})(?![\\w])`, 'gi');
  return text.replace(pattern, (_m, before, name) => `${before}[@${name}](#mention)`);
}

/** What is being typed after an "@", if the caret is right after one. */
export function mentionQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\w'’-]{0,30})$/.exec(before);
  return m ? { query: m[2].toLowerCase(), start: before.length - m[2].length - 1 } : null;
}

/**
 * Suggestions shown while typing "@": the people and agents that can be tagged here, people
 * first. Arrow keys move, Enter or Tab picks, Escape closes. Returns the menu and a key handler.
 */
export function useMentions({
  text,
  setText,
  agents,
  people = [],
  jobs,
  box,
}: {
  text: string;
  setText: (value: string) => void;
  agents: User[];
  /** People who can be tagged: they get a mention. */
  people?: User[];
  jobs: Job[];
  box: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [caret, setCaret] = useState(0);
  const [at, setAt] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const q = mentionQuery(text, caret);
  const fits = (u: User) => u.name.toLowerCase().includes(q!.query);
  const options = q ? [...people.filter(fits).slice(0, 4), ...agents.filter(fits)].slice(0, 7) : [];
  const open = !!q && options.length > 0 && dismissed !== q.start;
  const pick = (agent: User) => {
    if (!q) return;
    const next = `${text.slice(0, q.start)}@${agent.name} ${text.slice(caret)}`;
    const place = q.start + agent.name.length + 2;
    setText(next);
    setAt(0);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(place, place);
      setCaret(place);
    });
  };
  const track = (e: { currentTarget: HTMLTextAreaElement }) => {
    setCaret(e.currentTarget.selectionStart ?? 0);
  };
  /** Returns true when the key was used by the menu. */
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return false;
    const i = Math.min(at, options.length - 1);
    if (e.key === 'ArrowDown') setAt((i + 1) % options.length);
    else if (e.key === 'ArrowUp') setAt((i + options.length - 1) % options.length);
    else if (e.key === 'Enter' || e.key === 'Tab') pick(options[i]);
    else if (e.key === 'Escape') setDismissed(q!.start);
    else return false;
    e.preventDefault();
    return true;
  };
  const menu = open ? (
    <div
      className="mention-menu"
      role="listbox"
      aria-label={people.length ? 'Tag someone' : 'Tag an agent'}
      onMouseDown={(e) => e.preventDefault()}
    >
      {options.map((a, i) => (
        <Fragment key={a.id}>
          {(i === 0 || options[i - 1].kind !== a.kind) && (
            <p>{a.kind === 'human' ? 'People' : 'Agents'}</p>
          )}
          <button
            type="button"
            key={a.id}
            role="option"
            aria-selected={i === Math.min(at, options.length - 1)}
            onMouseEnter={() => setAt(i)}
            onClick={() => pick(a)}
          >
            {a.kind === 'human' ? (
              <Actor user={a} jobs={jobs} size={24} />
            ) : (
              <Character agent={a} size={24} state={agentState(a.id, jobs)} />
            )}
            <span>
              <strong>{a.name}</strong>
              <small>
                {a.kind === 'human'
                  ? 'Gets a mention'
                  : a.role === 'personal'
                    ? `Asks ${a.name.replace(/'s agent$/, '')} first; they decide what it shares`
                    : a.purpose || 'Shared with the space'}
              </small>
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  ) : null;
  return { menu, onKey, track };
}
