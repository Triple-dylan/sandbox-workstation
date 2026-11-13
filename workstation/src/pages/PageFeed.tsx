import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessagesSquare } from 'lucide-react';
import { api } from '../data/client.ts';
import { Composer, Feed } from '../features/feed/Feed.tsx';
import { useWorkspace } from '../app/workspace.tsx';
import type { Conversation, Resource } from '../../shared/types.ts';

export function usePageFeed(page: Resource) {
  const { s, run } = useWorkspace();
  const feed = s.conversations.find((c) => c.kind === 'discussion' && c.resourceId === page.id);
  const ensure = async () =>
    feed ?? (await run(() => api<Conversation>('/discussions', { body: { resourceId: page.id } })));
  return { feed, ensure };
}

/** The conversation that belongs to a page, tucked under it: everyone who can open the page sees it. */
export function PageFeed({ page, startOpen = false }: { page: Resource; startOpen?: boolean }) {
  const { s, space, ui, open: openTarget } = useWorkspace();
  const { feed, ensure } = usePageFeed(page);
  const count = feed
    ? s.messages.filter((m) => m.conversationId === feed.id && !m.anchor && !m.replyTo).length
    : 0;
  const [open, setOpen] = useState(startOpen || count > 0);
  // Something new said on the page opens its feed, so it is not missed.
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) setOpen(true);
    seen.current = count;
  }, [count]);
  // A reply drafted by your agent opens the feed so you can see it waiting.
  const drafted = !!ui.drafts[`page:${page.id}`];
  const shown = open || drafted;
  const audience =
    space.kind === 'personal'
      ? 'Notes to yourself about this page'
      : page.visibility === 'space'
        ? 'Say something to everyone on this page'
        : 'Say something to the people you added to this page';
  return (
    <section className={`page-feed ${shown ? 'open' : ''}`} aria-label="On this page">
      <button className="page-feed-head" aria-expanded={shown} onClick={() => setOpen(!shown)}>
        <MessagesSquare size={14} />
        <strong>On this page</strong>
        <small>{count ? `${count} message${count === 1 ? '' : 's'}` : 'Nothing said yet'}</small>
        {shown ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {!shown && (
        <Composer
          conversation={feed}
          ensure={ensure}
          draftKey={`page:${page.id}`}
          placeholder={audience}
          onSent={() => setOpen(true)}
        />
      )}
      {shown && (
        <Feed
          conversation={feed}
          ensure={ensure}
          draftKey={`page:${page.id}`}
          placeholder={audience}
          filter={(m) =>
            !m.anchor && !(m.replyTo && s.messages.find((x) => x.id === m.replyTo)?.anchor)
          }
          empty="Talk about this page here. It stays with the page."
          latest={3}
          onEarlier={feed ? () => openTarget({ type: 'chat', id: feed.id }, true) : undefined}
        />
      )}
    </section>
  );
}
