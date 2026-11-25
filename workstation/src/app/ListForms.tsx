import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Lock, Plus, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character } from '../features/agents/Character.tsx';
import { ORB_FORMS, PAGE_KINDS, type PageKind, type User } from '../../shared/types.ts';
import { KindIcon, kindName } from './util.tsx';
import { useWorkspace } from './workspace.tsx';
import { inviteFrom } from './invite.ts';

/**
 * Everything made from the list is made in the list, in the section where it will appear: one
 * shape for all of them. A name first, at most one row of choices, then who can see it and Create.
 */
function ListForm({
  label,
  onClose,
  onSubmit,
  children,
  foot,
  submit = 'Create',
  ready = true,
}: {
  label: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  foot?: ReactNode;
  submit?: string;
  ready?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  // Opened from a menu, which hands focus back to its button as it closes: take it after that.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.querySelector('input')?.focus());
    return () => clearTimeout(t);
  }, []);
  return (
    <form
      ref={ref}
      className="list-new"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit();
      }}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
    >
      {children}
      <div className="list-new-foot">
        {foot ?? <span />}
        <span>
          <button type="button" className="list-new-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!ready}>
            {submit}
          </button>
        </span>
      </div>
    </form>
  );
}

/** Who can see what is being made: everyone in the workspace, or only you. */
function Who({
  mine,
  setMine,
  label,
}: {
  mine: boolean;
  setMine: (v: boolean) => void;
  label: string;
}) {
  const { space } = useWorkspace();
  if (space.kind !== 'project')
    return (
      <small>
        <Lock size={11} /> Only you
      </small>
    );
  return (
    <select
      aria-label={label}
      value={mine ? 'mine' : 'space'}
      onChange={(e) => setMine(e.target.value === 'mine')}
    >
      <option value="space">Everyone</option>
      <option value="mine">Only you</option>
    </select>
  );
}

/** Kinds you make here. A file from your computer comes in through "New → File" instead. */
const MADE = PAGE_KINDS.filter((k) => k !== 'asset');

export function NewPage() {
  const { ui, space, setUi, run, open } = useWorkspace();
  const [kind, setKind] = useState<PageKind>(typeof ui.creating === 'string' ? ui.creating : 'doc');
  const [title, setTitle] = useState('');
  const [mine, setMine] = useState(false);
  const close = () => setUi({ creating: false });
  const create = async () => {
    const made = await run(() =>
      api<{ id: string }>('/resources', {
        body: {
          spaceId: space.id,
          kind,
          title: title.trim(),
          body: '',
          visibility: mine ? 'private' : 'space',
        },
      }),
    );
    if (made) {
      close();
      open({ type: 'page', id: made.id });
    }
  };
  return (
    <ListForm
      label="New page"
      onClose={close}
      onSubmit={() => void create()}
      foot={<Who mine={mine} setMine={setMine} label="Who can open it" />}
    >
      <input
        className="list-new-name"
        autoFocus
        value={title}
        maxLength={120}
        placeholder={`Untitled ${kindName[kind].toLowerCase()}`}
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="list-new-kinds" role="radiogroup" aria-label="Kind of page">
        {MADE.map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            aria-label={kindName[k]}
            title={kindName[k]}
            onClick={() => setKind(k)}
          >
            <KindIcon kind={k} size={15} />
          </button>
        ))}
      </div>
    </ListForm>
  );
}

export function NewChannel() {
  const { space, setUi, run, open } = useWorkspace();
  const [name, setName] = useState('');
  const close = () => setUi({ making: null });
  const create = async () => {
    const made = await run(() =>
      api<{ id: string }>('/channels', { body: { spaceId: space.id, title: name.trim() } }),
    );
    if (made) {
      close();
      open({ type: 'chat', id: made.id });
    }
  };
  return (
    <ListForm
      label="New channel"
      onClose={close}
      onSubmit={() => void create()}
      ready={!!name.trim()}
      foot={<small># Everyone in {space.name}</small>}
    >
      <input
        className="list-new-name"
        autoFocus
        value={name}
        maxLength={40}
        placeholder="channel-name"
        aria-label="Channel name"
        onChange={(e) => setName(e.target.value)}
      />
    </ListForm>
  );
}

/** A new agent: a name and what it is for. Its instructions, look and skills are on its page. */
export function NewAgent() {
  const { s, space, setUi, run, open } = useWorkspace();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [mine, setMine] = useState(space.kind !== 'project');
  const form = ORB_FORMS[s.users.filter((u) => u.kind === 'agent').length % ORB_FORMS.length];
  const preview = {
    id: 'preview',
    name,
    color: '#888',
    kind: 'agent',
    character: { hue: 210, shape: 'round', eyes: 'dot', form },
  } as User;
  const close = () => setUi({ making: null });
  const create = async () => {
    const made = await run(async () => {
      const agent = await api<User>('/agents', {
        body: {
          name: name.trim(),
          purpose,
          instructions: '',
          spaceId: mine ? null : space.id,
        },
      });
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { form } });
      return agent;
    });
    if (made) {
      close();
      open({ type: 'who', id: made.id });
    }
  };
  return (
    <ListForm
      label="New agent"
      onClose={close}
      onSubmit={() => void create()}
      ready={!!name.trim()}
      foot={<Who mine={mine} setMine={setMine} label="Who can use it" />}
    >
      <div className="list-new-agent">
        <Character agent={preview} size={22} />
        <input
          className="list-new-name"
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
        placeholder="What it's for"
        aria-label="What it's for"
        onChange={(e) => setPurpose(e.target.value)}
      />
    </ListForm>
  );
}

/** The workspace's people, opened from its member count: who is here, a message, the invite link. */
export function PeoplePanel({ onClose }: { onClose: () => void }) {
  const { s, space, user, resource, notify, run, open } = useWorkspace();
  const [link, setLink] = useState<{ token: string; expiresAt: string } | null>(null);
  const make = (fresh = false) =>
    api<{ token: string; expiresAt: string }>('/invites', {
      body: { spaceId: space.id, fresh },
    }).then(setLink, (e) => notify((e as Error).message));
  useEffect(() => {
    void make();
  }, [space.id]);
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
    return page ? `in ${page.title}` : chat?.kind === 'channel' ? `in #${chat.title}` : 'here now';
  };
  const others = s.users.filter(
    (u) => u.kind === 'human' && u.id !== s.me.id && !people.some((p) => p.id === u.id),
  );
  const message = async (p: User) => {
    const dm =
      s.conversations.find((c) => c.kind === 'dm' && c.participantIds.includes(p.id)) ??
      (await run(() => api<{ id: string }>('/dms', { body: { userId: p.id } })));
    if (dm) {
      onClose();
      open({ type: 'chat', id: dm.id });
    }
  };
  const copy = () =>
    void navigator.clipboard?.writeText(url).then(
      () => notify('Invite link copied.'),
      () => notify('Copy did not work here. Select the link and copy it.'),
    );
  return (
    <section
      className="list-new list-people"
      aria-label={`People in ${space.name}`}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
    >
      <div className="list-people-head">
        <b>People</b>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {people.map((p) => {
        const at = where(p);
        return (
          <div key={p.id} className="list-people-row">
            <span className={`dot-wrap ${at ? 'online' : ''}`}>
              <Actor user={p} jobs={s.jobs} size={20} />
            </span>
            <span className="truncate">
              {p.name}
              {p.id === s.me.id ? ' (you)' : ''}
              {at && <small> · {at}</small>}
            </span>
            {p.id !== s.me.id && (
              <button type="button" onClick={() => void message(p)}>
                Message
              </button>
            )}
          </div>
        );
      })}
      {others.map((p) => (
        <button
          key={p.id}
          type="button"
          className="list-people-add"
          onClick={() =>
            void run(() => api(`/projects/${space.id}/members`, { body: { userId: p.id } })).then(
              (ok) => ok && notify(`${p.name} can now open ${space.name}.`),
            )
          }
        >
          <Plus size={12} /> Add {p.name}
        </button>
      ))}
      <div className="list-new-foot">
        <button
          type="button"
          className="list-new-cancel"
          disabled={!link}
          title={
            link
              ? `Works until ${new Date(link.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. A new link stops this one working.`
              : undefined
          }
          onClick={() => void make(true)}
        >
          New link
        </button>
        <button className="primary" type="button" disabled={!link} onClick={copy}>
          <Copy size={12} /> Copy invite link
        </button>
      </div>
    </section>
  );
}

/** A workspace of your own, named in the list under the switcher. */
export function NewWorkspace({ onClose }: { onClose: () => void }) {
  const { setUi, run } = useWorkspace();
  const [name, setName] = useState('');
  return (
    <ListForm
      label="New workspace"
      onClose={onClose}
      ready={!!name.trim()}
      onSubmit={() =>
        void run(() => api<{ id: string }>('/projects', { body: { name: name.trim() } })).then(
          (made) => {
            if (!made) return;
            onClose();
            setUi({ spaceId: made.id, panes: [], active: 0 });
          },
        )
      }
    >
      <input
        className="list-new-name"
        autoFocus
        value={name}
        maxLength={60}
        placeholder="Workspace name"
        aria-label="Workspace name"
        onChange={(e) => setName(e.target.value)}
      />
    </ListForm>
  );
}

/** Joining a workspace from an invite link someone sent you. */
export function JoinWorkspace({ onClose }: { onClose: () => void }) {
  const { setUi, run, notify } = useWorkspace();
  const [link, setLink] = useState('');
  const token = inviteFrom(link);
  return (
    <ListForm
      label="Join a workspace"
      submit="Join"
      onClose={onClose}
      ready={!!token}
      onSubmit={() =>
        void run(() =>
          api<{ id: string; name: string }>('/invites/accept', { body: { token } }),
        ).then((joined) => {
          if (!joined) return;
          onClose();
          setUi({ spaceId: joined.id, panes: [], active: 0 });
          notify(`You joined ${joined.name}.`);
        })
      }
    >
      <input
        className="list-new-name"
        autoFocus
        value={link}
        placeholder="Paste the invite link"
        aria-label="Invite link"
        onChange={(e) => setLink(e.target.value)}
      />
    </ListForm>
  );
}
