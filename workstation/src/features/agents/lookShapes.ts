// The shapes behind our agent looks: nine variants of each, one per agent form.

/* ---------- Trace: one closed line per agent ---------- */

type Curve = (t: number) => [number, number];
const curves: Curve[] = [
  // a soft trefoil
  (t) => {
    const r = 0.65 + 0.35 * Math.cos(3 * t);
    return [r * Math.cos(t), r * Math.sin(t)];
  },
  // an eight lying down
  (t) => [Math.sin(t), Math.sin(2 * t) * 0.7],
  // three inner loops
  (t) => [2 * Math.cos(t) + 1.6 * Math.cos(2 * t), 2 * Math.sin(t) - 1.6 * Math.sin(2 * t)],
  // a four-leaf
  (t) => {
    const r = 0.7 + 0.3 * Math.cos(4 * t);
    return [r * Math.cos(t), r * Math.sin(t)];
  },
  // a pretzel
  (t) => [Math.sin(2 * t + Math.PI / 4), Math.sin(3 * t)],
  // four inner loops
  (t) => [3 * Math.cos(t) + 1.4 * Math.cos(3 * t), 3 * Math.sin(t) - 1.4 * Math.sin(3 * t)],
  // a five-leaf
  (t) => {
    const r = 0.72 + 0.28 * Math.cos(5 * t);
    return [r * Math.cos(t), r * Math.sin(t)];
  },
  // a looped bow
  (t) => [Math.sin(3 * t + Math.PI / 2), Math.sin(2 * t)],
  // a heart-ish loop with a loop inside
  (t) => {
    const r = 0.45 + 0.75 * Math.cos(t);
    return [r * Math.sin(t) * 1.1, -r * Math.cos(t)];
  },
];

export const tracePaths = curves.map((curve) => {
  const steps = 160;
  const pts = Array.from({ length: steps }, (_, i) => curve((i / steps) * Math.PI * 2));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy);
  const k = 8.6 / half;
  const at = (p: [number, number]) =>
    `${(12 + (p[0] - cx) * k).toFixed(2)} ${(12 + (p[1] - cy) * k).toFixed(2)}`;
  return {
    d: `M${pts.map(at).join('L')}Z`,
    start: at(pts[0]).split(' ').map(Number) as [number, number],
  };
});

export const tilePatterns = [
  '.x.xxx.x.',
  'x.x.x.x.x',
  'xxx.x..x.',
  'x.xxxxx.x',
  '.x.x.x.x.',
  'xxxx.xxxx',
  'x.xx.xxxx',
  '.x.xxxx.x',
  'xxxx.x.x.',
];
// The edge, clockwise from the top left, for the light that runs round while it works.
export const ring = [0, 1, 2, 5, 8, 7, 6, 3];

const blooms = [
  { lobes: 3, depth: 0.22 },
  { lobes: 4, depth: 0.16 },
  { lobes: 5, depth: 0.2 },
  { lobes: 6, depth: 0.14 },
  { lobes: 3, depth: 0.36 },
  { lobes: 4, depth: 0.3 },
  { lobes: 5, depth: 0.32 },
  { lobes: 6, depth: 0.26 },
  { lobes: 7, depth: 0.2 },
];
export const bloomPaths = blooms.map(({ lobes, depth }) => {
  const steps = 120;
  const pts = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const r = 8.4 * (1 - depth + depth * Math.cos(lobes * t));
    return `${(12 + r * Math.sin(t)).toFixed(2)} ${(12 - r * Math.cos(t)).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
});
