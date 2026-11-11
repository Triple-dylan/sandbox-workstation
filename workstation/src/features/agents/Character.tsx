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
        aria-label={`${agent.name}, ${stateLabel[state]}`}
      />
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
