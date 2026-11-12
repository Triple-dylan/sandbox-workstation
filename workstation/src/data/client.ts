import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cursor, Snapshot } from '../../shared/types.ts';

/** Teammates' pointers on a canvas arrive live and are never stored. */
const cursorListeners = new Set<(cursor: Cursor) => void>();
export function onCursor(listener: (cursor: Cursor) => void) {
  cursorListeners.add(listener);
  return () => void cursorListeners.delete(listener);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The only place the browser talks to the server. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers:
      init.body === undefined
        ? { 'x-workstation': '1' }
        : { 'content-type': 'application/json', 'x-workstation': '1' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(response.status, (data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

export type Session =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'offline' }
  | { status: 'ready'; snapshot: Snapshot };

/** Live snapshot of everything this person may see. The server pushes a version; we refetch. */
export function useSession() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const running = useRef<Promise<void> | null>(null);
  const queued = useRef<Promise<void> | null>(null);
  const load = useCallback(async () => {
    try {
      const snapshot = await api<Snapshot>('/snapshot');
      setSession({ status: 'ready', snapshot });
    } catch (error) {
      setSession(
        error instanceof ApiError && error.status === 401
          ? { status: 'signed-out' }
          : { status: 'offline' },
      );
    }
  }, []);
  /** Resolves once a snapshot taken after this call is on screen. Calls made meanwhile share one fetch. */
  const refresh = useCallback((): Promise<void> => {
    if (!running.current) {
      running.current = load().finally(() => (running.current = null));
      return running.current;
    }
    queued.current ??= running.current.then(() => {
      queued.current = null;
      running.current = load().finally(() => (running.current = null));
      return running.current;
    });
    return queued.current;
  }, [load]);
  const signedIn = session.status === 'ready';
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!signedIn) return;
    const events = new EventSource('/api/events');
    events.onmessage = () => void refresh();
    events.onerror = () => void refresh();
    events.addEventListener?.('cursor', (event) => {
      try {
        const cursor = JSON.parse((event as MessageEvent).data) as Cursor;
        for (const listener of cursorListeners) listener(cursor);
      } catch {
        // Ignore a malformed pointer.
      }
    });
    // Safety net in case a proxy or sleep silently drops the live connection.
    const poll = setInterval(() => void refresh(), 15_000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.close();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, refresh]);
  return { session, refresh };
}
