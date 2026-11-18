import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { Lock, Users, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { Character } from '../features/agents/Character.tsx';
import { ORB_FORMS } from '../../shared/types.ts';
import type { User } from '../../shared/types.ts';
import { useWorkspace } from './workspace.tsx';

function Dialog({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { setUi } = useWorkspace();
  const close = () => setUi({ dialog: null });
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
  ['⌘ \\', 'Show or hide the list'],
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
  const { ui, setUi, s } = useWorkspace();
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
        prefs.list ? 'shown' : 'hidden',
        [
          ['shown', 'Shown'],
          ['hidden', 'Hidden until asked'],
        ],
        (v) => set({ list: v === 'shown' }),
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
      <p className="dialog-note">
        On canvases, documents, sheets and decks, teammates on the same page see where you are, and
        you see them. Turning sharing off stops sending yours straight away.
      </p>
      <DeviceLink />
      <div className="setting">
        <span>Shortcuts</span>
        <button className="plain" onClick={() => setUi({ dialog: 'shortcuts' })}>
          See them all
        </button>
      </div>
      <p className="dialog-note">
        These are yours and stay in this browser. Agents answer with {s.runtime.label}
        {s.runtime.model ? ` (${s.runtime.model})` : ''}.
      </p>
    </Dialog>
  );
}

/** Pasting text in from somewhere else: a transcript, an email, notes. */
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
    <Dialog title="Paste text in" wide>
      <input
        value={title}
        placeholder="What is it? e.g. Customer call, May 20"
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        autoFocus
        rows={10}
        value={text}
        placeholder={
          'Paste a transcript, an email thread or notes.\nLines like "Maya: we ship June 10" are kept as a transcript.'
        }
        aria-label="Text"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="dialog-actions">
        <button className="primary" disabled={!text.trim()} onClick={() => void save()}>
          Add to {space.kind === 'personal' ? 'your space' : space.name}
        </button>
      </div>
    </Dialog>
  );
}

/** Making an agent on purpose: who can use it is the first choice, and it says what that means. */
export function AgentBuilder() {
  const { s, space, setUi, run, open } = useWorkspace();
  const canShare = space.kind === 'project';
  const [shared, setShared] = useState(canShare);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [form, setForm] = useState<(typeof ORB_FORMS)[number]>(ORB_FORMS[1]);
  const [picked, setPicked] = useState<string[]>([]);
  const personal = s.spaces.find((x) => x.kind === 'personal')!;
  const home = shared ? space.id : personal.id;
  const skills = s.skills.filter((k) => k.spaceId === home);
  const preview = {
    id: 'preview',
    name,
    color: '#888',
    kind: 'agent',
    character: { hue: 210, shape: 'round', eyes: 'dot', form },
  } as User;
  const create = async () => {
    const made = await run(async () => {
      const agent = await api<User>('/agents', {
        body: { name, purpose, instructions, spaceId: shared ? space.id : null },
      });
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { form } });
      for (const skillId of picked)
        await api(`/agents/${agent.id}/skills`, { body: { skillId, on: true } });
      return agent;
    });
    if (made) {
      setUi({ dialog: null });
      open({ type: 'who', id: made.id });
    }
  };
  return (
    <Dialog title="New agent" wide>
      <div className="who-choice" role="radiogroup" aria-label="Who can use it">
        <button
          role="radio"
          aria-checked={shared}
          disabled={!canShare}
          onClick={() => setShared(true)}
        >
          <Users size={16} />
          <strong>Shared with {canShare ? space.name : 'a space'}</strong>
          <small>
            {canShare
              ? 'Everyone in the space can ask it, in channels and on pages. It sees what is shared with the space.'
              : 'Open a shared space to make one there.'}
          </small>
        </button>
        <button role="radio" aria-checked={!shared} onClick={() => setShared(false)}>
          <Lock size={16} />
          <strong>Private to you</strong>
          <small>
            Only you can talk to it and only you see what it says. It sees what you can see.
          </small>
        </button>
      </div>
      <div className="builder-row">
        <Character agent={preview} size={64} />
        <label>
          <span>Name</span>
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. Editor"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <div className="agent-forms" role="radiogroup" aria-label="Look">
        {ORB_FORMS.map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={form === f}
            aria-label={`Look: ${f}`}
            onClick={() => setForm(f)}
          >
            <Character agent={preview} size={32} form={f} />
          </button>
        ))}
      </div>
      <label>
        <span>What it is for</span>
        <input
          value={purpose}
          maxLength={300}
          placeholder="One line. e.g. Messaging and copy in our voice"
          onChange={(e) => setPurpose(e.target.value)}
        />
      </label>
      <label>
        <span>Standing instructions</span>
        <textarea
          rows={3}
          value={instructions}
          placeholder="How it should work, what to watch for, what to leave alone."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <div>
        <span className="label">Skills</span>
        {skills.length === 0 ? (
          <p className="dialog-note">
            No {shared ? 'shared' : 'private'} skills yet. You can write some on the agent’s page
            once it exists.
          </p>
        ) : (
          <div className="chips">
            {skills.map((k) => (
              <button
                key={k.id}
                aria-pressed={picked.includes(k.id)}
                title={k.description}
                onClick={() =>
                  setPicked((p) => (p.includes(k.id) ? p.filter((x) => x !== k.id) : [...p, k.id]))
                }
              >
                {k.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="dialog-actions">
        <button className="primary" disabled={!name.trim()} onClick={() => void create()}>
          Create {shared ? 'shared' : 'private'} agent
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
      <small>
        Open it on the other device within 15 minutes. It works once. Anyone holding it can sign in
        as you, so send it only to yourself.
      </small>
    </div>
  );
}

/** Inviting people into the shared space you are in. */
export function Invite() {
  const { s, space, notify, run } = useWorkspace();
  const [link, setLink] = useState<{ token: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const make = async (fresh = false) => {
    try {
      setLink(await api('/invites', { body: { spaceId: space.id, fresh } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!link && !error) void make();
  const url = link ? `${location.origin}/?invite=${link.token}` : '';
  const others = s.users.filter(
    (u) =>
      u.kind === 'human' &&
      u.id !== s.me.id &&
      !s.members.some((m) => m.spaceId === space.id && m.userId === u.id),
  );
  return (
    <Dialog title={`Invite people to ${space.name}`}>
      {error && <p className="join-error">{error}</p>}
      {link && (
        <>
          <span className="link-out">
            <input
              readOnly
              value={url}
              aria-label="Invite link"
              onFocus={(e) => e.target.select()}
            />
            <button className="primary" onClick={() => copy(url, notify, 'Invite link')}>
              <Copy size={13} /> Copy
            </button>
          </span>
          <p className="dialog-note">
            Anyone with this link can join {space.name} until{' '}
            {new Date(link.expiresAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
            . They see what is shared with the space, never what is private to you.{' '}
            <button className="link" onClick={() => void make(true)}>
              Make a new link
            </button>{' '}
            to stop the old one working.
          </p>
        </>
      )}
      {others.length > 0 && (
        <div>
          <span className="label">People you already work with</span>
          <div className="chips">
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  void run(() =>
                    api(`/projects/${space.id}/members`, { body: { userId: p.id } }),
                  ).then((ok) => ok && notify(`${p.name} can now open ${space.name}.`))
                }
              >
                Add {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
