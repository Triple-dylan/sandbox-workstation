// @ts-nocheck
// In-page build: the real server (store, access checks, agent engine) runs inside this page,
// so it opens anywhere a web page opens. One browser at a time; data stays in this browser.
import { ready } from './shims/sqlite.ts';
import { handler } from './shims/node.ts';
import { createApp } from '../server/app.ts';
import { claudeRuntime, stayQuiet } from './claude-runtime.ts';
import { seedExample } from './example.ts';

const TOKEN = 'sw-inpage-session-v13';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
let token = read(TOKEN) ?? '';
const keep = (value: string) => {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN, value);
    else localStorage.removeItem(TOKEN);
  } catch {
    // In-memory only.
  }
};

globalThis.Buffer = { concat: (chunks: string[]) => ({ toString: () => chunks.join('') }) };

function call(
  method: string,
  url: string,
  body: string | undefined,
  stream?: (data: string) => void,
) {
  let closeListeners: (() => void)[] = [];
  let finish: (r: Response) => void = () => {};
  const done = new Promise<Response>((resolve) => (finish = resolve));
  let status = 200;
  let headers: Record<string, string> = {};
  const req = {
    method,
    url,
    headers: {
      cookie: token ? `sw_session=${encodeURIComponent(token)}` : '',
      'x-workstation': '1',
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield body;
    },
  };
  const res = {
    headersSent: false,
    writeHead(s: number, h: Record<string, string> = {}) {
      status = s;
      headers = h;
      this.headersSent = true;
      const cookie = h['set-cookie'];
      if (cookie)
        keep(/Max-Age=0/.test(cookie) ? '' : (cookie.match(/sw_session=([^;]*)/)?.[1] ?? ''));
    },
    write(data: string) {
      stream?.(data);
    },
    end(data?: string) {
      finish(
        new Response(data ?? '', {
          status,
          headers: { 'content-type': headers['content-type'] ?? 'application/json' },
        }),
      );
    },
    on(event: string, cb: () => void) {
      if (event === 'close') closeListeners.push(cb);
    },
  };
  handler(req, res);
  return { done, close: () => closeListeners.splice(0).forEach((cb) => cb()) };
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!url.startsWith('/api')) return realFetch(input, init);
  const first = url === '/api/join' && app.store.profiles().length === 0;
  const done = call(init.method ?? 'GET', url, init.body as string | undefined).done;
  // The very first person to join gets a labelled example project, so there is something to look at.
  if (first)
    return done.then((response) => {
      try {
        const me = app.store.userForToken(token);
        if (response.ok && me) {
          stayQuiet(4000);
          seedExample(app.store, me.id);
        }
      } catch (error) {
        console.warn('Example project was not created', error);
      }
      return response;
    });
  return done;
};

globalThis.EventSource = class {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private stop: () => void;
  constructor(url: string) {
    this.stop = call('GET', url, undefined, (data) => {
      const line = data.match(/^data: (.*)$/m);
      if (line) queueMicrotask(() => this.onmessage?.({ data: line[1] }));
    }).close;
  }
  close() {
    this.stop();
  }
};

let app: ReturnType<typeof createApp>;
(async () => {
  await ready();
  app = createApp({ dbPath: ':memory:', staticDir: null, runtime: claudeRuntime, env: {} });
  await import('../src/main.tsx');
})();
