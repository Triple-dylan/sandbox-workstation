import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AccessError, InputError, type ChangeEvent, type Store } from './store.ts';
import { OutsideAgent } from './api.ts';
import { isPrivateAddress, mayVisit } from './browser/guard.ts';
import { isPage } from '../shared/types.ts';
import type { Id } from '../shared/types.ts';

/**
 * Webhooks: an agent seat hears about what happens in its workspaces without asking every minute.
 * The agent registers an https address with its token (`POST /api/v1/webhooks`). Sandbox then
 * POSTs it an event when a message lands in a chat the seat can read (`message.created`, with
 * `toMe` when it was sent to the seat) or someone changes a page it can open (`page.changed`, the
 * page's details only; the agent reads the page for its contents).
 *
 * Every event is checked against the seat's access at the moment it is sent, exactly as a read
 * would be, so a webhook never carries what the seat could not read itself. Its own writes are not
 * sent back to it. A webhook stops when the token that made it is revoked or the seat is retired.
 *
 * Each request is signed: `x-sandbox-signature: sha256=<hex>` is the HMAC-SHA256, keyed with the
 * webhook's secret (shown once, when it is made), of `<x-sandbox-timestamp>.<raw body>`. Receivers
 * should check it and reject old timestamps. Addresses on this machine or a private network are
 * refused, and redirects are not followed, so a webhook cannot be used to look inside the server.
 *
 * Delivery is tried three times over about a minute and kept in memory, so events pending when the
 * server restarts are lost; an agent that must not miss anything also reads `/api/v1/inbox`.
 */

const MAX_PER_SEAT = 5;
/** Edits to a page come in bursts while someone types; one event goes out once it settles. */
const PAGE_SETTLE_MS = 5_000;
const TIMEOUT_MS = 10_000;

export type WebhookInfo = {
  id: Id;
  url: string;
  createdAt: string;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveryAt: string | null;
};
export type WebhookEvent = {
  id: Id;
  type: 'message.created' | 'page.changed';
  at: string;
  agentId: Id;
  data: unknown;
};

type Row = Record<string, any>;
const toInfo = (r: Row): WebhookInfo => ({
  id: r.id,
  url: r.url,
  createdAt: r.created_at,
  lastStatus: r.last_status ?? null,
  lastError: r.last_error ?? null,
  lastDeliveryAt: r.last_delivery_at ?? null,
});
// Must match how seats.ts keeps tokens: only their hash is stored.
const tokenHash = (token: string) => createHash('sha256').update(token).digest('base64url');
const now = () => new Date().toISOString();

export function sign(secret: string, timestamp: string, body: string) {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export class Webhooks {
  private store: Store;
  private allow: (host: string) => boolean;
  private retryMs: number[];
  private settleMs: number;
  private pending = new Set<Promise<void>>();
  private pageTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;
  private unsubscribe: () => unknown;

  constructor(
    store: Store,
    options: { allowHosts?: string[]; retryMs?: number[]; pageSettleMs?: number } = {},
  ) {
    this.store = store;
    const allowed = new Set((options.allowHosts ?? []).map((h) => h.toLowerCase()));
    this.allow = (host) => allowed.has(host);
    this.retryMs = options.retryMs ?? [5_000, 60_000];
    this.settleMs = options.pageSettleMs ?? PAGE_SETTLE_MS;
    store.db.exec(`create table if not exists agent_webhooks (
      id text primary key, agent_id text not null, token_id text not null, url text not null,
      secret text not null, created_at text not null, revoked integer not null default 0,
      last_status integer, last_error text, last_delivery_at text
    )`);
    this.unsubscribe = store.onChange((event) => this.onChange(event));
  }

  private all(sql: string, ...args: any[]) {
    return this.store.db.prepare(sql).all(...args) as Row[];
  }
  private run(sql: string, ...args: any[]) {
    this.store.db.prepare(sql).run(...args);
  }

  /** The seat's webhooks, without their secrets. */
  list(agentId: Id) {
    return this.all(
      'select * from agent_webhooks where agent_id = ? and revoked = 0 order by created_at, rowid',
      agentId,
    ).map(toInfo);
  }

  /** A new webhook for this seat. Its secret is returned once; keep it to check signatures. */
  add(agentId: Id, token: string, rawUrl: unknown) {
    const url = this.checkUrl(rawUrl);
    if (this.list(agentId).length >= MAX_PER_SEAT)
      throw new InputError(`A seat can have at most ${MAX_PER_SEAT} webhooks. Remove one first.`);
    const tokenRow = this.all(
      'select id from agent_tokens where token_hash = ? and agent_id = ? and revoked = 0',
      tokenHash(token),
      agentId,
    )[0];
    if (!tokenRow) throw new AccessError('Use a live agent seat token.');
    const id = randomUUID();
    const secret = 'whsec_' + randomBytes(24).toString('base64url');
    this.run(
      'insert into agent_webhooks (id, agent_id, token_id, url, secret, created_at) values (?, ?, ?, ?, ?, ?)',
      id,
      agentId,
      tokenRow.id,
      url,
      secret,
      now(),
    );
    return { ...toInfo(this.all('select * from agent_webhooks where id = ?', id)[0]), secret };
  }

  remove(agentId: Id, webhookId: Id) {
    const found = this.all(
      'select 1 from agent_webhooks where id = ? and agent_id = ? and revoked = 0',
      webhookId,
      agentId,
    ).length;
    if (!found) throw new AccessError('Not available.');
    this.run('update agent_webhooks set revoked = 1 where id = ?', webhookId);
  }

  private checkUrl(raw: unknown) {
    let url: URL;
    try {
      url = new URL(String(raw ?? ''));
    } catch {
      throw new InputError('Give a full address, like https://example.com/sandbox.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && this.allow(host)))
      throw new InputError('Webhooks go to https addresses.');
    if (
      !this.allow(host) &&
      (isPrivateAddress(host) || host === 'localhost' || host.endsWith('.localhost'))
    )
      throw new InputError('Webhooks go to addresses on the internet, not this network.');
    if (url.username || url.password) throw new InputError('Put no sign-in in the address.');
    if (url.href.length > 2000) throw new InputError('That address is too long.');
    return url.href;
  }

  /** Live webhooks, each with its seat, skipping retired seats and revoked tokens. */
  private live() {
    return this.all(
      `select w.* from agent_webhooks w
       join agent_tokens t on t.id = w.token_id and t.revoked = 0
       join users u on u.id = w.agent_id and u.kind = 'agent' and u.role = 'outside' and u.retired = 0
       where w.revoked = 0`,
    );
  }

  private onChange(event: ChangeEvent) {
    if (this.stopped) return;
    if (event.type === 'message') {
      const message = event.message;
      for (const hook of this.live()) {
        if (hook.agent_id === message.authorId) continue;
        const agent = this.store.user(hook.agent_id);
        const seen = agent && new OutsideAgent(this.store, agent).seeMessage(message);
        if (seen) this.send(hook, 'message.created', { message: seen });
      }
    }
    if (event.type === 'resource' && isPage(event.resource.kind)) {
      const { resource, actorId } = event;
      for (const hook of this.live()) {
        if (hook.agent_id === actorId) continue;
        const key = `${hook.id}:${resource.id}`;
        const waiting = this.pageTimers.get(key);
        if (waiting) clearTimeout(waiting);
        const timer = setTimeout(() => {
          this.pageTimers.delete(key);
          if (this.stopped) return;
          // Checked again when it goes: the page may have been closed to the seat meanwhile.
          const still = this.live().find((h) => h.id === hook.id);
          const agent = still && this.store.user(still.agent_id);
          const seen = agent && new OutsideAgent(this.store, agent).seePage(resource.id);
          if (still && seen) this.send(still, 'page.changed', { page: seen });
        }, this.settleMs);
        timer.unref?.();
        this.pageTimers.set(key, timer);
      }
    }
  }

  private send(hook: Row, type: WebhookEvent['type'], data: unknown) {
    const event: WebhookEvent = { id: randomUUID(), type, at: now(), agentId: hook.agent_id, data };
    const job = this.deliver(hook, event).finally(() => this.pending.delete(job));
    this.pending.add(job);
  }

  private async deliver(hook: Row, event: WebhookEvent) {
    const body = JSON.stringify(event);
    for (let attempt = 0; attempt <= this.retryMs.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryMs[attempt - 1]));
      if (this.stopped) return;
      let status: number | null = null;
      let error: string | null = null;
      if (!(await mayVisit(hook.url, this.allow)))
        error = 'That address is not reachable from here.';
      else
        try {
          const timestamp = String(Math.floor(Date.now() / 1000));
          const res = await fetch(hook.url, {
            method: 'POST',
            redirect: 'manual',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
              'content-type': 'application/json',
              'user-agent': 'Sandbox-Webhooks',
              'x-sandbox-event': event.type,
              'x-sandbox-delivery': event.id,
              'x-sandbox-timestamp': timestamp,
              'x-sandbox-signature': sign(hook.secret, timestamp, body),
            },
            body,
          });
          status = res.status;
          await res.body?.cancel();
          if (status < 200 || status >= 300) error = `Answered ${status}.`;
        } catch (e) {
          error =
            (e as Error).name === 'TimeoutError' ? 'No answer in time.' : 'Could not connect.';
        }
      if (this.stopped) return;
      this.run(
        'update agent_webhooks set last_status = ?, last_error = ?, last_delivery_at = ? where id = ?',
        status,
        error,
        now(),
        hook.id,
      );
      if (!error) return;
    }
  }

  /** Waits for deliveries under way (tests). */
  async idle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  stop() {
    this.stopped = true;
    for (const timer of this.pageTimers.values()) clearTimeout(timer);
    this.pageTimers.clear();
    this.unsubscribe();
  }
}
