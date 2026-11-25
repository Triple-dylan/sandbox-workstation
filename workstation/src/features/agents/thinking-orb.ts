/**
 * Vanilla host for thinking-orbs (https://orbs.jakubantalik.com).
 * MODE_DRAWS + resolvePreset — no React tree required at the canvas.
 * Adapted from DropDeployment apps/harness/src/thinking-orb.ts.
 */
import {
  MODE_DRAWS,
  resolvePreset,
  type OrbSize,
  type OrbState,
  type OrbTheme,
} from 'thinking-orbs';

export type { OrbState, OrbSize, OrbTheme };

export type ThinkingOrbHandle = {
  setState: (state: OrbState) => void;
  setPaused: (paused: boolean) => void;
  destroy: () => void;
};

/** Package ships 20 / 64; map Sandbox display sizes onto the nearer preset. */
export function presetForDisplay(displayPx: number): OrbSize {
  return displayPx <= 22 ? 20 : 64;
}

function resolveDark(theme: OrbTheme, el: HTMLElement): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  const root = el.closest('[data-theme],.dark,.light') as HTMLElement | null;
  if (root?.dataset.theme === 'dark' || root?.classList.contains('dark')) return true;
  if (root?.dataset.theme === 'light' || root?.classList.contains('light')) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function mountThinkingOrb(
  host: HTMLElement,
  opts: {
    state?: OrbState;
    /** CSS display size (Sandbox uses 18 / 26 / 28 / 40). */
    displaySize: number;
    theme?: OrbTheme;
    speed?: number;
    label?: string;
    decorative?: boolean;
  },
): ThinkingOrbHandle {
  const display = Math.max(8, Math.round(opts.displaySize));
  const presetSize = presetForDisplay(display);
  const theme: OrbTheme = opts.theme ?? 'auto';
  let state: OrbState = opts.state ?? 'breathing';
  let paused = false;
  let raf = 0;
  let start = performance.now();
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.className = 'thinking-orb-canvas';
  if (opts.decorative) {
    canvas.setAttribute('aria-hidden', 'true');
  } else {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', opts.label || `${state}…`);
  }
  host.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(display * dpr);
  canvas.height = Math.floor(display * dpr);
  canvas.style.width = `${display}px`;
  canvas.style.height = `${display}px`;
  const ctx = canvas.getContext('2d');

  const paint = (now: number) => {
    if (!ctx) return;
    const preset = resolvePreset(state, presetSize);
    const dark = resolveDark(theme, host);
    const t = reduced ? 0 : (Math.max(0, now - start) / 1000) * preset.speed * (opts.speed ?? 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, display, display);
    MODE_DRAWS[preset.mode](ctx, display, t, dark, preset.opts);
  };

  const loop = (now: number) => {
    if (!paused && !reduced) paint(now);
    else paint(performance.now());
    if (!paused && !reduced) raf = requestAnimationFrame(loop);
  };

  if (reduced) {
    paint(performance.now());
  } else {
    raf = requestAnimationFrame(loop);
  }

  const onVis = () => {
    if (document.hidden) {
      paused = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      paused = false;
      start = performance.now();
      if (!reduced && !raf) raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    setState(next) {
      state = next;
      if (!opts.decorative) {
        canvas.setAttribute('aria-label', opts.label || `${state}…`);
      }
      start = performance.now();
      if (reduced) paint(performance.now());
    },
    setPaused(p) {
      paused = p;
      if (!p && !reduced && !raf) {
        start = performance.now();
        raf = requestAnimationFrame(loop);
      }
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVis);
      if (raf) cancelAnimationFrame(raf);
      host.replaceChildren();
    },
  };
}
