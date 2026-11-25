import { nameStyle } from '../agents/Character.tsx';
import { useState } from 'react';
import { ArrowDown, ArrowUp, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Goal, Id } from '../../../shared/types.ts';

/**
 * The space's steps in order. The board's plan and the Goals card are two views of these same
 * records, so a change in one shows in the other.
 */
export function PlanList({ spaceId, compact = false }: { spaceId: Id; compact?: boolean }) {
  const { s, run, user, open } = useWorkspace();
  const [draft, setDraft] = useState('');
  const goals = s.goals.filter((g) => g.spaceId === spaceId);
  const members = s.members.filter((m) => m.spaceId === spaceId).map((m) => user(m.userId)!);
  const people = members.filter((u) => u?.kind === 'human');
  const agents = members.filter((u) => u?.kind === 'agent' && !u.retired);
  const move = (goal: Goal, direction: 'up' | 'down') =>
    void run(() => api(`/goals/${goal.id}/move`, { body: { direction } }));
  const patch = (goal: Goal, body: Record<string, unknown>) =>
    void run(() => api(`/goals/${goal.id}`, { method: 'PATCH', body }));
  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await run(() => api('/goals', { body: { spaceId, title } }));
  };
  const shown = compact ? goals.filter((g) => !g.done).slice(0, 4) : goals;
  return (
    <div className={`plan ${compact ? 'compact' : ''}`}>
      {goals.length === 0 && (
        <p className="card-empty">No steps yet.{compact ? '' : ' Add the first one below.'}</p>
      )}
      <ol>
        {shown.map((g, index) => {
          const source = g.sourceMessageId && s.messages.find((m) => m.id === g.sourceMessageId);
          return (
            <li key={g.id} className={g.done ? 'done' : ''}>
              <button
                className="plan-check"
                role="checkbox"
                aria-checked={g.done}
                aria-label={`${g.done ? 'Reopen' : 'Complete'} ${g.title}`}
                onClick={() => patch(g, { done: !g.done })}
              />
              {compact ? (
                <span className="plan-title">{g.title}</span>
              ) : (
                <input
                  className="plan-title"
                  defaultValue={g.title}
                  key={g.title}
                  aria-label="Step"
                  onBlur={(e) =>
                    e.target.value.trim() !== g.title && patch(g, { title: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              )}
              {!compact && (
                <span className="plan-meta">
                  {source && (
                    <button
                      title="Open the message this came from"
                      aria-label="Open the message this came from"
                      onClick={() => open({ type: 'chat', id: source.conversationId }, true)}
                    >
                      <MessageSquareText size={12} />
                    </button>
                  )}
                  <select
                    aria-label="Owner"
                    value={g.ownerId ?? ''}
                    style={nameStyle(user(g.ownerId)?.color)}
                    onChange={(e) => patch(g, { ownerId: e.target.value || null })}
                  >
                    <option value="">Owner</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Agent"
                    value={g.agentId ?? ''}
                    onChange={(e) => patch(g, { agentId: e.target.value || null })}
                  >
                    <option value="">Agent</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    aria-label="Date"
                    value={g.due ?? ''}
                    onChange={(e) => patch(g, { due: e.target.value || null })}
                  />
                  <button
                    className="plan-move"
                    aria-label={`Move ${g.title} earlier`}
                    title="Earlier"
                    disabled={index === 0}
                    onClick={() => move(g, 'up')}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={`Move ${g.title} later`}
                    title="Later"
                    disabled={index === shown.length - 1}
                    onClick={() => move(g, 'down')}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    aria-label={`Remove ${g.title}`}
                    title="Remove"
                    onClick={() => void run(() => api(`/goals/${g.id}`, { method: 'DELETE' }))}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!compact && (
        <form
          className="plan-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Plus size={14} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a next step"
            aria-label="Add a next step"
          />
        </form>
      )}
    </div>
  );
}
