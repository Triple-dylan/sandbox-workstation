import type { GridviewApi } from 'dockview';

// Gridview provides pointer resizing. Add the keyboard and ARIA contract to
// those same splitters, rather than introducing a second set of layout handles.
export function accessibleSplitters(host: HTMLElement, api: GridviewApi) {
  const listeners = new Map<HTMLElement, (e: KeyboardEvent) => void>();
  const update = () => {
    for (const sash of host.querySelectorAll<HTMLElement>('.dv-sash.dv-enabled')) {
      const rect = sash.getBoundingClientRect();
      const horizontal = rect.width > rect.height;
      const panes = [...host.querySelectorAll<HTMLElement>('[data-pane]')];
      const before = panes
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return horizontal
            ? Math.abs(r.bottom - rect.top) < 20 && r.x < rect.right && r.right > rect.x
            : Math.abs(r.right - rect.left) < 20 && r.y < rect.bottom && r.bottom > rect.y;
        })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(),
            rb = b.getBoundingClientRect();
          return horizontal ? rb.width - ra.width : rb.height - ra.height;
        })[0];
      if (!before) continue;
      const size = horizontal
        ? before.getBoundingClientRect().height
        : before.getBoundingClientRect().width;
      sash.tabIndex = 0;
      sash.setAttribute('role', 'separator');
      sash.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
      sash.setAttribute(
        'aria-label',
        horizontal ? 'Resize panes vertically' : 'Resize panes horizontally',
      );
      sash.setAttribute('aria-valuenow', String(Math.round(size)));
      sash.setAttribute('aria-valuemin', horizontal ? '184' : '300');
      if (!listeners.has(sash)) {
        const handler = (e: KeyboardEvent) => {
          const r = sash.getBoundingClientRect(),
            isHorizontal = r.width > r.height;
          const decrement = isHorizontal ? 'ArrowUp' : 'ArrowLeft',
            increment = isHorizontal ? 'ArrowDown' : 'ArrowRight';
          if (![decrement, increment, 'Home'].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          const candidates = [...host.querySelectorAll<HTMLElement>('[data-pane]')];
          const el = candidates.find((el) => {
            const b = el.getBoundingClientRect();
            return isHorizontal
              ? Math.abs(b.bottom - r.top) < 20 && b.x < r.right && b.right > r.x
              : Math.abs(b.right - r.left) < 20 && b.y < r.bottom && b.bottom > r.y;
          });
          const panel = el && api.getPanel(el.dataset.pane!);
          if (!panel) return;
          const step = (e.shiftKey ? 40 : 16) * (e.key === decrement ? -1 : 1);
          if (isHorizontal)
            panel.api.setSize({ height: e.key === 'Home' ? 184 : panel.height + step });
          else panel.api.setSize({ width: e.key === 'Home' ? 300 : panel.width + step });
          update();
        };
        sash.addEventListener('keydown', handler);
        listeners.set(sash, handler);
      }
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(host, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  update();
  return () => {
    observer.disconnect();
    for (const [el, handler] of listeners) el.removeEventListener('keydown', handler);
  };
}
