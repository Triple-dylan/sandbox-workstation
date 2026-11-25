import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ServerResponse } from 'node:http';
import type { BrowserContext, CDPSession, Page } from 'playwright';
import { InputError, type Store } from '../store.ts';
import {
  SEARCH_ENGINES,
  type BrowserBody,
  type Id,
  type SearchEngine,
} from '../../shared/types.ts';
import { addressFor, guardProxy, mayVisit } from './guard.ts';

const WIDTH = 1280;
const HEIGHT = 800;
/** Someone who stops using the controls for this long lets anyone else take over. */
const DRIVER_IDLE_MS = 30_000;

type Tab = { id: string; page: Page };
type Room = {
  resourceId: Id;
  spaceId: Id;
  tabs: Tab[];
  active: string | null;
  viewers: Map<ServerResponse, Id>;
  driver: Id | null;
  driverAt: number;
  pointers: Map<Id, { x: number; y: number; at: number }>;
  frame: string | null;
  cast: CDPSession | null;
  closing: ReturnType<typeof setTimeout> | null;
};
type Workspace = { context: BrowserContext; rooms: Set<Id> };

export type BrowserInput =
  | {
      t: 'move' | 'down' | 'up';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle';
      count?: number;
    }
  | { t: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle'; count?: number }
  | { t: 'wheel'; dx: number; dy: number }
  | { t: 'key'; key: string }
  | { t: 'text'; text: string }
  | { t: 'go'; url: string }
  | { t: 'back' | 'forward' | 'reload' | 'take' | 'release' }
  | { t: 'newTab'; url?: string }
  | { t: 'engine'; engine: SearchEngine }
  | { t: 'closeTab' | 'showTab'; id: string };

/**
 * One real Chrome the whole workspace shares. Each Browser page holds its own tabs; everyone on the
 * page watches the same screen live, sees each other's pointers, and one person drives at a time.
 * Sign-ins are kept per workspace, so they are shared with everyone in it. Every connection goes
 * through a proxy that refuses private addresses, and nothing is downloaded.
 */
export class SharedBrowsers {
  private store: Store;
  private dataDir: string | null;
  private allow: (host: string) => boolean;
  private maxWorkspaces: number;
  private idleMs: number;
  private rooms = new Map<Id, Room>();
  private workspaces = new Map<Id, Promise<Workspace>>();
  private proxy: Promise<{ url: string; close: () => void }> | null = null;
  private launcher: Promise<typeof import('playwright')> | null = null;
  private tabCount = 0;
  private headless: boolean;
  private display: ChildProcess | null = null;

  constructor(
    store: Store,
    options: {
      dataDir: string | null;
      allowHosts?: string[];
      maxWorkspaces?: number;
      idleMs?: number;
      /** Tests only. People use a normal, visible Chrome: many sites refuse headless ones. */
      headless?: boolean;
    },
  ) {
    this.headless = options.headless ?? false;
    this.store = store;
    this.dataDir = options.dataDir;
    const allowed = new Set(options.allowHosts ?? []);
    this.allow = (host) => allowed.has(host);
    this.maxWorkspaces = options.maxWorkspaces ?? 4;
    this.idleMs = options.idleMs ?? 5 * 60_000;
  }

  private async workspace(spaceId: Id): Promise<Workspace> {
    const open = this.workspaces.get(spaceId);
    if (open) return open;
    if (this.workspaces.size >= this.maxWorkspaces)
      throw new InputError(
        'The shared browser is busy in other workspaces. Try again in a few minutes.',
      );
    const starting = (async () => {
      this.launcher ??= import('playwright');
      this.proxy ??= guardProxy(this.allow);
      const [{ chromium }, proxy] = await Promise.all([this.launcher, this.proxy]);
      const options = {
        headless: this.headless,
        env: { ...process.env, ...this.screen() },
        viewport: { width: WIDTH, height: HEIGHT },
        acceptDownloads: false,
        // Every connection, even to this machine, goes through the guard.
        proxy: { server: proxy.url, bypass: '<-loopback>' },
        args: [
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-features=Translate',
          // Visible Chrome, but its window is kept out of sight on a desktop machine.
          '--window-position=-32000,-32000',
          `--window-size=${WIDTH},${HEIGHT + 120}`,
        ],
      };
      let context: BrowserContext;
      if (this.dataDir) {
        // Kept on disk per workspace, so sign-ins survive a restart.
        const dir = join(this.dataDir, spaceId.replace(/[^\w-]/g, ''));
        mkdirSync(dir, { recursive: true });
        context = await chromium.launchPersistentContext(dir, options);
        // It opens with an empty window of its own; tabs belong to Browser pages instead.
        for (const blank of context.pages()) await blank.close().catch(() => {});
      } else {
        const browser = await chromium.launch(options);
        context = await browser.newContext(options);
        context.on('close', () => void browser.close().catch(() => {}));
      }
      // A first, cheap check for addresses that are plainly not allowed (file:, chrome:, localhost).
      await context.route('**/*', async (route) =>
        (await mayVisit(route.request().url(), this.allow))
          ? route.continue()
          : route.abort('blockedbyclient'),
      );
      // A page that opens a new window opens a new tab in the same Browser page.
      context.on('page', async (page) => {
        const from = await page.opener().catch(() => null);
        const opener =
          from && [...this.rooms.values()].find((r) => r.tabs.some((t) => t.page === from));
        if (opener && !opener.tabs.some((t) => t.page === page)) {
          const tab = this.track(opener, page);
          void this.show(opener, tab.id);
        }
      });
      return { context, rooms: new Set<Id>() };
    })();
    this.workspaces.set(spaceId, starting);
    starting.catch(() => this.workspaces.delete(spaceId));
    return starting;
  }

  /**
   * A server has no screen: a virtual one (Xvfb) is started once for the visible Chrome. On a
   * desktop the real screen is used.
   */
  private screen(): Record<string, string> {
    if (this.headless || process.platform !== 'linux' || process.env.DISPLAY) return {};
    if (!this.display) {
      this.display = spawn('Xvfb', [':99', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], {
        stdio: 'ignore',
      });
      this.display.on('error', (error) => console.error('virtual screen failed', error));
    }
    return { DISPLAY: ':99' };
  }

  private track(room: Room, page: Page): Tab {
    const tab = { id: `t${++this.tabCount}`, page };
    room.tabs.push(tab);
    page.on('load', () => void this.remember(room));
    page.on('framenavigated', (frame) => frame === page.mainFrame() && this.state(room));
    page.on('close', () => {
      room.tabs = room.tabs.filter((t) => t !== tab);
      if (room.active === tab.id) void this.show(room, room.tabs.at(-1)?.id ?? null);
      this.state(room);
    });
    return tab;
  }

  /** Opens the page's browser, bringing back the tabs it had. */
  private async room(resourceId: Id): Promise<Room> {
    const existing = this.rooms.get(resourceId);
    if (existing) return existing;
    const resource = this.store.resource(resourceId);
    if (!resource || resource.kind !== 'browser') throw new InputError('Not a browser page.');
    const ws = await this.workspace(resource.spaceId);
    const again = this.rooms.get(resourceId);
    if (again) return again;
    const room: Room = {
      resourceId,
      spaceId: resource.spaceId,
      tabs: [],
      active: null,
      viewers: new Map(),
      driver: null,
      driverAt: 0,
      pointers: new Map(),
      frame: null,
      cast: null,
      closing: null,
    };
    this.rooms.set(resourceId, room);
    ws.rooms.add(resourceId);
    const body = readBrowser(resource.body);
    const urls = body.tabs.length ? body.tabs.map((t) => t.url) : [addressFor('', body.engine)];
    for (const url of urls.slice(0, 8)) {
      const tab = this.track(room, await ws.context.newPage());
      void tab.page.goto(url).catch(() => {});
    }
    await this.show(room, room.tabs[Math.min(body.active, room.tabs.length - 1)]?.id ?? null);
    return room;
  }

  /** Streams the active tab's screen to everyone watching. */
  private async show(room: Room, tabId: string | null) {
    room.active = tabId;
    if (room.cast) {
      const old = room.cast;
      room.cast = null;
      await old.send('Page.stopScreencast').catch(() => {});
      await old.detach().catch(() => {});
    }
    const tab = room.tabs.find((t) => t.id === tabId);
    if (tab) {
      await tab.page.bringToFront().catch(() => {});
      const cast = await tab.page.context().newCDPSession(tab.page);
      room.cast = cast;
      cast.on('Page.screencastFrame', ({ data, sessionId }) => {
        if (room.cast !== cast) return;
        room.frame = data;
        this.send(room, { t: 'frame', data });
        void cast.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await cast.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: WIDTH,
        maxHeight: HEIGHT,
      });
    }
    this.state(room);
    void this.remember(room);
  }

  private send(room: Room, message: unknown) {
    const line = `data: ${JSON.stringify(message)}\n\n`;
    for (const res of room.viewers.keys()) res.write(line);
  }

  private state(room: Room) {
    const now = Date.now();
    if (room.driver && now - room.driverAt > DRIVER_IDLE_MS) room.driver = null;
    this.send(room, {
      t: 'state',
      tabs: room.tabs.map((t) => ({ id: t.id, url: t.page.url() })),
      active: room.active,
      driver: room.driver,
      watching: [...new Set(room.viewers.values())],
    });
    this.pointers(room);
    void this.titles(room);
  }
  /** Where everyone's pointer is on the screen, so the team sees who is pointing at what. */
  private pointers(room: Room) {
    const now = Date.now();
    this.send(room, {
      t: 'pointers',
      pointers: Object.fromEntries([...room.pointers].filter(([, p]) => now - p.at < 15_000)),
    });
  }
  /** Titles need a round trip to each tab; sent as they come. */
  private async titles(room: Room) {
    const titles = await Promise.all(room.tabs.map((t) => t.page.title().catch(() => '')));
    this.send(room, {
      t: 'titles',
      titles: Object.fromEntries(room.tabs.map((t, i) => [t.id, titles[i]])),
    });
  }

  /** The open tabs, and what the active one says, kept on the page for agents and for reopening. */
  private async remember(room: Room) {
    const active = room.tabs.find((t) => t.id === room.active);
    const tabs = await Promise.all(
      room.tabs.map(async (t) => ({
        url: t.page.url(),
        title: await t.page.title().catch(() => ''),
      })),
    );
    const text = active
      ? await active.page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      : '';
    const body: BrowserBody = {
      engine: this.engine(room),
      tabs: tabs.filter((t) => t.url && t.url !== 'about:blank'),
      active: Math.max(
        0,
        room.tabs.findIndex((t) => t.id === room.active),
      ),
      text: String(text)
        .replace(/\n{3,}/g, '\n\n')
        .slice(0, 20_000),
    };
    this.store.setBrowserBody(room.resourceId, body);
    this.state(room);
  }

  /** Someone opens the page: they start watching. */
  async watch(resourceId: Id, userId: Id, res: ServerResponse) {
    const room = await this.room(resourceId);
    if (room.closing) clearTimeout(room.closing);
    room.closing = null;
    room.viewers.set(res, userId);
    if (room.frame) res.write(`data: ${JSON.stringify({ t: 'frame', data: room.frame })}\n\n`);
    this.state(room);
    res.on('close', () => {
      room.viewers.delete(res);
      room.pointers.delete(userId);
      if (room.driver === userId && ![...room.viewers.values()].includes(userId))
        room.driver = null;
      this.state(room);
      // Nobody left watching: the tabs close after a while, and are reopened from the page later.
      if (!room.viewers.size)
        room.closing = setTimeout(() => void this.close(resourceId), this.idleMs);
    });
  }

  async input(resourceId: Id, userId: Id, input: BrowserInput) {
    const room = await this.room(resourceId);
    const now = Date.now();
    if (input.t === 'move')
      room.pointers.set(userId, { x: clamp(input.x), y: clamp(input.y), at: now });
    // Which search engine to use is the page's setting, not driving.
    if (input.t === 'engine') {
      const resource = this.store.resource(room.resourceId);
      if (resource && input.engine in SEARCH_ENGINES)
        this.store.setBrowserBody(room.resourceId, {
          ...readBrowser(resource.body),
          engine: input.engine,
        });
      return;
    }
    const driving = room.driver && room.driver !== userId && now - room.driverAt < DRIVER_IDLE_MS;
    if (input.t === 'release') {
      if (room.driver === userId) room.driver = null;
      return this.state(room);
    }
    if (driving && input.t !== 'take') {
      if (input.t === 'move') return this.pointers(room);
      const who = this.store.user(room.driver!)?.name ?? 'Someone';
      throw new InputError(`${who} is driving. Take control to use it.`);
    }
    const changed = room.driver !== userId;
    room.driver = userId;
    room.driverAt = now;
    const tab = room.tabs.find((t) => t.id === room.active);
    const page = tab?.page;
    const x = 'x' in input ? clamp(input.x) * WIDTH : 0;
    const y = 'y' in input ? clamp(input.y) * HEIGHT : 0;
    switch (input.t) {
      case 'take':
        break;
      case 'move':
        await page?.mouse.move(x, y);
        break;
      case 'down':
        await page?.mouse.move(x, y);
        await page?.mouse.down({ button: input.button ?? 'left', clickCount: count(input.count) });
        break;
      case 'up':
        await page?.mouse.move(x, y);
        await page?.mouse.up({ button: input.button ?? 'left', clickCount: count(input.count) });
        break;
      case 'click':
        await page?.mouse.click(x, y, {
          button: input.button ?? 'left',
          clickCount: Math.min(3, Math.max(1, input.count ?? 1)),
        });
        break;
      case 'wheel':
        await page?.mouse.wheel(clampWheel(input.dx), clampWheel(input.dy));
        break;
      case 'key':
        if (/^[\w+ -]{1,40}$/.test(input.key) || input.key.length === 1)
          await page?.keyboard.press(input.key);
        break;
      case 'text':
        await page?.keyboard.insertText(String(input.text).slice(0, 5000));
        break;
      case 'go':
        await page?.goto(addressFor(input.url, this.engine(room))).catch(() => {});
        break;
      case 'back':
        await page?.goBack().catch(() => {});
        break;
      case 'forward':
        await page?.goForward().catch(() => {});
        break;
      case 'reload':
        await page?.reload().catch(() => {});
        break;
      case 'newTab': {
        if (room.tabs.length >= 8) throw new InputError('Close a tab first; eight is the most.');
        const ws = await this.workspace(room.spaceId);
        const fresh = this.track(room, await ws.context.newPage());
        await this.show(room, fresh.id);
        void fresh.page.goto(addressFor(input.url ?? '', this.engine(room))).catch(() => {});
        break;
      }
      case 'showTab':
        if (room.tabs.some((t) => t.id === input.id)) await this.show(room, input.id);
        break;
      case 'closeTab': {
        const closing = room.tabs.find((t) => t.id === input.id);
        if (closing && room.tabs.length > 1) await closing.page.close();
        break;
      }
    }
    if (changed || input.t !== 'move') this.state(room);
    else this.pointers(room);
  }

  /** The search engine this page uses: Google unless the team chose another. */
  private engine(room: Room): SearchEngine {
    return readBrowser(this.store.resource(room.resourceId)?.body ?? '').engine ?? 'google';
  }

  private async close(resourceId: Id) {
    const room = this.rooms.get(resourceId);
    if (!room || room.viewers.size) return;
    this.rooms.delete(resourceId);
    await room.cast?.detach().catch(() => {});
    await Promise.all(room.tabs.map((t) => t.page.close().catch(() => {})));
    const ws = await this.workspaces.get(room.spaceId)?.catch(() => null);
    if (!ws) return;
    ws.rooms.delete(resourceId);
    if (!ws.rooms.size) {
      this.workspaces.delete(room.spaceId);
      await ws.context.close().catch(() => {});
    }
  }

  async stop() {
    for (const id of [...this.rooms.keys()]) {
      const room = this.rooms.get(id)!;
      for (const res of room.viewers.keys()) res.end();
      room.viewers.clear();
      await this.close(id);
    }
    for (const ws of this.workspaces.values()) await (await ws.catch(() => null))?.context.close();
    this.workspaces.clear();
    (await this.proxy?.catch(() => null))?.close();
    this.display?.kill();
  }
}

const count = (n: number | undefined) => Math.min(3, Math.max(1, Number(n) || 1));
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const clampWheel = (n: number) => (Number.isFinite(n) ? Math.max(-2000, Math.min(2000, n)) : 0);

export function readBrowser(body: string): BrowserBody {
  try {
    const parsed = JSON.parse(body) as Partial<BrowserBody>;
    return {
      tabs: Array.isArray(parsed.tabs)
        ? parsed.tabs
            .filter((t) => t && typeof t.url === 'string')
            .map((t) => ({ url: t.url, title: String(t.title ?? '') }))
        : [],
      active: Number(parsed.active) || 0,
      text: String(parsed.text ?? ''),
      engine: parsed.engine && parsed.engine in SEARCH_ENGINES ? parsed.engine : 'google',
    };
  } catch {
    return { tabs: [], active: 0, text: '' };
  }
}
