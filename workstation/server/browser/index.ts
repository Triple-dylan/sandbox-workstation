import type { ServerResponse } from 'node:http';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright-core';
import { InputError, type Store } from '../store.ts';
import {
  SEARCH_ENGINES,
  type BrowserBody,
  type Id,
  type SearchEngine,
} from '../../shared/types.ts';
import { mayVisit } from './guard.ts';
import { addressFor } from './address.ts';

const WIDTH = 1280;
const HEIGHT = 800;
/** Someone who stops using the controls for this long lets anyone else take over. */
const DRIVER_IDLE_MS = 30_000;

type Tab = { id: string; page: Page; title: string; openedAt: number };
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
  private endpoint: string | null;
  private allow: (host: string) => boolean;
  private maxWorkspaces: number;
  private idleMs: number;
  private noticeAfterMs: number;
  /** Tabs closed from here (by a person, or the Browser page closing) need no word. */
  private closedHere = new WeakSet<Page>();
  private rooms = new Map<Id, Room>();
  private workspaces = new Map<Id, Promise<Workspace>>();
  private remote: Promise<Browser> | null = null;
  private tabCount = 0;

  constructor(
    store: Store,
    options: {
      /**
       * The browser service's address (BROWSER_SERVICE_URL). Chrome runs there, on its own
       * server, never on the machine running this app. Unset, Browser pages say it is not set up.
       */
      endpoint: string | null;
      allowHosts?: string[];
      maxWorkspaces?: number;
      idleMs?: number;
      /** A tab open at least this long that closes by itself is announced (shorter: a popup). */
      noticeAfterMs?: number;
    },
  ) {
    this.store = store;
    this.endpoint = options.endpoint;
    const allowed = new Set(options.allowHosts ?? []);
    this.allow = (host) => allowed.has(host);
    this.maxWorkspaces = options.maxWorkspaces ?? 4;
    this.idleMs = options.idleMs ?? 5 * 60_000;
    this.noticeAfterMs = options.noticeAfterMs ?? 60_000;
  }

  /** The connection to the browser service, made once and remade if it drops. */
  private browser(): Promise<Browser> {
    if (!this.endpoint)
      throw new InputError(
        'The shared browser is not set up on this server yet: it needs the browser service (BROWSER_SERVICE_URL).',
      );
    this.remote ??= import('playwright-core').then(async ({ chromium }) => {
      const browser = await chromium.connect(this.endpoint!, { timeout: 15_000 });
      browser.on('disconnected', () => {
        this.remote = null;
        for (const id of [...this.rooms.keys()]) this.dropRoom(id);
        this.workspaces.clear();
      });
      return browser;
    });
    this.remote.catch(() => (this.remote = null));
    return this.remote.catch((error) => {
      throw new InputError(
        `Couldn't reach the shared browser service: ${(error as Error).message.split('\n')[0]}`,
      );
    });
  }

  private async workspace(spaceId: Id): Promise<Workspace> {
    const open = this.workspaces.get(spaceId);
    if (open) return open;
    if (this.workspaces.size >= this.maxWorkspaces)
      throw new InputError(
        'The shared browser is busy in other workspaces. Try again in a few minutes.',
      );
    const starting = (async () => {
      const browser = await this.browser();
      // Sign-ins are kept in this app's database per workspace, and brought back each time.
      const saved = this.store.browserState(spaceId);
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: HEIGHT },
        acceptDownloads: false,
        ...(saved ? { storageState: JSON.parse(saved) } : {}),
      });
      // A first, cheap check for addresses that are plainly not allowed (file:, chrome:, localhost).
      // The service's own proxy checks every connection again where Chrome runs.
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

  /** Keeps the workspace's sign-ins, so they survive the browser closing. */
  private async saveSignIns(spaceId: Id) {
    const ws = await this.workspaces.get(spaceId)?.catch(() => null);
    if (!ws) return;
    const state = await ws.context.storageState().catch(() => null);
    if (state) this.store.setBrowserState(spaceId, JSON.stringify(state));
  }

  private dropRoom(resourceId: Id) {
    const room = this.rooms.get(resourceId);
    if (!room) return;
    this.rooms.delete(resourceId);
    room.frame = null;
    this.send(room, { t: 'error', text: 'The shared browser restarted. Reopen the page.' });
  }

  private track(room: Room, page: Page): Tab {
    const tab: Tab = { id: `t${++this.tabCount}`, page, title: '', openedAt: Date.now() };
    room.tabs.push(tab);
    page.on('load', () => void this.remember(room));
    page.on('framenavigated', (frame) => frame === page.mainFrame() && this.state(room));
    page.on('close', () => {
      room.tabs = room.tabs.filter((t) => t !== tab);
      // Nobody here closed it: the browser service did (unused for a while, or memory running low).
      // A popup that closes itself soon after opening, as sign-in windows do, needs no word.
      if (!this.closedHere.has(page) && Date.now() - tab.openedAt >= this.noticeAfterMs)
        this.send(room, {
          t: 'notice',
          text: `${tab.title ? `“${tab.title}”` : 'A tab'} closed. The shared browser closes tabs nobody has used for a while, and the oldest when it runs low on memory.`,
        });
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
    const tabs = room.tabs;
    const titles = await Promise.all(tabs.map((t) => t.page.title().catch(() => '')));
    tabs.forEach((t, i) => (t.title = titles[i] || t.title));
    this.send(room, {
      t: 'titles',
      titles: Object.fromEntries(tabs.map((t, i) => [t.id, titles[i]])),
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
    void this.saveSignIns(room.spaceId);
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
        if (closing && room.tabs.length > 1) {
          this.closedHere.add(closing.page);
          await closing.page.close();
        }
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
    for (const t of room.tabs) this.closedHere.add(t.page);
    await Promise.all(room.tabs.map((t) => t.page.close().catch(() => {})));
    const ws = await this.workspaces.get(room.spaceId)?.catch(() => null);
    if (!ws) return;
    ws.rooms.delete(resourceId);
    if (!ws.rooms.size) {
      await this.saveSignIns(room.spaceId);
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
    // Only the connection is closed: the browser service keeps running for other apps' restarts.
    const browser = await this.remote?.catch(() => null);
    this.remote = null;
    await browser?.close().catch(() => {});
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
