/**
 * Chrome's own view of every open page, whichever app connection opened it. The service watches
 * this so it can say how many pages are open and close ones nobody has used for a long time: the
 * app closes a workspace's pages five minutes after the last person leaves, and this is the
 * backstop for any page that slips past that (a popup no Browser page took in, say).
 */

/** A browser-wide session on Chrome's DevTools protocol (Playwright's `newBrowserCDPSession`). */
export type BrowserSession = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (params: any) => void): unknown;
};

type TargetInfo = {
  targetId: string;
  type: string;
  url: string;
  title: string;
  browserContextId?: string;
};

type Open = { context: string; url: string; title: string; usedAt: number };

export class PageWatch {
  private session: BrowserSession;
  private idleMs: number;
  private now: () => number;
  private open = new Map<string, Open>();
  /** Pages this service has closed for being idle, since it started. */
  closedIdle = 0;
  /** Pages closed to bring memory back under the limit, since it started. */
  closedForMemory = 0;

  constructor(
    session: BrowserSession,
    options: {
      /** A page whose address and title haven't changed for this long is closed. 0 never closes. */
      idleMs: number;
      now?: () => number;
    },
  ) {
    this.session = session;
    this.idleMs = options.idleMs;
    this.now = options.now ?? Date.now;
  }

  async start() {
    this.session.on('Target.targetCreated', ({ targetInfo }) => this.seen(targetInfo));
    this.session.on('Target.targetInfoChanged', ({ targetInfo }) => this.seen(targetInfo));
    this.session.on('Target.targetDestroyed', ({ targetId }) => this.open.delete(targetId));
    // Chrome answers with a targetCreated for every page already open, then follows changes.
    await this.session.send('Target.setDiscoverTargets', { discover: true });
  }

  private seen(info: TargetInfo) {
    if (info.type !== 'page') return;
    const was = this.open.get(info.targetId);
    // Going somewhere new, or the page changing its own title, counts as being used.
    const used = !was || was.url !== info.url || was.title !== info.title;
    this.open.set(info.targetId, {
      context: info.browserContextId ?? '',
      url: info.url,
      title: info.title,
      usedAt: used ? this.now() : was.usedAt,
    });
  }

  /** Open pages, and the workspaces (browser contexts) they belong to. */
  counts() {
    return {
      pages: this.open.size,
      workspaces: new Set([...this.open.values()].map((p) => p.context)).size,
    };
  }

  /** Closes every page idle for longer than the limit, and says how many it closed. */
  async closeIdle(): Promise<number> {
    if (!this.idleMs) return 0;
    const now = this.now();
    const idle = [...this.open].filter(([, page]) => now - page.usedAt >= this.idleMs);
    const closed = await this.close(idle.map(([id]) => id));
    this.closedIdle += closed;
    return closed;
  }

  /** Closes the page used longest ago, to give memory back. Says whether one was closed. */
  async closeLeastUsed(): Promise<boolean> {
    const oldest = [...this.open].sort(([, a], [, b]) => a.usedAt - b.usedAt)[0];
    const closed = oldest ? await this.close([oldest[0]]) : 0;
    this.closedForMemory += closed;
    return closed > 0;
  }

  private async close(targetIds: string[]) {
    let closed = 0;
    for (const targetId of targetIds) {
      this.open.delete(targetId);
      const ok = await this.session
        .send('Target.closeTarget', { targetId })
        .then(() => true)
        .catch(() => false);
      if (ok) closed++;
    }
    return closed;
  }
}
