import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';
import { SharedBrowsers } from '../server/browser/index.ts';

const closing: (() => unknown)[] = [];
after(async () => {
  for (const close of closing.reverse()) await close();
});

test('shared browser: a tab the browser service closes is announced; one a person closes is not', async (t) => {
  let service: any;
  try {
    const where = '../../browser-service/service.ts';
    const { startService } = await import(where);
    // The service closes pages unused for 3 seconds here (30 minutes in production).
    service = await startService({
      token: 'test-token-that-is-long-enough-345',
      port: 0,
      host: '127.0.0.1',
      allowHosts: ['127.0.0.1'],
      headless: true,
      idleMs: 3000,
      healthMs: 0,
      log: () => {},
    });
  } catch {
    return t.skip('No Chromium here; CI runs the browser service.');
  }
  closing.push(() => service.close());
  const site = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    // Through the browser's proxy the request may name the whole address; the path is what counts.
    const name = new URL(req.url ?? '/', 'http://x').pathname.slice(1);
    res.end(`<title>Quote ${name}</title><p>Hello</p>`);
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  closing.push(() => site.close());
  const url = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
  closing.push(() => app.close());
  const { store } = app;
  const browsers = new SharedBrowsers(store, {
    endpoint: service.endpoint,
    allowHosts: ['127.0.0.1'],
    noticeAfterMs: 0,
  });
  closing.push(() => browsers.stop());
  const priya = store.createHuman('Priya');
  const project = store.createProject(priya.id, 'Northwind');
  const page = store.createResource(priya.id, {
    spaceId: project.id,
    kind: 'browser',
    body: '',
  });
  // A Browser page starts on a search engine; this one had two tabs open last time.
  store.setBrowserBody(page.id, {
    tabs: [
      { url: `${url}/a`, title: '' },
      { url: `${url}/b`, title: '' },
    ],
    active: 0,
    text: '',
  });
  const seen: any[] = [];
  const res = Object.assign(new EventEmitter(), {
    write: (line: string) => seen.push(JSON.parse(line.slice(6))),
    end: () => {},
  });
  await browsers.watch(page.id, priya.id, res as any);
  const until = async (check: () => boolean, what: string | (() => string)) => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(check(), typeof what === 'string' ? what : what());
  };
  // What the page was told, briefly, for when a wait runs out.
  const story = () =>
    seen
      .filter((m) => m.t !== 'frame' && m.t !== 'pointers')
      .map((m) =>
        m.t === 'state'
          ? `state ${m.tabs.map((tab: any) => tab.url).join(' ')}`
          : m.t === 'titles'
            ? `titles ${Object.values(m.titles).join('|')}`
            : `${m.t} ${m.text ?? ''}`,
      )
      .join('; ');
  const titles = () => seen.filter((m) => m.t === 'titles').at(-1)?.titles ?? {};
  await until(
    () => Object.values(titles()).includes('Quote b'),
    () => `both tabs have loaded (seen: ${story()})`,
  );
  const tabs = seen.filter((m) => m.t === 'state').at(-1).tabs;
  assert.equal(tabs.length, 2);

  // Priya closes one herself: no word about it.
  const b = tabs.find((tab: any) => tab.url.endsWith('/b'));
  await browsers.input(page.id, priya.id, { t: 'closeTab', id: b.id });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(seen.filter((m) => m.t === 'notice').length, 0);

  // The service closes the one left once nobody has used it: the page says what happened.
  await until(
    () => seen.some((m) => m.t === 'notice'),
    () => `the closing is announced (seen: ${story()})`,
  );
  const notices = seen.filter((m) => m.t === 'notice');
  assert.equal(notices.length, 1);
  assert.match(
    notices[0].text,
    /^“Quote a” closed\. The shared browser closes tabs nobody has used/,
  );
});
