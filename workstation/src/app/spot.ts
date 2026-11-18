import { useEffect, useRef, useState } from 'react';
import { useWorkspace, type Spot } from './workspace.tsx';

/**
 * Brings a spot on this page into view when something elsewhere points at it: a quote in a chat, rows
 * shared in a message, a piece of a board. The page decides how to show it; the light fades on its own.
 */
export function useSpot(resourceId: string, show: (spot: Spot) => void) {
  const { ui, setUi } = useWorkspace();
  const latest = useRef(show);
  latest.current = show;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const spot = ui.focus;
    if (!spot || spot.resourceId !== resourceId) return;
    setUi({ focus: null });
    // Let the page lay out first when it has just opened.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(spot), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.focus?.at, resourceId]);
}

/** A value that clears itself after a while: what is lit after a jump. */
export function useFading<T>(ms = 5000) {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (next: T | null) => {
    clearTimeout(timer.current);
    setValue(next);
    if (next !== null) timer.current = setTimeout(() => setValue(null), ms);
  };
  return [value, set] as const;
}
