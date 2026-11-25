import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { useWorkspace } from './workspace.tsx';

/**
 * A dropdown that opens the app's own menu under it, the same menu as "+ New" and right-click,
 * instead of the operating system's. The current choice is ticked.
 */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
  style,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  /** What is being chosen, for screen readers and as the tooltip. */
  label: string;
  style?: CSSProperties;
}) {
  const { menu } = useWorkspace();
  const current = options.find(([v]) => v === value)?.[1] ?? '';
  return (
    <button
      type="button"
      className="choice"
      aria-label={`${label}: ${current}`}
      aria-haspopup="menu"
      title={label}
      style={style}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        menu(
          { clientX: r.left, clientY: r.bottom + 4, preventDefault: () => {} },
          options.map(([v, name]) => ({
            label: name,
            checked: v === value,
            run: () => onChange(v),
          })),
        );
      }}
    >
      <span className="truncate">{current}</span>
      <ChevronDown size={12} aria-hidden="true" />
    </button>
  );
}
