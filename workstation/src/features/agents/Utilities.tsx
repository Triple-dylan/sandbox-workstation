import { nameStyle } from './Character.tsx';
import { useState } from 'react';
import { Check, Compass, ListChecks, Square, UserPlus } from 'lucide-react';
import { PlanList } from '../plan/Plan.tsx';
import { boardSpot } from '../canvas/Canvas.tsx';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { Avatar, Character, agentState } from './Character.tsx';
import { privateAgentConversation, projectAgentOf } from '../conversations/audience.ts';
import type { Job } from '../../../shared/types.ts';

const jobVerb: Record<Job['kind'], string> = {
  instruction: 'Instruction',
  ask: 'Question',
  proactive: 'Chimed in',
  delegation: 'Delegated work',
  maintenance: 'Updated orientation',
};
const statusText: Record<Job['status'], string> = {
  queued: 'queued',
  running: 'working',
  awaiting_approval: 'needs approval',
  done: 'done',
  failed: 'failed',
};

export function Utilities() {
  const { space } = useWorkspace();
  return (
    <div className="utilities">
      <AgentCard />
      <GoalsCard />
      {space.kind === 'project' && <OrientationCard />}
      {space.kind === 'project' && <PeopleCard />}
    </div>
  );
}

function AgentCard() {
  const { s, space, run, openConversation, resource } = useWorkspace();
  const agent =
    space.kind === 'project' ? projectAgentOf(s, space.id) : privateAgentConversation(s)?.agent;
  if (!agent) return null;
  const state = agentState(agent.id, s.jobs);
  const jobs = s.jobs.filter((j) => j.agentId === agent.id && j.spaceId === space.id).slice(0, 4);
  const approvals = s.approvals
    .filter((a) => a.agentId === agent.id && a.status === 'pending')
    .slice(0, 3);
  const assignments = s.assignments.filter((a) => a.agentId === agent.id && a.active).slice(0, 3);
  const stateLine =
    state === 'working'
      ? 'Working'
      : state === 'waiting'
        ? 'Waiting for your approval'
        : state === 'failed'
          ? 'Last job failed'
          : 'Idle';
  return (
    <section className="card agent-card" aria-label={`${agent.name} status`}>
      <header>
        <Character agent={agent} size={40} state={state} />
        <div>
          <h2>{agent.name}</h2>
          <small>
            {stateLine} · {s.runtime.label}
            {s.runtime.model ? ` (${s.runtime.model})` : ''}
          </small>
        </div>
      </header>
      {approvals.length > 0 && (
        <ul className="card-list" aria-label="Waiting for approval">
          {approvals.map((a) => (
            <li key={a.id} className="approval-row">
              <span>
                {a.proposal.kind === 'create-agent' ? 'Add agent' : 'Create'} “{a.proposal.title}”?
              </span>
              <button
                className="primary"
                aria-label={`Approve ${a.proposal.title}`}
                onClick={() =>
                  void run(() => api(`/approvals/${a.id}`, { body: { decision: 'approved' } }))
                }
              >
                <Check size={12} />
              </button>
              <button
                onClick={() =>
                  void run(() => api(`/approvals/${a.id}`, { body: { decision: 'declined' } }))
                }
              >
                Decline
              </button>
            </li>
          ))}
        </ul>
      )}
      {assignments.length > 0 && (
        <ul className="card-list" aria-label="Ongoing responsibilities">
          {assignments.map((a) => (
            <li key={a.id}>
              <span className="truncate" title={a.instruction}>
                Ongoing: {a.instruction}
              </span>
              <button
                aria-label="Stop this responsibility"
                title="Stop"
                onClick={() => void run(() => api(`/assignments/${a.id}/stop`, { body: {} }))}
              >
                <Square size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {jobs.length > 0 ? (
        <ul className="card-list jobs" aria-label="Recent work">
          {jobs.map((j) => (
            <li key={j.id}>
              <button
                className="truncate"
                disabled={!j.conversationId}
                onClick={() => j.conversationId && openConversation(j.conversationId)}
                title={j.error ?? j.request}
              >
                {jobVerb[j.kind]}
                {j.targetResourceId && resource(j.targetResourceId)
                  ? ` · ${resource(j.targetResourceId)!.title}`
                  : ''}
              </button>
              <span className={`status status-${j.status}`}>{statusText[j.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-empty">
          {space.kind === 'project'
            ? 'Ask it something from the composer, or delegate an ongoing job.'
            : 'Only you can see this agent and what you ask it.'}
        </p>
      )}
    </section>
  );
}

function GoalsCard() {
  const { s, space, setUi, run } = useWorkspace();
  const total = s.goals.filter((g) => g.spaceId === space.id);
  const open = total.filter((g) => !g.done).length;
  const openPlan = async () => {
    const existing = s.resources.find((r) => r.spaceId === space.id && r.kind === 'plan');
    if (!existing?.placement) {
      const placement = boardSpot(s, space.id, { width: 408, height: 312 });
      await run(() =>
        api('/resources', { body: { spaceId: space.id, kind: 'plan', body: '', placement } }),
      );
    }
    setUi({ surface: 'canvas', readerId: null, wide: false, selectedId: existing?.id ?? null });
  };
  return (
    <section className="card" aria-label="Goals">
      <header>
        <ListChecks size={16} />
        <h2>Goals</h2>
        <button className="link" onClick={() => void openPlan()}>
          {total.length ? `Open plan${open > 4 ? ` · ${open} open` : ''}` : 'Start a plan'}
        </button>
      </header>
      {total.length > 0 && <PlanList spaceId={space.id} compact />}
    </section>
  );
}

function OrientationCard() {
  const { s, space, openResource } = useWorkspace();
  const doc = s.resources.find((r) => r.spaceId === space.id && r.role === 'orientation');
  if (!doc) return null;
  const lines = doc.body
    .split('\n')
    .filter((l) => /^\s*[-*]\s/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s*/, '').replace(/[*_`]/g, ''))
    .slice(0, 3);
  return (
    <section className="card" aria-label="Orientation">
      <header>
        <Compass size={16} />
        <h2>Orientation</h2>
        <button className="link" onClick={() => openResource(doc.id)}>
          Open
        </button>
      </header>
      {lines.length ? (
        <ul className="card-lines">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="card-empty">The project agent fills this in as work happens.</p>
      )}
    </section>
  );
}

function PeopleCard() {
  const { s, space, run, user } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const members = s.members
    .filter((m) => m.spaceId === space.id && m.role !== 'agent')
    .map((m) => user(m.userId)!)
    .filter(Boolean);
  const candidates = s.users.filter(
    (u) => u.kind === 'human' && !members.some((m) => m.id === u.id),
  );
  const presence = (id: string) => s.presence.find((p) => p.userId === id && p.online);
  return (
    <section className="card" aria-label="People in this project">
      <header>
        <h2>People</h2>
        {candidates.length > 0 && (
          <button className="link" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <UserPlus size={13} /> Add
          </button>
        )}
      </header>
      {adding && (
        <div className="add-people">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setAdding(false);
                void run(() => api(`/projects/${space.id}/members`, { body: { userId: c.id } }));
              }}
            >
              <Avatar user={c} size={16} /> {c.name}
            </button>
          ))}
        </div>
      )}
      <ul className="card-list">
        {members.slice(0, 6).map((m) => {
          if (m.id === s.me.id)
            return (
              <li key={m.id}>
                <span className="presence-wrap">
                  <Avatar user={m} size={18} />
                  <i className="presence-dot on" />
                </span>
                <span className="truncate" style={nameStyle(m.color)}>
                  {m.name} (you)
                </span>
              </li>
            );
          const p = presence(m.id);
          const where =
            p?.spaceId === space.id
              ? p.resourceId
                ? s.resources.find((r) => r.id === p.resourceId)?.title
                : p.surface
              : null;
          return (
            <li key={m.id}>
              <span className="presence-wrap">
                <Avatar user={m} size={18} />
                <i className={`presence-dot ${p ? 'on' : ''}`} />
              </span>
              <span className="truncate" style={nameStyle(m.color)}>
                {m.name}
              </span>
              <small>{p ? (where ? `on ${where}` : 'online') : 'away'}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
