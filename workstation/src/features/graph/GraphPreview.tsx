import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Columns2, ExternalLink, MessageSquare, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../../app/workspace.tsx';
import { KindIcon, Md, ago, deckSlides, kindName } from '../../app/util.tsx';
import { api } from '../../data/client.ts';
import { readSheet, shownRows } from '../../../shared/sheet.ts';
import { toNumber } from '../../../shared/formula.ts';
import type { Resource } from '../../../shared/types.ts';

const WIDTH_KEY = 'sw-graph-preview-width';
const savedWidth = () => {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= 320 && n <= 900 ? n : 440;
  } catch {
    return 440;
  }
};

/** What a page holds, shown as it reads: formatted text, a table, slides, what is on a board. */
function Contents({ page }: { page: Resource }) {
  const { s, resource } = useWorkspace();
  if (page.kind === 'doc')
    return page.body.trim() ? (
      <div className="page-read">
        <Md text={page.body} />
      </div>
    ) : (
      <p className="preview-empty">Nothing written yet.</p>
    );
  if (page.kind === 'sheet') {
    const sheet = readSheet(page.body);
    const rows = shownRows(sheet).filter((r) => r.some((c) => c.trim()));
    if (!rows.length) return <p className="preview-empty">An empty sheet.</p>;
    const width = Math.max(...rows.map((r) => r.length));
    return (
      <div className="preview-sheet">
        <table>
          <tbody>
            {rows.slice(0, 40).map((row, r) => (
              <tr key={r} className={r === 0 ? 'head' : ''}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className={toNumber(row[c] ?? '') !== null && r > 0 ? 'num' : ''}>
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 40 && <p className="preview-more">{rows.length - 40} more rows</p>}
      </div>
    );
  }
  if (page.kind === 'deck')
    return (
      <ol className="preview-slides">
        {deckSlides(page.body).map((slide, i) => (
          <li key={i}>
            <span className="preview-slide-n">{i + 1}</span>
            <div className="preview-slide">
              <strong>{slide.title || 'Untitled slide'}</strong>
              {slide.body && <Md text={slide.body} />}
            </div>
          </li>
        ))}
      </ol>
    );
  if (page.kind === 'canvas') {
    const pieces = s.resources.filter((r) => r.parentId === page.id && !r.archived);
    if (!pieces.length) return <p className="preview-empty">Nothing on this board yet.</p>;
    return (
      <ul className="preview-pieces">
        {pieces.slice(0, 30).map((p) => {
          const target =
            p.kind === 'embed' ? resource((JSON.parse(p.body || '{}') as any).resourceId) : null;
          return (
            <li key={p.id}>
              <KindIcon kind={target?.kind ?? p.kind} size={13} />
              <span className="truncate">
                {target?.title ?? (p.kind === 'note' ? p.body.slice(0, 90) : p.title)}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (page.kind === 'asset' && page.body.startsWith('data:image'))
    return <img className="preview-image" src={page.body} alt={page.title} />;
  if (page.kind === 'browser') {
    try {
      const b = JSON.parse(page.body) as {
        tabs: { url: string; title: string }[];
        active: number;
        text?: string;
      };
      const open = b.tabs[b.active];
      return (
        <div className="page-read">
          {open && (
            <p className="preview-url">
              <ExternalLink size={12} /> {open.title || open.url}
            </p>
          )}
          <p className="preview-text">{(b.text ?? '').slice(0, 4000) || 'Nothing open yet.'}</p>
        </div>
      );
    } catch {
      return <p className="preview-empty">Nothing open yet.</p>;
    }
  }
  return page.body.trim() ? (
    <div className="page-read">
      <Md text={page.body} />
    </div>
  ) : (
    <p className="preview-empty">Empty so far.</p>
  );
}

/**
 * The page chosen on the graph, shown beside it so you can read it without leaving. The graph
 * keeps its place; Open takes you to the page, Open beside keeps both.
 */
export function GraphPreview({ page, onClose }: { page: Resource; onClose: () => void }) {
  const { s, space, user, open, run, setUi } = useWorkspace();
  const [width, setWidth] = useState(savedWidth);
  const body = useRef<HTMLDivElement>(null);
  // A different page starts at its top.
  useEffect(() => body.current?.scrollTo({ top: 0 }), [page.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest?.(
        'input, textarea, [contenteditable="true"]',
      );
      if (e.key === 'Escape' && !typing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const resize = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = e.clientX;
    const from = width;
    let now = from;
    const move = (m: PointerEvent) => {
      now = Math.max(320, Math.min(900, from + start - m.clientX));
      setWidth(now);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(WIDTH_KEY, String(now));
      } catch {
        // Only a convenience.
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const feed = s.conversations.find((c) => c.kind === 'discussion' && c.resourceId === page.id);
  const talk = feed ? s.messages.filter((m) => m.conversationId === feed.id).length : 0;
  const shared =
    page.visibility === 'private' || space.kind === 'personal'
      ? 'Only you'
      : `Shared with ${space.name}`;
  return (
    <aside className="graph-preview" style={{ width }} aria-label={`Preview: ${page.title}`}>
      <span
        className="graph-preview-edge"
        role="separator"
        aria-label="Resize the preview"
        onPointerDown={resize}
      />
      <header>
        <KindIcon kind={page.kind} size={16} />
        <h2 className="truncate">{page.title}</h2>
        <button aria-label="Close the preview" title="Close (Esc)" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <p className="graph-preview-meta">
        {kindName[page.kind]} · {shared} · {user(page.updatedBy)?.name ?? 'someone'},{' '}
        {ago(page.updatedAt)}
        {page.source ? ` · from ${page.source.name}` : ''}
      </p>
      <div className="graph-preview-body" ref={body}>
        <Contents page={page} />
      </div>
      <footer>
        <button className="primary" onClick={() => open({ type: 'page', id: page.id })}>
          <ArrowUpRight size={13} /> Go to page
        </button>
        <button
          title="The page opens in a second panel; the graph stays on the left"
          onClick={() => open({ type: 'page', id: page.id }, true)}
        >
          <Columns2 size={13} /> Show next to the graph
        </button>
        <button
          onClick={() =>
            setUi({
              railOpen: true,
              railText: `About ${page.title}: `,
              barExtras: [page.id],
            })
          }
        >
          <Sparkles size={13} /> Ask about it
        </button>
        {talk > 0 && (
          <button onClick={() => open({ type: 'chat', id: feed!.id }, true)}>
            <MessageSquare size={13} /> {talk} said
          </button>
        )}
        {page.archived && (
          <button
            onClick={() =>
              void run(() =>
                api(`/resources/${page.id}`, { method: 'PATCH', body: { archived: false } }),
              )
            }
          >
            Bring back
          </button>
        )}
      </footer>
    </aside>
  );
}
