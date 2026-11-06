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

const bodies: Record<CharacterSpec['shape'], string> = {
  round: 'M32 6c14 0 24 10 24 25 0 16-10 27-24 27S8 47 8 31C8 16 18 6 32 6z',
  tall: 'M32 4c11 0 19 9 19 24v8c0 14-8 22-19 22s-19-8-19-22v-8C13 13 21 4 32 4z',
  wide: 'M32 10c16 0 27 8 27 21 0 15-11 25-27 25S5 46 5 31C5 18 16 10 32 10z',
};

/** A soft, restrained character. Same identity everywhere: chat, canvas, graph, panels. */
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
  const id = `g-${agent.id.slice(0, 8)}`;
  return (
    <span
      className={`character state-${state}`}
      role="img"
      aria-label={`${agent.name}, ${stateLabel[state]}`}
      title={`${agent.name} · ${stateLabel[state]}`}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <radialGradient id={id} cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor={`hsl(${spec.hue} 45% 86%)`} />
            <stop offset="70%" stopColor={`hsl(${spec.hue} 30% 66%)`} />
            <stop offset="100%" stopColor={`hsl(${spec.hue} 26% 52%)`} />
          </radialGradient>
        </defs>
        <g className="character-body">
          <ellipse cx="32" cy="60" rx="15" ry="2.5" className="character-shadow" />
          <path d={bodies[spec.shape]} fill={`url(#${id})`} />
          <g className="character-eyes" fill="#1d1d1f">
            {spec.eyes === 'dot' ? (
              <>
                <ellipse cx="25" cy="30" rx="3" ry="3.6" />
                <ellipse cx="39" cy="30" rx="3" ry="3.6" />
              </>
            ) : (
              <>
                <path
                  d="M21 31q4-5 8 0"
                  stroke="#1d1d1f"
                  strokeWidth="2.6"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M35 31q4-5 8 0"
                  stroke="#1d1d1f"
                  strokeWidth="2.6"
                  fill="none"
                  strokeLinecap="round"
                />
              </>
            )}
          </g>
        </g>
      </svg>
      {state === 'waiting' && <i className="character-badge" aria-hidden="true" />}
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
