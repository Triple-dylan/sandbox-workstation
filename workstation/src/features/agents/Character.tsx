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

/** An agent's identity: a soft animated orb, the same everywhere it appears. Motion shows real job state. */
export function Character({
  agent,
  size = 28,
  state = 'idle',
}: {
  agent: User;
  size?: number;
  state?: AgentState;
}) {
  const hue = agent.character?.hue ?? 210;
  return (
    <span
      className={`orb state-${state}`}
      style={{ '--size': `${size}px`, '--hue': hue } as React.CSSProperties}
      role="img"
      aria-label={`${agent.name}, ${stateLabel[state]}`}
      title={`${agent.name} · ${stateLabel[state]}`}
    >
      <i className="orb-core" aria-hidden="true" />
      {state === 'waiting' && <i className="orb-badge" aria-hidden="true" />}
    </span>
  );
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
