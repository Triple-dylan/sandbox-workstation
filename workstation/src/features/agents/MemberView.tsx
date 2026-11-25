import { useState } from 'react';
import { agentTools, type User } from '../../../shared/types.ts';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { Actor } from './Character.tsx';

/** The only standalone identity view is the signed-in person's account. */
export function MemberView({ member }: { member: User }) {
  const { s, ui, setUi } = useWorkspace();
  return (
    <article className="member-view">
      <header>
        <Actor user={member} jobs={s.jobs} size={38} />
        <div>
          <h1>{member.name}</h1>
          <p>Your account</p>
        </div>
        <button className="link" onClick={() => setUi({ memberId: null })}>
          Return to work
        </button>
      </header>
      <div className="member-settings">
        <label>
          Appearance
          <select
            value={ui.theme}
            onChange={(e) => {
              const theme = e.target.value;
              if (theme === 'system' || theme === 'light' || theme === 'dark') setUi({ theme });
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button
          className="link"
          onClick={() => void api('/logout', { body: {} }).then(() => location.reload())}
        >
          Sign out
        </button>
      </div>
    </article>
  );
}

/** Secondary configuration stays inside the agent's conversation, never in a popup. */
export function AgentSettings({ agent }: { agent: User }) {
  const { s, run } = useWorkspace();
  const settings = s.agentSettings[agent.id];
  const [name, setName] = useState(agent.name);
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const editable =
    !!settings &&
    (agent.ownerId === s.me.id ||
      s.spaces.some((space) => space.id === agent.spaceId && space.ownerId === s.me.id));
  if (!settings || !draft) return null;
  return (
    <details className="agent-settings-disclosure">
      <summary>About {agent.name}</summary>
      <form
        className="member-settings"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            api(`/agents/${agent.id}`, { method: 'PATCH', body: { name, ...draft } }),
          ).then((result) => {
            if (result) setSaved(true);
          });
        }}
      >
        <p className="settings-scope">
          {agent.spaceId
            ? `Works in ${s.spaces.find((space) => space.id === agent.spaceId)?.name ?? 'this project'}. Project members can talk to this agent; direct messages stay private.`
            : 'Your personal agent. This conversation is private.'}
        </p>
        <label>
          Name
          <input
            value={name}
            required
            readOnly={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Instructions
          <textarea
            rows={3}
            value={draft.instructions}
            readOnly={!editable}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          />
        </label>
        <label>
          Skills
          <textarea
            rows={2}
            value={draft.skills}
            readOnly={!editable}
            onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Workspace tools</legend>
          {agentTools.map((tool) => (
            <label key={tool}>
              <input
                type="checkbox"
                disabled={!editable}
                checked={draft.tools.includes(tool)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tools: e.target.checked
                      ? [...draft.tools, tool]
                      : draft.tools.filter((t) => t !== tool),
                  })
                }
              />
              {tool}
            </label>
          ))}
        </fieldset>
        <small>These are built-in tools. External workspace plugins are not connected yet.</small>
        {editable && (
          <button className="primary" type="submit">
            Save settings
          </button>
        )}
        {saved && <span role="status">Settings saved</span>}
      </form>
    </details>
  );
}
