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
export const mkdirSync = () => {};
export const readFileSync = () => {
  throw new Error('No files in the in-page build.');
};
export const readFile = async () => {
  throw new Error('No files in the in-page build.');
};
export const stat = readFile;
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
