import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Lock, MessageSquareText, Square, Users } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, ago } from '../app/util.tsx';
import { Avatar, Character, agentState, orbForm } from '../features/agents/Character.tsx';
import { ApprovalCard } from '../features/feed/Feed.tsx';
import { ORB_FORMS, isPage } from '../../shared/types.ts';
import type { Job, User } from '../../shared/types.ts';

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
  waiting: 'Waiting for a person to say yes',
  failed: 'The last job failed',
};

/** A person, or an agent: what it is doing, who can see it, and how it should behave. */
export function WhoPage({ who }: { who: User }) {
  const { s, setUi, run, open, resource, closePane, ui, notify } = useWorkspace();
  const [name, setName] = useState(who.name);
  const [purpose, setPurpose] = useState(who.purpose ?? '');
  const [instructions, setInstructions] = useState(who.instructions ?? '');
  const [retiring, setRetiring] = useState(false);
  if (who.kind === 'human') {
    const pages = s.resources.filter((r) => r.ownerId === who.id && isPage(r.kind)).slice(0, 12);
    return (
      <div className="who">
        <header>
          <Avatar user={who} size={56} />
          <div>
            <h2>{who.name}</h2>
          </div>
        </header>
        <h3>Pages they started</h3>
        {pages.map((p) => (
          <button key={p.id} className="need row" onClick={() => open({ type: 'page', id: p.id })}>
            <KindIcon kind={p.kind} />
            <span>
              <strong>{p.title}</strong>
            </span>
            <time>{ago(p.updatedAt)}</time>
          </button>
        ))}
      </div>
    );
  }
  const personal = who.role === 'personal';
  const editable = personal
    ? who.ownerId === s.me.id
    : s.members.some((m) => m.spaceId === who.spaceId && m.userId === s.me.id);
  const space = s.spaces.find((x) => x.id === who.spaceId);
  const state = agentState(who.id, s.jobs);
  const jobs = s.jobs.filter((j) => j.agentId === who.id).slice(0, 8);
  const approvals = s.approvals.filter((a) => a.agentId === who.id && a.status === 'pending');
  const assignments = s.assignments.filter((a) => a.agentId === who.id && a.active);
  const chat = personal
    ? s.conversations.find((c) => c.kind === 'agent-private' && c.participantIds.includes(who.id))
    : s.conversations.find((c) => c.kind === 'channel' && c.spaceId === who.spaceId);
  const dirty =
    name !== who.name ||
    purpose !== (who.purpose ?? '') ||
    instructions !== (who.instructions ?? '');
  const patch = (body: Record<string, unknown>) =>
    run(() => api(`/agents/${who.id}`, { method: 'PATCH', body }));
  const talk = () => {
    if (!chat) return;
    if (!personal)
      setUi((old) => ({ drafts: { ...old.drafts, [`chat:${chat.id}`]: `@${who.name} ` } }));
    open({ type: 'chat', id: chat.id }, true);
  };
  return (
    <div className="who">
      <header>
        <Character agent={who} size={64} state={state} />
        <div>
          <h2>{who.name}</h2>
          <span className={`reach-badge ${personal ? 'private' : 'shared'}`}>
            {personal ? <Lock size={12} /> : <Users size={12} />}
            {personal ? 'Private to you' : `Shared with ${space?.name ?? 'the space'}`}
          </span>
          <small>
            {personal
              ? 'Only you can talk to it, and only you see what it says and does.'
              : 'Everyone in the space can ask it, in channels and on pages.'}
          </small>
          <small>{stateLine[state]}</small>
        </div>
        <button className="primary" onClick={talk} disabled={!chat}>
          <MessageSquareText size={14} />{' '}
          {personal ? `Talk to ${who.name}` : `Ask in #${chat?.title ?? 'a channel'}`}
        </button>
      </header>

      <h3>Work</h3>
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approvalId={a.id} />
      ))}
      {assignments.map((a) => (
        <p key={a.id} className="who-line">
          <span>Ongoing: {a.instruction}</span>
          <button onClick={() => void run(() => api(`/assignments/${a.id}/stop`, { body: {} }))}>
            <Square size={11} /> Stop
          </button>
        </p>
      ))}
      {jobs.length + approvals.length + assignments.length === 0 && (
        <p className="feed-empty">Nothing yet. Ask it something and its work shows up here.</p>
      )}
      {jobs.map((j) => {
        const target = resource(j.targetResourceId);
        return (
          <button
            key={j.id}
            className="need row"
            disabled={!target && !j.conversationId}
            title={j.error ?? j.request}
            onClick={() =>
              target
                ? open({ type: 'page', id: target.id }, true)
                : j.conversationId && open({ type: 'chat', id: j.conversationId }, true)
            }
          >
            <span className={`status status-${j.status}`}>
              {j.status === 'awaiting_approval' ? 'needs a yes' : j.status}
            </span>
            <span>
              <strong>{verb[j.kind]}</strong>
              <small>{target ? target.title : j.request.slice(0, 140)}</small>
            </span>
            <time>{ago(j.updatedAt)}</time>
          </button>
        );
      })}

      <h3>
        Skills <small>ways of working it has been given</small>
      </h3>
      <Skills who={who} editable={editable} />

      <h3>About this agent</h3>
      <fieldset disabled={!editable} className="who-form">
        <label>
          <span>Name</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="agent-forms" role="radiogroup" aria-label="Look">
          {ORB_FORMS.map((form) => (
            <button
              type="button"
              key={form}
              role="radio"
              aria-checked={orbForm(who) === form}
              aria-label={`Look: ${form}`}
              title={form}
              onClick={() => void patch({ form })}
            >
              <Character agent={who} size={32} form={form} />
            </button>
          ))}
        </div>
        <div className="agent-hues" role="radiogroup" aria-label="Colour">
          {[20, 60, 110, 160, 200, 240, 280, 330].map((hue) => (
            <button
              type="button"
              key={hue}
              role="radio"
              aria-checked={Math.abs((who.character?.hue ?? -99) - hue) < 20}
              aria-label={`Colour ${hue}`}
              style={{ background: `hsl(${hue} 42% 52%)` }}
              onClick={() => void patch({ hue })}
            />
          ))}
        </div>
        <label>
          <span>What it is for</span>
          <input
            value={purpose}
            maxLength={300}
            placeholder={personal ? 'Help me with my own work' : 'Keep this space organised'}
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
        <p className="who-note">
          {personal
            ? `It sees what you can see (${s.spaces.map((x) => (x.kind === 'personal' ? 'your space' : x.name)).join(', ')}).`
            : 'It sees what is shared with the space, and private pages only when their owner adds it.'}{' '}
          Changes it suggests need a person to accept them. Answers come from {s.runtime.label}
          {s.runtime.model ? ` (${s.runtime.model})` : ''}.
        </p>
        <div className="who-save">
          <button
            type="button"
            className="primary"
            disabled={!dirty || !name.trim()}
            onClick={() =>
              void patch({ name, purpose, instructions }).then((ok) => ok && notify('Saved.'))
            }
          >
            Save changes
          </button>
          <button
            type="button"
            className="danger"
            onBlur={() => setRetiring(false)}
            onClick={() => {
              if (!retiring) return setRetiring(true);
              void run(() => api(`/agents/${who.id}/retire`, { body: {} })).then((ok) => {
                if (!ok) return;
                const index = ui.panes.findIndex((t) => t.type === 'who' && t.id === who.id);
                if (index >= 0) closePane(index);
                notify(`${who.name} is retired. Its history stays.`);
              });
            }}
          >
            {retiring ? 'Retire now? Click again' : 'Retire'}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

/** The skills an agent has, the ones it could have, and a place to write a new one. */
function Skills({ who, editable }: { who: User; editable: boolean }) {
  const { s, run } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  const [steps, setSteps] = useState('');
  const personal = who.role === 'personal';
  const home = personal ? s.spaces.find((x) => x.kind === 'personal')!.id : who.spaceId!;
  const available = s.skills.filter((k) => k.spaceId === home);
  const has = new Set(who.skillIds ?? []);
  const begin = (id: string) => {
    const skill = s.skills.find((k) => k.id === id);
    setEditing(id);
    setName(skill?.name ?? '');
    setWhen(skill?.description ?? '');
    setSteps(skill?.body ?? '');
  };
  const save = async () => {
    const body = { name, description: when, body: steps };
    if (editing === 'new') {
      const made = await run(() =>
        api<{ id: string }>('/skills', { body: { spaceId: home, ...body } }),
      );
      if (made)
        await run(() => api(`/agents/${who.id}/skills`, { body: { skillId: made.id, on: true } }));
    } else await run(() => api(`/skills/${editing}`, { method: 'PATCH', body }));
    setEditing(null);
  };
  return (
    <div className="skills">
      {available.length === 0 && editing !== 'new' && (
        <p className="feed-empty">
          No skills yet. A skill is a way of doing one kind of job, written once: when to use it and
          the steps. You can also ask the agent to “remember how to …” and approve what it writes.
        </p>
      )}
      {available.map((k) =>
        editing === k.id ? null : (
          <div key={k.id} className={`skill ${has.has(k.id) ? 'on' : ''}`}>
            <button
              role="switch"
              aria-checked={has.has(k.id)}
              aria-label={`${who.name} uses ${k.name}`}
              disabled={!editable}
              onClick={() =>
                void run(() =>
                  api(`/agents/${who.id}/skills`, { body: { skillId: k.id, on: !has.has(k.id) } }),
                )
              }
            />
            <button
              className="skill-text"
              disabled={!editable}
              onClick={() => begin(k.id)}
              title="Edit this skill"
            >
              <strong>{k.name}</strong>
              <small>{k.description || k.body.slice(0, 90)}</small>
            </button>
            <span className="tag">{personal ? 'private' : 'shared'}</span>
          </div>
        ),
      )}
      {editing && (
        <form
          className="skill-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Name, e.g. Launch copy"
            aria-label="Skill name"
            onChange={(e) => setName(e.target.value)}
          />
          <input
            value={when}
            maxLength={300}
            placeholder="When to use it, e.g. When asked to write announcement copy"
            aria-label="When to use it"
            onChange={(e) => setWhen(e.target.value)}
          />
          <textarea
            rows={5}
            value={steps}
            placeholder={
              'The steps, written as instructions.\n1. Lead with the customer problem.\n2. One claim per paragraph, each with its source page.'
            }
            aria-label="Steps"
            onChange={(e) => setSteps(e.target.value)}
          />
          <div>
            {editing !== 'new' && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void run(() => api(`/skills/${editing}`, { method: 'DELETE' }));
                  setEditing(null);
                }}
              >
                <Trash2 size={12} /> Delete skill
              </button>
            )}
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={!name.trim()}>
              {editing === 'new' ? `Save and give to ${who.name}` : 'Save'}
            </button>
          </div>
          <small>
            {personal
              ? 'Private: only your own agents can use it.'
              : 'Shared: any agent in this space can be given it, and anyone in the space can edit it.'}
          </small>
        </form>
      )}
      {editable && !editing && (
        <button className="skill-add" onClick={() => begin('new')}>
          <Plus size={13} /> New skill
        </button>
      )}
    </div>
  );
}
