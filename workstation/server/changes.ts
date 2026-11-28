import { InputError, type Store } from './store.ts';
import type { MessageInfo, OutsideAgent, PageInfo } from './api.ts';
import { PAGE_KINDS } from '../shared/types.ts';
import type { Id, Message } from '../shared/types.ts';

/**
 * The changes feed: everything new an agent seat can see since its last sync, in order, so an
 * outside agent can keep its own copy of a workspace without reading it all again
 * (`GET /api/v1/changes?cursor=…`).
 *
 * Each change is a new message in a chat it can read (`message.created`), a page it can open
 * that was made or edited (`page.changed`, details only), or a shared page that was deleted or
 * archived (`page.removed`). Every change is checked against the seat's access as it is read, the
 * same as a read would be, and a page edited many times shows once, as it is now.
 *
 * The cursor is opaque: pass back the one the last answer gave. It marks a moment and what was
 * already returned at that moment, so nothing is missed or repeated when several changes share a
 * time. With no cursor the feed starts now; pass `since` (a date and time) to start earlier.
 * `more: true` means there is more to read straight away.
 */

export type Change =
  | { type: 'message.created'; at: string; message: MessageInfo }
  | { type: 'page.changed'; at: string; page: PageInfo }
  | { type: 'page.removed'; at: string; page: { id: Id; spaceId: Id } };

type Cursor = { t: string; ids: Id[] };
type Candidate = { at: string; id: Id; kind: 'message' | 'page'; row: Record<string, any> };

const LIMIT = 100;

function readCursor(raw: string | null | undefined, since: string | null | undefined): Cursor {
  if (raw) {
    try {
      const parsed = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
      if (
        typeof parsed?.t === 'string' &&
        Number.isFinite(Date.parse(parsed.t)) &&
        Array.isArray(parsed.ids) &&
        parsed.ids.every((id: unknown) => typeof id === 'string')
      )
        return { t: new Date(parsed.t).toISOString(), ids: parsed.ids.slice(0, LIMIT * 2) };
    } catch {}
    throw new InputError('That cursor is not one this feed gave. Start again without one.');
  }
  if (since) {
    const at = Date.parse(since);
    if (!Number.isFinite(at))
      throw new InputError('since must be a date and time, like 2026-11-27T20:00:00Z.');
    return { t: new Date(at).toISOString(), ids: [] };
  }
  return { t: new Date().toISOString(), ids: [] };
}
// Ids and times are plain ASCII, so btoa is enough (and runs in the in-page preview too).
const writeCursor = (cursor: Cursor) =>
  btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Changes this seat can see after the cursor, oldest first. */
export function changes(
  store: Store,
  outside: OutsideAgent,
  options: { cursor?: string | null; since?: string | null; limit?: number } = {},
) {
  const from = readCursor(options.cursor, options.since);
  const limit = Math.min(Math.max(Math.floor(Number(options.limit)) || 50, 1), LIMIT);
  const spaces = outside.spaces().map((s) => s.id);
  const dms = outside.dms().map((c) => c.id);
  const seen = new Set(from.ids);
  const all = (sql: string, ...args: any[]) =>
    store.db.prepare(sql).all(...args) as Record<string, any>[];
  const marks = (ids: Id[]) => ids.map(() => '?').join(',') || 'null';

  // Candidates from each source, in order; one extra each tells whether more is waiting.
  const take = limit + seen.size + 1;
  const messages = all(
    `select m.id, m.conversation_id, m.author_id, m.text, m.reply_to, m.addressed_to, m.created_at
     from messages m join conversations c on c.id = m.conversation_id
     where m.created_at >= ? and (c.space_id in (${marks(spaces)}) or c.id in (${marks(dms)}))
     order by m.created_at, m.id limit ?`,
    from.t,
    ...spaces,
    ...dms,
    take,
  ).map((row): Candidate => ({ at: row.created_at, id: row.id, kind: 'message', row }));
  const pages = all(
    `select id, space_id, visibility, deleted, archived, updated_at from resources
     where updated_at >= ? and space_id in (${marks(spaces)}) and kind in (${marks([...PAGE_KINDS])})
     order by updated_at, id limit ?`,
    from.t,
    ...spaces,
    ...PAGE_KINDS,
    take,
  ).map((row): Candidate => ({ at: row.updated_at, id: row.id, kind: 'page', row }));

  const ordered = [...messages, ...pages]
    .filter((c) => !(c.at === from.t && seen.has(c.id)))
    .sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1));
  const batch = ordered.slice(0, limit);
  const more = ordered.length > limit;

  const out: Change[] = [];
  for (const c of batch) {
    if (c.kind === 'message') {
      const r = c.row;
      const message = outside.seeMessage({
        id: r.id,
        conversationId: r.conversation_id,
        authorId: r.author_id,
        text: r.text,
        replyTo: r.reply_to ?? null,
        addressedTo: r.addressed_to ?? null,
        createdAt: r.created_at,
      } as Message);
      if (message) out.push({ type: 'message.created', at: c.at, message });
      continue;
    }
    const gone = !!c.row.deleted || !!c.row.archived;
    const page = gone ? null : outside.seePage(c.id);
    if (page) out.push({ type: 'page.changed', at: c.at, page });
    // Only a page the whole workspace could open is reported gone: a private one never was seen.
    else if (gone && c.row.visibility === 'space')
      out.push({ type: 'page.removed', at: c.at, page: { id: c.id, spaceId: c.row.space_id } });
  }

  const last = batch.at(-1);
  const cursor: Cursor = last
    ? {
        t: last.at,
        ids: [
          ...(last.at === from.t ? from.ids : []),
          ...batch.filter((c) => c.at === last.at).map((c) => c.id),
        ],
      }
    : from;
  return { changes: out, cursor: writeCursor(cursor), more };
}
