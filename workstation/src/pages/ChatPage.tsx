import { Plus, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, ago, chatTitle } from '../app/util.tsx';
import { DRAG, atWork, pagesNamed } from '../app/scope.ts';
import { Feed } from '../features/feed/Feed.tsx';
import type { Conversation, Id, Resource } from '../../shared/types.ts';

/**
 * A conversation as a page. The pages it works from are pinned along the top with what is happening
 * on each, and the pages people have brought up follow them. Your own agent is on the right.
 */
export function ChatPage({ chat }: { chat: Conversation }) {
  const { s, resource, open, pick, run, space, user } = useWorkspace();
  const name = chatTitle(chat, s);
  const channel = chat.kind === 'channel';
  const about = chat.kind === 'discussion' ? resource(chat.resourceId) : undefined;
  const pinned = chat.pinnedIds.map((id) => resource(id)).filter((r): r is Resource => !!r);
  const pin = (resourceId: string, on: boolean) =>
    void run(() => api(`/conversations/${chat.id}/pins`, { body: { resourceId, on } }));
  const messages = s.messages.filter((m) => m.conversationId === chat.id);
  // Pages this conversation has touched: shown live in a message, cited by an agent, or named.
  const touched = new Map<Id, string>();
  for (const m of messages) {
    for (const id of [m.embed?.resourceId, m.anchor?.resourceId, ...m.sourceIds])
      if (id) touched.set(id, m.createdAt);
    for (const p of pagesNamed(s, chat.spaceId, m.text)) touched.set(p.id, m.createdAt);
  }
  const brought = [...touched]
    .map(([id, at]) => ({ page: resource(id), at }))
    .filter(
      (x): x is { page: Resource; at: string } =>
        !!x.page && !chat.pinnedIds.includes(x.page.id) && x.page.id !== about?.id,
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
  // What is happening on a pinned page right now, in a few words.
  const status = (p: Resource) => {
    const working = atWork(s, { resourceId: p.id })[0];
    if (working) return `${working.name} is working on it`;
    const there = s.presence.find((x) => x.online && x.resourceId === p.id && x.userId !== s.me.id);
    if (there) return `${user(there.userId)?.name ?? 'Someone'} is in it now`;
    const by = user(p.updatedBy);
    return `${by && by.id !== s.me.id ? `${by.name.replace(/ \(example\)$/, '')} edited` : 'Edited'} ${ago(p.updatedAt)}`;
  };
  const pinRow = (channel || about) && (
    <div
      className="chat-pins"
      aria-label={channel ? 'Pages this channel works from' : 'What this is about'}
      onDragOver={(e) => channel && [...e.dataTransfer.types].includes(DRAG) && e.preventDefault()}
      onDrop={(e) => {
        try {
          const t = JSON.parse(e.dataTransfer.getData(DRAG));
          if (t.type !== 'page') return;
          e.preventDefault();
          pin(t.id, true);
        } catch {
          // Not something from the list.
        }
      }}
    >
      {[...(about ? [about] : []), ...pinned].map((p) => (
        <span key={p.id} className="chat-pin">
          <button onClick={() => open({ type: 'page', id: p.id }, true)} title="Open beside">
            <strong>
              <KindIcon kind={p.kind} size={13} /> <span className="truncate">{p.title}</span>
            </strong>
            <small className="truncate">{status(p)}</small>
          </button>
          {channel && (
            <button
              className="chat-pin-x"
              aria-label={`Unpin ${p.title}`}
              title="Unpin"
              onClick={() => pin(p.id, false)}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {channel && (
        <button
          className="chat-pin add"
          title="Pin a page this channel works from. You can also drag one here from the list."
          onClick={() =>
            pick({
              title: `Pin a page to #${name}`,
              filter: (r) =>
                r.visibility === 'space' &&
                r.spaceId === space.id &&
                !chat.pinnedIds.includes(r.id),
              onPick: (t) => t.type === 'page' && pin(t.id, true),
            })
          }
        >
          <Plus size={13} /> Pin a page
        </button>
      )}
      {brought.length > 0 && (
        <span className="chat-brought">
          <small>Brought up</small>
          {brought.slice(0, 4).map(({ page }) => (
            <button
              key={page.id}
              onClick={() => open({ type: 'page', id: page.id }, true)}
              onContextMenu={(e) =>
                channel && page.visibility === 'space' && (e.preventDefault(), pin(page.id, true))
              }
              title={
                channel && page.visibility === 'space'
                  ? 'Open beside · right-click to pin'
                  : 'Open beside'
              }
            >
              <KindIcon kind={page.kind} size={12} /> <span className="truncate">{page.title}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
  // A chat with an agent opens on what it is for and how to reach it, so a new agent isn't a blank page.
  const agent =
    channel || about
      ? undefined
      : chat.participantIds.map((id) => user(id)).find((u) => u?.kind === 'agent');
  const looksAfter = agent
    ? s.watches
        .filter((w) => w.agentId === agent.id)
        .map((w) => resource(w.resourceId))
        .filter((r): r is Resource => !!r)
    : [];
  const intro = agent && (
    <div className="agent-intro">
      <p>
        <b>{agent.name}</b>
        {agent.purpose ? ` · ${agent.purpose}` : ''}
      </p>
      <ul>
        <li>Ask it here. Only you see this conversation.</li>
        <li>In any chat, tag @{agent.name} and it answers where everyone there can see it.</li>
        <li>On a page, select text or cells and ask it about just that part.</li>
        <li>
          {looksAfter.length ? (
            <>
              It looks after{' '}
              {looksAfter.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <button className="link" onClick={() => open({ type: 'page', id: p.id }, true)}>
                    {p.title}
                  </button>
                </span>
              ))}
              .
            </>
          ) : (
            <>
              It doesn't look after any page yet.{' '}
              <button className="link" onClick={() => open({ type: 'who', id: agent.id }, true)}>
                Give it one
              </button>{' '}
              and it speaks up when that page crosses a line you set.
            </>
          )}
        </li>
      </ul>
    </div>
  );
  return (
    <div className="chat-page">
      <Feed
        conversation={chat}
        top={pinRow || undefined}
        draftKey={`chat:${chat.id}`}
        placeholder={
          channel
            ? `Message #${name}`
            : chat.kind === 'agent-private'
              ? `Ask ${name}. Only you see this.`
              : chat.kind === 'discussion'
                ? `Say something to everyone on ${about?.title ?? 'this page'}`
                : `Message ${name}`
        }
        empty={
          channel
            ? `This is the start of #${name}. Everyone in ${space.name} can read it.`
            : chat.kind === 'discussion'
              ? 'Nothing said about this page yet.'
              : (intro ?? `Only you and ${name} see this conversation.`)
        }
      />
    </div>
  );
}
