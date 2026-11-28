import { useState } from 'react';
import { Backups } from './Backups.tsx';
import { Copy, Link2, Lock, X } from 'lucide-react';
import { Character, type AgentState } from '../features/agents/Character.tsx';
import { AGENT_LOOKS, lookInfo, type AgentLook } from '../features/agents/Looks.tsx';
import type { User } from '../../shared/types.ts';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';
import { DeleteMyData } from './DeleteMyData.tsx';

/**
 * Every popup shares this frame: a title with a close button, the content, and at most one primary
 * action at the bottom right. Esc and a click outside close it.
 */
function Dialog({
  title,
  children,
  wide,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  onClose?: () => void;
}) {
  const { setUi } = useWorkspace();
  const close = onClose ?? (() => setUi({ dialog: null }));
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button aria-label="Close" onClick={close}>
            <X size={15} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export const shortcuts: [string, string][] = [
  ['⌘ K', 'Find a page, or do something'],
  ['⌘ J', 'Your agent: go to its box; again to fold it away'],
  ['⌘ \\', 'Keep the list open, or let it step aside'],
  ['⌘ ,', 'Settings'],
  ['⌘ /', 'This list of shortcuts'],
  ['Alt N', 'New page'],
  ['Alt G', 'Open the graph'],
  ['Alt click', 'Open something beside what is open'],
  ['Right click', 'Quick actions for a page, a piece or an agent'],
  ['/', 'In a document, on an empty line: insert a block'],
  ['V T S R F A C', 'On a canvas: select, text, sticky, shape, section, arrow, comment'],
  ['Delete', 'On a canvas: remove what is selected'],
  ['Esc', 'Close whatever is open'],
];

export function Shortcuts() {
  return (
    <Dialog title="Shortcuts">
      <dl className="keys">
        {shortcuts.map(([keys, what]) => (
          <div key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <p className="dialog-note">On Windows and Linux, ⌘ is Ctrl.</p>
    </Dialog>
  );
}

const accents = [null, 20, 110, 160, 210, 265, 330];

export function Settings() {
  const { ui, setUi, s, run } = useWorkspace();
  const prefs = ui.prefs;
  const set = (patch: Partial<typeof prefs>) => setUi({ prefs: { ...prefs, ...patch } });
  const seg = <T extends string>(
    label: string,
    value: T,
    options: [T, string][],
    pick: (v: T) => void,
  ) => (
    <div className="setting">
      <span>{label}</span>
      <span className="seg" role="radiogroup" aria-label={label}>
        {options.map(([id, name]) => (
          <button key={id} role="radio" aria-checked={value === id} onClick={() => pick(id)}>
            {name}
          </button>
        ))}
      </span>
    </div>
  );
  return (
    <Dialog title="Settings">
      {seg(
        'Appearance',
        ui.theme,
        [
          ['system', 'Match my device'],
          ['light', 'Light'],
          ['dark', 'Dark'],
        ],
        (theme) => setUi({ theme }),
      )}
      {seg(
        'Text size',
        prefs.size,
        [
          ['s', 'Small'],
          ['m', 'Medium'],
          ['l', 'Large'],
        ],
        (size) => set({ size }),
      )}
      {seg(
        'Spacing',
        prefs.density,
        [
          ['roomy', 'Roomy'],
          ['compact', 'Compact'],
        ],
        (density) => set({ density }),
      )}
      <div className="setting">
        <span>Accent</span>
        <span className="swatches" role="radiogroup" aria-label="Accent">
          {accents.map((hue) => (
            <button
              key={String(hue)}
              role="radio"
              aria-checked={prefs.accent === hue}
              aria-label={hue === null ? 'No accent' : `Accent ${hue}`}
              style={{ background: hue === null ? 'var(--ink)' : `hsl(${hue} 55% 48%)` }}
              onClick={() => set({ accent: hue })}
            />
          ))}
        </span>
      </div>
      {seg(
        'The list',
        prefs.list,
        [
          ['auto', 'Out of the way on pages'],
          ['shown', 'Always shown'],
          ['hidden', 'Only at the edge'],
        ],
        (v) => set({ list: v }),
      )}
      {seg(
        "Teammates' cursors",
        prefs.seeCursors === false ? 'hide' : 'show',
        [
          ['show', 'Show'],
          ['hide', 'Hide'],
        ],
        (v) => set({ seeCursors: v === 'show' }),
      )}
      {seg(
        'Share my cursor',
        prefs.shareCursor === false ? 'off' : 'on',
        [
          ['on', 'On'],
          ['off', 'Off'],
        ],
        (v) => set({ shareCursor: v === 'on' }),
      )}
      <div className="setting">
        <span>Agent look</span>
        <span className="setting-pair">
          <span className="seg" role="radiogroup" aria-label="Agent look">
            {AGENT_LOOKS.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={prefs.agentLook === id}
                onClick={() => set({ agentLook: id })}
              >
                {lookInfo[id].name}
              </button>
            ))}
          </span>
          <button className="plain" onClick={() => setUi({ dialog: 'looks' })}>
            Compare
          </button>
        </span>
      </div>
      <DeviceLink />
      <Backups />
      {s.connectors?.map((c) => (
        <div className="setting" key={c.id}>
          <span>{c.name}</span>
          {!c.ready ? (
            <small className="muted">Not set up on this server yet</small>
          ) : c.account ? (
            <span className="setting-pair">
              <small className="muted truncate">{c.account}</small>
              <button
                className="plain"
                onClick={() => void run(() => api(`/connections/${c.id}`, { method: 'DELETE' }))}
              >
                Disconnect
              </button>
            </span>
          ) : (
            <a className="plain" href={`/api/connect/${c.id}`}>
              Connect
            </a>
          )}
        </div>
      ))}
      <div className="setting">
        <span>Shortcuts</span>
        <button className="plain" onClick={() => setUi({ dialog: 'shortcuts' })}>
          See them all
        </button>
      </div>
      <div className="setting">
        <span>My data</span>
        <a className="plain" href="/api/me/export" download>
          Download
        </a>
      </div>
      <DeleteMyData />
      <p className="dialog-note">
        Saved in this browser.{' '}
        {s.runtime.id === 'none'
          ? 'Agents are not connected on this server yet: it needs an OpenAI key.'
          : `Agents answer with ${s.runtime.model || s.runtime.label}${s.runtime.fallback ? `, or ${s.runtime.fallback} when OpenAI is unavailable` : ''}.`}
      </p>
    </Dialog>
  );
}

/** Pasting text in from somewhere else: a transcript, an email, notes. */
// Example agents for comparing the looks: made up, and labelled so on the page.
const exampleAgent = (
  id: string,
  name: string,
  hue: number,
  form: NonNullable<User['character']>['form'],
  role: User['role'],
): User => ({
  id,
  name,
  color: `hsl(${hue} 55% 48%)`,
  kind: 'agent',
  role,
  character: { hue, shape: 'round', eyes: 'dot', form },
});
const examples: User[] = [
  exampleAgent('example-editor', 'Editor', 212, 'breathing', 'project'),
  exampleAgent('example-researcher', 'Researcher', 24, 'composing', 'personal'),
  exampleAgent('example-planner', 'Planner', 148, 'searching', 'project'),
  exampleAgent('example-scout', 'Scout', 292, 'shaping', 'personal'),
];
const states: [AgentState, string][] = [
  ['idle', 'Idle'],
  ['working', 'Working'],
  ['waiting', 'Waiting for a yes'],
  ['failed', 'Job failed'],
];
const rowStates: AgentState[] = ['idle', 'working', 'waiting', 'failed'];
const rowNote: Record<AgentState, string> = {
  idle: '',
  working: 'writing',
  waiting: 'needs a yes',
  failed: 'failed',
};

/** Every agent look side by side, in every state and at the sizes the app draws agents at. */
export function AgentLooks() {
  const { ui, setUi } = useWorkspace();
  const [still, setStill] = useState(false);
  const use = (agentLook: AgentLook) => setUi({ prefs: { ...ui.prefs, agentLook } });
  return (
    <Dialog title="Agent looks" wide>
      <div className="looks-compare">
        <div className="setting">
          <small className="muted">
            Example agents (Editor, Researcher, Planner, Scout), not real ones. The look you pick is
            used everywhere on this device.
          </small>
          <label className="looks-still">
            <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} />
            Hold still, as with reduced motion
          </label>
        </div>
        {AGENT_LOOKS.map((look) => (
          <section key={look}>
            <h3>
              {lookInfo[look].name}
              {look === 'orbs' && <small>today</small>}
              <span className="seg">
                <button aria-pressed={ui.prefs.agentLook === look} onClick={() => use(look)}>
                  {ui.prefs.agentLook === look ? 'In use' : 'Use this'}
                </button>
              </span>
            </h3>
            <p>{lookInfo[look].about}</p>
            <div className="looks-states">
              {states.map(([state, name]) => (
                <div key={state} className="looks-state">
                  <span>{name}</span>
                  <span className="looks-sizes">
                    {[16, 20, 24, 30].map((size) => (
                      <Character
                        key={size}
                        agent={examples[0]}
                        size={size}
                        state={state}
                        look={look}
                        still={still}
                      />
                    ))}
                  </span>
                  <span className="looks-sizes">
                    {examples.slice(1).map((a) => (
                      <Character
                        key={a.id}
                        agent={a}
                        size={20}
                        state={state}
                        look={look}
                        still={still}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="looks-rows">
              {examples.map((a, i) => (
                <span key={a.id} className="list-row agent">
                  <Character agent={a} size={18} state={rowStates[i]} look={look} still={still} />
                  <span className="truncate">{a.name}</span>
                  {rowNote[rowStates[i]] && <small>{rowNote[rowStates[i]]}</small>}
                  {a.role === 'personal' && (
                    <small>
                      <Lock size={10} /> you
                    </small>
                  )}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function PasteText() {
  const { space, setUi, run, open } = useWorkspace();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const save = async () => {
    const { parseText } = await import('../features/import/parse.ts');
    const parsed = parseText(`${title.trim() || 'Pasted text'}.txt`, text)!;
    const made = await run(() =>
      api<{ id: string }>('/resources', {
        body: {
          spaceId: space.id,
          kind: 'doc',
          title: parsed.title,
          body: parsed.body,
          source: { name: 'Pasted text', type: parsed.type },
        },
      }),
    );
    if (made) {
      setUi({ dialog: null });
      open({ type: 'page', id: made.id });
    }
  };
  return (
    <Dialog title="Paste text" wide>
      <input
        value={title}
        placeholder="Title, like Customer call, May 20"
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        autoFocus
        rows={10}
        value={text}
        placeholder="A transcript, an email thread or notes"
        aria-label="Text"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="dialog-foot">
        <span />
        <button className="primary" disabled={!text.trim()} onClick={() => void save()}>
          Add page
        </button>
      </div>
    </Dialog>
  );
}

function copy(text: string, notify: (t: string) => void, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => notify(`${what} copied.`),
    () => notify('Copy did not work here. Select the link and copy it.'),
  );
}

/** A link to sign in as yourself on another device. One use, fifteen minutes. */
function DeviceLink() {
  const { notify } = useWorkspace();
  const [link, setLink] = useState('');
  return (
    <div className="setting stack">
      <span>Sign in on another device</span>
      {link ? (
        <span className="link-out">
          <input
            readOnly
            value={link}
            aria-label="Sign-in link"
            onFocus={(e) => e.target.select()}
          />
          <button className="primary" onClick={() => copy(link, notify, 'Sign-in link')}>
            <Copy size={13} /> Copy
          </button>
        </span>
      ) : (
        <button
          className="plain"
          onClick={() =>
            void api<{ token: string }>('/signin-links', { body: {} }).then(
              (r) => setLink(`${location.origin}/?signin=${r.token}`),
              (e) => notify((e as Error).message),
            )
          }
        >
          <Link2 size={13} /> Make a sign-in link
        </button>
      )}
      <small>Works once, for 15 minutes. Anyone with it can sign in as you.</small>
    </div>
  );
}
