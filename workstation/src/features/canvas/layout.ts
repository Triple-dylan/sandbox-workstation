import type { Placement } from '../../../shared/types.ts';

export const GRID = 24;
const GAP = 8;

export const snap = (value: number) => Math.round(value / GRID) * GRID;

export function intersects(a: Placement, b: Placement, gap = GAP) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export function contains(p: Placement, x: number, y: number) {
  return x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height;
}

/** A placement is valid when it stays inside the canvas and clear of every other item. */
export function fits(
  item: Placement,
  bounds: { width: number; height: number },
  others: Placement[],
) {
  return (
    item.x >= 0 &&
    item.y >= 0 &&
    item.x + item.width <= bounds.width &&
    item.y + item.height <= bounds.height &&
    !others.some((o) => intersects(item, o))
  );
}

/** First free grid spot scanning rows from the top-left; null when the canvas is full. */
export function freeSpot(
  size: { width: number; height: number },
  bounds: { width: number; height: number },
  others: Placement[],
) {
  for (let y = GRID; y + size.height <= bounds.height; y += GRID)
    for (let x = GRID; x + size.width <= bounds.width; x += GRID) {
      const candidate = { x, y, ...size };
      if (fits(candidate, bounds, others)) return candidate;
    }
  return null;
}

/** Where a new note starts when someone clicks at (x, y); shrinks to fit before giving up. */
export function placeNote(
  x: number,
  y: number,
  bounds: { width: number; height: number },
  others: Placement[],
) {
  for (const width of [336, 240, 168]) {
    const candidate = {
      x: snap(Math.min(x, bounds.width - width)),
      y: snap(y - 12),
      width,
      height: 48,
    };
    candidate.x = Math.max(0, candidate.x);
    candidate.y = Math.max(0, Math.min(candidate.y, bounds.height - 48));
    if (fits(candidate, bounds, others)) return candidate;
  }
  return null;
}
