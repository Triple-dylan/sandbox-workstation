export type Tool = 'document' | 'browser' | 'agent-settings';
export type Bounds = { width: number; height: number };
export type CanvasObject = { id: Tool; x: number; y: number; width: number; height: number };
export const minimum = { width: 300, height: 220 };
const gap = 16;
export function intersects(a: CanvasObject, b: CanvasObject) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
export function fits(item: CanvasObject, bounds: Bounds, others: CanvasObject[]) {
  return (
    item.x >= 0 &&
    item.y >= 0 &&
    item.width >= minimum.width &&
    item.height >= minimum.height &&
    item.x + item.width <= bounds.width + 0.5 &&
    item.y + item.height <= bounds.height + 0.5 &&
    !others.some((other) => other.id !== item.id && intersects(item, other))
  );
}
export function initialObject(
  id: Tool,
  bounds: Bounds,
  others: CanvasObject[],
): CanvasObject | null {
  if (bounds.width < minimum.width || bounds.height < minimum.height) return null;
  const preferred =
    id === 'document'
      ? { width: 560, height: 520 }
      : id === 'browser'
        ? { width: 520, height: 340 }
        : { width: 350, height: 360 };
  const width = Math.min(preferred.width, bounds.width),
    height = Math.min(preferred.height, bounds.height);
  for (const size of [
    { width, height },
    { width: Math.min(360, width), height: Math.min(300, height) },
  ]) {
    for (let y = 16; y + size.height <= bounds.height; y += 16)
      for (let x = 16; x + size.width <= bounds.width; x += 16) {
        const item = { id, x, y, ...size };
        if (fits(item, bounds, others)) return item;
      }
  }
  const item = { id, x: 0, y: 0, width, height };
  return fits(item, bounds, others) ? item : null;
}
export function snapped(item: CanvasObject, x: number, y: number, bounds: Bounds) {
  return {
    ...item,
    x: Math.max(0, Math.min(bounds.width - item.width, Math.round(x / 16) * 16)),
    y: Math.max(0, Math.min(bounds.height - item.height, Math.round(y / 16) * 16)),
  };
}
export function pairSnap(
  moving: CanvasObject,
  target: CanvasObject,
  x: number,
  y: number,
  bounds: Bounds,
  others: CanvasObject[],
): CanvasObject[] | null {
  if (
    x < target.x - 42 ||
    x > target.x + target.width + 42 ||
    y < target.y - 42 ||
    y > target.y + target.height + 42
  )
    return null;
  const distances = [
    ['left', Math.abs(x - target.x)],
    ['right', Math.abs(x - target.x - target.width)],
    ['above', Math.abs(y - target.y)],
    ['below', Math.abs(y - target.y - target.height)],
  ] as const;
  const [edge, distance] = [...distances].sort((a, b) => a[1] - b[1])[0];
  if (distance > 42) return null;
  const horizontal = edge === 'left' || edge === 'right';
  const width = horizontal ? Math.min(760, bounds.width) : Math.max(moving.width, target.width);
  const height = horizontal ? Math.max(moving.height, target.height) : Math.min(540, bounds.height);
  const origin = {
    x: Math.min(target.x, Math.max(0, bounds.width - width)),
    y: Math.min(target.y, Math.max(0, bounds.height - height)),
  };
  const first = {
    ...moving,
    ...origin,
    width: horizontal ? (width - gap) / 2 : width,
    height: horizontal ? height : (height - gap) / 2,
  };
  const second = { ...target, ...origin, width: first.width, height: first.height };
  if (edge === 'left') second.x += first.width + gap;
  if (edge === 'right') first.x += first.width + gap;
  if (edge === 'above') second.y += first.height + gap;
  if (edge === 'below') first.y += first.height + gap;
  const rest = others.filter((i) => i.id !== moving.id && i.id !== target.id);
  return fits(first, bounds, [...rest, second]) && fits(second, bounds, [...rest, first])
    ? [first, second]
    : null;
}
