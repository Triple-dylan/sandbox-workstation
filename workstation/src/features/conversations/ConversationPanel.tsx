import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, FileText, Folder, Quote, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Message } from '../../../shared/types.ts';
import { Actor, Character, agentState } from '../agents/Character.tsx';
import { Reader } from '../reader/Reader.tsx';
import { AgentSettings } from '../agents/MemberView.tsx';
import { Composer } from './Composer.tsx';
import { conversationLabel } from './audience.ts';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ConversationPanel({ conversationId }: { conversationId: string }) {
  const { s, ui, setUi, run, openResource, openDirect } = useWorkspace();
  const conversation = s.conversations.find((c) => c.id === conversationId)!;
  const messages = s.messages.filter((m) => m.conversationId === conversationId);
  const roots = messages.filter((m) => !m.replyTo || !messages.some((p) => p.id === m.replyTo));
  const replies = (id: string) => messages.filter((m) => m.replyTo === id);
  const { label, detail } = conversationLabel(s, conversation);
  const primaryAgent = s.users.find(
    (user) => user.kind === 'agent' && conversation.participantIds.includes(user.id),
  );
  const participants = conversation.spaceId
    ? s.users.filter((user) =>
        s.members.some((m) => m.spaceId === conversation.spaceId && m.userId === user.id),
      )
    : s.users.filter((user) => conversation.participantIds.includes(user.id));
  const scrollKey = `chat-scroll:${s.me.id}:${conversationId}`;
  const working = s.jobs.filter(
    (j) => j.conversationId === conversationId && (j.status === 'running' || j.status === 'queued'),
  );
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = list.current;
    if (element) {
      const saved = sessionStorage.getItem(scrollKey);
      element.scrollTop = saved === null ? element.scrollHeight : Number(saved);
    }
    void api('/reads', { body: { conversationId } }).catch(() => {});
  }, [messages.length, conversationId]);
  if (!conversation) return null;
  const projectId =
    conversation.spaceId ??
    (conversation.kind === 'dm'
      ? s.users.find(
          (user) => user.kind === 'agent' && conversation.participantIds.includes(user.id),
        )?.spaceId
      : undefined);
  const projectResources = s.spaces.some(
    (space) => space.id === projectId && space.kind === 'project',
  )
    ? s.resources.filter(
        (resource) =>
          resource.spaceId === projectId && resource.visibility === 'space' && !resource.parentId,
      )
    : [];
  return (
    <section className="conversation" aria-label={label}>
      <header>
        <div>
          <h2>{label}</h2>
          <small>
            {detail}
            {primaryAgent ? ` · ${primaryAgent.name}` : ''}
          </small>
        </div>
        <button aria-label="Close conversation" onClick={() => setUi({ conversationId: null })}>
          <X size={15} />
        </button>
      </header>
      <div className="conversation-people" aria-label="Conversation participants">
        {participants
          .filter((person) => person.id !== s.me.id)
          .map((person) => (
            <button
              key={person.id}
              title={`Private conversation with ${person.name}`}
              aria-label={`Message ${person.name} privately`}
              onClick={() => void openDirect(person.id)}
            >
              <Actor user={person} jobs={s.jobs} size={18} />
              <span>{person.name}</span>
            </button>
          ))}
      </div>
      {projectResources.length > 0 && (
        <section className="conversation-resources" aria-label="Project resources">
          <strong>Resources</strong>
          <div>
            {projectResources.map((resource) => (
              <button
                key={resource.id}
                aria-pressed={ui.readerId === resource.id}
                onClick={() => openResource(resource.id)}
              >
                {resource.kind === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
                {resource.title}
              </button>
            ))}
          </div>
        </section>
      )}
      <div
        className="conversation-list"
        ref={list}
        onScroll={(e) => sessionStorage.setItem(scrollKey, String(e.currentTarget.scrollTop))}
      >
        {primaryAgent && <AgentSettings key={primaryAgent.id} agent={primaryAgent} />}
        {primaryAgent &&
          (conversation.kind === 'agent-work' || conversation.kind === 'agent-private') && (
            <details className="agent-settings-disclosure">
              <summary>Ongoing work</summary>
              <p>Send /assign followed by a responsibility to keep it active.</p>
              {s.assignments
                .filter(
                  (a) =>
                    a.agentId === primaryAgent.id &&
                    a.conversationId === conversationId &&
                    a.active,
                )
                .map((a) => (
                  <div className="member-job" key={a.id}>
                    <span>{a.instruction}</span>
                    <button
                      className="link"
                      onClick={() => void run(() => api(`/assignments/${a.id}/stop`, { body: {} }))}
                    >
                      Stop
                    </button>
                  </div>
                ))}
            </details>
          )}
        {ui.readerId && (
          <div className="conversation-reader">
            <Reader key={ui.readerId} resourceId={ui.readerId} />
          </div>
        )}
        {messages.length === 0 && (
          <p className="conversation-empty">
            {primaryAgent ? `Start a conversation with ${primaryAgent.name}.` : 'No messages yet.'}
          </p>
        )}
        {primaryAgent && (
          <p className="conversation-runtime">
            {s.runtime.label}
            {s.runtime.model ? ` · ${s.runtime.model}` : ''}
          </p>
        )}
        {roots.map((m) => (
          <div key={m.id} className="thread">
            <MessageView m={m} />
            {replies(m.id).map((r) => (
              <div key={r.id} className="thread-reply">
                <MessageView m={r} />
              </div>
            ))}
            <ReplyBox
              text={ui.drafts[`reply:${m.id}`] ?? ''}
              onChange={(text) =>
                setUi((old) => ({ drafts: { ...old.drafts, [`reply:${m.id}`]: text } }))
              }
              onSend={(text) =>
                run(() =>
                  api<Message>('/messages', { body: { conversationId, text, replyTo: m.id } }),
                ).then(Boolean)
              }
            />
          </div>
        ))}
        {working.map((j) => {
          const agent = s.users.find((u) => u.id === j.agentId);
          return (
            agent && (
              <p key={j.id} className="working" role="status">
                <Character agent={agent} size={18} state={agentState(agent.id, s.jobs)} />{' '}
                {agent.name} is working…
              </p>
            )
          );
        })}
      </div>
      <Composer />
    </section>
  );
}

function MessageView({ m }: { m: Message }) {
  const { s, user, resource, openResource, openDirect, run } = useWorkspace();
  const author = user(m.authorId);
  const addressed = user(m.addressedTo);
  const anchored = m.anchor ? resource(m.anchor.resourceId) : undefined;
  const approval = m.approvalId ? s.approvals.find((a) => a.id === m.approvalId) : undefined;
  return (
    <article className={`message ${author?.kind === 'agent' ? 'from-agent' : ''}`}>
      <span className="message-actor">
        {author && <Actor user={author} jobs={s.jobs} size={24} />}
      </span>
      <div className="message-body">
        <header>
          <button
            className="author-name"
            disabled={!author || author.id === s.me.id}
            onClick={() => author && void openDirect(author.id)}
            style={{ color: author?.kind === 'human' ? author.color : undefined }}
          >
            {author?.name ?? 'Someone'}
          </button>
          {addressed && (
            <span className="tag">
              {m.delegated ? `delegated to ${addressed.name}` : `to ${addressed.name}`}
            </span>
          )}
          {m.runtime && <span className="tag subtle">{m.runtime}</span>}
          <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
        </header>
        {m.anchor && (
          <button
            className="anchor"
            onClick={() => anchored && openResource(anchored.id)}
            disabled={!anchored}
          >
            <Quote size={12} />
            <span>{m.anchor.quote || anchored?.title || 'Item'}</span>
          </button>
        )}
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
        </div>
        {approval && (
          <div className="approval">
            <div>
              <strong>Proposed: {approval.proposal.title}</strong>
              <small>{approval.proposal.body.slice(0, 160)}</small>
            </div>
            {approval.status === 'pending' ? (
              <div className="approval-actions">
                <button
                  className="primary"
                  onClick={() =>
                    void run(() =>
                      api(`/approvals/${approval.id}`, { body: { decision: 'approved' } }),
                    )
                  }
                >
                  <Check size={13} /> Approve
                </button>
                <button
                  onClick={() =>
                    void run(() =>
                      api(`/approvals/${approval.id}`, { body: { decision: 'declined' } }),
                    )
                  }
                >
                  Decline
                </button>
              </div>
            ) : (
              <span className="tag">
                {approval.status} by {user(approval.decidedBy)?.name ?? 'someone'}
                {approval.resultResourceId && (
                  <button className="link" onClick={() => openResource(approval.resultResourceId!)}>
                    open
                  </button>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function ReplyBox({
  onSend,
  text,
  onChange,
}: {
  onSend: (text: string) => Promise<boolean>;
  text: string;
  onChange: (text: string) => void;
}) {
  const [open, setOpen] = useState(!!text);
  const [sending, setSending] = useState(false);
  if (!open)
    return (
      <button className="reply-open" onClick={() => setOpen(true)}>
        <CornerDownRight size={12} /> Reply
      </button>
    );
  return (
    <form
      className="reply-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || sending) return;
        setSending(true);
        void onSend(text).then((sent) => {
          setSending(false);
          if (sent) {
            onChange('');
            setOpen(false);
          }
        });
      }}
    >
      <input
        autoFocus
        disabled={sending}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Reply in thread"
        aria-label="Reply in thread"
      />
    </form>
  );
}
