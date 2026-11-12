import { Plus, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, chatTitle } from '../app/util.tsx';
import { Feed } from '../features/feed/Feed.tsx';
import type { Conversation } from '../../shared/types.ts';

/** A conversation as a page: a channel, direct messages, or a conversation with an agent. */
export function ChatPage({ chat }: { chat: Conversation }) {
  const { s, resource, open, pick, run, space } = useWorkspace();
  const name = chatTitle(chat, s);
  const pinned = chat.pinnedIds.map((id) => resource(id)).filter((r) => !!r);
  const pin = (resourceId: string, on: boolean) =>
    void run(() => api(`/conversations/${chat.id}/pins`, { body: { resourceId, on } }));
  return (
    <div className="chat-page">
      {chat.kind === 'channel' && (
        <div className="pins" aria-label="Pinned pages">
          {pinned.map((p) => (
            <span key={p.id} className="pin">
              <button onClick={() => open({ type: 'page', id: p.id }, true)} title="Open beside">
                <KindIcon kind={p.kind} size={13} /> <span className="truncate">{p.title}</span>
              </button>
              <button aria-label={`Unpin ${p.title}`} onClick={() => pin(p.id, false)}>
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            className="pin-add"
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
        </div>
      )}
      <Feed
        conversation={chat}
        draftKey={`chat:${chat.id}`}
        placeholder={
          chat.kind === 'channel'
            ? `Message #${name}`
            : chat.kind === 'agent-private'
              ? `Ask ${name}. Only you see this.`
              : `Message ${name}`
        }
        empty={
          chat.kind === 'channel'
            ? `This is the start of #${name}. Everyone in ${space.name} can read it.`
            : chat.kind === 'agent-private'
              ? `Only you and ${name} see this conversation.`
              : `Only you and ${name} see this conversation.`
        }
      />
    </div>
  );
}
