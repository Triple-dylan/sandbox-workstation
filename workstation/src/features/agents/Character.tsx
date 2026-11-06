import { useId, type CSSProperties } from 'react';
import type { Character as CharacterSpec, Job, User } from '../../../shared/types.ts';

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

function OrbCore({ shape }: { shape: CharacterSpec['shape'] }) {
  if (shape === 'tall') return <rect x="23" y="13" width="18" height="38" rx="9" />;
  if (shape === 'wide') return <rect x="16" y="16" width="32" height="32" rx="11" />;
  return <circle cx="32" cy="32" r="17" />;
}

/** Orb: abstract core in a thin ring. State lives in motion, not a face. */
export function Character({
  agent,
  size = 28,
  state = 'idle',
}: {
  agent: User;
  size?: number;
  state?: AgentState;
}) {
  const spec = agent.character ?? { hue: 210, shape: 'round', eyes: 'dot' };
  const small = size < 32;
  const gid = useId().replace(/:/g, '');
  const style = {
    width: size,
    height: size,
    '--s': `${size}px`,
    '--tint': `hsl(${spec.hue} 10% 18%)`,
  } as CSSProperties;

  return (
    <span
      className={`character orb state-${state}${small ? ' is-small' : ''}`}
      role="img"
      aria-label={`${agent.name}, ${stateLabel[state]}`}
      title={`${agent.name} · ${stateLabel[state]}`}
      style={style}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`orb-${gid}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle className="orb-track" cx="32" cy="32" r="28" />
        {state === 'working' && (
          <circle
            className="orb-arc"
            cx="32"
            cy="32"
            r="28"
            pathLength={100}
            strokeDasharray="30 70"
          />
        )}
        {state === 'waiting' && (
          <>
            <circle className="orb-ripple" cx="32" cy="32" r="22" />
            <circle className="orb-ring" cx="32" cy="32" r="28" />
          </>
        )}
        <g className="orb-core">
          {state === 'waiting' ? (
            <>
              <circle className="orb-hold" cx="32" cy="32" r="15" />
              <circle className="orb-fill" cx="32" cy="32" r="6.5" />
            </>
          ) : (
            <>
              <g className="orb-fill">
                <OrbCore shape={spec.shape} />
              </g>
              <g fill={`url(#orb-${gid})`}>
                <OrbCore shape={spec.shape} />
              </g>
            </>
          )}
        </g>
      </svg>
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
