import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Hand, Plus, RotateCw, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { Avatar } from '../features/agents/Character.tsx';
import type { Id, Resource } from '../../shared/types.ts';

type Live = {
  tabs: { id: string; url: string }[];
  titles: Record<string, string>;
  active: string | null;
  driver: Id | null;
  watching: Id[];
  pointers: Record<Id, { x: number; y: number }>;
  error: string | null;
};

/** Keys sent as Playwright names, with ⌘ and Ctrl both meaning the browser's own shortcut key. */
function keyName(e: React.KeyboardEvent) {
  const mods = [
    e.metaKey || e.ctrlKey ? 'ControlOrMeta' : '',
    e.altKey ? 'Alt' : '',
    e.shiftKey && e.key.length > 1 ? 'Shift' : '',
  ].filter(Boolean);
  const key = e.key === ' ' ? 'Space' : e.key;
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Dead', 'Unidentified'].includes(key))
    return null;
  return [...mods, key.length === 1 && mods.length ? key.toLowerCase() : key].join('+');
}

/**
 * The workspace's shared browser: a real Chrome on the server that everyone on this page sees
 * live. One person drives at a time; anyone can take over. Teammates' pointers show on the
 * screen. Sign-ins made here belong to the whole workspace.
 */
export function BrowserPage({ page }: { page: Resource }) {
  const { s, user, notify, space } = useWorkspace();
  const [live, setLive] = useState<Live>({
    tabs: [],
    titles: {},
    active: null,
    driver: null,
    watching: [],
    pointers: {},
    error: null,
  });
  const [address, setAddress] = useState<string | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stream = new EventSource(`/api/browser/${page.id}/stream`);
    stream.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'frame') {
        if (image.current) image.current.src = `data:image/jpeg;base64,${m.data}`;
        setReady(true);
      } else if (m.t === 'state')
        setLive((l) => ({
          ...l,
          tabs: m.tabs,
          active: m.active,
          driver: m.driver,
          watching: m.watching,
          error: null,
        }));
      else if (m.t === 'titles') setLive((l) => ({ ...l, titles: m.titles }));
      else if (m.t === 'pointers') setLive((l) => ({ ...l, pointers: m.pointers }));
      else if (m.t === 'error') setLive((l) => ({ ...l, error: m.text }));
    };
    return () => stream.close();
  }, [page.id]);

  const told = useRef(0);
  const send = (input: Record<string, unknown>) =>
    api(`/browser/${page.id}/input`, { body: input }).catch((error: Error) => {
      // Said once in a while, not on every click.
      if (Date.now() - told.current > 4000) {
        told.current = Date.now();
        notify(error.message);
      }
    });

  const someoneElse = live.driver && live.driver !== s.me.id ? user(live.driver) : undefined;
  const at = (e: { clientX: number; clientY: number }) => {
    const r = screen.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const lastMove = useRef(0);
  const scroll = useRef({ dx: 0, dy: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    // Scrolling the page inside, not this one: gathered and sent a few times a second.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = scroll.current;
      w.dx += e.deltaX;
      w.dy += e.deltaY;
      if (w.timer) return;
      w.timer = setTimeout(() => {
        void send({ t: 'wheel', dx: w.dx, dy: w.dy });
        w.dx = 0;
        w.dy = 0;
        w.timer = 0 as unknown as ReturnType<typeof setTimeout>;
      }, 60);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const activeTab = live.tabs.find((t) => t.id === live.active);
  const shownAddress = address ?? activeTab?.url ?? '';
  return (
    <div className="browser-page">
      <div className="browser-tabs" role="tablist" aria-label="Tabs">
        {live.tabs.map((t) => (
          <span
            key={t.id}
            role="tab"
            aria-selected={t.id === live.active}
            className="browser-tab"
            title={t.url}
          >
            <button className="truncate" onClick={() => void send({ t: 'showTab', id: t.id })}>
              {live.titles[t.id] || t.url.replace(/^https?:\/\/(www\.)?/, '') || 'New tab'}
            </button>
            {live.tabs.length > 1 && (
              <button aria-label="Close tab" onClick={() => void send({ t: 'closeTab', id: t.id })}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        <button
          className="browser-new"
          aria-label="New tab"
          title="New tab"
          onClick={() => void send({ t: 'newTab' })}
        >
          <Plus size={13} />
        </button>
      </div>
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (address !== null) void send({ t: 'go', url: address });
          setAddress(null);
          screen.current?.focus();
        }}
      >
        <button type="button" aria-label="Back" onClick={() => void send({ t: 'back' })}>
          <ArrowLeft size={14} />
        </button>
        <button type="button" aria-label="Forward" onClick={() => void send({ t: 'forward' })}>
          <ArrowRight size={14} />
        </button>
        <button type="button" aria-label="Reload" onClick={() => void send({ t: 'reload' })}>
          <RotateCw size={13} />
        </button>
        <input
          value={shownAddress}
          aria-label="Address or search"
          placeholder="Search DuckDuckGo or type an address"
          onFocus={(e) => {
            setAddress(shownAddress);
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => setAddress(null)}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setAddress(null), e.currentTarget.blur())}
        />
        <span className="browser-who">
          {live.watching
            .filter((id) => id !== s.me.id)
            .map((id) => user(id))
            .filter((u) => !!u)
            .map((u) => (
              <span key={u!.id} title={`${u!.name} is here`}>
                <Avatar user={u!} size={20} />
              </span>
            ))}
        </span>
      </form>
      {someoneElse && (
        <p className="browser-driver">
          <Avatar user={someoneElse} size={16} /> {someoneElse.name} is driving.
          <button onClick={() => void send({ t: 'take' })}>
            <Hand size={12} /> Take control
          </button>
        </p>
      )}
      <div className="browser-stage">
        <div
          ref={screen}
          className={`browser-screen ${someoneElse ? 'watching' : ''}`}
          tabIndex={0}
          aria-label={`Shared browser${activeTab ? `: ${activeTab.url}` : ''}`}
          onMouseMove={(e) => {
            if (Date.now() - lastMove.current < 50) return;
            lastMove.current = Date.now();
            void send({ t: 'move', ...at(e) });
          }}
          onMouseDown={(e) => {
            screen.current?.focus();
            e.preventDefault();
            if (!someoneElse)
              void send({
                t: 'down',
                ...at(e),
                button: (['left', 'middle', 'right'] as const)[e.button] ?? 'left',
                count: e.detail,
              });
          }}
          onMouseUp={(e) => {
            if (!someoneElse)
              void send({
                t: 'up',
                ...at(e),
                button: (['left', 'middle', 'right'] as const)[e.button] ?? 'left',
                count: e.detail,
              });
          }}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (someoneElse) return;
            const key = keyName(e);
            // ⌘V pastes from your computer into the page.
            if (!key || key === 'ControlOrMeta+v') return;
            e.preventDefault();
            void send({ t: 'key', key });
          }}
          onPaste={(e) => {
            if (someoneElse) return;
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            if (text) void send({ t: 'text', text });
          }}
        >
          <img ref={image} alt="" draggable={false} />
          {!ready && <p className="browser-wait">{live.error ?? 'Opening the shared browser…'}</p>}
          {Object.entries(live.pointers)
            .filter(([id]) => id !== s.me.id)
            .map(([id, p]) => {
              const u = user(id);
              return (
                <span
                  key={id}
                  className="browser-pointer"
                  style={
                    {
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      '--who': u?.color ?? '#888',
                    } as React.CSSProperties
                  }
                >
                  <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
                    <path d="M1 1l11 9-5 1 3 6-2 1-3-6-4 3z" />
                  </svg>
                  <small>{u?.name ?? 'Someone'}</small>
                </span>
              );
            })}
        </div>
      </div>
      <p className="browser-note">
        Everyone in {space.name} uses this browser. Anything you sign in to here, they can use too.
      </p>
    </div>
  );
}
