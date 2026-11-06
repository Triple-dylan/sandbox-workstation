import { useId, type CSSProperties } from 'react';

export type OptionState = 'idle' | 'working' | 'waiting';

export type SampleAgent = {
  name: string;
  hue: number;
  shape: 'round' | 'tall' | 'wide';
  initial: string;
};

export type OptionProps = { agent: SampleAgent; size: number; state: OptionState };

const stateLabel: Record<OptionState, string> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting for approval',
};

const frame = (agent: SampleAgent, size: number, state: OptionState, extra?: CSSProperties) => ({
  role: 'img' as const,
  'aria-label': `${agent.name}, ${stateLabel[state]}`,
  title: `${agent.name} · ${stateLabel[state]}`,
  style: { width: size, height: size, '--s': `${size}px`, ...extra } as CSSProperties,
});

const tint = (agent: SampleAgent) => ({ '--tint': `hsl(${agent.hue} 10% 18%)` }) as CSSProperties;

/** Dot used at chat size, where a bubble would be unreadable. */
const Dot = () => <i className="opt-dot" aria-hidden="true" />;

function Bubble({ kind }: { kind: 'typing' | 'ask' }) {
  return (
    <i className={`opt-bubble bubble-${kind}`} aria-hidden="true">
      {kind === 'typing' ? (
        <>
          <b />
          <b />
          <b />
        </>
      ) : (
        '?'
      )}
    </i>
  );
}

/* ---------- 1. Pebble: soft geometric blob ---------- */

const pebbleBodies: Record<SampleAgent['shape'], string> = {
  round: 'M32 8C50 8 56 14 56 32S50 56 32 56 8 50 8 32 14 8 32 8Z',
  tall: 'M32 5C47 5 52 11 52 28V38C52 52 46 58 32 58S12 52 12 38V28C12 11 17 5 32 5Z',
  wide: 'M32 13C52 13 58 18 58 35S52 56 32 56 6 51 6 35 12 13 32 13Z',
};

const pebbleEyes: Record<OptionState, { dx: number; dy: number; w: number; h: number }> = {
  idle: { dx: 0, dy: 0, w: 5, h: 8 },
  working: { dx: -3.5, dy: 3, w: 5.5, h: 4 },
  waiting: { dx: 0, dy: -2, w: 6.2, h: 9.5 },
};

export function Pebble({ agent, size, state }: OptionProps) {
  const small = size < 32;
  const k = small ? 1.3 : 1;
  const e = pebbleEyes[state];
  const w = e.w * k;
  const h = e.h * k;
  return (
    <span
      className={`opt pebble is-${state} ${small ? 'is-small' : ''}`}
      {...frame(agent, size, state, tint(agent))}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {!small && <ellipse className="pebble-shadow" cx="32" cy="61" rx="17" ry="2.2" />}
        <g className="pebble-body">
          <path d={pebbleBodies[agent.shape]} className="pebble-fill" />
          <g className="pebble-eyes" transform={`translate(${e.dx} ${e.dy})`}>
            {[25, 39].map((cx) => (
              <rect
                key={cx}
                x={cx - w / 2}
                y={31 - h / 2}
                width={w}
                height={h}
                rx={Math.min(w, h) / 2}
              />
            ))}
          </g>
          {state === 'waiting' && !small && (
            <ellipse className="pebble-mouth" cx="32" cy="42" rx="2.2" ry="2.6" />
          )}
        </g>
      </svg>
      {!small && state === 'working' && <Bubble kind="typing" />}
      {!small && state === 'waiting' && <Bubble kind="ask" />}
      {small && state === 'waiting' && <Dot />}
    </span>
  );
}

/* ---------- 2. Orb: abstract glyph, state carried by motion ---------- */

function OrbCore({ shape }: { shape: SampleAgent['shape'] }) {
  if (shape === 'tall') return <rect x="23" y="13" width="18" height="38" rx="9" />;
  if (shape === 'wide') return <rect x="16" y="16" width="32" height="32" rx="11" />;
  return <circle cx="32" cy="32" r="17" />;
}

export function Orb({ agent, size, state }: OptionProps) {
  const small = size < 32;
  const gid = useId().replace(/:/g, '');
  return (
    <span
      className={`opt orb is-${state} ${small ? 'is-small' : ''}`}
      {...frame(agent, size, state, tint(agent))}
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
                <OrbCore shape={agent.shape} />
              </g>
              <g fill={`url(#orb-${gid})`}>
                <OrbCore shape={agent.shape} />
              </g>
            </>
          )}
        </g>
      </svg>
    </span>
  );
}

/* ---------- 3. Bit: illustrated mascot ---------- */

function Antenna({ shape }: { shape: SampleAgent['shape'] }) {
  return (
    <g className="bit-antenna">
      <path d="M48 16V8" className="bit-line" />
      {shape === 'tall' ? (
        <path d="M48 8C48 3 52 1 55 1C55 5 52 8 48 8Z" className="bit-tip" />
      ) : shape === 'wide' ? (
        <circle cx="48" cy="5" r="3.6" className="bit-tip bit-tip-ring" />
      ) : (
        <circle cx="48" cy="5.5" r="3.6" className="bit-tip" />
      )}
    </g>
  );
}

const bitEyes: Record<OptionState, { cy: number; ry: number; rx: number }> = {
  idle: { cy: 36, ry: 4.4, rx: 3.4 },
  working: { cy: 40, ry: 2.4, rx: 3.6 },
  waiting: { cy: 35, ry: 5.2, rx: 4 },
};

export function Bit({ agent, size, state }: OptionProps) {
  const full = size >= 48;
  const eye = bitEyes[state];
  return (
    <span
      className={`opt bit is-${state} ${full ? '' : 'is-small'}`}
      {...frame(agent, size, state, tint(agent))}
    >
      <svg
        viewBox={full ? '12 0 76 92' : '18 0 60 60'}
        width={size}
        height={size}
        aria-hidden="true"
      >
        {full && (
          <>
            <ellipse className="bit-shadow" cx="48" cy="91" rx="19" ry="2.4" />
            <rect x="39" y="80" width="7" height="8" rx="3" className="bit-dark" />
            <rect x="50" y="80" width="7" height="8" rx="3" className="bit-dark" />
            <rect x="33" y="55" width="30" height="28" rx="11" className="bit-shell" />
            <circle cx="48" cy="69" r="2.6" className="bit-belly" />
            {state === 'idle' && (
              <g className="bit-arms">
                <path d="M34 62Q27 68 28 76" className="bit-line" />
                <path d="M62 62Q69 68 68 76" className="bit-line" />
                <circle cx="28" cy="77" r="3.4" className="bit-shell" />
                <circle cx="68" cy="77" r="3.4" className="bit-shell" />
              </g>
            )}
            {state === 'working' && (
              <g className="bit-arms">
                <rect x="28" y="67" width="40" height="18" rx="3.5" className="bit-dark" />
                <circle cx="48" cy="76" r="2" className="bit-logo" />
                <path d="M34 62Q28 64 32 68" className="bit-line" />
                <path d="M62 62Q68 64 64 68" className="bit-line" />
                <circle cx="33" cy="68" r="3.4" className="bit-shell bit-hand-l" />
                <circle cx="63" cy="68" r="3.4" className="bit-shell bit-hand-r" />
              </g>
            )}
            {state === 'waiting' && (
              <g className="bit-arms">
                <path d="M34 62Q27 68 28 76" className="bit-line" />
                <circle cx="28" cy="77" r="3.4" className="bit-shell" />
                <g className="bit-wave">
                  <path d="M62 61Q72 56 73 44" className="bit-line" />
                  <circle cx="73" cy="41" r="3.8" className="bit-shell" />
                </g>
                <g className="bit-ask">
                  <path d="M80 30L78 36L85 32Z" className="bit-dark" />
                  <circle cx="85" cy="24" r="9" className="bit-dark" />
                  <text x="85" y="28.4" className="bit-ask-text">
                    ?
                  </text>
                </g>
              </g>
            )}
          </>
        )}
        <Antenna shape={agent.shape} />
        <rect x="18" y="26" width="5" height="14" rx="2.5" className="bit-dark" />
        <rect x="73" y="26" width="5" height="14" rx="2.5" className="bit-dark" />
        <rect x="22" y="16" width="52" height="40" rx="15" className="bit-shell" />
        <rect x="29" y="23" width="38" height="26" rx="9" className="bit-screen" />
        <g className="bit-eyes">
          <ellipse cx="41" cy={eye.cy} rx={eye.rx} ry={eye.ry} />
          <ellipse cx="55" cy={eye.cy} rx={eye.rx} ry={eye.ry} />
        </g>
      </svg>
      {!full && state === 'waiting' && <Dot />}
    </span>
  );
}

/* ---------- 4. Badge: monochrome initial with an aura ---------- */

export function Badge({ agent, size, state }: OptionProps) {
  return (
    <span
      className={`opt badge is-${state} ${size < 32 ? 'is-small' : ''}`}
      {...frame(agent, size, state, tint(agent))}
    >
      <i className="badge-aura" aria-hidden="true" />
      {state === 'waiting' && <i className="badge-ripple" aria-hidden="true" />}
      <span className="badge-face" style={{ fontSize: size * 0.46 }} aria-hidden="true">
        {agent.initial}
      </span>
      {state === 'waiting' && <Dot />}
    </span>
  );
}
