import type { AgentForm } from '../../../shared/types.ts';

/**
 * An agent's tile pattern: which of the nine tiles in its 3×3 mark are lit, read left to right and
 * top to bottom. Each is mirror-symmetric so it reads as a sign, not noise, down to 16px.
 */
export const tilePatterns: Record<AgentForm, string> = {
  breathing: '.x.xxx.x.',
  weaving: 'x.x.x.x.x',
  composing: 'xxx.x..x.',
  listening: 'x.xxxxx.x',
  connecting: '.x.x.x.x.',
  searching: 'xxxx.xxxx',
  working: 'x.xx.xxxx',
  solving: '.x.xxxx.x',
  shaping: 'xxxx.x.x.',
};

/** What a person sees each pattern called when picking one. */
export const tileNames: Record<AgentForm, string> = {
  breathing: 'Plus',
  weaving: 'Cross',
  composing: 'Tee',
  listening: 'Bridge',
  connecting: 'Diamond',
  searching: 'Frame',
  working: 'Cup',
  solving: 'Arrow',
  shaping: 'Gate',
};

// The edge, clockwise from the top left, for the light that runs round while it works.
export const ring = [0, 1, 2, 5, 8, 7, 6, 3];
