import { useSyncExternalStore } from 'react';
import { ORB_FORMS, type OrbForm } from '../../../shared/types.ts';
import type { AgentState } from './Character.tsx';
import { bloomPaths, ring, tilePatterns, tracePaths } from './lookShapes.ts';

/**
 * Our own agent looks, being tried out against the orbs. Each one is drawn in the agent's colour
 * and has nine variants (one per agent form), so agents still tell apart by colour and shape. Each
 * look shows every state its own way; with reduced motion they hold a still picture of that state.
 */
export const AGENT_LOOKS = ['orbs', 'trace', 'tiles', 'bloom'] as const;
export type AgentLook = (typeof AGENT_LOOKS)[number];

export const lookInfo: Record<AgentLook, { name: string; about: string }> = {
  orbs: { name: 'Orbs', about: 'The dotted thinking orbs used today.' },
  trace: {
    name: 'Trace',
    about:
      'One unbroken pen line, its own loop for each agent. A bright stretch runs along it while it works; it stops with a gap and a dot when it needs you; it breaks into dashes when a job fails.',
  },
  tiles: {
    name: 'Tiles',
    about:
      'A three-by-three mark with its own pattern for each agent. Light runs round the edge while it works; the middle tile blinks when it needs you; the tiles drop and grey when a job fails.',
  },
  bloom: {
    name: 'Bloom',
    about:
      'A soft lobed shape, its own number and depth of lobes for each agent. It breathes when idle and turns while it works; it folds to a bud when it needs you; it wilts when a job fails.',
  },
};

// The look in use on this device: set from Settings, read by every agent mark.
let current: AgentLook = 'orbs';
const listeners = new Set<() => void>();
export function setAgentLook(look: AgentLook) {
  if (look === current) return;
  current = look;
  for (const l of listeners) l();
}
export function useAgentLook(): AgentLook {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

// Reduced motion, followed live: every look then holds a still picture of its state.
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

const formIndex = (form: OrbForm) => Math.max(0, ORB_FORMS.indexOf(form));

function Trace({ form }: { form: OrbForm }) {
  const p = tracePaths[formIndex(form)];
  return (
    <g className="look-spin">
      <path className="trace-line" d={p.d} pathLength={100} />
      <path className="trace-run" d={p.d} pathLength={100} />
      <circle className="trace-dot" cx={p.start[0]} cy={p.start[1]} r={2.7} />
    </g>
  );
}

/* ---------- Tiles: a 3x3 mark per agent ---------- */

function Tiles({ form }: { form: OrbForm }) {
  const pattern = tilePatterns[formIndex(form)];
  return (
    <g>
      {Array.from({ length: 9 }, (_, i) => {
        const x = 1.5 + (i % 3) * 7.5;
        const y = 1.5 + Math.floor(i / 3) * 7.5;
        const on = pattern[i] === 'x';
        const step = ring.indexOf(i);
        return (
          <rect
            key={i}
            className={`tile ${on ? 'on' : 'off'}${i === 4 ? ' mid' : ''}`}
            x={x}
            y={y}
            width={6}
            height={6}
            rx={1.6}
            style={
              {
                '--step': step < 0 ? 0 : step,
                '--col': i % 3,
              } as React.CSSProperties
            }
          />
        );
      })}
    </g>
  );
}

/* ---------- Bloom: a lobed shape per agent ---------- */

function Bloom({ form }: { form: OrbForm }) {
  return (
    <g className="look-spin">
      <g className="bloom-body">
        <path className="bloom-shape" d={bloomPaths[formIndex(form)]} />
      </g>
      <circle className="bloom-core" cx={12} cy={12} r={2.4} />
    </g>
  );
}

/** One of our looks, drawn at the given size in the agent's colour. */
export function LookMark({
  look,
  form,
  size,
  state,
  color,
  label,
  still,
}: {
  look: Exclude<AgentLook, 'orbs'>;
  form: OrbForm;
  size: number;
  state: AgentState;
  color?: string;
  label: string;
  still?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <span
      className={`orb look look-${look} state-${state}${still || reduced ? ' still' : ''}`}
      style={
        { width: size, height: size, ...(color ? { '--mark': color } : {}) } as React.CSSProperties
      }
      title={label}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
        {look === 'trace' ? (
          <Trace form={form} />
        ) : look === 'tiles' ? (
          <Tiles form={form} />
        ) : (
          <Bloom form={form} />
        )}
      </svg>
    </span>
  );
}
