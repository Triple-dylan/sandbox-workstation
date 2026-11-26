import type { ServerResponse } from 'node:http';
import * as Y from 'yjs';
import type { ChangeEvent, Store } from './store.ts';
import type { Id } from '../shared/types.ts';

type Room = {
  doc: Y.Doc;
  viewers: Map<ServerResponse, string>;
  /** The one client asked to fill an empty document from the page's text, and until when. */
  seeding: { client: string; until: number } | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

/**
 * Live co-editing of documents. Each document has one shared edit history (a Yjs document) that
 * merges everyone's typing as it happens, so two people in the same paragraph never overwrite
 * each other. The editor still saves the page's Markdown, which agents, search and history read.
 *
 * A change that arrives some other way (an accepted suggestion, a restored version) replaces the
 * shared history; open editors are told to start again from the page's new text.
 */
export class Collab {
  private store: Store;
  private rooms = new Map<Id, Room>();
  /** The Markdown each document's editors last saved, so their own saves are not taken as outside changes. */
  private synced = new Map<Id, string>();

  constructor(store: Store) {
    this.store = store;
    store.onChange((event) => this.onChange(event));
  }

  private room(resourceId: Id): Room {
    let room = this.rooms.get(resourceId);
    if (room) return room;
    const doc = new Y.Doc();
    const saved = this.store.docState(resourceId);
    if (saved) Y.applyUpdate(doc, saved);
    room = { doc, viewers: new Map(), seeding: null, saveTimer: null };
    this.rooms.set(resourceId, room);
    return room;
  }

  private empty(room: Room) {
    return room.doc.getXmlFragment('default').length === 0;
  }

  /** Someone opens the document: they get its history so far, and every change after. */
  watch(resourceId: Id, client: string, res: ServerResponse) {
    const room = this.room(resourceId);
    let seed = false;
    if (this.empty(room) && (!room.seeding || room.seeding.until < Date.now())) {
      room.seeding = { client, until: Date.now() + 10_000 };
      seed = true;
    }
    room.viewers.set(res, client);
    // Whoever fills it gets the page's text as it is now, not their own copy, which may be behind
    // (an accepted suggestion arrives here before it reaches everyone's screen).
    const body = seed ? (this.store.resource(resourceId)?.body ?? '') : undefined;
    res.write(
      `data: ${JSON.stringify({ t: 'init', state: b64(Y.encodeStateAsUpdate(room.doc)), seed, body })}\n\n`,
    );
    res.on('close', () => {
      room.viewers.delete(res);
      if (room.seeding?.client === client) room.seeding = null;
      if (!room.viewers.size) {
        this.save(resourceId, room);
        this.rooms.delete(resourceId);
      }
    });
  }

  /** A client's change: merged into the history and passed to everyone else on the page. */
  update(resourceId: Id, client: string, update: string) {
    const room = this.room(resourceId);
    const bytes = new Uint8Array(Buffer.from(update, 'base64'));
    if (!bytes.length || bytes.length > 2_000_000) return;
    Y.applyUpdate(room.doc, bytes, client);
    if (room.seeding?.client === client) room.seeding = null;
    const line = `data: ${JSON.stringify({ t: 'update', update, client })}\n\n`;
    for (const [res, who] of room.viewers) if (who !== client) res.write(line);
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => this.save(resourceId, room), 1500);
  }

  /** The Markdown the editors just saved: theirs, so not an outside change. */
  noteSaved(resourceId: Id, body: string) {
    this.synced.set(resourceId, body);
  }

  private save(resourceId: Id, room: Room) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = null;
    if (!this.empty(room)) this.store.setDocState(resourceId, Y.encodeStateAsUpdate(room.doc));
  }

  /** A document's text changed without its editors: they start again from the new text. */
  private onChange(event: ChangeEvent) {
    if (event.type !== 'resource' || event.resource.kind !== 'doc') return;
    const id = event.resource.id;
    if (this.synced.get(id) === event.resource.body) return;
    if (!this.store.docState(id) && !this.rooms.has(id)) return;
    this.reset(id);
    this.synced.set(id, event.resource.body);
  }

  reset(resourceId: Id) {
    this.store.setDocState(resourceId, null);
    const room = this.rooms.get(resourceId);
    if (!room) return;
    if (room.saveTimer) clearTimeout(room.saveTimer);
    this.rooms.delete(resourceId);
    for (const res of room.viewers.keys()) res.write(`data: ${JSON.stringify({ t: 'reset' })}\n\n`);
  }

  stop() {
    for (const [id, room] of this.rooms) {
      this.save(id, room);
      for (const res of room.viewers.keys()) res.end();
    }
    this.rooms.clear();
  }
}
