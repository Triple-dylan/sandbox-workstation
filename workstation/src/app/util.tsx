import {
  FileText,
  Folder,
  Hash,
  Image as ImageIcon,
  LayoutDashboard,
  Presentation,
  Sheet,
  StickyNote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  Conversation,
  DeckBody,
  Resource,
  ResourceKind,
  SheetBody,
  Snapshot,
  User,
} from '../../shared/types.ts';

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 50) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const kindName: Record<string, string> = {
  doc: 'Document',
  sheet: 'Sheet',
  deck: 'Deck',
  canvas: 'Canvas',
  folder: 'Folder',
};

export function KindIcon({ kind, size = 14 }: { kind: ResourceKind | 'channel'; size?: number }) {
  if (kind === 'sheet') return <Sheet size={size} aria-hidden="true" />;
  if (kind === 'deck') return <Presentation size={size} aria-hidden="true" />;
  if (kind === 'canvas') return <LayoutDashboard size={size} aria-hidden="true" />;
  if (kind === 'folder') return <Folder size={size} aria-hidden="true" />;
  if (kind === 'channel') return <Hash size={size} aria-hidden="true" />;
  if (kind === 'image') return <ImageIcon size={size} aria-hidden="true" />;
  if (kind === 'sticky' || kind === 'note') return <StickyNote size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

export function sheetRows(body: string): string[][] {
  try {
    const rows = (JSON.parse(body) as SheetBody).rows;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
export function deckSlides(body: string): DeckBody['slides'] {
  try {
    const slides = (JSON.parse(body) as DeckBody).slides;
    return Array.isArray(slides) && slides.length ? slides : [{ title: '', body: '' }];
  } catch {
    return [{ title: '', body: '' }];
  }
}

/** A page's content in a sentence or two, for cards and previews. */
export function excerpt(r: Resource, length = 160) {
  if (r.kind === 'sheet') {
    const rows = sheetRows(r.body);
    return `${rows.length} rows · ${rows[0]?.filter(Boolean).join(', ') ?? ''}`.slice(0, length);
  }
  if (r.kind === 'deck') {
    const slides = deckSlides(r.body);
    return `${slides.length} slide${slides.length === 1 ? '' : 's'} · ${slides[0].title}`.slice(
      0,
      length,
    );
  }
  if (r.kind === 'canvas') return 'Canvas';
  return r.body
    .replace(/^#.*$/m, '')
    .replace(/[#*_`>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

export function Md({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/** What a conversation is called from where this person sits. */
export function chatTitle(c: Conversation, s: Snapshot) {
  if (c.kind === 'channel') return c.title;
  const other = c.participantIds
    .filter((id) => id !== s.me.id)
    .map((id) => s.users.find((u) => u.id === id))
    .find(Boolean) as User | undefined;
  if (c.kind === 'dm' || c.kind === 'agent-private') return other?.name ?? 'Conversation';
  return c.title;
}

export function unreadIn(c: Conversation, s: Snapshot) {
  const last = s.lastRead[c.id] ?? '';
  return s.messages.filter(
    (m) => m.conversationId === c.id && m.authorId !== s.me.id && m.createdAt > last,
  ).length;
}

export { scopeOf } from './scope.ts';
