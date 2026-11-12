import { isDark } from '../../app/theme.ts';
import { ThinkingOrb } from 'thinking-orbs';
import { ORB_FORMS, type OrbForm } from '../../../shared/types.ts';
import type { Job, User } from '../../../shared/types.ts';

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

const stateLabel: Record<AgentState, string> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting for approval',
  failed: 'last job failed',
};

/** The orb's ink: the agent's own hue, kept restrained and readable in either theme. */
function tint(hue: number) {
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

/** An agent's own orb form: the one it was given, or one derived from its id. */
export function orbForm(agent: User): OrbForm {
  if (agent.character?.form) return agent.character.form;
  let hash = 0;
  for (const ch of agent.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ORB_FORMS[Math.abs(hash) % ORB_FORMS.length];
}

/**
 * An agent's identity: a dotted thinking orb (as in the DropDeployment harness). Each agent has
 * its own form and colour, the same everywhere it appears. What it is doing shows in how it moves:
 * slow when idle, fast with a pulse when working, a dot when it is waiting on a person.
 */
export function Character({
  agent,
  size = 28,
  state = 'idle',
  form,
}: {
  agent: User;
  size?: number;
  state?: AgentState;
  form?: OrbForm;
}) {
  const preset = size <= 24 ? 20 : size <= 44 ? 32 : 64;
  return (
    <span
      className={`orb state-${state}`}
      style={{ width: preset, height: preset }}
      title={`${agent.name} · ${stateLabel[state]}`}
    >
      <ThinkingOrb
        state={form ?? orbForm(agent)}
        size={preset}
        speed={state === 'working' ? 2.2 : state === 'waiting' ? 0.9 : 0.45}
        paused={state === 'failed'}
        color={agent.character ? tint(agent.character.hue) : undefined}
        aria-label={`${agent.name}, ${stateLabel[state]}`}
      />
      {state === 'waiting' && <i className="orb-badge" aria-hidden="true" />}
    </span>
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
