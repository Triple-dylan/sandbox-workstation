import { useEffect, useState } from 'react';

/** Per-person conveniences kept in this browser: saved graph views and saved questions. */
export type GraphFilter = {
  kind: 'all' | 'doc' | 'sheet' | 'deck' | 'canvas';
  mine: boolean;
  recent: boolean;
};
export type Saved = { views: { name: string; filter: GraphFilter }[]; questions: string[] };

const key = (spaceId: string) => `sw-saved-${spaceId}`;
const EVENT = 'sw-saved';

export function readSaved(spaceId: string): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(key(spaceId)) ?? '{}');
    return {
      views: Array.isArray(saved.views) ? saved.views : [],
      questions: Array.isArray(saved.questions) ? saved.questions : [],
    };
  } catch {
    return { views: [], questions: [] };
  }
}
export function writeSaved(spaceId: string, change: (saved: Saved) => Saved) {
  try {
    localStorage.setItem(key(spaceId), JSON.stringify(change(readSaved(spaceId))));
  } catch {
    // Saved views are a convenience; the graph works without them.
  }
  window.dispatchEvent(new Event(EVENT));
}
export function useSaved(spaceId: string) {
  const [saved, setSaved] = useState(() => readSaved(spaceId));
  useEffect(() => {
    const sync = () => setSaved(readSaved(spaceId));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [spaceId]);
  return saved;
}

/** When this person last looked at a space, for "since I was last here". */
export function lastVisit(spaceId: string) {
  try {
    return localStorage.getItem(`sw-visit-${spaceId}`) ?? '';
  } catch {
    return '';
  }
}
export function markVisit(spaceId: string) {
  try {
    localStorage.setItem(`sw-visit-${spaceId}`, new Date().toISOString());
  } catch {
    // Without it, "since I was last here" falls back to the last week.
  }
}

/** Which pages this person has looked at since they last changed, so the list can mark the rest. */
const SEEN = 'sw-seen-v1';
function readSeen(): { base: string; pages: Record<string, string> } {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN) ?? 'null');
    if (saved && typeof saved.base === 'string')
      return { base: saved.base, pages: saved.pages ?? {} };
  } catch {
    // Start fresh below.
  }
  const fresh = { base: new Date().toISOString(), pages: {} };
  try {
    localStorage.setItem(SEEN, JSON.stringify(fresh));
  } catch {
    // Without it nothing is marked as changed.
  }
  return fresh;
}
export function seenAt(pageId: string) {
  const seen = readSeen();
  return seen.pages[pageId] ?? seen.base;
}
export function markSeen(pageId: string) {
  const seen = readSeen();
  seen.pages[pageId] = new Date().toISOString();
  try {
    localStorage.setItem(SEEN, JSON.stringify(seen));
  } catch {
    // A convenience only.
  }
}
