import { useContext, useState } from 'react';
import {
  Download,
  Plus,
  Check,
  ChevronRight,
  Lock,
  FolderOpen,
  History,
  Circle,
} from 'lucide-react';
import { Workspace } from './components';
import { agentConfigEqual, newAgent, type AgentConfig } from './agents';

export function AgentEditor() {
  const w = useContext(Workspace);
  const a = w.agents.find((a) => a.id === w.selectedAgent) || w.agents[0];
  const [showVersions, setShowVersions] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const c = a.draft,
    latest = a.versions.at(-1);
  const changed = !latest || !agentConfigEqual(c, latest.config);
  const ready = !!c.name.trim() && !!c.purpose.trim() && !!c.instructions.trim();
  const update = (patch: Partial<AgentConfig>) => {
    setConfirmation('');
    w.updateAgents(w.agents.map((x) => (x.id === a.id ? { ...x, draft: { ...c, ...patch } } : x)));
  };
  const create = () => {
    const next = newAgent();
    w.updateAgents([...w.agents, next]);
    w.selectAgent(next.id);
    setShowVersions(false);
    setConfirmation('');
  };
  const saveVersion = () => {
    if (!ready || !changed) return;
    const version = {
      id: crypto.randomUUID(),
      number: a.versions.length + 1,
      at: new Date().toISOString(),
      config: { ...c },
    };
    w.updateAgents(
      w.agents.map((x) => (x.id === a.id ? { ...x, versions: [...x.versions, version] } : x)),
    );
    setConfirmation(`Version ${version.number} saved on this browser. It has not been deployed.`);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }),
    );
    const el = document.createElement('a');
    el.href = url;
    el.download = `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'agent'}.json`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="agent-editor" key={a.id}>
      <div className="agent-selector-row">
        <label>
          <span className="sr-only">Agent definition</span>
          <select
            aria-label="Agent definition"
            value={a.id}
            onChange={(e) => {
              w.selectAgent(e.target.value);
              setConfirmation('');
            }}
          >
            {w.agents.map((x) => (
              <option key={x.id} value={x.id}>
                {x.draft.name || 'Untitled agent'}
              </option>
            ))}
          </select>
        </label>
        <button className="text-button" onClick={create}>
          <Plus size={14} />
          New agent
        </button>
      </div>
      <div className="agent-edit-scroll">
        <div className="editor-section-heading">
          <span>Definition</span>
          <small>Draft · saved locally</small>
        </div>
        <label className="editor-field">
          Name
          <input
            value={c.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={100}
          />
        </label>
        <label className="editor-field">
          Purpose
          <input
            value={c.purpose}
            onChange={(e) => update({ purpose: e.target.value })}
            placeholder="What is this agent responsible for?"
            maxLength={500}
          />
        </label>
        <label className="editor-field">
          Instructions
          <textarea
            aria-label="Instructions"
            value={c.instructions}
            onChange={(e) => update({ instructions: e.target.value })}
            placeholder="Describe how the agent should approach its work."
            rows={6}
          />
        </label>
        <fieldset className="agent-scope">
          <legend>Where it works</legend>
          <label>
            <input
              type="radio"
              name={`scope-${a.id}`}
              checked={c.scope === 'private'}
              disabled={a.id === 'project-agent'}
              title={
                a.id === 'project-agent'
                  ? 'The dedicated project agent keeps its project scope'
                  : undefined
              }
              onChange={() => update({ scope: 'private' })}
            />
            <Lock size={14} />
            Private
          </label>
          <label>
            <input
              type="radio"
              name={`scope-${a.id}`}
              checked={c.scope === 'project'}
              onChange={() => update({ scope: 'project' })}
            />
            <FolderOpen size={14} />
            Workstation project
          </label>
        </fieldset>
        <section className="agent-context-section">
          <h3>Context</h3>
          <p>
            {c.scope === 'project'
              ? 'Starts with the project’s conversations, goals and resource folder.'
              : 'Starts with the private conversation and resources you explicitly provide.'}
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={c.widerContext}
              onChange={(e) => update({ widerContext: e.target.checked })}
            />
            Search other knowledge I am allowed to access
          </label>
          <small>
            Access is enforced by the connected service. This local definition grants no
            permissions.
          </small>
        </section>
        <section className="agent-policy-section">
          <h3>Changes and approvals</h3>
          {c.scope === 'project' ? (
            <p>
              Consequential shared changes require project approval. Context maintenance follows
              project authority automatically.
            </p>
          ) : (
            <label className="editor-field">
              Before changing private work
              <select
                aria-label="Private agent autonomy"
                value={c.autonomy}
                onChange={(e) => update({ autonomy: e.target.value as AgentConfig['autonomy'] })}
              >
                <option value="ask">Request approval</option>
                <option value="autonomous">Allow autonomous changes</option>
              </select>
            </label>
          )}
          <small>Personal preferences never override shared-resource rules.</small>
        </section>
        <section className="agent-runtime-section">
          <h3>Test and deploy</h3>
          <div className="readiness-row">
            <span>
              {ready ? <Check size={14} /> : <Circle size={14} />}Definition{' '}
              {ready ? 'complete' : 'needs purpose and instructions'}
            </span>
          </div>
          <div className="readiness-row">
            <span>
              {latest ? <Check size={14} /> : <Circle size={14} />}{' '}
              {latest
                ? `Version ${latest.number} saved${changed ? ' · draft has changes' : ''}`
                : 'No saved version'}
            </span>
          </div>
          <p>
            No runtime or tools are connected. Tests and deployment require an authenticated
            execution service.
          </p>
          <div className="agent-runtime-actions">
            <button disabled title="An execution service must be connected">
              Test agent
            </button>
            <button disabled title="A runtime must acknowledge a deployment">
              Deploy agent
            </button>
          </div>
        </section>
        <button
          className="version-toggle"
          aria-expanded={showVersions}
          onClick={() => setShowVersions(!showVersions)}
        >
          <History size={15} />
          Version history <span>{a.versions.length}</span>
          <ChevronRight size={14} className={showVersions ? 'turned' : ''} />
        </button>
        {showVersions && (
          <div className="agent-versions">
            {a.versions.length ? (
              [...a.versions].reverse().map((v) => (
                <details key={v.id}>
                  <summary>
                    Version {v.number}
                    <time>{new Date(v.at).toLocaleString()}</time>
                  </summary>
                  <p>{v.config.purpose}</p>
                  <pre>{v.config.instructions}</pre>
                  <button
                    className="text-button"
                    onClick={() => {
                      update(v.config);
                      setConfirmation(
                        `Version ${v.number} copied into the draft. Saved versions are unchanged.`,
                      );
                    }}
                  >
                    Restore into draft
                  </button>
                </details>
              ))
            ) : (
              <p>Save a version to preserve this definition before it changes.</p>
            )}
          </div>
        )}
      </div>
      <div className="agent-save-bar">
        <button className="text-button" onClick={download} aria-label="Export agent definition">
          <Download size={15} />
          Export
        </button>
        <button className="primary" disabled={!ready || !changed} onClick={saveVersion}>
          Save version
        </button>
      </div>
      {confirmation && (
        <p role="status" className="agent-confirmation">
          {confirmation}
        </p>
      )}
    </div>
  );
}
