import { ThinkingOrb, type OrbState } from 'thinking-orbs';
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
  const dark = document.documentElement.dataset.theme === 'dark';
  const s = dark ? 0.8 : 0.45;
  const l = dark ? 0.88 : 0.38;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}

const orbState: Record<AgentState, OrbState> = {
  idle: 'breathing',
  working: 'working',
  waiting: 'shaping',
  failed: 'breathing',
};

/**
 * An agent's identity: the dotted thinking orb used in the DropDeployment harness, the same
 * everywhere it appears. The animation is the agent's real job state.
 */
export function Character({
  agent,
  size = 28,
  state = 'idle',
}: {
  agent: User;
  size?: number;
  state?: AgentState;
}) {
  const preset = size <= 24 ? 20 : size <= 44 ? 32 : 64;
  return (
    <span
      className={`orb state-${state}`}
      style={{ width: preset, height: preset }}
      title={`${agent.name} · ${stateLabel[state]}`}
    >
      <ThinkingOrb
        state={orbState[state]}
        size={preset}
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
