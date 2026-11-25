import { useEffect, type RefObject } from 'react';

/**
 * Closes a dropdown or panel when the person presses anywhere outside it (or presses Escape).
 * `inside` is what counts as part of it: the panel and the button that opens it.
 */
export function useClickAway(
  open: boolean,
  close: () => void,
  ...inside: RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!inside.some((r) => r.current?.contains(target))) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc);
    };
  });
}
