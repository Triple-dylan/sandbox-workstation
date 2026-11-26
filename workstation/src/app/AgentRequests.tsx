import { useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../data/client.ts';
import { Character } from '../features/agents/Character.tsx';
import type { AgentRequest, Message } from '../../shared/types.ts';
import { useWorkspace } from './workspace.tsx';

/**
 * Someone's agent asked yours. It comes to you first: your agent drafts an answer below, you read
 * it, and only what you send reaches them.
 */
export function IncomingRequests() {
  const { s, user, run } = useWorkspace();
  const waiting = s.agentRequests.filter(
    (r) => r.toUserId === s.me.id && (r.status === 'pending' || r.status === 'drafting'),
  );
  if (!waiting.length) return null;
  return (
    <div className="requests">
      {waiting.map((r) => {
        const asker = user(r.fromUserId);
        return (
          <div key={r.id} className="request">
            <p className="request-who">
              {user(r.fromAgentId) && <Character agent={user(r.fromAgentId)!} size={16} />}
              {asker?.name}'s agent asks, for {asker?.name}
            </p>
            <p className="request-text">“{r.request}”</p>
            {r.status === 'pending' ? (
              <p className="request-actions">
                <button
                  className="primary"
                  onClick={() => void run(() => api(`/agent-requests/${r.id}/draft`, { body: {} }))}
                >
                  Draft an answer
                </button>
                <button
                  onClick={() =>
                    void run(() => api(`/agent-requests/${r.id}/decline`, { body: {} }))
                  }
                >
                  Decline
                </button>
                <small>Nothing is shared until you send it.</small>
              </p>
            ) : (
              <p className="request-note">Your agent is drafting it below. You send it, or not.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What your agent asked teammates' agents, and where each stands. */
export function OutgoingRequests() {
  const { s, user } = useWorkspace();
  const mine = s.agentRequests.filter(
    (r) =>
      r.fromUserId === s.me.id &&
      r.status !== 'sent' &&
      Date.now() - Date.parse(r.createdAt) < 7 * 24 * 3600_000,
  );
  if (!mine.length) return null;
  return (
    <div className="requests out">
      {mine.map((r) => {
        const who = user(r.toUserId)?.name ?? 'They';
        return (
          <p key={r.id} className={`request-status is-${r.status}`}>
            {r.status === 'declined' ? `${who} declined` : `Waiting for ${who}`}: “{r.request}”
          </p>
        );
      })}
    </div>
  );
}

/** The request an answer in your conversation is a draft for, if it is one. */
export function draftFor(
  requests: AgentRequest[],
  thread: Message[],
  answer: Message,
): AgentRequest | undefined {
  return requests.find((r) => {
    if (r.status !== 'drafting' || !r.draftId) return false;
    const at = thread.findIndex((m) => m.id === r.draftId);
    if (at < 0) return false;
    // The first answer after the request was put to your agent.
    return thread.slice(at + 1).find((m) => m.authorId !== thread[at].authorId)?.id === answer.id;
  });
}

/** Send your agent's draft to the person who asked, as it is or after you change it. */
export function SendDraft({ request, text }: { request: AgentRequest; text: string }) {
  const { user, run, notify } = useWorkspace();
  const [editing, setEditing] = useState(!text);
  const [draft, setDraft] = useState(text);
  const who = user(request.fromUserId)?.name ?? 'them';
  const send = (words: string) =>
    void run(() => api(`/agent-requests/${request.id}/send`, { body: { text: words } })).then(
      (ok) => ok && notify(`Sent to ${who}.`),
    );
  return (
    <div className="send-draft">
      {!text && (
        <p className="request-note">Your agent couldn't draft this. Write the answer yourself.</p>
      )}
      {editing && (
        <textarea
          rows={4}
          value={draft}
          aria-label={`What to send ${who}`}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <p className="request-actions">
        <button
          className="primary"
          disabled={!(editing ? draft : text).trim()}
          onClick={() => send(editing ? draft : text)}
        >
          <Send size={12} /> Send to {who}
        </button>
        {!editing && <button onClick={() => setEditing(true)}>Edit first</button>}
        <button
          onClick={() => void run(() => api(`/agent-requests/${request.id}/decline`, { body: {} }))}
        >
          Don't send
        </button>
      </p>
    </div>
  );
}
