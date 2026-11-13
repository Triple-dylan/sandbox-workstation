import { Plus, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, ago, chatTitle, excerpt } from '../app/util.tsx';
import { DRAG, pagesNamed } from '../app/scope.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { Feed, agentsIn } from '../features/feed/Feed.tsx';
import type { Conversation, Id, Resource, User } from '../../shared/types.ts';

/**
 * A conversation as a page. The messages sit beside what they are about: the conversation's
 * resources, the pages people have brought up, and who (people and agents) is in it.
 */
export function ChatPage({ chat }: { chat: Conversation }) {
  const { s, setUi, resource, open, pick, run, space, user } = useWorkspace();
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
  const agents = agentsIn(chat, s.users);
  const people = (
    channel || chat.kind === 'discussion'
      ? s.members.filter((m) => m.spaceId === chat.spaceId).map((m) => user(m.userId))
      : chat.participantIds.map((id) => user(id))
  ).filter((u): u is User => !!u && u.kind === 'human');
  const here = new Set(
    s.presence.filter((p) => p.online && p.conversationId === chat.id).map((p) => p.userId),
  );
  const card = (p: Resource, extra?: React.ReactNode) => (
    <div key={p.id} className="res">
      <button onClick={() => open({ type: 'page', id: p.id }, true)} title="Open beside">
        <KindIcon kind={p.kind} size={14} />
        <span>
          <strong className="truncate">{p.title}</strong>
          <small>{excerpt(p, 80) || 'Empty so far.'}</small>
        </span>
      </button>
      {extra}
    </div>
  );
  return (
    <div className="chat-page">
      <Feed
        conversation={chat}
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
              : `Only you and ${name} see this conversation.`
        }
      />
      <aside className="chat-context" aria-label="What this conversation is about">
        {about && (
          <section>
            <h3>About</h3>
            {card(about)}
          </section>
        )}
        {channel && (
          <section
            onDragOver={(e) => [...e.dataTransfer.types].includes(DRAG) && e.preventDefault()}
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
            <h3>
              Resources
              <button
                aria-label="Add a resource"
                title="Add a page as a resource of this channel"
                onClick={() =>
                  pick({
                    title: `Add a resource to #${name}`,
                    filter: (r) =>
                      r.visibility === 'space' &&
                      r.spaceId === space.id &&
                      !chat.pinnedIds.includes(r.id),
                    onPick: (t) => t.type === 'page' && pin(t.id, true),
                  })
                }
              >
                <Plus size={13} />
              </button>
            </h3>
            {pinned.length === 0 && (
              <p className="hint">
                The pages this channel works from. Add one, or drag it here from the list.
              </p>
            )}
            {pinned.map((p) =>
              card(
                p,
                <button
                  className="res-x"
                  aria-label={`Remove ${p.title} from resources`}
                  onClick={() => pin(p.id, false)}
                >
                  <X size={12} />
                </button>,
              ),
            )}
          </section>
        )}
        {brought.length > 0 && (
          <section>
            <h3>Brought up here</h3>
            {brought.map(({ page, at }) =>
              card(
                page,
                channel && page.visibility === 'space' ? (
                  <button
                    className="res-x"
                    title="Keep as a resource"
                    aria-label={`Keep ${page.title} as a resource`}
                    onClick={() => pin(page.id, true)}
                  >
                    <Plus size={12} />
                  </button>
                ) : (
                  <time>{ago(at)}</time>
                ),
              ),
            )}
          </section>
        )}
        {agents.length > 0 && (
          <section>
            <h3>Agents here</h3>
            {agents.map((a) => {
              const state = s.activity.some((x) => x.agentId === a.id && x.status === 'working')
                ? 'working'
                : agentState(a.id, s.jobs);
              return (
                <div key={a.id} className="res who-row">
                  <button onClick={() => open({ type: 'who', id: a.id }, true)}>
                    <Character agent={a} size={28} state={state} />
                    <span>
                      <strong>{a.name}</strong>
                      <small>
                        {state === 'working' ? 'Working now' : a.purpose || 'Shared with the space'}
                      </small>
                    </span>
                  </button>
                  {chat.kind !== 'agent-private' && (
                    <button
                      className="res-x wide"
                      onClick={() =>
                        setUi((old) => ({
                          drafts: { ...old.drafts, [`chat:${chat.id}`]: `@${a.name} ` },
                        }))
                      }
                    >
                      Ask
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        )}
        {chat.kind !== 'agent-private' && (
          <section>
            <h3>People</h3>
            <p className="people">
              {people.map((p) => (
                <span
                  key={p.id}
                  className={here.has(p.id) ? 'here' : ''}
                  title={`${p.name}${here.has(p.id) ? ' is here now' : ''}`}
                >
                  <Actor user={p} jobs={s.jobs} size={22} /> {p.id === s.me.id ? 'You' : p.name}
                </span>
              ))}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
