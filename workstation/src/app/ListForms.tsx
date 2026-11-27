import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Link2, Lock, Plus, Upload, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Character } from '../features/agents/Character.tsx';
import { ORB_FORMS, PAGE_KINDS, type PageKind, type User } from '../../shared/types.ts';
import { KindIcon, kindName } from './util.tsx';
import { useWorkspace } from './workspace.tsx';
import { inviteFrom } from './invite.ts';
import { Choice } from './Choice.tsx';
import { talkTo } from './agentChat.ts';

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
      <button
        type="button"
        className="list-new-close"
        aria-label="Cancel"
        title="Cancel (Esc)"
        onClick={onClose}
      >
        <X size={13} />
      </button>
      {children}
      <div className="list-new-foot">
        {foot ?? <span />}
        <button className="primary" type="submit" disabled={!ready}>
          {submit}
        </button>
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
    <Choice
      label={label}
      value={mine ? 'mine' : 'space'}
      options={[
        ['space', 'Everyone'],
        ['mine', 'Only you'],
      ]}
      onChange={(v) => setMine(v === 'mine')}
    />
  );
}

/** Kinds you make here. A file from your computer comes in through "New → File" instead. */
const MADE = PAGE_KINDS.filter((k) => k !== 'asset');

/** What each choice in the new-page form makes, in a few words: the icons alone don't say. */
const KIND_SAYS: Record<string, string> = {
  doc: 'Document · writing, notes, plans',
  sheet: 'Sheet · rows, columns and sums',
  deck: 'Deck · slides to present',
  canvas: 'Canvas · a board to lay things out',
  browser: 'Browser · the web, shared with your team',
  link: 'Linked sheet · from Google Sheets or Excel',
  file: 'From a file · .xlsx, .csv, .docx, .pptx and more',
};

/** Which connector a pasted link belongs to, as the server decides it. */
const linkProvider = (url: string) =>
  /docs\.google\.com\/spreadsheets\/d\//.test(url)
    ? 'google'
    : /(onedrive\.live\.com|1drv\.ms|sharepoint\.com|office\.com)/.test(url)
      ? 'microsoft'
      : null;

export function NewPage() {
  const { s, ui, space, setUi, run, open, chooseFiles, notify } = useWorkspace();
  const [kind, setKind] = useState<PageKind | 'link'>(
    typeof ui.creating === 'string' ? ui.creating : 'doc',
  );
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [mine, setMine] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const close = () => setUi({ creating: false });
  const provider = s.connectors?.find((c) => c.id === linkProvider(url.trim()));
  const create = async () => {
    if (kind === 'link') {
      const made = await run(() =>
        api<{ id: string; title: string }[]>('/sheets/link', {
          body: { spaceId: space.id, url: url.trim(), visibility: mine ? 'private' : 'space' },
        }),
      );
      if (made?.length) {
        close();
        open({ type: 'page', id: made[0].id });
        if (made.length > 1) notify(`Linked ${made.length} tabs as ${made.length} sheets.`);
      }
      return;
    }
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
  const needsSignIn = kind === 'link' && provider && provider.ready && !provider.account;
  return (
    <ListForm
      label="New page"
      onClose={close}
      onSubmit={() => void create()}
      submit={kind === 'link' ? 'Link' : 'Create'}
      ready={kind !== 'link' || (!!provider?.ready && !!provider.account)}
      foot={<Who mine={mine} setMine={setMine} label="Who can open it" />}
    >
      {kind === 'link' ? (
        <input
          className="list-new-name"
          autoFocus
          value={url}
          placeholder="Paste a Google Sheets or Excel link"
          aria-label="Spreadsheet link"
          onChange={(e) => setUrl(e.target.value)}
        />
      ) : (
        <input
          className="list-new-name"
          autoFocus
          value={title}
          maxLength={120}
          placeholder={`Untitled ${kindName[kind].toLowerCase()}`}
          aria-label="Title"
          onChange={(e) => setTitle(e.target.value)}
        />
      )}
      {kind === 'link' && (
        <p className="list-new-note">
          {!url.trim() ? (
            'It stays in sync both ways. Every tab becomes a sheet here.'
          ) : !provider ? (
            'That is not a Google Sheets or OneDrive Excel link.'
          ) : !provider.ready ? (
            `${provider.name} is not set up on this server yet.`
          ) : needsSignIn ? (
            <>
              <a href={`/api/connect/${provider.id}`}>Connect {provider.name}</a> first. You come
              back here after.
            </>
          ) : (
            `Through ${provider.account}.`
          )}
        </p>
      )}
      <div
        className="list-new-kinds"
        role="radiogroup"
        aria-label="Kind of page"
        onMouseLeave={() => setHover(null)}
      >
        {MADE.map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            aria-label={kindName[k]}
            onMouseEnter={() => setHover(k)}
            onFocus={() => setHover(k)}
            onClick={() => setKind(k)}
          >
            <KindIcon kind={k} size={15} />
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={kind === 'link'}
          aria-label="Linked from Google Sheets or Excel"
          onMouseEnter={() => setHover('link')}
          onFocus={() => setHover('link')}
          onClick={() => setKind('link')}
        >
          <Link2 size={15} />
        </button>
        <button
          type="button"
          aria-label="From a file on your computer"
          onMouseEnter={() => setHover('file')}
          onFocus={() => setHover('file')}
          onClick={() => {
            close();
            chooseFiles();
          }}
        >
          <Upload size={15} />
        </button>
      </div>
      <small className="list-new-says">{KIND_SAYS[hover ?? kind]}</small>
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
  const ws = useWorkspace();
  const { s, space, setUi, run, open } = ws;
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
      // A new agent opens on a chat with it; its settings are one click away there.
      if (made.spaceId) void talkTo(ws, made);
      else open({ type: 'who', id: made.id });
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
  // One thing waiting for a second click at a time: removing someone, leaving, or deleting.
  const [asking, setAsking] = useState<
    | { kind: 'remove'; who: User }
    | { kind: 'leave' }
    | { kind: 'delete' }
    | { kind: 'renew' }
    | null
  >(null);
  const [typed, setTyped] = useState('');
  const [name, setName] = useState(space.name);
  useEffect(() => setName(space.name), [space.name]);
  const owner = space.ownerId === s.me.id;
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
  const rename = () => {
    const next = name.trim();
    if (!next || next === space.name) return setName(space.name);
    void run(() => api(`/projects/${space.id}`, { method: 'PATCH', body: { name: next } })).then(
      (ok) => (ok ? notify(`Renamed to ${next}.`) : setName(space.name)),
    );
  };
  const remove = (who: User) =>
    void run(() => api(`/projects/${space.id}/members/${who.id}`, { method: 'DELETE' })).then(
      (ok) => ok && (setAsking(null), notify(`${who.name} is no longer in ${space.name}.`)),
    );
  const leave = () =>
    void run(() => api(`/projects/${space.id}/members/${s.me.id}`, { method: 'DELETE' })).then(
      (ok) => ok && (onClose(), notify(`You left ${space.name}.`)),
    );
  const destroy = () =>
    void run(() =>
      api(`/projects/${space.id}`, { method: 'DELETE', body: { confirm: typed } }),
    ).then((ok) => ok && (onClose(), notify(`${space.name} is deleted.`)));
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
            {asking?.kind === 'remove' && asking.who.id === p.id ? (
              <>
                <button type="button" className="danger" onClick={() => remove(p)}>
                  Remove
                </button>
                <button type="button" onClick={() => setAsking(null)}>
                  Keep
                </button>
              </>
            ) : (
              p.id !== s.me.id && (
                <>
                  <button type="button" onClick={() => void message(p)}>
                    Message
                  </button>
                  {owner && p.id !== space.ownerId && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name} from ${space.name}`}
                      onClick={() => setAsking({ kind: 'remove', who: p })}
                    >
                      Remove
                    </button>
                  )}
                </>
              )
            )}
          </div>
        );
      })}
      {asking?.kind === 'remove' && (
        <small className="list-people-note">
          {asking.who.name} loses {space.name} now: its pages, chats and agents. What they shared
          stays.
        </small>
      )}
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
      {link && (
        <small className="list-people-note">
          {asking?.kind === 'renew'
            ? 'A new link stops the current one working. Anyone you sent it to will need the new one.'
            : `The link works until ${new Date(link.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`}
        </small>
      )}
      <div className="list-new-foot">
        {asking?.kind === 'renew' ? (
          <>
            <button type="button" className="list-new-cancel" onClick={() => setAsking(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                void make(true).then(() => (setAsking(null), notify('New invite link made.')))
              }
            >
              Make new
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="list-new-cancel"
              disabled={!link}
              onClick={() => setAsking({ kind: 'renew' })}
            >
              New link
            </button>
            <button className="primary" type="button" disabled={!link} onClick={copy}>
              <Copy size={12} /> Copy invite link
            </button>
          </>
        )}
      </div>
      <div className="list-people-space">
        {owner ? (
          <input
            value={name}
            maxLength={60}
            aria-label="Workspace name"
            title="Rename the workspace"
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') (e.stopPropagation(), setName(space.name));
            }}
          />
        ) : null}
        {asking?.kind === 'delete' ? (
          <>
            <small>
              Everyone loses {space.name} at once, with its pages, chats and agents. Type its name
              to delete it.
            </small>
            <input
              autoFocus
              value={typed}
              placeholder={space.name}
              aria-label={`Type ${space.name} to delete it`}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && typed.trim() === space.name && destroy()}
            />
            <span className="list-people-ask">
              <button type="button" className="list-new-cancel" onClick={() => setAsking(null)}>
                Keep
              </button>
              <button
                type="button"
                className="danger"
                disabled={typed.trim() !== space.name}
                onClick={destroy}
              >
                Delete
              </button>
            </span>
          </>
        ) : asking?.kind === 'leave' ? (
          <>
            <small>You lose {space.name} now. Someone in it can invite you back.</small>
            <span className="list-people-ask">
              <button type="button" className="list-new-cancel" onClick={() => setAsking(null)}>
                Stay
              </button>
              <button type="button" className="danger" onClick={leave}>
                Leave
              </button>
            </span>
          </>
        ) : owner ? (
          <button
            type="button"
            className="list-new-cancel"
            onClick={() => (setTyped(''), setAsking({ kind: 'delete' }))}
          >
            Delete workspace…
          </button>
        ) : (
          <button
            type="button"
            className="list-new-cancel"
            onClick={() => setAsking({ kind: 'leave' })}
          >
            Leave workspace…
          </button>
        )}
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
