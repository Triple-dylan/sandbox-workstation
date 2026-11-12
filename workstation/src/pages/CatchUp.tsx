import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, ago, chatTitle, excerpt, unreadIn } from '../app/util.tsx';
import { lastVisit, markVisit } from '../app/saved.ts';
import { Actor, Character, agentState } from '../features/agents/Character.tsx';
import { ApprovalCard } from '../features/feed/Feed.tsx';
import { isPage } from '../../shared/types.ts';
import type { Id, Snapshot } from '../../shared/types.ts';

type Need =
  | { kind: 'approval'; id: Id; at: string }
  | { kind: 'comment'; id: Id; pageId: Id; at: string }
  | { kind: 'step'; id: Id; at: string }
  | { kind: 'dm'; id: Id; count: number; at: string };

/** What is waiting on this person in a space. Worked out from the records; nothing is invented. */
export function needsYou(s: Snapshot, spaceId: Id): Need[] {
  const needs: Need[] = [];
  for (const a of s.approvals)
    if (a.spaceId === spaceId && a.status === 'pending')
      needs.push({ kind: 'approval', id: a.id, at: a.createdAt });
  for (const m of s.messages) {
    if (!m.anchor || m.replyTo || m.resolved || m.authorId === s.me.id) continue;
    const anchored = s.resources.find((r) => r.id === m.anchor!.resourceId);
    const page =
      anchored &&
      (isPage(anchored.kind) ? anchored : s.resources.find((r) => r.id === anchored.parentId));
    if (page && page.spaceId === spaceId && page.ownerId === s.me.id && !m.addressedTo)
      needs.push({ kind: 'comment', id: m.id, pageId: page.id, at: m.createdAt });
  }
  for (const g of s.goals)
    if (g.spaceId === spaceId && g.ownerId === s.me.id && !g.done)
      needs.push({ kind: 'step', id: g.id, at: g.due ?? '' });
  for (const c of s.conversations) {
    if (c.kind !== 'dm') continue;
    const count = unreadIn(c, s);
    if (count) needs.push({ kind: 'dm', id: c.id, count, at: '' });
  }
  return needs;
}

/** A private page: what needs you, what changed since you were last here, and what you can ignore. */
export function CatchUp() {
  const { s, space, open, user, resource, myAgent, ask } = useWorkspace();
  const since = useRef(lastVisit(space.id) || new Date(Date.now() - 7 * 86_400_000).toISOString());
  useEffect(() => {
    since.current = lastVisit(space.id) || new Date(Date.now() - 7 * 86_400_000).toISOString();
    return () => markVisit(space.id);
  }, [space.id]);
  const needs = needsYou(s, space.id);
  const pages = s.resources.filter((r) => r.spaceId === space.id && isPage(r.kind));
  const changed = pages
    .filter((r) => r.updatedAt > since.current && r.updatedBy !== s.me.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === space.id);
  const talking = channels.filter((c) => unreadIn(c, s) > 0);
  const quiet = channels.filter((c) => unreadIn(c, s) === 0);
  const untouched = pages.length - changed.length;
  const summarise = () =>
    void ask(
      `Catch me up on ${space.kind === 'personal' ? 'my own space' : space.name}. In a few short lines: what changed, what was decided, and what needs me. Name the pages you rely on.`,
      { resourceIds: changed.slice(0, 8).map((r) => r.id) },
    );
  return (
    <div className="catchup">
      <header>
        <h2>{space.kind === 'personal' ? 'Your space' : space.name}</h2>
        <p>Since you were last here, {ago(since.current)}. Only you see this page.</p>
        {myAgent && (
          <button className="primary" onClick={summarise}>
            <Character agent={myAgent} size={20} state={agentState(myAgent.id, s.jobs)} />
            <Sparkles size={13} /> Ask {myAgent.name} to write this up
          </button>
        )}
      </header>

      <section aria-label="Needs you">
        <h3>
          Needs you <small>{needs.length || ''}</small>
        </h3>
        {needs.length === 0 && <p className="feed-empty">Nothing is waiting on you.</p>}
        {needs.map((n) => {
          if (n.kind === 'approval') {
            const a = s.approvals.find((x) => x.id === n.id)!;
            const agent = user(a.agentId);
            return (
              <div key={n.id} className="need">
                <p className="need-head">
                  {agent && <Actor user={agent} jobs={s.jobs} size={20} />}
                  <strong>{agent?.name}</strong> is waiting for a yes · {ago(a.createdAt)}
                </p>
                <ApprovalCard approvalId={a.id} />
              </div>
            );
          }
          if (n.kind === 'comment') {
            const m = s.messages.find((x) => x.id === n.id)!;
            const page = resource(n.pageId)!;
            const author = user(m.authorId);
            return (
              <button
                key={n.id}
                className="need row"
                onClick={() => open({ type: 'page', id: page.id })}
              >
                {author && <Actor user={author} jobs={s.jobs} size={20} />}
                <span>
                  <strong>{author?.name}</strong> commented on <strong>{page.title}</strong>
                  <small>{m.text.slice(0, 120)}</small>
                </span>
                <time>{ago(m.createdAt)}</time>
              </button>
            );
          }
          if (n.kind === 'step') {
            const g = s.goals.find((x) => x.id === n.id)!;
            return (
              <div key={n.id} className="need row">
                <span className="step-dot" />
                <span>
                  <strong>{g.title}</strong>
                  <small>
                    Yours on the plan
                    {g.due
                      ? ` · due ${new Date(g.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : ''}
                  </small>
                </span>
              </div>
            );
          }
          const chat = s.conversations.find((c) => c.id === n.id)!;
          return (
            <button
              key={n.id}
              className="need row"
              onClick={() => open({ type: 'chat', id: chat.id })}
            >
              <span className="step-dot" />
              <span>
                <strong>{chatTitle(chat, s)}</strong> sent you {n.count} message
                {n.count === 1 ? '' : 's'}
                <small>
                  {s.messages
                    .filter((m) => m.conversationId === chat.id)
                    .at(-1)
                    ?.text.slice(0, 120)}
                </small>
              </span>
            </button>
          );
        })}
      </section>

      <section aria-label="What changed">
        <h3>
          What changed <small>{changed.length + talking.length || ''}</small>
        </h3>
        {changed.length + talking.length === 0 && (
          <p className="feed-empty">Nothing has changed since you were last here.</p>
        )}
        {talking.map((c) => {
          const last = s.messages.filter((m) => m.conversationId === c.id).at(-1);
          return (
            <button
              key={c.id}
              className="need row"
              onClick={() => open({ type: 'chat', id: c.id })}
            >
              <KindIcon kind="channel" />
              <span>
                <strong>#{c.title}</strong> · {unreadIn(c, s)} new
                <small>
                  {user(last?.authorId)?.name}: {last?.text.slice(0, 120)}
                </small>
              </span>
              <time>{last ? ago(last.createdAt) : ''}</time>
            </button>
          );
        })}
        {changed.map((r) => (
          <button key={r.id} className="need row" onClick={() => open({ type: 'page', id: r.id })}>
            <KindIcon kind={r.kind} />
            <span>
              <strong>{r.title}</strong> · {user(r.updatedBy)?.name ?? 'Someone'} edited it
              <small>{excerpt(r, 120)}</small>
            </span>
            <time>{ago(r.updatedAt)}</time>
          </button>
        ))}
      </section>

      <section aria-label="Nothing for you">
        <h3>Nothing for you</h3>
        <p className="quiet">
          {quiet.length > 0 && <>Quiet: {quiet.map((c) => `#${c.title}`).join(', ')}. </>}
          {untouched > 0 && `${untouched} page${untouched === 1 ? '' : 's'} unchanged.`}
          {quiet.length === 0 && untouched === 0 && 'Everything here has had some activity.'}
        </p>
      </section>
    </div>
  );
}
