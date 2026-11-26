import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { api } from '../../data/client.ts';

export type CollabDoc = {
  doc: Y.Doc;
  /** This editor fills the empty shared document from the page's saved text. */
  seed: boolean;
  /** That text, as the server has it now. */
  body?: string;
};

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * The page's shared edit history, kept in step with everyone else's. Local changes go out in small
 * batches; theirs come in as they happen. When the page changed some other way (an accepted
 * suggestion), it starts again from the new text.
 */
export function useCollab(pageId: string, enabled: boolean): CollabDoc | null {
  const [state, setState] = useState<CollabDoc | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const client = `c${Math.random().toString(36).slice(2, 12)}`;
    const doc = new Y.Doc();
    let queued: Uint8Array[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (!queued.length) return;
      const update = Y.mergeUpdates(queued);
      queued = [];
      void api(`/collab/${pageId}`, { body: { client, update: toB64(update) } }).catch(() => {
        // Lost on the way: the next change carries the document's full state instead.
        queued.unshift(Y.encodeStateAsUpdate(doc));
      });
    };
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      queued.push(update);
      timer ??= setTimeout(flush, 60);
    });
    const stream = new EventSource(`/api/collab/${pageId}?client=${client}`);
    stream.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'init') {
        Y.applyUpdate(doc, fromB64(m.state), 'remote');
        // Reconnected after a drop: send anything typed meanwhile.
        if (queued.length) flush();
        setState((s) => s ?? { doc, seed: !!m.seed, body: m.body });
      } else if (m.t === 'update') Y.applyUpdate(doc, fromB64(m.update), 'remote');
      else if (m.t === 'reset') setRound((r) => r + 1);
    };
    return () => {
      if (timer) clearTimeout(timer);
      flush();
      stream.close();
      doc.destroy();
      setState(null);
    };
  }, [pageId, enabled, round]);
  return state;
}
