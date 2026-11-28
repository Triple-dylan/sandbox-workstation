import { useSyncExternalStore } from 'react';
import { isDark } from '../../app/theme.ts';
import { AGENT_FORMS, type AgentForm } from '../../../shared/types.ts';
import type { Job, User } from '../../../shared/types.ts';
import { ring, tilePatterns } from './tiles.ts';
export type AgentState = 'idle' | 'working' | 'waiting' | 'failed';

export function agentState(agentId: string, jobs: Job[]): AgentState {
  const mine = jobs.filter((j) => j.agentId === agentId);
  if (mine.some((j) => j.status === 'running' || j.status === 'queued')) return 'working';
  if (mine.some((j) => j.status === 'awaiting_approval')) return 'waiting';
  const latest = mine[0];
  if (latest?.status === 'failed' && Date.now() - Date.parse(latest.updatedAt) < 60_000)
    return 'failed';
  return 'idle';
}

export const stateLabel: Record<AgentState, string> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting for approval',
  failed: 'last job failed',
};

/** An agent's ink: its own hue, kept restrained and readable in either theme. */
export function tint(hue: number) {
  const dark = isDark();
  const s = dark ? 0.85 : 0.6;
  const l = dark ? 0.82 : 0.36;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}

/** An agent's own form (its tile pattern): the one it was given, or one derived from its id. */
export function agentForm(agent: User): AgentForm {
  if (agent.character?.form) return agent.character.form;
  let hash = 0;
  for (const ch of agent.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AGENT_FORMS[Math.abs(hash) % AGENT_FORMS.length];
}

// Reduced motion, followed live: the mark then holds a still picture of its state.
const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function useReducedMotion() {
  return useSyncExternalStore(
    (l) => {
      motionQuery?.addEventListener('change', l);
      return () => motionQuery?.removeEventListener('change', l);
    },
    () => !!motionQuery?.matches,
  );
}

/**
 * Tiles: a 3×3 mark with its own pattern (the agent's form), drawn in the agent's own colour.
 * Idle, a slow glint passes over it; working, light runs round its edge; waiting for a yes, the
 * middle tile blinks; after a failed job the tiles sag and turn grey.
 */
export function AgentMark({
  form,
  size,
  state = 'idle',
  color,
  label,
}: {
  form: AgentForm;
  size: number;
  state?: AgentState;
  color?: string;
  label?: string;
}) {
  const still = useReducedMotion();
  const pattern = tilePatterns[form] ?? tilePatterns.breathing;
  return (
    <span
      className={`agent-mark state-${state}${still ? ' still' : ''}`}
      style={
        { width: size, height: size, ...(color ? { '--mark': color } : {}) } as React.CSSProperties
      }
      title={label}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {Array.from({ length: 9 }, (_, i) => {
          const step = ring.indexOf(i);
          return (
            <rect
              key={i}
              className={`tile ${pattern[i] === 'x' ? 'on' : 'off'}${i === 4 ? ' mid' : ''}`}
              x={1.5 + (i % 3) * 7.5}
              y={1.5 + Math.floor(i / 3) * 7.5}
              width={6}
              height={6}
              rx={1.6}
              style={{ '--step': step < 0 ? 0 : step, '--col': i % 3 } as React.CSSProperties}
            />
          );
        })}
      </svg>
    </span>
  );
}

/** An agent's identity, the same everywhere it appears: its own tile pattern and colour. */
export function Character({
  agent,
  size = 28,
  state = 'idle',
  form,
}: {
  agent: User;
  size?: number;
  state?: AgentState;
  form?: AgentForm;
}) {
  return (
    <AgentMark
      form={form ?? agentForm(agent)}
      size={size}
      state={state}
      color={agent.character ? tint(agent.character.hue) : undefined}
      label={`${agent.name} · ${stateLabel[state]}`}
    />
  );
}

/** A person's colour for their name, lifted toward white in the dark theme so it stays readable. */
export function nameStyle(color: string | undefined): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    '--who': color,
    color: 'color-mix(in oklab, var(--who) var(--who-mix), white)',
  } as React.CSSProperties;
}

export function Avatar({ user, size = 24 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Actor({ user, jobs, size }: { user: User; jobs: Job[]; size?: number }) {
  return user.kind === 'agent' ? (
    <Character agent={user} size={size} state={agentState(user.id, jobs)} />
  ) : (
    <Avatar user={user} size={size} />
  );
}
