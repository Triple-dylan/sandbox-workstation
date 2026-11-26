import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { isPrivateAddress, mayVisit } from '../server/browser/guard.ts';
import { addressFor } from '../server/browser/address.ts';

const closing: (() => unknown)[] = [];
after(async () => {
  for (const close of closing) await close();
});

test('shared browser: private addresses are refused, and the address bar searches the chosen engine', async () => {
  for (const a of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.0.9',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
  ])
    assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['93.184.216.34', '2606:4700::1111']) assert.equal(isPrivateAddress(a), false, a);
  assert.equal(await mayVisit('file:///etc/passwd'), false);
  assert.equal(await mayVisit('chrome://settings'), false);
  assert.equal(await mayVisit('http://localhost:4174/api/snapshot'), false);
  assert.equal(await mayVisit('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(await mayVisit('data:text/html,hi'), true);
  assert.equal(addressFor(''), 'https://www.google.com/');
  assert.equal(
    addressFor('q1 travel budget'),
    'https://www.google.com/search?q=q1%20travel%20budget',
  );
  assert.equal(
    addressFor('q1 travel budget', 'duckduckgo'),
    'https://duckduckgo.com/?q=q1%20travel%20budget',
  );
  assert.equal(addressFor('example.com/pricing'), 'https://example.com/pricing');
  assert.equal(addressFor('https://a.b/c'), 'https://a.b/c');
  assert.equal(
    addressFor('https://www.google.com/ navan pricing'),
    'https://www.google.com/search?q=https%3A%2F%2Fwww.google.com%2F%20navan%20pricing',
    'words with spaces are a search, never a broken address',
  );

  // The proxy every connection goes through refuses this machine, by name or number.
  const inside = createServer((_req, res) => res.end('secret'));
  await new Promise<void>((r) => inside.listen(0, '127.0.0.1', r));
  closing.push(() => inside.close());
  const guard = '../../browser-service/guard.ts';
  const { guardProxy } = await import(guard);
  const proxy = await guardProxy();
  closing.push(proxy.close);
  const port = (inside.address() as AddressInfo).port;
  const through = (path: string) =>
    new Promise<number>((resolve) => {
      const p = new URL(proxy.url);
      request({ host: p.hostname, port: p.port, path, method: 'GET' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).end();
    });
  assert.equal(await through(`http://127.0.0.1:${port}/`), 403);
  assert.equal(await through(`http://localhost:${port}/`), 403);
});

/**
 * A browser service for the test, like the one on its own server in production. Only where a
 * Chromium is installed (CI); a person's own machine never needs one.
 */
async function browserService() {
  try {
    // The service is its own package (browser-service/), installed only where it runs: CI or Railway.
    const where = '../../browser-service/service.ts';
    const { startService } = await import(where);
    const service = await startService({
      token: 'test-token-that-is-long-enough-123',
      port: 0,
      host: '127.0.0.1',
      allowHosts: ['127.0.0.1'],
      headless: true,
    });
    closing.push(() => service.close());
    return service.endpoint;
  } catch {
    return null;
  }
}

test('shared browser: the team watches one real Chrome, one drives, and agents can read the open tab', async (t) => {
  const endpoint = await browserService();
  if (!endpoint) return t.skip('No Chromium here; CI runs the browser service.');
  const site = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<title>Vendor quote</title><h1>Travel quote</h1><p>Flights and hotel: $2,100</p><input id="q" autofocus>',
    );
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  closing.push(() => site.close());
  const url = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
  const app = createApp({
    dbPath: ':memory:',
    staticDir: null,
    runtime: scriptedRuntime,
    browserHosts: ['127.0.0.1'],
    browserService: endpoint,
  });
  closing.push(() => app.close());
  const { store } = app;
  const priya = store.createHuman('Priya');
  const sam = store.createHuman('Sam');
  const project = store.createProject(priya.id, 'Northwind');
  store.addMember(priya.id, project.id, sam.id);
  const page = store.createResource(priya.id, { spaceId: project.id, kind: 'browser', body: '' });
  assert.equal(page.title, 'Browser');
  assert.match(page.body, /google\.com/, 'opens on Google unless the team picks another');

  // Two people watching: each gets the same frames and state.
  const viewer = () => {
    const seen: any[] = [];
    const res = Object.assign(new EventEmitter(), {
      write: (line: string) => seen.push(JSON.parse(line.slice(6))),
      end: () => {},
    });
    return { res, seen };
  };
  const a = viewer();
  const b = viewer();
  await app.browsers.watch(page.id, priya.id, a.res as any);
  await app.browsers.watch(page.id, sam.id, b.res as any);

  await app.browsers.input(page.id, priya.id, { t: 'go', url });
  const until = async (check: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(check(), what);
  };
  await until(
    () => /\$2,100/.test(store.resource(page.id)!.body),
    'the open tab is kept for agents',
  );
  await until(() => b.seen.some((m) => m.t === 'frame'), 'the other person sees the screen');
  const state = b.seen.filter((m) => m.t === 'state').at(-1);
  assert.equal(state.driver, priya.id);
  assert.deepEqual(state.watching.sort(), [priya.id, sam.id].sort());

  // One driver at a time: Sam is told, until he takes control.
  await assert.rejects(
    app.browsers.input(page.id, sam.id, { t: 'key', key: 'a' }),
    /Priya is driving/,
  );
  await app.browsers.input(page.id, sam.id, { t: 'take' });
  for (const key of ['h', 'i']) await app.browsers.input(page.id, sam.id, { t: 'key', key });
  await app.browsers.input(page.id, sam.id, { t: 'move', x: 0.5, y: 0.5 });
  await until(
    () => a.seen.some((m) => m.t === 'pointers' && m.pointers[sam.id]?.x === 0.5),
    'Priya sees where Sam points',
  );

  // Private addresses stay out of reach, whatever is typed.
  await app.browsers.input(page.id, sam.id, { t: 'go', url: 'http://169.254.169.254/' });
  await new Promise((r) => setTimeout(r, 300));
  assert.doesNotMatch(store.resource(page.id)!.body, /169\.254/);

  const blocked = store.resource(page.id)!.body;
  assert.match(blocked, /chrome-error/, 'the blocked address shows an error instead');

  // A body sent from outside never changes what a browser page says it shows.
  const http = await new Promise<string>((resolve) =>
    app.server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`),
    ),
  );
  const join = await fetch(`${http}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-workstation': '1' },
    body: JSON.stringify({ userId: priya.id }),
  });
  const cookie = join.headers.get('set-cookie')!.split(';')[0];
  await fetch(`${http}/api/resources/${page.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-workstation': '1', cookie },
    body: JSON.stringify({
      title: 'Research',
      body: JSON.stringify({ tabs: [], active: 0, text: 'fake' }),
    }),
  });
  assert.equal(store.resource(page.id)!.title, 'Research');
  assert.equal(store.resource(page.id)!.body, blocked);
});
