import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Square } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { KindIcon, ago } from '../app/util.tsx';
import { Avatar, Character, agentState, orbForm } from '../features/agents/Character.tsx';
import { ApprovalCard } from '../features/feed/Feed.tsx';
import { ORB_FORMS, isPage } from '../../shared/types.ts';
import type { Job, RoutineCadence, User } from '../../shared/types.ts';

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
  const { s, run, open, resource, closePane, ui, notify } = useWorkspace();
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
  const state = agentState(who.id, s.jobs);
  const jobs = s.jobs.filter((j) => j.agentId === who.id).slice(0, 4);
  const approvals = s.approvals.filter((a) => a.agentId === who.id && a.status === 'pending');
  const assignments = s.assignments.filter((a) => a.agentId === who.id && a.active);
  const patch = (body: Record<string, unknown>) =>
    run(() => api(`/agents/${who.id}`, { method: 'PATCH', body }));
  // Settings save when you leave the field; what it is for and how it works go into every request.
  const save = (field: 'name' | 'purpose' | 'instructions', value: string, was: string) => {
    if (value.trim() === was.trim() || (field === 'name' && !value.trim())) return;
    void patch({ [field]: value.trim() }).then((ok) => ok && notify('Saved.'));
  };
  return (
    <div className="agent-page">
      <header className="agent-head">
        <Character agent={who} size={64} state={state} />
        <div>
          <input
            className="agent-name"
            aria-label="Name"
            value={name}
            maxLength={40}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => save('name', name, who.name)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="agent-sub">{stateLine[state]}</span>
        </div>
      </header>

      <div className="agent-cols">
        <section className="agent-setup" aria-label="How it works">
          <label>
            <span>What it is for</span>
            <input
              value={purpose}
              maxLength={300}
              disabled={!editable}
              placeholder={personal ? 'Help me with my own work' : 'Keep this workspace organised'}
              onChange={(e) => setPurpose(e.target.value)}
              onBlur={() => save('purpose', purpose, who.purpose ?? '')}
            />
          </label>
          <label className="grow">
            <span>How it should work</span>
            <textarea
              value={instructions}
              disabled={!editable}
              placeholder="What to watch for, how to answer, what to leave alone."
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={() => save('instructions', instructions, who.instructions ?? '')}
            />
          </label>
          <div className="agent-look">
            <span>Look</span>
            <div className="agent-forms" role="radiogroup" aria-label="Look">
              {ORB_FORMS.map((form) => (
                <button
                  type="button"
                  key={form}
                  role="radio"
                  disabled={!editable}
                  aria-checked={orbForm(who) === form}
                  aria-label={`Look: ${form}`}
                  title={form}
                  onClick={() => void patch({ form })}
                >
                  <Character agent={who} size={20} form={form} />
                </button>
              ))}
            </div>
            <div className="agent-hues" role="radiogroup" aria-label="Colour">
              {[20, 60, 110, 160, 200, 240, 280, 330].map((hue) => (
                <button
                  type="button"
                  key={hue}
                  role="radio"
                  disabled={!editable}
                  aria-checked={Math.abs((who.character?.hue ?? -99) - hue) < 20}
                  aria-label={`Colour ${hue}`}
                  style={{ background: `hsl(${hue} 42% 52%)` }}
                  onClick={() => void patch({ hue })}
                />
              ))}
            </div>
          </div>
          {editable && !personal && (
            <button
              type="button"
              className="agent-retire"
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
              {retiring ? 'Click again to retire' : 'Retire this agent'}
            </button>
          )}
        </section>

        <section className="agent-side">
          <h3>Routines</h3>
          <Routines who={who} editable={editable} />
          {assignments.map((a) => (
            <p key={a.id} className="who-line">
              <span>Keeps up: {a.instruction}</span>
              <button
                onClick={() => void run(() => api(`/assignments/${a.id}/stop`, { body: {} }))}
              >
                <Square size={11} /> Stop
              </button>
            </p>
          ))}

          <h3>Skills</h3>
          <Skills who={who} editable={editable} />

          <h3>Recent work</h3>
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approvalId={a.id} />
          ))}
          {jobs.length + approvals.length === 0 && <p className="feed-empty">Nothing yet.</p>}
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
        </section>
      </div>
    </div>
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const when = (r: { cadence: RoutineCadence; weekday: number | null; time: string }) =>
  `${r.cadence === 'daily' ? 'Every day' : r.cadence === 'weekdays' ? 'Weekdays' : `${DAYS[r.weekday ?? 1]}s`} at ${r.time}`;

/** Jobs the agent does on a schedule, written as one sentence each. */
function Routines({ who, editable }: { who: User; editable: boolean }) {
  const { s, run } = useWorkspace();
  const personal = who.role === 'personal';
  const routines = s.routines.filter((r) => r.agentId === who.id);
  const channels = s.conversations.filter((c) => c.kind === 'channel' && c.spaceId === who.spaceId);
  const [adding, setAdding] = useState(false);
  const [cadence, setCadence] = useState<RoutineCadence>('weekdays');
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState('09:00');
  const [instruction, setInstruction] = useState('');
  const [channel, setChannel] = useState(channels[0]?.id ?? '');
  const where = (id: string) =>
    personal ? 'to you' : `in #${s.conversations.find((c) => c.id === id)?.title ?? 'channel'}`;
  return (
    <div className="routines">
      {routines.length === 0 && !adding && <p className="feed-empty">None yet.</p>}
      {routines.map((r) => (
        <p key={r.id} className="who-line">
          <span>
            <b>{when(r)}</b> {r.instruction} <small>{where(r.conversationId)}</small>
          </span>
          {editable && (
            <button
              aria-label="Delete routine"
              onClick={() => void run(() => api(`/routines/${r.id}`, { method: 'DELETE' }))}
            >
              <Trash2 size={11} />
            </button>
          )}
        </p>
      ))}
      {adding ? (
        <form
          className="routine-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!instruction.trim()) return;
            void run(() =>
              api('/routines', {
                body: {
                  agentId: who.id,
                  instruction,
                  cadence,
                  weekday,
                  time,
                  tzOffset: new Date().getTimezoneOffset(),
                  conversationId: personal ? null : channel,
                },
              }),
            ).then((ok) => {
              if (!ok) return;
              setInstruction('');
              setAdding(false);
            });
          }}
        >
          <div className="routine-when">
            <select
              aria-label="How often"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as RoutineCadence)}
            >
              <option value="weekdays">Weekdays</option>
              <option value="daily">Every day</option>
              <option value="weekly">Weekly</option>
            </select>
            {cadence === 'weekly' && (
              <select
                aria-label="Day"
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <input
              type="time"
              aria-label="Time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            {!personal && (
              <select
                aria-label="Post in"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <input
            autoFocus
            aria-label="What to do"
            value={instruction}
            maxLength={1000}
            placeholder="e.g. Summarise what changed and what needs a decision"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
          <div className="routine-actions">
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={!instruction.trim()}>
              Add routine
            </button>
          </div>
        </form>
      ) : (
        editable && (
          <button className="skill-add" onClick={() => setAdding(true)}>
            <Plus size={13} /> New routine
          </button>
        )
      )}
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
        <p className="feed-empty">None yet. A skill is the steps for one kind of job.</p>
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
