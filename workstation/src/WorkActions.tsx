import { useEffect, useRef, useState } from 'react';
import {
  Search,
  FileText,
  Plus,
  Workflow,
  Bookmark,
  RotateCcw,
  Image,
  ListOrdered,
  Pin,
} from 'lucide-react';
import type { Resource } from './model';
export type WorkCommand =
  | 'new-document'
  | 'edit-agent'
  | 'new-agent'
  | 'browser-connection'
  | 'save-layout'
  | 'restore-layout'
  | 'open-plan'
  | 'add-visual'
  | `pin:${string}`
  | `visual:${string}`;
export function WorkActions({
  resources,
  onOpen,
  onCommand,
  onClose,
  canRestore,
  canSave,
  canvasItems,
}: {
  resources: Resource[];
  onOpen: (id: string) => void;
  onCommand: (id: WorkCommand) => void;
  onClose: () => void;
  canRestore: boolean;
  canSave: boolean;
  canvasItems: { id: `pin:${string}` | `visual:${string}`; title: string; detail: string }[];
}) {
  const [query, setQuery] = useState('');
  const host = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      if (
        document.activeElement === document.body ||
        host.current?.contains(document.activeElement)
      )
        trigger?.focus();
    };
  }, []);
  const commands = [
    {
      id: 'open-plan',
      label: 'Open project plan',
      hint: 'Steps, owners and source messages',
      icon: ListOrdered,
    },
    {
      id: 'add-visual',
      label: 'Add visual reference',
      hint: 'Choose an image · or drop and paste on Canvas',
      icon: Image,
    },
    { id: 'new-document', label: 'New document', hint: 'Private · saved locally', icon: Plus },
    {
      id: 'edit-agent',
      label: 'Edit project agent',
      hint: 'Definition and versions',
      icon: Workflow,
    },
    { id: 'new-agent', label: 'New agent', hint: 'Start a private definition', icon: Plus },
    {
      id: 'browser-connection',
      label: 'Browser connection',
      hint: 'Inspect the unavailable browser service',
      icon: Search,
    },
    { id: 'save-layout', label: 'Save arrangement', hint: 'This browser', icon: Bookmark },
    {
      id: 'restore-layout',
      label: 'Restore arrangement',
      hint: 'Saved positions',
      icon: RotateCcw,
    },
  ] as const;
  const matches = resources.filter((r) =>
    `${r.title} ${r.summary}`.toLowerCase().includes(query.toLowerCase()),
  );
  const references = canvasItems.filter((r) =>
    `${r.title} ${r.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  const actions = commands.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) &&
      (c.id !== 'restore-layout' || canRestore) &&
      (c.id !== 'save-layout' || canSave) &&
      (c.id !== 'browser-connection' || query.trim().length > 0),
  );
  return (
    <div
      className="work-actions glass"
      role="dialog"
      aria-label="Open work"
      ref={host}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...host.current!.querySelectorAll<HTMLElement>('[data-command]')];
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next =
            index < 0
              ? e.key === 'ArrowDown'
                ? 0
                : items.length - 1
              : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      <label className="work-search">
        <Search size={16} />
        <input
          ref={search}
          aria-label="Find work or an action"
          placeholder="Find a document or action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>esc</kbd>
      </label>
      <div className="work-results">
        {matches.length > 0 && (
          <>
            <div className="action-group-label">Documents</div>
            {matches.map((r) => (
              <button
                data-command
                key={r.id}
                onClick={() => {
                  onOpen(r.id);
                  onClose();
                }}
              >
                <FileText size={16} />
                <span>
                  {r.title}
                  <small>
                    {r.body !== undefined
                      ? 'Private · local document'
                      : r.folder === 'research'
                        ? 'Workstation / Research'
                        : 'Workstation / Direction'}
                  </small>
                </span>
              </button>
            ))}
          </>
        )}
        {references.length > 0 && (
          <>
            <div className="action-group-label">Canvas references</div>
            {references.map((r) => (
              <button
                data-command
                key={r.id}
                onClick={() => {
                  onCommand(r.id);
                  onClose();
                }}
              >
                {r.id.startsWith('pin:') ? <Pin size={16} /> : <Image size={16} />}
                <span>
                  {r.title}
                  <small>{r.detail}</small>
                </span>
              </button>
            ))}
          </>
        )}
        {actions.length > 0 && (
          <>
            <div className="action-group-label">Actions</div>
            {actions.map((c) => (
              <button
                data-command
                key={c.id}
                onClick={() => {
                  onCommand(c.id);
                  onClose();
                }}
              >
                <c.icon size={16} />
                <span>
                  {c.label}
                  <small>{c.hint}</small>
                </span>
              </button>
            ))}
          </>
        )}
        {!matches.length && !actions.length && !references.length && (
          <p className="no-results">No matching work or actions.</p>
        )}
      </div>
    </div>
  );
}
