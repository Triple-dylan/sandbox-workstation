export type Tool =
  | 'document'
  | 'browser'
  | 'agent-settings'
  | 'planning'
  | `pin:${string}`
  | `visual:${string}`
  | `writing:${string}`;
export type Bounds = { width: number; height: number };
export const GRID = 24;
export type CanvasObject = { id: Tool; x: number; y: number; width: number; height: number };
export const minimum = { width: 300, height: 220 };
export const minimumFor = (id: Tool) => ({
  width: id.startsWith('writing:') ? 96 : 300,
  height: id.startsWith('writing:')
    ? 56
    : id === 'planning'
      ? 300
      : id.startsWith('visual:')
        ? 280
        : 220,
});
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
    item.width >= minimumFor(item.id).width &&
    item.height >= minimumFor(item.id).height &&
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
  const min = minimumFor(id);
  if (bounds.width < min.width || bounds.height < min.height) return null;
  const preferred = id.startsWith('writing:')
    ? { width: 420, height: 72 }
    : id === 'document'
      ? { width: 560, height: 520 }
      : id === 'browser'
        ? { width: 520, height: 340 }
        : id === 'planning'
          ? { width: 540, height: 480 }
          : id.startsWith('pin:')
            ? { width: 360, height: 260 }
            : id.startsWith('visual:')
              ? { width: 440, height: 360 }
              : { width: 480, height: 580 };
  const width = Math.min(preferred.width, bounds.width),
    height = Math.min(preferred.height, bounds.height);
  for (const size of [
    { width, height },
    { width: Math.min(360, width), height: Math.min(300, height) },
  ]) {
    for (let y = GRID; y + size.height <= bounds.height; y += GRID)
      for (let x = GRID; x + size.width <= bounds.width; x += GRID) {
        const item = { id, x, y, ...size };
        if (fits(item, bounds, others)) return item;
      }
  }
  const item = { id, x: 0, y: 0, width, height };
  return fits(item, bounds, others) ? item : null;
}
// Keep valid positions first; repack only when a requested layout genuinely needs room.
// Return null rather than silently hiding another piece of work.
export function arrange(
  objects: CanvasObject[],
  bounds: Bounds,
  reserved: CanvasObject[] = [],
): CanvasObject[] | null {
  if (objects.every((o) => fits(o, bounds, [...objects, ...reserved]))) return objects;
  for (const compact of [false, true]) {
    const placed: CanvasObject[] = [];
    for (const object of objects) {
      const min = minimumFor(object.id);
      const sizes = compact
        ? [min]
        : [
            {
              width: Math.min(object.width, bounds.width),
              height: Math.min(object.height, bounds.height),
            },
            {
              width: Math.min(360, object.width),
              height: Math.min(object.height, object.id === 'planning' ? 340 : 300),
            },
            min,
          ];
      let found: CanvasObject | undefined;
      for (const size of sizes) {
        for (let y = 0; y + size.height <= bounds.height && !found; y += GRID)
          for (let x = 0; x + size.width <= bounds.width && !found; x += GRID) {
            const candidate = { ...object, ...size, x, y };
            if (fits(candidate, bounds, [...placed, ...reserved])) found = candidate;
          }
        if (found) break;
      }
      if (!found) break;
      placed.push(found);
    }
    if (placed.length === objects.length) return placed;
  }
  return null;
}

export function snapped(item: CanvasObject, x: number, y: number, bounds: Bounds) {
  return {
    ...item,
    x: Math.max(0, Math.min(bounds.width - item.width, Math.round(x / GRID) * GRID)),
    y: Math.max(0, Math.min(bounds.height - item.height, Math.round(y / GRID) * GRID)),
  };
}
export function addNativeObject(
  id: Tool,
  bounds: Bounds,
  objects: CanvasObject[],
  reserved: CanvasObject[] = [],
) {
  const first = initialObject(id, bounds, [...objects, ...reserved]);
  if (first) return [...objects, first];
  // Native content can compose more tightly; never shrink a full tool to make an import fit.
  if (objects.some((o) => !['planning'].includes(o.id) && !/^(pin|visual|writing):/.test(o.id)))
    return null;
  const candidate = initialObject(id, bounds, []);
  return candidate ? arrange([...objects, candidate], bounds, reserved) : null;
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
