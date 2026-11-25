import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CornerDownRight,
  Paperclip,
  SmilePlus,
  X,
} from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { KindIcon, Md, ago, clock, excerpt, sheetRows } from '../../app/util.tsx';
import { Actor, Character, agentState, nameStyle } from '../agents/Character.tsx';
import { proposalText } from '../agents/proposal.ts';
import { addressed, markMentions, useMentions } from './mentions.tsx';
import { DRAG, pagesNamed } from '../../app/scope.ts';
import { cellEdits, colName, evaluate } from '../../../shared/formula.ts';
import { REACTIONS } from '../../../shared/types.ts';
import type { Conversation, Id, Message, Proposal, Resource, User } from '../../../shared/types.ts';

/** Which agents can be spoken to in a conversation. Mirrors the server's rule. */
export function agentsIn(conversation: Conversation, users: User[]) {
  if (conversation.kind === 'agent-private')
    return users.filter(
      (u) => u.kind === 'agent' && !u.retired && conversation.participantIds.includes(u.id),
    );
  if (conversation.kind === 'dm') return [];
  return users.filter(
    (u) =>
      u.kind === 'agent' &&
      u.role === 'project' &&
      !u.retired &&
      u.spaceId === conversation.spaceId,
  );
}

/** An agent's suggestion, waiting on a person. */
export function ApprovalCard({ approvalId }: { approvalId: Id }) {
  const { s, run, resource, open, user } = useWorkspace();
  const a = s.approvals.find((x) => x.id === approvalId);
  if (!a) return null;
  const page = resource(a.proposal.resourceId);
  const words = proposalText(a.proposal, page?.title);
  const decide = (decision: 'approved' | 'declined') =>
    void run(() => api(`/approvals/${a.id}`, { body: { decision } }));
  return (
    <div className={`approval is-${a.status}`}>
      <strong>{words.title}</strong>
      {a.proposal.kind === 'edit-cells' ? (
        <CellChanges proposal={a.proposal} page={page} done={a.status !== 'pending'} />
      ) : a.proposal.kind === 'edit-doc' ? (
        <p className="diff">
          <del>{a.proposal.title}</del>
          <ins>{a.proposal.body}</ins>
        </p>
      ) : (
        a.proposal.body && (
          <p className="approval-body">{a.proposal.body.replace(/[#*_`]/g, '').slice(0, 220)}</p>
        )
      )}
      {a.status === 'pending' ? (
        <div className="approval-actions">
          <button className="primary" onClick={() => decide('approved')}>
            <Check size={13} /> {words.yes}
          </button>
          <button onClick={() => decide('declined')}>{words.no}</button>
          <small>Nothing changes until a person says yes.</small>
        </div>
      ) : (
        <small className="approval-done">
          {a.status === 'approved' ? 'Accepted' : 'Declined'} by{' '}
          {user(a.decidedBy)?.name ?? 'someone'}
          {a.status === 'approved' && resource(a.resultResourceId) && (
            <>
              {' · '}
              <button
                className="link"
                onClick={() => open({ type: 'page', id: a.resultResourceId! }, true)}
              >
                Open {resource(a.resultResourceId)!.title}
              </button>
            </>
          )}
        </small>
      )}
    </div>
  );
}

/** A proposed sheet change, cell by cell: what is there now and what it would become. */
function CellChanges({
  proposal,
  page,
  done,
}: {
  proposal: Proposal;
  page?: Resource;
  /** Once decided, the sheet already shows the new values: only what was set is listed. */
  done: boolean;
}) {
  const edits = cellEdits(proposal.body) ?? [];
  const rows = page?.kind === 'sheet' ? sheetRows(page.body) : [];
  return (
    <table className="cell-changes">
      <tbody>
        {edits.map((e) => {
          const now = evaluate(rows, e.row, e.col);
          return (
            <tr key={`${e.row}:${e.col}`}>
              <th>
                {colName(e.col)}
                {e.row + 1}
              </th>
              {!done && <td>{now ? <del>{now}</del> : <span className="empty">empty</span>}</td>}
              <td>
                <ins>{e.value || 'empty'}</ins>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A piece of a page shown inside a message. It is the page itself, not a copy. */
export function LivePiece({ embed }: { embed: NonNullable<Message['embed']> }) {
  const { resource, jump, run } = useWorkspace();
  const page = resource(embed.resourceId);
  if (!page) return <div className="live gone">This page is no longer available to you.</div>;
  const rows = page.kind === 'sheet' ? sheetRows(page.body) : [];
  const from = embed.from ?? 0;
  const to = embed.to ?? Math.min(rows.length - 1, 4);
  return (
    <div className="live">
      <header>
        <KindIcon kind={page.kind} />
        <button
          className="link"
          onClick={() =>
            jump(
              page.kind === 'sheet'
                ? { resourceId: page.id, rows: [from, to] }
                : { resourceId: page.id },
            )
          }
        >
          {page.title}
        </button>
        <small>live · also changes the page</small>
        {page.kind === 'sheet' && (
          <button
            className="live-open"
            title="Open the sheet beside, at these rows"
            onClick={() => jump({ resourceId: page.id, rows: [from, to] })}
          >
            <ArrowUpRight size={12} /> Rows {from + 1}–{to + 1}
          </button>
        )}
      </header>
      {page.kind === 'sheet' ? (
        <table>
          <tbody>
            {rows.slice(from, to + 1).map((row, i) => (
              <tr key={from + i}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input
                      defaultValue={evaluate(rows, from + i, c)}
                      key={`${cell}:${evaluate(rows, from + i, c)}`}
                      onFocus={(e) => (e.target.value = cell)}
                      aria-label={`Row ${from + i + 1}, column ${c + 1}`}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value === cell)
                          return void (e.target.value = evaluate(rows, from + i, c));
                        void run(() =>
                          api(`/resources/${page.id}/cells`, {
                            body: { row: from + i, col: c, value },
                          }),
                        );
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{excerpt(page, 260) || 'Empty so far.'}</p>
      )}
    </div>
  );
}

export function SourceChips({ ids, label = 'From' }: { ids: Id[]; label?: string }) {
  const { resource, open } = useWorkspace();
  const pages = ids.map((id) => resource(id)).filter((r) => !!r);
  if (!pages.length) return null;
  return (
    <p className="sources">
      <small>{label}</small>
      {pages.map((p) => (
        <button
          key={p.id}
          onClick={() => open({ type: 'page', id: p.id }, true)}
          title="Open beside"
        >
          <KindIcon kind={p.kind} size={12} /> {p.title}
        </button>
      ))}
    </p>
  );
}

export function MessageView({
  m,
  onReply,
  extra,
  quiet,
}: {
  m: Message;
  onReply?: () => void;
  /** Extra actions under an agent's answer. */
  extra?: React.ReactNode;
  /** Leave out reactions and reply, for compact threads. */
  quiet?: boolean;
}) {
  const { s, user, run, resource, jump } = useWorkspace();
  const [reacting, setReacting] = useState(false);
  const author = user(m.authorId);
  const to = user(m.addressedTo);
  const anchored = m.anchor && resource(m.anchor.resourceId);
  const mentionable = s.users.filter((u) => !u.retired).map((u) => u.name);
  const conversationSpace = s.conversations.find((c) => c.id === m.conversationId)?.spaceId ?? null;
  const react = (emoji: string) => {
    setReacting(false);
    void run(() => api(`/messages/${m.id}/react`, { body: { emoji } }));
  };
  return (
    <div className={`msg ${author?.kind === 'agent' ? 'from-agent' : ''}`} data-message={m.id}>
      <span className="msg-who">{author && <Actor user={author} jobs={s.jobs} size={26} />}</span>
      <div className="msg-main">
        <p className="msg-head">
          <strong style={nameStyle(author?.color)}>{author?.name ?? 'Someone'}</strong>
          {to && <span className="to">to {to.name}</span>}
          {m.delegated && <span className="to">ongoing</span>}
          <time title={new Date(m.createdAt).toLocaleString()}>{clock(m.createdAt)}</time>
          {m.runtime === 'scripted' && <span className="tag">scripted stand-in</span>}
          {m.sharedFrom && (
            <span
              className="msg-shared"
              title="Shared from a private conversation with their agent"
            >
              <Character agent={user(m.sharedFrom.agentId)!} size={14} /> from{' '}
              {m.sharedFrom.ownerId === s.me.id ? 'your' : `${user(m.sharedFrom.ownerId)?.name}’s`}{' '}
              agent
            </span>
          )}
        </p>
        {m.anchor && (
          <button
            className="quote"
            disabled={!anchored}
            title={anchored ? `Show it on ${anchored.title}` : undefined}
            onClick={() =>
              anchored && jump({ resourceId: anchored.id, quote: m.anchor!.quote || undefined })
            }
          >
            {m.anchor.quote ? `“${m.anchor.quote.slice(0, 140)}”` : anchored?.title}
          </button>
        )}
        <Md text={markMentions(m.text, mentionable)} />
        {m.embed && <LivePiece embed={m.embed} />}
        {m.resolved && !m.anchor && (
          <span className="decided" title="Marked decided. Agents treat it as settled.">
            <Check size={12} /> Decided
          </span>
        )}
        <SourceChips ids={m.sourceIds} />
        <SourceChips
          label="Mentions"
          ids={pagesNamed(s, conversationSpace, m.text, [
            ...m.sourceIds,
            ...(m.embed ? [m.embed.resourceId] : []),
            ...(m.anchor ? [m.anchor.resourceId] : []),
          ]).map((p) => p.id)}
        />
        {m.approvalId && <ApprovalCard approvalId={m.approvalId} />}
        {extra}
        {!quiet && (
          <div className="msg-foot">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className="reaction"
                aria-pressed={r.userIds.includes(s.me.id)}
                title={r.userIds.map((id) => user(id)?.name).join(', ')}
                onClick={() => react(r.emoji)}
              >
                {r.emoji} {r.userIds.length}
              </button>
            ))}
            <span className="msg-tools">
              <button
                aria-label="React"
                title="React"
                aria-expanded={reacting}
                onClick={() => setReacting((v) => !v)}
              >
                <SmilePlus size={13} />
              </button>
              {reacting &&
                REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    className="pick"
                    aria-label={`React ${emoji}`}
                    onClick={() => react(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              {onReply && (
                <button onClick={onReply}>
                  <CornerDownRight size={13} /> Reply
                </button>
              )}
              {onReply && !m.anchor && (
                <button
                  aria-pressed={m.resolved}
                  title={
                    m.resolved ? 'No longer decided' : 'Mark as decided; agents treat it as settled'
                  }
                  onClick={() =>
                    void run(() =>
                      api(`/messages/${m.id}/resolve`, { body: { resolved: !m.resolved } }),
                    )
                  }
                >
                  <Check size={13} /> {m.resolved ? 'Undecide' : 'Decided'}
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The box you write in. Who it goes to is always shown, and an agent is only addressed on purpose. */
export function Composer({
  conversation,
  ensure,
  draftKey,
  placeholder,
  replyTo,
  onSent,
  anchor,
  autoFocus,
}: {
  conversation: Conversation | undefined;
  /** Makes the conversation when the first message is sent (a page's feed is made on demand). */
  ensure?: () => Promise<Conversation | undefined>;
  draftKey: string;
  placeholder: string;
  replyTo?: Id | null;
  onSent?: () => void;
  anchor?: { resourceId: Id; quote: string } | null;
  autoFocus?: boolean;
}) {
  const { s, ui, setUi, run, pick, resource, space } = useWorkspace();
  const text = ui.drafts[draftKey] ?? '';
  const setText = (value: string) =>
    setUi((old) => ({ drafts: { ...old.drafts, [draftKey]: value } }));
  const [attached, setAttached] = useState<Id | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const agents = conversation
    ? agentsIn(conversation, s.users)
    : s.users.filter(
        (u) => u.kind === 'agent' && u.role === 'project' && u.spaceId === space.id && !u.retired,
      );
  const privateAgent = conversation?.kind === 'agent-private';
  // An agent is spoken to the way a person is: tagged with @Name, or named at the start.
  const target = privateAgent ? null : (addressed(text, agents) ?? null);
  const mentions = useMentions({
    text,
    setText,
    agents: privateAgent ? [] : agents,
    jobs: s.jobs,
    box,
  });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const chat = conversation ?? (await ensure?.());
    if (!chat) return;
    const sent = await run(() =>
      api('/messages', {
        body: {
          conversationId: chat.id,
          text: body,
          addressedTo: target?.id ?? null,
          replyTo: replyTo ?? null,
          anchor: anchor ?? null,
          embed: attached ? { resourceId: attached } : null,
        },
      }),
    );
    if (sent) {
      setText('');
      setAttached(null);
      onSent?.();
    }
  };
  const page = resource(attached);
  return (
    <form
      className="composer"
      onDragOver={(e) => [...e.dataTransfer.types].includes(DRAG) && e.preventDefault()}
      onDrop={(e) => {
        // A page dragged in from the list rides along with the message, live.
        try {
          const t = JSON.parse(e.dataTransfer.getData(DRAG));
          if (t.type !== 'page' || conversation?.kind === 'discussion') return;
          e.preventDefault();
          setAttached(t.id);
        } catch {
          // Not something from the list.
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {page && (
        <p className="attached">
          <KindIcon kind={page.kind} size={12} /> {page.title}
          <button type="button" aria-label="Remove the page" onClick={() => setAttached(null)}>
            <X size={12} />
          </button>
        </p>
      )}
      {mentions.menu}
      {target && (
        <p className="speaking-to">
          <Character agent={target} size={16} state={agentState(target.id, s.jobs)} />
          {target.name} will answer here, where everyone in this conversation can see it.
        </p>
      )}
      <div className="composer-row">
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={
            agents.length && !privateAgent ? `${placeholder} · @ to tag an agent` : placeholder
          }
          aria-label={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            mentions.track(e);
          }}
          onSelect={mentions.track}
          onKeyDown={(e) => {
            if (mentions.onKey(e)) return;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {conversation && conversation.kind !== 'discussion' && (
          <button
            type="button"
            aria-label="Add a page to this message"
            title="Add a page"
            onClick={() =>
              pick({
                title: 'Add a page to this message',
                filter: (r) => conversation.kind === 'agent-private' || r.visibility === 'space',
                onPick: (t) => t.type === 'page' && setAttached(t.id),
              })
            }
          >
            <Paperclip size={14} />
          </button>
        )}
        <button className="send" type="submit" aria-label="Send" disabled={!text.trim()}>
          <ArrowUp size={15} />
        </button>
      </div>
    </form>
  );
}

/** A running agent job shown under the message that asked for it. */
function WorkCard({ m }: { m: Message }) {
  const { s, user } = useWorkspace();
  const job = s.jobs.find(
    (j) =>
      j.conversationId === m.conversationId &&
      (j.status === 'running' || j.status === 'queued') &&
      j.createdAt >= m.createdAt &&
      (!m.addressedTo || j.agentId === m.addressedTo),
  );
  const agent = user(job?.agentId);
  if (!job || !agent) return null;
  return (
    <div className="work">
      <Character agent={agent} size={20} state="working" />
      <span>{agent.name} is working on this…</span>
    </div>
  );
}

/**
 * A conversation as a feed: messages with their threads underneath, and a reply box at the end.
 * Used for channels, direct messages, a page's own feed and conversations with an agent.
 */
export function Feed({
  conversation,
  ensure,
  draftKey,
  placeholder,
  filter,
  empty,
  latest,
  onEarlier,
  top,
}: {
  conversation: Conversation | undefined;
  ensure?: () => Promise<Conversation | undefined>;
  draftKey: string;
  placeholder: string;
  filter?: (m: Message) => boolean;
  empty?: string;
  /** Show only the last few, for a feed tucked under a page. */
  latest?: number;
  /** What "earlier" does when only the last few are shown. */
  onEarlier?: () => void;
  /** Shown above the messages and scrolling with them: a channel's pinned pages. */
  top?: React.ReactNode;
}) {
  const { s, run } = useWorkspace();
  // Where you left off, as it was when you arrived; reading the feed moves the real marker on.
  const [since] = useState(() => (conversation ? s.lastRead[conversation.id] : undefined));
  const [replying, setReplying] = useState<Id | null>(null);
  const [expanded, setExpanded] = useState<Record<Id, boolean>>({});
  const [all, setAll] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messages = conversation
    ? s.messages.filter((m) => m.conversationId === conversation.id && (!filter || filter(m)))
    : [];
  const roots = messages.filter((m) => !m.replyTo || !messages.some((x) => x.id === m.replyTo));
  const shown = latest && !all ? roots.slice(-latest) : roots;
  const lastId = messages.at(-1)?.id;
  const flat = conversation?.kind === 'agent-private';
  useEffect(() => {
    if (!conversation || !lastId) return;
    end.current?.scrollIntoView({ block: 'nearest' });
    if ((s.lastRead[conversation.id] ?? '') < (messages.at(-1)?.createdAt ?? ''))
      void run(() => api('/reads', { body: { conversationId: conversation.id } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, conversation?.id]);
  let day = '';
  return (
    <div className="feed">
      <div className="feed-list">
        {top}
        {roots.length === 0 && <p className="feed-empty">{empty ?? 'Nothing here yet.'}</p>}
        {shown.length < roots.length && (
          <button className="link earlier" onClick={() => (onEarlier ? onEarlier() : setAll(true))}>
            {roots.length - shown.length} earlier{' '}
            {onEarlier ? '· open the conversation beside' : ''}
          </button>
        )}
        {shown.map((m) => {
          const replies = messages.filter((x) => x.replyTo === m.id);
          const open = expanded[m.id] ?? replies.length <= 3;
          const stamp = new Date(m.createdAt).toDateString();
          const newDay = stamp !== day;
          day = stamp;
          const firstNew =
            !!since &&
            !latest &&
            m.createdAt > since &&
            m.authorId !== s.me.id &&
            !shown.some(
              (x) => x.createdAt > since && x.authorId !== s.me.id && x.createdAt < m.createdAt,
            );
          return (
            <div key={m.id} className="thread">
              {firstNew && (
                <p className="since" role="separator">
                  <span>New since you were here</span>
                </p>
              )}
              {newDay && !latest && (
                <p className="day">
                  <span>
                    {stamp === new Date().toDateString()
                      ? 'Today'
                      : new Date(m.createdAt).toLocaleDateString(undefined, {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })}
                  </span>
                </p>
              )}
              <MessageView m={m} onReply={flat ? undefined : () => setReplying(m.id)} />
              {(replies.length > 0 || replying === m.id) && (
                <div className="replies">
                  {!open && (
                    <button
                      className="link"
                      onClick={() => setExpanded((e) => ({ ...e, [m.id]: true }))}
                    >
                      {replies.length} replies · last {ago(replies.at(-1)!.createdAt)}
                    </button>
                  )}
                  {open && replies.map((r) => <MessageView key={r.id} m={r} quiet />)}
                  <WorkCard m={m} />
                  {replying === m.id && (
                    <Composer
                      conversation={conversation}
                      draftKey={`${draftKey}:${m.id}`}
                      placeholder="Reply in this thread"
                      replyTo={m.id}
                      autoFocus
                      onSent={() => setReplying(null)}
                    />
                  )}
                </div>
              )}
              {replies.length === 0 && replying !== m.id && <WorkCard m={m} />}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <Composer
        conversation={conversation}
        ensure={ensure}
        draftKey={draftKey}
        placeholder={placeholder}
      />
    </div>
  );
}
