import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, Quote, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Message } from '../../../shared/types.ts';
import { Actor, Character, agentState } from '../agents/Character.tsx';
import { conversationLabel } from './audience.ts';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ConversationPanel({ conversationId }: { conversationId: string }) {
  const { s, setUi, run } = useWorkspace();
  const conversation = s.conversations.find((c) => c.id === conversationId)!;
  const messages = s.messages.filter((m) => m.conversationId === conversationId);
  const roots = messages.filter((m) => !m.replyTo || !messages.some((p) => p.id === m.replyTo));
  const replies = (id: string) => messages.filter((m) => m.replyTo === id);
  const { label, detail } = conversationLabel(s, conversation);
  const working = s.jobs.filter(
    (j) => j.conversationId === conversationId && (j.status === 'running' || j.status === 'queued'),
  );
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
    void api('/reads', { body: { conversationId } }).catch(() => {});
  }, [messages.length, conversationId]);
  if (!conversation) return null;
  return (
    <section className="conversation" aria-label={label}>
      <header>
        <div>
          <h2>{label}</h2>
          <small>{detail}</small>
        </div>
        <button aria-label="Close conversation" onClick={() => setUi({ conversationId: null })}>
          <X size={15} />
        </button>
      </header>
      <div className="conversation-list" ref={list}>
        {messages.length === 0 && <p className="conversation-empty">No messages yet.</p>}
        {roots.map((m) => (
          <div key={m.id} className="thread">
            <MessageView m={m} />
            {replies(m.id).map((r) => (
              <div key={r.id} className="thread-reply">
                <MessageView m={r} />
              </div>
            ))}
            <ReplyBox
              onSend={(text) =>
                run(() => api('/messages', { body: { conversationId, text, replyTo: m.id } })).then(
                  () => undefined,
                )
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
    </section>
  );
}

function MessageView({ m }: { m: Message }) {
  const { s, user, resource, openResource, run } = useWorkspace();
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
          <strong style={{ color: author?.kind === 'human' ? author.color : undefined }}>
            {author?.name ?? 'Someone'}
          </strong>
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

function ReplyBox({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
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
        if (!text.trim()) return;
        void onSend(text).then(() => {
          setText('');
          setOpen(false);
        });
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Reply in thread"
        aria-label="Reply in thread"
      />
    </form>
  );
}
