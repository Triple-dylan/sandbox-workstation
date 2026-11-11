import { useEffect, useState } from 'react';
import { Check, Lock, MessageSquareText, Square, Users, X } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { Character, agentState } from './Character.tsx';
import { myAgents } from '../conversations/audience.ts';
import type { Job } from '../../../shared/types.ts';

const verb: Record<Job['kind'], string> = {
  instruction: 'Asked',
  ask: 'Asked',
  proactive: 'Chimed in',
  delegation: 'Ongoing work',
  maintenance: 'Kept the orientation current',
};
const stateLine = {
  idle: 'Not working on anything right now',
  working: 'Working',
  waiting: 'Waiting for approval',
  failed: 'The last job failed',
};

/** One agent: what it is doing and saying first, then who it is and how it should behave. */
export function AgentPanel({ agentId }: { agentId: string }) {
  const { s, setUi, run, user, resource, openConversation, openResource } = useWorkspace();
  const agent = user(agentId)!;
  const [name, setName] = useState(agent.name);
  const [purpose, setPurpose] = useState(agent.purpose ?? '');
  const [instructions, setInstructions] = useState(agent.instructions ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setName(agent.name);
    setPurpose(agent.purpose ?? '');
    setInstructions(agent.instructions ?? '');
    // Reset the form only when a different agent is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);
  const personal = agent.role === 'personal';
  const mine = personal ? myAgents(s).find((m) => m.agent.id === agent.id) : undefined;
  const home = personal
    ? mine?.conversation
    : s.conversations.find((c) => c.kind === 'channel' && c.spaceId === agent.spaceId);
  const space = s.spaces.find((x) => x.id === agent.spaceId);
  const state = agentState(agent.id, s.jobs);
  const jobs = s.jobs.filter((j) => j.agentId === agent.id).slice(0, 6);
  const approvals = s.approvals.filter((a) => a.agentId === agent.id && a.status === 'pending');
  const assignments = s.assignments.filter((a) => a.agentId === agent.id && a.active);
  const said = s.messages.filter((m) => m.authorId === agent.id).slice(-2);
  const dirty =
    name !== agent.name ||
    purpose !== (agent.purpose ?? '') ||
    instructions !== (agent.instructions ?? '');
  const save = async () => {
    const done = await run(() =>
      api(`/agents/${agent.id}`, { method: 'PATCH', body: { name, purpose, instructions } }),
    );
    if (done) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };
  const talk = () => {
    if (!home) return;
    if (!personal && agent.spaceId)
      setUi((old) => ({
        spaceId: agent.spaceId!,
        audience: {
          ...old.audience,
          [agent.spaceId!]: { kind: 'instruct', conversationId: home.id, agentId: agent.id },
        },
      }));
    openConversation(home.id);
  };
  return (
    <section className="agent-panel" aria-label={agent.name}>
      <header>
        <Character agent={agent} size={64} state={state} />
        <div>
          <h2>{agent.name}</h2>
          <small>
            {personal ? <Lock size={11} /> : <Users size={11} />}
            {personal ? 'Private to you' : `Shared with ${space?.name ?? 'the project'}`}
          </small>
          <small>{stateLine[state]}</small>
        </div>
        <button aria-label="Close agent" onClick={() => setUi({ agentId: null })}>
          <X size={15} />
        </button>
      </header>
      <div className="agent-scroll">
        <button className="primary agent-talk" onClick={talk} disabled={!home}>
          <MessageSquareText size={14} /> Talk to {agent.name}
        </button>

        <h3>Work</h3>
        {approvals.map((a) => (
          <div key={a.id} className="approval">
            <div>
              <strong>
                Wants to {a.proposal.kind === 'create-agent' ? 'add an agent called' : 'create'} “
                {a.proposal.title}”
              </strong>
              <small>{a.proposal.body.replace(/[#*_`]/g, '').slice(0, 140)}</small>
            </div>
            <div className="approval-actions">
              <button
                className="primary"
                onClick={() =>
                  void run(() => api(`/approvals/${a.id}`, { body: { decision: 'approved' } }))
                }
              >
                <Check size={13} /> Approve
              </button>
              <button
                onClick={() =>
                  void run(() => api(`/approvals/${a.id}`, { body: { decision: 'declined' } }))
                }
              >
                Decline
              </button>
            </div>
          </div>
        ))}
        {assignments.map((a) => (
          <p key={a.id} className="agent-line">
            <span>Ongoing: {a.instruction}</span>
            <button
              aria-label="Stop this ongoing work"
              onClick={() => void run(() => api(`/assignments/${a.id}/stop`, { body: {} }))}
            >
              <Square size={11} /> Stop
            </button>
          </p>
        ))}
        {jobs.length === 0 && approvals.length === 0 && assignments.length === 0 && (
          <p className="card-empty">Nothing yet. Ask it something and its work shows up here.</p>
        )}
        <ul className="card-list jobs">
          {jobs.map((j) => {
            const target = resource(j.targetResourceId);
            return (
              <li key={j.id}>
                <button
                  className="truncate"
                  title={j.error ?? j.request}
                  disabled={!target && !j.conversationId}
                  onClick={() =>
                    target
                      ? openResource(target.id)
                      : j.conversationId && openConversation(j.conversationId)
                  }
                >
                  {verb[j.kind]}
                  {target ? ` · ${target.title}` : j.request ? ` · ${j.request}` : ''}
                </button>
                <span className={`status status-${j.status}`}>
                  {j.status === 'awaiting_approval' ? 'needs approval' : j.status}
                </span>
              </li>
            );
          })}
        </ul>

        {said.length > 0 && (
          <>
            <h3>Last said</h3>
            {said.map((m) => (
              <button
                key={m.id}
                className="agent-said"
                onClick={() => openConversation(m.conversationId)}
              >
                {m.text.replace(/[#*_`>]/g, '').slice(0, 180)}
              </button>
            ))}
          </>
        )}

        <h3>About this agent</h3>
        <label>
          <span>Name</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="agent-hues" role="radiogroup" aria-label="Colour">
          {[20, 60, 110, 160, 200, 240, 280, 330].map((hue) => (
            <button
              key={hue}
              role="radio"
              aria-checked={Math.abs((agent.character?.hue ?? -99) - hue) < 20}
              aria-label={`Colour ${hue}`}
              style={{ background: `hsl(${hue} 42% 52%)` }}
              onClick={() =>
                void run(() => api(`/agents/${agent.id}`, { method: 'PATCH', body: { hue } }))
              }
            />
          ))}
        </div>
        <label>
          <span>What it is for</span>
          <input
            value={purpose}
            maxLength={300}
            placeholder={personal ? 'Help me with my own work' : 'Keep this project organised'}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <label>
          <span>Standing instructions</span>
          <textarea
            value={instructions}
            rows={5}
            placeholder="How it should work, what to watch for, what to leave alone."
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <p className="card-empty">
          {personal
            ? 'It sees only what you can see, and only you see what it does.'
            : 'It sees what is shared with the project, never private items. Shared changes it proposes need a person to approve them.'}{' '}
          Replies come from the {s.runtime.label.toLowerCase()}
          {s.runtime.model ? ` (${s.runtime.model})` : ''}.
        </p>
        <div className="agent-save">
          <button className="primary" disabled={!dirty || !name.trim()} onClick={() => void save()}>
            Save changes
          </button>
          {saved && <span role="status">Saved</span>}
        </div>
      </div>
    </section>
  );
}
