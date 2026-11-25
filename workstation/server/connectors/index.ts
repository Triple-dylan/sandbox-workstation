import { randomBytes } from 'node:crypto';
import { AccessError, InputError, type Store } from '../store.ts';
import { MAX_COLS, MAX_ROWS, readSheet, settleFormulas } from '../../shared/sheet.ts';
import type { Id, SheetLink } from '../../shared/types.ts';
import { excelOnline, googleSheets, type Edit, type Provider } from './providers.ts';

export type ConnectorInfo = {
  id: Provider['id'];
  name: string;
  ready: boolean;
  account: string | null;
};

/**
 * Sheets linked to Excel or Google Sheets. A linked sheet is a normal page here: people edit it,
 * agents read it and propose changes. Edits go out to the original as they are made, and the
 * original's changes come in when the page is opened and every couple of minutes.
 */
export class Connectors {
  readonly providers: Provider[];
  private pending = new Map<Id, { edits: Edit[]; timer: ReturnType<typeof setTimeout> }>();
  private states = new Map<string, { userId: Id; provider: Provider['id']; at: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private store: Store;

  constructor(store: Store, env: NodeJS.ProcessEnv, providers?: Provider[]) {
    this.store = store;
    this.providers = providers ?? [googleSheets(env), excelOnline(env)];
    store.syncOut = (id, edits) => this.queue(id, edits);
    if (this.providers.some((p) => p.ready))
      this.timer = setInterval(() => void this.pullAll(), 120_000);
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    for (const p of this.pending.values()) clearTimeout(p.timer);
  }

  info(userId: Id): ConnectorInfo[] {
    const mine = this.store.connectionsOf(userId);
    return this.providers.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      account: mine.find((c) => c.provider === p.id)?.account ?? null,
    }));
  }
  provider(id: string) {
    const p = this.providers.find((x) => x.id === id);
    if (!p) throw new InputError('Unknown connector.');
    if (!p.ready) throw new InputError(`${p.name} is not set up on this server yet.`);
    return p;
  }

  /** Where to send someone to sign in, and the one-time state that brings them back. */
  start(userId: Id, providerId: string, redirect: string) {
    const p = this.provider(providerId);
    const state = randomBytes(16).toString('hex');
    this.states.set(state, { userId, provider: p.id, at: Date.now() });
    for (const [k, v] of this.states) if (Date.now() - v.at > 600_000) this.states.delete(k);
    return p.authUrl(state, redirect);
  }
  async finish(userId: Id, providerId: string, code: string, state: string, redirect: string) {
    const started = this.states.get(state);
    this.states.delete(state);
    if (!started || started.userId !== userId || started.provider !== providerId)
      throw new AccessError('That sign-in link has expired. Try connecting again.');
    const p = this.provider(providerId);
    this.store.saveConnection(userId, p.id, await p.exchange(code, redirect));
  }
  disconnect(userId: Id, providerId: string) {
    this.store.dropConnection(userId, providerId);
  }

  private async token(userId: Id, p: Provider) {
    const c = this.store.connection(userId, p.id);
    if (!c) throw new InputError(`Connect ${p.name} first.`);
    if (c.expiresAt - 60_000 > Date.now()) return c.access;
    if (!c.refresh) throw new InputError(`Your ${p.name} sign-in has ended. Connect it again.`);
    const fresh = await p.refresh(c.refresh);
    this.store.saveConnection(userId, p.id, fresh);
    return fresh.access;
  }

  /** Links a spreadsheet into a space: one sheet page per tab, up to ten. */
  async link(
    userId: Id,
    input: { spaceId: Id; url: string; parentId?: Id | null; visibility?: 'space' | 'private' },
  ) {
    const url = input.url.trim();
    const p = this.providers.find((x) => x.owns(url));
    if (!p)
      throw new InputError('Paste a link to a Google Sheet or an Excel workbook in OneDrive.');
    if (!p.ready) throw new InputError(`${p.name} is not set up on this server yet.`);
    const token = await this.token(userId, p);
    const book = await p.open(token, url);
    const made: { id: Id; title: string }[] = [];
    for (const tab of book.tabs.slice(0, 10)) {
      const { formulas, values } = await p.read(token, book.fileId, tab);
      const link: SheetLink = {
        provider: p.id,
        fileId: book.fileId,
        tab,
        url: book.url,
        linkedBy: userId,
        syncedAt: new Date().toISOString(),
        error: null,
      };
      const page = this.store.createResource(userId, {
        spaceId: input.spaceId,
        parentId: input.parentId ?? null,
        visibility: input.visibility ?? 'space',
        kind: 'sheet',
        title: book.tabs.length > 1 ? `${book.title} · ${tab}` : book.title,
        body: JSON.stringify({ rows: fit(settleFormulas(formulas, values)), freeze: 1 }),
        source: { name: book.title, type: p.name },
      });
      this.store.replaceLinkedSheet(page.id, null, link);
      made.push({ id: page.id, title: page.title });
    }
    return made;
  }

  /** Brings a linked sheet up to date from the original. */
  async pull(resourceId: Id) {
    if (this.pending.has(resourceId)) return;
    const page = this.store.resource(resourceId);
    const link = page && readSheet(page.body).link;
    if (!link) return;
    const p = this.providers.find((x) => x.id === link.provider);
    if (!p?.ready) return;
    try {
      const token = await this.token(link.linkedBy, p);
      const { formulas, values } = await p.read(token, link.fileId, link.tab);
      if (this.pending.has(resourceId)) return;
      this.store.replaceLinkedSheet(resourceId, fit(settleFormulas(formulas, values)), {
        ...link,
        syncedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      this.store.replaceLinkedSheet(resourceId, null, { ...link, error: explain(error, p) });
    }
  }
  private async pullAll() {
    for (const id of this.store.linkedSheets().slice(0, 50)) await this.pull(id);
  }

  /** Edits made here go out to the original, gathered for half a second. */
  private queue(resourceId: Id, edits: Edit[]) {
    const page = this.store.resource(resourceId);
    if (!page || !readSheet(page.body).link) return;
    const waiting = this.pending.get(resourceId);
    if (waiting) clearTimeout(waiting.timer);
    const all = [...(waiting?.edits ?? []), ...edits];
    this.pending.set(resourceId, {
      edits: all,
      timer: setTimeout(() => void this.push(resourceId), 500),
    });
  }
  private async push(resourceId: Id) {
    const waiting = this.pending.get(resourceId);
    const page = this.store.resource(resourceId);
    const link = page && readSheet(page.body).link;
    if (!waiting || !link) return void this.pending.delete(resourceId);
    const p = this.providers.find((x) => x.id === link.provider);
    // The last edit to a cell wins.
    const last = new Map(waiting.edits.map((e) => [`${e.row}:${e.col}`, e]));
    try {
      if (!p?.ready) throw new Error(`${link.provider} is not set up on this server.`);
      await p.write(await this.token(link.linkedBy, p), link.fileId, link.tab, [...last.values()]);
      this.pending.delete(resourceId);
      this.store.replaceLinkedSheet(resourceId, null, {
        ...link,
        syncedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      this.pending.delete(resourceId);
      this.store.replaceLinkedSheet(resourceId, null, {
        ...link,
        error: `Changes here did not reach ${p?.name ?? 'the original'}: ${explain(error, p)}`,
      });
    }
  }
  /** For tests: waits for edits on their way out. */
  async flush() {
    for (const [id, w] of [...this.pending]) {
      clearTimeout(w.timer);
      await this.push(id);
    }
  }
}

const fit = (rows: string[][]) =>
  rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => c.slice(0, 2000)));
const explain = (error: unknown, p: Provider | undefined) => {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'signed-out'
    ? `The ${p?.name ?? ''} sign-in of whoever linked it has ended. They can connect it again.`
    : message;
};
