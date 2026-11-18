import { useEffect, useRef, useState } from 'react';
import { AtSign, FileText, Hash, MessageSquareQuote, MoreHorizontal } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Conversation, Id, Message } from '../../../shared/types.ts';

/** Where something from your private conversation went, so it can be shown and taken back. */
export type Shared = { label: string; messageId: Id; conversationId: Id; text: string; at: number };

type Place = {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  preview: { resourceId: Id; quote: string } | { conversationId: Id } | null;
  go: () => Promise<{ conversationId: Id } | null>;
};

/**
 * The places an answer from your agent can be shared, best first. The line it is about comes first
 * when there is one, then the space's main chat, the conversation or page on screen, then people.
 */
export function useSharePlaces(m: Message, about: { resourceId: Id; quote: string } | null) {
  const { s, ui, space, resource, user, columns } = useWorkspace();
  const places: Place[] = [];
  const shown = columns === 1 ? [ui.panes[ui.active]] : ui.panes;
  const discussionOf = async (resourceId: Id) =>
    s.conversations.find((c) => c.kind === 'discussion' && c.resourceId === resourceId) ??
    (await api<Conversation>('/discussions', { body: { resourceId } }));

  const page = about && resource(about.resourceId);
  if (about && page && page.visibility !== 'private') {
    const short = about.quote.length > 34 ? `${about.quote.slice(0, 32).trim()}…` : about.quote;
    places.push({
      key: `line:${page.id}`,
      icon: <MessageSquareQuote size={13} />,
      label: `Comment on “${short}”`,
      detail: `The line it is about · everyone on ${page.title}`,
      preview: about,
      go: async () => ({ conversationId: (await discussionOf(page.id)).id }),
    });
  }
  const main = s.conversations.find(
    (c) => c.kind === 'channel' && c.spaceId === space.id && c.title === 'general',
  );
  const people = s.members
    .filter(
      (x) => x.spaceId === space.id && x.userId !== s.me.id && user(x.userId)?.kind === 'human',
    )
    .map((x) => x.userId);
  if (main)
    places.push({
      key: `chat:${main.id}`,
      icon: <Hash size={13} />,
      label: main.title,
      detail: `Main chat · ${people.length + 1} people`,
      preview: { conversationId: main.id },
      go: async () => ({ conversationId: main.id }),
    });
  for (const t of shown) {
    if (t?.type === 'chat' && t.id !== main?.id) {
      const c = s.conversations.find((x) => x.id === t.id);
      if (!c || c.kind === 'agent-private') continue;
      places.push({
        key: `chat:${c.id}`,
        icon: c.kind === 'dm' ? <AtSign size={13} /> : <Hash size={13} />,
        label:
          c.kind === 'dm'
            ? (user(c.participantIds.find((p) => p !== s.me.id))?.name ?? 'Message')
            : c.title,
        detail: 'Open beside you',
        preview: { conversationId: c.id },
        go: async () => ({ conversationId: c.id }),
      });
    }
    if (t?.type === 'page') {
      const r = resource(t.id);
      if (!r || r.visibility === 'private' || places.some((p) => p.key === `talk:${r.id}`))
        continue;
      places.push({
        key: `talk:${r.id}`,
        icon: <FileText size={13} />,
        label: 'Talk about this page',
        detail: r.title,
        preview: null,
        go: async () => ({ conversationId: (await discussionOf(r.id)).id }),
      });
    }
  }
  for (const id of people.slice(0, 2)) {
    const who = user(id)!;
    places.push({
      key: `dm:${id}`,
      icon: (
        <span className="share-face" style={{ background: who.color ?? 'var(--ink-3)' }}>
          {who.name[0]}
        </span>
      ),
      label: who.name.replace(/ \(example\)$/, ''),
      detail: 'Directly',
      preview: null,
      go: async () => ({
        conversationId: (await api<Conversation>('/dms', { body: { userId: id } })).id,
      }),
    });
  }
  // Sources only you can open stay behind; say so before anything is sent.
  const leftOut = m.sourceIds
    .map((id) => resource(id))
    .filter((r) => r && r.visibility === 'private')
    .map((r) => r!.title);
  return { places, leftOut };
}

export function ShareMenu({
  m,
  text,
  about,
  onShared,
  onClose,
}: {
  m: Message;
  /** What is being shared: the answer, or the part of it you highlighted. */
  text: string;
  about: { resourceId: Id; quote: string } | null;
  onShared: (shared: Shared) => void;
  onClose: () => void;
}) {
  const { setUi, run, pick, notify } = useWorkspace();
  const { places, leftOut } = useSharePlaces(m, about);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const preview = (place: Place | undefined) => setUi({ preview: place?.preview ?? null });
  const share = async (place: Place | 'more') => {
    setUi({ preview: null });
    onClose();
    const where =
      place === 'more'
        ? await new Promise<{ conversationId: Id; label: string } | null>((done) =>
            pick({
              title: 'Share in a conversation',
              chats: true,
              filter: () => false,
              onPick: (t) =>
                done(
                  t.type === 'chat' ? { conversationId: t.id, label: 'the conversation' } : null,
                ),
            }),
          )
        : await run(place.go).then((w) => (w ? { ...w, label: place.label } : null));
    if (!where) return;
    const posted = await run(() =>
      api<Message>('/messages', {
        body: {
          conversationId: where.conversationId,
          text,
          sharedFrom: m.id,
          anchor: place !== 'more' && place.key.startsWith('line:') && about ? about : null,
        },
      }),
    );
    if (!posted) return;
    onShared({
      label:
        place === 'more'
          ? where.label
          : place.key.startsWith('line:')
            ? `a comment on ${place.label.replace(/^Comment on /, '')}`
            : place.label.startsWith('#') || place.key.startsWith('chat:')
              ? `#${place.label.replace(/^#/, '')}`
              : place.label,
      messageId: posted.id,
      conversationId: where.conversationId,
      text,
      at: Date.now(),
    });
    if (leftOut.length) notify(`Shared without ${leftOut.join(', ')}, which only you can open.`);
  };
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    preview(places[0]);
    return () => setUi({ preview: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className="share-menu"
      role="menu"
      aria-label="Share with the team"
      tabIndex={-1}
      ref={box}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') return (e.preventDefault(), setUi({ preview: null }), onClose());
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = (at + (e.key === 'ArrowDown' ? 1 : places.length - 1)) % places.length;
          setAt(next);
          preview(places[next]);
        }
        if (e.key === 'Enter' && places[at]) (e.preventDefault(), void share(places[at]));
        const n = Number(e.key);
        if (n >= 1 && n <= places.length) (e.preventDefault(), void share(places[n - 1]));
      }}
    >
      <p className="share-head">
        <span>Share with the team</span>
        {m.sourceIds.length > 0 && (
          <small>
            keeps {m.sourceIds.length - leftOut.length} source
            {m.sourceIds.length - leftOut.length === 1 ? '' : 's'}
          </small>
        )}
      </p>
      {places.map((place, i) => (
        <button
          key={place.key}
          role="menuitem"
          className={i === at ? 'on' : ''}
          onMouseEnter={() => (setAt(i), preview(place))}
          onClick={() => void share(place)}
        >
          <span className="share-icon">{place.icon}</span>
          <span className="share-text">
            {place.label}
            <small>{place.detail}</small>
          </span>
          <kbd>{i === 0 ? '↵' : i + 1}</kbd>
        </button>
      ))}
      <button role="menuitem" className="share-more" onClick={() => void share('more')}>
        <span className="share-icon">
          <MoreHorizontal size={13} />
        </span>
        <span className="share-text">Somewhere else…</span>
      </button>
      {leftOut.length > 0 && (
        <p className="share-warn">Leaves out {leftOut.join(', ')}, which only you can open.</p>
      )}
    </div>
  );
}
