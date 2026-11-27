import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The browser service is its own package (browser-service/); its files are loaded by path so the
// app's typecheck stays out of it, as tests/browser.test.ts does.
const service = (file: string) => import(`../../browser-service/${file}`);

const closing: (() => unknown)[] = [];
after(async () => {
  for (const close of closing) await close();
});

/** Chrome's protocol, as far as the page watch uses it. */
function fakeChrome() {
  const listeners = new Map<string, ((params: any) => void)[]>();
  const sent: { method: string; params?: any }[] = [];
  const emit = (event: string, params: unknown) =>
    (listeners.get(event) ?? []).forEach((l) => l(params));
  return {
    sent,
    emit,
    session: {
      on(event: string, listener: (params: any) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
      async send(method: string, params?: any) {
        sent.push({ method, params });
        if (method === 'Target.closeTarget') emit('Target.targetDestroyed', params);
        return {};
      },
    },
  };
}

const page = (targetId: string, url: string, context = 'w1', title = '') => ({
  targetInfo: { targetId, type: 'page', url, title, browserContextId: context },
});

test('browser service: pages nobody uses are closed after the idle time, used ones stay', async () => {
  const { PageWatch } = await service('pages.ts');
  const chrome = fakeChrome();
  let now = 0;
  const watch = new PageWatch(chrome.session, { idleMs: 30 * 60_000, now: () => now });
  await watch.start();
  assert.deepEqual(chrome.sent[0], {
    method: 'Target.setDiscoverTargets',
    params: { discover: true },
  });

  chrome.emit('Target.targetCreated', page('a', 'https://a.example/'));
  chrome.emit('Target.targetCreated', page('b', 'https://b.example/'));
  chrome.emit('Target.targetCreated', page('c', 'https://c.example/', 'w2'));
  // Not pages: never counted or closed.
  chrome.emit('Target.targetCreated', {
    targetInfo: { targetId: 'sw', type: 'service_worker', url: 'https://a.example/sw.js' },
  });
  assert.deepEqual(watch.counts(), { pages: 3, workspaces: 2 });

  now = 20 * 60_000;
  // Someone goes somewhere new in b, and c's page changes its own title: both were used.
  chrome.emit('Target.targetInfoChanged', page('b', 'https://b.example/pricing'));
  chrome.emit('Target.targetInfoChanged', page('c', 'https://c.example/', 'w2', '(1) Inbox'));
  // Chrome saying the same thing again isn't use.
  chrome.emit('Target.targetInfoChanged', page('a', 'https://a.example/'));
  assert.equal(await watch.closeIdle(), 0, 'nothing is idle for 30 minutes yet');

  now = 31 * 60_000;
  assert.equal(await watch.closeIdle(), 1);
  assert.deepEqual(
    chrome.sent.filter((s) => s.method === 'Target.closeTarget').map((s) => s.params.targetId),
    ['a'],
  );
  assert.deepEqual(watch.counts(), { pages: 2, workspaces: 2 });

  now = 51 * 60_000;
  assert.equal(await watch.closeIdle(), 2);
  assert.deepEqual(watch.counts(), { pages: 0, workspaces: 0 });
  assert.equal(watch.closedIdle, 3);

  // 0 turns closing off.
  const off = new PageWatch(fakeChrome().session, { idleMs: 0, now: () => now });
  assert.equal(await off.closeIdle(), 0);
});

test('browser service: under memory pressure, the page used longest ago closes first', async () => {
  const { PageWatch } = await service('pages.ts');
  const { fullness, healthLine } = await service('health.ts');
  const chrome = fakeChrome();
  let now = 0;
  const watch = new PageWatch(chrome.session, { idleMs: 0, now: () => now });
  await watch.start();
  chrome.emit('Target.targetCreated', page('a', 'https://a.example/'));
  now = 1;
  chrome.emit('Target.targetCreated', page('b', 'https://b.example/'));
  now = 2;
  chrome.emit('Target.targetCreated', page('c', 'https://c.example/'));
  now = 3;
  chrome.emit('Target.targetInfoChanged', page('a', 'https://a.example/next'));
  assert.equal(await watch.closeLeastUsed(), true);
  assert.equal(await watch.closeLeastUsed(), true);
  assert.deepEqual(
    chrome.sent.filter((s) => s.method === 'Target.closeTarget').map((s) => s.params.targetId),
    ['b', 'c'],
    'a was used most recently, so it stays',
  );
  assert.equal(watch.closedForMemory, 2);
  assert.equal(await watch.closeLeastUsed(), true);
  assert.equal(await watch.closeLeastUsed(), false, 'nothing left to close');
  assert.equal(watch.closedForMemory, 3);

  const MB = 1024 * 1024;
  assert.equal(fullness({ used: 1700 * MB, limit: 2000 * MB, chrome: null, node: 0 }), 0.85);
  assert.equal(fullness({ used: 1700 * MB, limit: null, chrome: null, node: 0 }), null);
  assert.equal(fullness({ used: null, limit: 2000 * MB, chrome: null, node: 0 }), null);
  assert.equal(
    healthLine(
      { used: null, limit: null, chrome: null, node: 40 * MB },
      { pages: 0, workspaces: 0 },
      0,
      2,
    ),
    'health: service 40 MB, 0 pages open in 0 workspaces, 0 idle pages closed, 2 pages closed to free memory',
  );
});

test('browser service: the health line reads memory from Linux and counts open pages', async () => {
  const { readMemory, healthLine } = await service('health.ts');
  const root = mkdtempSync(join(tmpdir(), 'browser-health-'));
  closing.push(() => rmSync(root, { recursive: true, force: true }));
  const MB = 1024 * 1024;
  // A made-up /proc: Chrome (10) with a renderer (11) that has a helper (12); 20 is unrelated.
  const proc = join(root, 'proc');
  const stat = (pid: number, name: string, parent: number, mb: number) => {
    mkdirSync(join(proc, String(pid)), { recursive: true });
    // pid (comm) state ppid, then the fixed fields; resident pages is the 24th field.
    const fields = ['S', String(parent), ...Array(19).fill('0'), String((mb * MB) / 4096)];
    writeFileSync(join(proc, String(pid), 'stat'), `${pid} (${name}) ${fields.join(' ')} 0 0\n`);
  };
  stat(10, 'chrome', 1, 200);
  stat(11, 'chrome (renderer)', 10, 300);
  stat(12, 'chrome helper', 11, 50);
  stat(20, 'node', 1, 80);
  mkdirSync(join(proc, 'self'));
  const cgroup = join(root, 'cgroup');
  mkdirSync(cgroup);
  writeFileSync(join(cgroup, 'memory.current'), `${900 * MB}\n`);
  writeFileSync(join(cgroup, 'memory.max'), `${2048 * MB}\n`);

  const memory = readMemory({ chromePid: 10, proc, cgroup });
  assert.equal(memory.used, 900 * MB);
  assert.equal(memory.limit, 2048 * MB);
  assert.equal(memory.chrome, 550 * MB, 'Chrome and everything under it, nothing else');
  assert.ok(memory.node > 0);

  const line = healthLine({ ...memory, node: 60 * MB }, { pages: 5, workspaces: 2 }, 3);
  assert.equal(
    line,
    'health: memory 900 MB of 2048 MB, Chrome 550 MB, service 60 MB, 5 pages open in 2 workspaces, 3 idle pages closed',
  );

  // No limit, cgroup v1, and a machine without either: left out, never guessed.
  writeFileSync(join(cgroup, 'memory.max'), 'max\n');
  assert.equal(readMemory({ proc, cgroup }).limit, null);
  const v1 = join(root, 'v1');
  mkdirSync(join(v1, 'memory'), { recursive: true });
  writeFileSync(join(v1, 'memory', 'memory.usage_in_bytes'), `${700 * MB}`);
  writeFileSync(join(v1, 'memory', 'memory.limit_in_bytes'), '9223372036854771712');
  assert.deepEqual(
    { ...readMemory({ proc, cgroup: v1 }), node: 0 },
    { used: 700 * MB, limit: null, chrome: null, node: 0 },
  );
  const none = readMemory({ chromePid: 99, proc: join(root, 'nothing'), cgroup: join(root, 'x') });
  assert.equal(
    healthLine({ ...none, node: 40 * MB }, { pages: 1, workspaces: 1 }, 1),
    'health: service 40 MB, 1 page open in 1 workspace, 1 idle page closed',
  );
});

test('browser service: its front door lets through only the secret address and the health check', async () => {
  const { startFront } = await service('front.ts');
  const { createServer } = await import('node:http');
  const token = 'test-token-that-is-long-enough-789';
  // Stands in for Playwright's server: it would answer /json with the secret, as Playwright does.
  const seen: string[] = [];
  const inside = createServer((req, res) => {
    seen.push(req.url ?? '');
    res.end(JSON.stringify({ wsEndpointPath: `/${token}` }));
  });
  inside.on('upgrade', (req, socket) => {
    seen.push(`upgrade ${req.url} host=${req.headers.host}`);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    socket.on('data', (d) => socket.write(d));
  });
  await new Promise<void>((r) => inside.listen(0, '127.0.0.1', r));
  closing.push(() => inside.close());
  const target = { host: '127.0.0.1', port: (inside.address() as any).port };
  let ok = true;
  const front = await startFront({
    token,
    host: '127.0.0.1',
    port: 0,
    target,
    health: () => ({ ok, pages: 3 }),
  });
  closing.push(() => front.close());
  const base = `http://127.0.0.1:${front.port}`;
  assert.equal(front.endpoint, `ws://127.0.0.1:${front.port}/${token}`);

  for (const path of ['/json', '/', `/${token}`, '/healthz/x']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), new RegExp(token), `${path} never shows the secret`);
  }
  assert.deepEqual(seen, [], 'nothing but the secret address reaches Playwright');
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, pages: 3 });
  ok = false;
  assert.equal((await fetch(`${base}/healthz`)).status, 503, 'Chrome gone: unhealthy');

  const { connect } = await import('node:net');
  const upgrade = (path: string) =>
    new Promise<string>((resolve) => {
      const socket = connect(front.port, '127.0.0.1', () =>
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: browser.railway.internal:3000\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
        ),
      );
      let got = '';
      socket.on('data', (d) => {
        got += d;
        if (got.includes('\r\n\r\n') && !got.includes('ping')) socket.write('ping');
        if (got.includes('ping') || got.startsWith('HTTP/1.1 404')) {
          socket.destroy();
          resolve(got);
        }
      });
      socket.on('close', () => resolve(got));
    });
  assert.match(await upgrade('/not-the-token'), /^HTTP\/1\.1 404/);
  assert.match(await upgrade(`/${token.slice(0, -1)}`), /^HTTP\/1\.1 404/);
  assert.deepEqual(seen, []);
  const through = await upgrade(`/${token}`);
  assert.match(through, /^HTTP\/1\.1 101/);
  assert.match(through, /ping/, 'the connection carries data both ways');
  assert.deepEqual(seen, [`upgrade /${token} host=127.0.0.1:${target.port}`]);
});

test('browser service: sees pages the app opens, logs its health and closes idle pages', async (t) => {
  let started: any;
  const lines: string[] = [];
  try {
    const { startService } = await service('service.ts');
    started = await startService({
      token: 'test-token-that-is-long-enough-456',
      port: 0,
      host: '127.0.0.1',
      headless: true,
      idleMs: 1500,
      healthMs: 200,
      log: (line: string) => lines.push(line),
    });
  } catch {
    return t.skip('No Chromium here; CI runs the browser service.');
  }
  closing.push(() => started.close());
  const { chromium } = await import('playwright-core');
  // The app, as it connects in production: its own connection, a context per workspace.
  const app = await chromium.connect(started.endpoint);
  closing.push(() => app.close());
  const context = await app.newContext();
  await context.newPage();
  await context.newPage();
  const until = async (check: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(check(), what);
  };
  await until(() => started.pages.counts().pages === 2, 'the service sees the app’s two pages');
  await until(
    () => lines.some((l) => /2 pages open in 1 workspace/.test(l)),
    'the health line counts them',
  );
  assert.match(started.health(), /^health: .*service \d+ MB/);
  // Only the secret address and the health check answer; Playwright's /json stays out of reach.
  const http = `http://127.0.0.1:${started.port}`;
  assert.equal((await fetch(`${http}/json`)).status, 404);
  const healthz = await (await fetch(`${http}/healthz`)).json();
  assert.equal(healthz.ok, true);
  assert.equal(typeof healthz.pages, 'number');
  assert.equal(typeof healthz.memory.node, 'number');
  await until(() => context.pages().length === 0, 'idle pages are closed, and the app is told');
  assert.equal(started.pages.closedIdle, 2);
  assert.ok(lines.some((l) => /^Closed 2 pages nobody had used/.test(l)));
});

test('browser service: past the memory limit it closes pages one at a time', async (t) => {
  let started: any;
  const lines: string[] = [];
  const MB = 1024 * 1024;
  const used = 1000 * MB;
  // Memory falls back under the limit as soon as a page closes, as it does once Chrome lets go.
  let pressure = () => used;
  try {
    const { startService } = await service('service.ts');
    started = await startService({
      token: 'test-token-that-is-long-enough-012',
      port: 0,
      host: '127.0.0.1',
      headless: true,
      idleMs: 0,
      healthMs: 0,
      checkMs: 100,
      memory: () => ({ used: pressure(), limit: 2000 * MB, chrome: null, node: 0 }),
      log: (line: string) => lines.push(line),
    });
  } catch {
    return t.skip('No Chromium here; CI runs the browser service.');
  }
  closing.push(() => started.close());
  const { chromium } = await import('playwright-core');
  const app = await chromium.connect(started.endpoint);
  closing.push(() => app.close());
  const context = await app.newContext();
  const first = await context.newPage();
  await new Promise((r) => setTimeout(r, 50));
  const second = await context.newPage();
  const until = async (check: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(check(), what);
  };
  await until(() => started.pages.counts().pages === 2, 'both pages seen');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(context.pages().length, 2, 'under the limit, nothing closes');
  pressure = () => (first.isClosed() ? 1000 : 1900) * MB;
  await until(() => first.isClosed(), 'the page used longest ago closes first');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(second.isClosed(), false, 'back under the limit, the rest stay');
  assert.ok(
    lines.some((l) => /^Memory at 95% of the limit: closed the page used longest ago/.test(l)),
  );
});
