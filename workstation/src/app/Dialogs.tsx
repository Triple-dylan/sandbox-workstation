import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { Lock, Plus, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character } from '../features/agents/Character.tsx';
import { ORB_FORMS } from '../../shared/types.ts';
import type { User } from '../../shared/types.ts';
import { useWorkspace } from './workspace.tsx';

/**
 * Every popup shares this frame: a title with a close button, the content, and at most one primary
 * action at the bottom right. Esc and a click outside close it.
 */
export function Dialog({
  title,
  children,
  wide,
  bare,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  /** No title row: the first field says what this is (a new page's title, say). */
  bare?: boolean;
  onClose?: () => void;
}) {
  const { setUi } = useWorkspace();
  const close = onClose ?? (() => setUi({ dialog: null }));
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        {!bare && (
          <header>
            <h2>{title}</h2>
            <button aria-label="Close" onClick={close}>
              <X size={15} />
            </button>
          </header>
        )}
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
      <DeviceLink />
      <div className="setting">
        <span>Shortcuts</span>
        <button className="plain" onClick={() => setUi({ dialog: 'shortcuts' })}>
          See them all
        </button>
      </div>
      <p className="dialog-note">
        Saved in this browser. Agents answer with {s.runtime.model || s.runtime.label}.
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

/** A new agent: a name, what it is for, and who can use it. The rest is set up on its page. */
export function AgentBuilder() {
  const { s, space, setUi, run, open } = useWorkspace();
  const canShare = space.kind === 'project';
  const [shared, setShared] = useState(canShare);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const form = ORB_FORMS[s.users.filter((u) => u.kind === 'agent').length % ORB_FORMS.length];
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
        body: { name: name.trim(), purpose, instructions: '', spaceId: shared ? space.id : null },
      });
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { form } });
      return agent;
    });
    if (made) {
      setUi({ dialog: null });
      open({ type: 'who', id: made.id });
    }
  };
  return (
    <Dialog title="New agent">
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <div className="builder-row">
          <Character agent={preview} size={44} />
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder="Name, like Editor"
            aria-label="Name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <input
          value={purpose}
          maxLength={300}
          placeholder="What it's for, like messaging in our voice"
          aria-label="What it's for"
          onChange={(e) => setPurpose(e.target.value)}
        />
        <div className="dialog-foot">
          {canShare ? (
            <select
              aria-label="Who can use it"
              value={shared ? 'space' : 'mine'}
              onChange={(e) => setShared(e.target.value === 'space')}
            >
              <option value="space">Everyone in {space.name}</option>
              <option value="mine">Only you</option>
            </select>
          ) : (
            <small>
              <Lock size={11} /> Only you
            </small>
          )}
          <button className="primary" type="submit" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
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

/** The people in this workspace: who is here now, a message to any of them, and the invite link. */
export function People() {
  const { s, space, user, resource, notify, run, open, setUi } = useWorkspace();
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
  const people = s.members
    .filter((m) => m.spaceId === space.id)
    .map((m) => user(m.userId))
    .filter((u): u is User => !!u && u.kind === 'human');
  const where = (p: User) => {
    const here = s.presence.find((x) => x.userId === p.id && x.online);
    if (!here) return '';
    const page = resource(here.resourceId);
    const chat = s.conversations.find((c) => c.id === here.conversationId);
    return page ? `In ${page.title}` : chat?.kind === 'channel' ? `In #${chat.title}` : 'Here now';
  };
  const others = s.users.filter(
    (u) => u.kind === 'human' && u.id !== s.me.id && !people.some((p) => p.id === u.id),
  );
  const message = async (p: User) => {
    const dm =
      s.conversations.find((c) => c.kind === 'dm' && c.participantIds.includes(p.id)) ??
      (await run(() => api<{ id: string }>('/dms', { body: { userId: p.id } })));
    if (dm) {
      setUi({ dialog: null });
      open({ type: 'chat', id: dm.id });
    }
  };
  return (
    <Dialog title={`People in ${space.name}`}>
      <ul className="people">
        {people.map((p) => {
          const at = where(p);
          return (
            <li key={p.id}>
              <span className={`dot-wrap ${at ? 'online' : ''}`}>
                <Actor user={p} jobs={s.jobs} size={28} />
              </span>
              <span>
                <b>
                  {p.name}
                  {p.id === s.me.id && ' (you)'}
                </b>
                {at && <small>{at}</small>}
              </span>
              {p.id !== s.me.id && <button onClick={() => void message(p)}>Message</button>}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
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
              <Plus size={12} /> Add {p.name}
            </button>
          ))}
        </div>
      )}
      <span className="label">Invite with a link</span>
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
            Works until{' '}
            {new Date(link.expiresAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
            .{' '}
            <button className="link" onClick={() => void make(true)}>
              Make a new link
            </button>{' '}
            to stop this one working.
          </p>
        </>
      )}
    </Dialog>
  );
}
