import { useEffect, useRef, useState } from 'react';
import { api, onCursor } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Id, Spot } from '../../../shared/types.ts';

type Seen = Exclude<Spot, { kind: 'gone' }> & { at: number };

/** How long a position stays on screen without news. A pointer moves often; a caret sits still. */
const FRESH: Record<string, number> = { point: 5_000, text: 12_000, cell: 12_000, slide: 12_000 };

/**
 * Where teammates are on this page right now, by person. Empty when you have turned
 * teammates' cursors off in Settings.
 */
export function useTeamCursors(resourceId: Id) {
  const { ui } = useWorkspace();
  const show = ui.prefs.seeCursors !== false;
  const [seen, setSeen] = useState<Record<Id, Seen>>({});
  useEffect(() => {
    setSeen({});
    if (!show) return;
    const stop = onCursor((c) => {
      if (c.resourceId !== resourceId) return;
      setSeen((old) => {
        const next = { ...old };
        if (c.kind === 'gone') delete next[c.userId];
        else {
          const { userId: _who, resourceId: _page, ...spot } = c;
          next[c.userId] = { ...(spot as Exclude<Spot, { kind: 'gone' }>), at: Date.now() };
        }
        return next;
      });
    });
    const timer = setInterval(
      () =>
        setSeen((old) => {
          const fresh = Object.fromEntries(
            Object.entries(old).filter(([, c]) => Date.now() - c.at < FRESH[c.kind]),
          );
          return Object.keys(fresh).length === Object.keys(old).length ? old : fresh;
        }),
      1_500,
    );
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [resourceId, show]);
  return seen;
}

/**
 * Tells teammates where you are on this page, a few times a second at most, and says you have
 * gone when you leave it. Sends nothing when you have turned sharing off in Settings.
 */
export function useShareCursor(resourceId: Id) {
  const { ui } = useWorkspace();
  const share = ui.prefs.shareCursor !== false;
  const last = useRef<{ spot: Spot; sent: number } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  const post = (spot: Spot) =>
    void api('/cursor', { body: { resourceId, ...spot } }).catch(() => undefined);
  useEffect(() => {
    if (!share) return;
    // A caret or a chosen cell sits still, so say it again now and then to keep it showing.
    const beat = setInterval(() => {
      const held = last.current;
      if (held && held.spot.kind !== 'point' && document.visibilityState === 'visible')
        post(held.spot);
    }, 4_000);
    return () => {
      clearInterval(beat);
      clearTimeout(pending.current);
      if (last.current) post({ kind: 'gone' });
      last.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, share]);
  return (spot: Spot) => {
    if (!share) return;
    const now = Date.now();
    const wait = 120 - (now - (last.current?.sent ?? 0));
    clearTimeout(pending.current);
    if (wait <= 0) {
      last.current = { spot, sent: now };
      post(spot);
    } else
      pending.current = setTimeout(() => {
        last.current = { spot, sent: Date.now() };
        post(spot);
      }, wait);
  };
}
