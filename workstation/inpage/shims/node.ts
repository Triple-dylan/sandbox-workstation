// @ts-nocheck
// Small stand-ins for the few Node APIs the server touches.
export const randomUUID = () => crypto.randomUUID();
export const randomBytes = (n: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return {
    toString: () =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
  };
};
/** SHA-256, synchronously, for the server's token hashing. Only `update(text).digest('base64url')` is used. */
function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const K = new Uint32Array(64);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every((q) => n % q)) primes.push(n);
  primes.forEach((q, i) => (K[i] = (Math.cbrt(q) % 1) * 2 ** 32));
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, length * 8);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  const w = new Uint32Array(64);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++)
      w[i] =
        w[i - 16] +
        (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) +
        w[i - 7] +
        (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10));
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => (H[i] = (H[i] + x) >>> 0));
  }
  const out = new Uint8Array(32);
  H.forEach((x, i) => new DataView(out.buffer).setUint32(i * 4, x));
  return out;
}
export const createHash = () => {
  let text = '';
  const hash = {
    update(part: string) {
      text += part;
      return hash;
    },
    digest() {
      return btoa(String.fromCharCode(...sha256(text)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    },
  };
  return hash;
};
export const mkdirSync = () => {};
export const readFileSync = () => {
  throw new Error('No files in the in-page build.');
};
export const readFile = async () => {
  throw new Error('No files in the in-page build.');
};
export const stat = readFile;
// Backups never run in the page (its database is in memory); these only satisfy the imports.
export const readdirSync = () => [];
export const statSync = readFileSync;
export const renameSync = readFileSync;
export const rmSync = () => {};
export const createReadStream = readFileSync;
export const sep = '/';
export const dirname = (p: string) => p.replace(/\/[^/]*$/, '');
export const extname = (p: string) => (p.match(/\.[^./]+$/) ?? [''])[0];
export const join = (...parts: string[]) => parts.join('/');
export const normalize = (p: string) => p;
export const fileURLToPath = (u: unknown) => String(u);

type Handler = (req: unknown, res: unknown) => void;
export let handler: Handler = () => {};
export const createServer = (h: Handler) => {
  handler = h;
  return {
    listen: (_p?: unknown, _h?: unknown, cb?: () => void) => cb?.(),
    close: (cb?: () => void) => cb?.(),
    address: () => ({ port: 0 }),
  };
};
