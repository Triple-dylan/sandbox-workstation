import { useEffect, useRef, type CSSProperties } from 'react';
import type { Job, User } from '../../../shared/types.ts';
import { agentState, agentStateLabel, orbStateForAgent, type AgentState } from './agent-state.ts';
import { mountThinkingOrb, type ThinkingOrbHandle } from './thinking-orb.ts';

export type { AgentState };
export { agentState, orbStateForAgent };

/** Orb: thinking-orbs particle canvas. State lives in motion, not a face. */
export function Character({
  agent,
  size = 28,
  state = 'idle',
}: {
  agent: User;
  size?: number;
  state?: AgentState;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<ThinkingOrbHandle | null>(null);
  const spec = agent.character ?? { hue: 210, shape: 'round', eyes: 'dot' };
  const orbState = orbStateForAgent(state);
  const label = `${agent.name}, ${agentStateLabel[state]}`;
  const style = {
    width: size,
    height: size,
    '--s': `${size}px`,
    '--tint': `hsl(${spec.hue} 28% 48% / 0.14)`,
  } as CSSProperties;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountThinkingOrb(host, {
      state: orbState,
      displaySize: size,
      theme: 'auto',
      label,
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Remount when display size changes; state updates go through setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: size only
  }, [size]);

  useEffect(() => {
    handleRef.current?.setState(orbState);
    // Failed: hold a static frame (package has no failed verb).
    handleRef.current?.setPaused(state === 'failed');
  }, [orbState, state]);

  useEffect(() => {
    const canvas = hostRef.current?.querySelector('canvas');
    if (canvas && !canvas.hasAttribute('aria-hidden')) {
      canvas.setAttribute('aria-label', label);
    }
  }, [label]);

  return (
    <span
      ref={hostRef}
      className={`character orb state-${state}`}
      title={`${agent.name} · ${agentStateLabel[state]}`}
      style={style}
    />
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
