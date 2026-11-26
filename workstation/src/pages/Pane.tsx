import { useClickAway } from '../app/clickAway.ts';
import { useRef, useState } from 'react';
import {
  Archive,
  Columns2,
  Pin,
  Lock,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { Actor, Avatar, Character, agentState } from '../features/agents/Character.tsx';
import { KindIcon, ago, chatTitle, kindName } from '../app/util.tsx';
import { useWorkspace, type Target } from '../app/workspace.tsx';
import { agentLabel, atWork, usedIn } from '../app/scope.ts';
import type { Resource, User } from '../../shared/types.ts';
import { DocPage } from './DocPage.tsx';
import { SheetPage } from './SheetPage.tsx';
import { DeckPage } from './DeckPage.tsx';
import { CanvasPage } from './CanvasPage.tsx';
import { ChatPage } from './ChatPage.tsx';
import { GraphPage } from './GraphPage.tsx';
import { WhoPage } from './WhoPage.tsx';
import { agentsIn } from '../features/feed/Feed.tsx';
import { AssetPage } from './AssetPage.tsx';

/** Who can open a page, and the way to change it. Only its owner changes it. */
function ShareBox({ page, close }: { page: Resource; close: () => void }) {
  const { s, run, user, space } = useWorkspace();
  const owner = page.ownerId === s.me.id;
  const shared = page.visibility === 'space';
  const members = s.members
    .filter((m) => m.spaceId === page.spaceId)
    .map((m) => user(m.userId))
    .filter((u): u is User => !!u && !u.retired && u.id !== page.ownerId);
  const grants = new Set(page.grants ?? []);
  const row = (u: User) => {
    const has = shared || grants.has(u.id);
    return (
      <li key={u.id}>
        <Actor user={u} jobs={s.jobs} size={20} />
        <span className="truncate">{u.name}</span>
        {shared ? (
          <small>{u.kind === 'agent' ? 'can read and suggest edits' : 'can edit'}</small>
        ) : owner ? (
          <button
            role="switch"
            aria-checked={has}
            aria-label={`${u.name} can open this page`}
            onClick={() =>
              void run(() =>
                api(`/resources/${page.id}/grants`, { body: { userId: u.id, on: !has } }),
              )
            }
          >
            {has ? (u.kind === 'agent' ? 'Can read and suggest' : 'Can edit') : 'Add'}
          </button>
        ) : (
          <small>{has ? 'can open' : ''}</small>
        )}
      </li>
    );
  };
  return (
    <div className="popover share" role="dialog" aria-label="Who can open this page">
      <header>
        <strong>Who can open this page</strong>
        <button aria-label="Close" onClick={close}>
          <X size={13} />
        </button>
      </header>
      {space.kind === 'personal' ? (
        <p>
          <Lock size={12} /> This is in your own space. Only you and your agents see it.
        </p>
      ) : (
        <>
          <div className="seg" role="radiogroup" aria-label="Sharing">
            <button
              role="radio"
              aria-checked={shared}
              disabled={!owner}
              onClick={() =>
                !shared &&
                void run(() =>
                  api(`/resources/${page.id}`, { method: 'PATCH', body: { visibility: 'space' } }),
                )
              }
            >
              <Users size={12} /> Everyone in {space.name}
            </button>
            <button
              role="radio"
              aria-checked={!shared}
              disabled={!owner}
              onClick={() =>
                shared &&
                void run(() =>
                  api(`/resources/${page.id}`, {
                    method: 'PATCH',
                    body: { visibility: 'private' },
                  }),
                )
              }
            >
              <Lock size={12} /> Only people you add
            </button>
          </div>
          <ul>
            <li>
              <Actor user={user(page.ownerId) ?? s.me} jobs={s.jobs} size={20} />
              <span className="truncate">{user(page.ownerId)?.name ?? 'Owner'}</span>
              <small>owner</small>
            </li>
            {members.filter((u) => shared || owner || grants.has(u.id)).map(row)}
          </ul>
          {!owner && (
            <p>Only {user(page.ownerId)?.name ?? 'the owner'} can change who opens this.</p>
          )}
          <p>Agents never change a page on their own. They suggest, and a person accepts.</p>
        </>
      )}
    </div>
  );
}

function PageMenu({ page, close }: { page: Resource; close: () => void }) {
  const { run, notify, closePane, ui } = useWorkspace();
  const index = ui.panes.findIndex((t) => t.type === 'page' && t.id === page.id);
  return (
    <div className="popover menu" role="menu">
      {!page.role && (
        <button
          role="menuitem"
          onClick={() => {
            close();
            void run(() =>
              api(`/resources/${page.id}`, { method: 'PATCH', body: { pinned: !page.pinned } }),
            );
          }}
        >
          <Pin size={13} /> {page.pinned ? 'Unpin' : 'Pin for everyone and their agents'}
        </button>
      )}
      {!page.role && (
        <button
          role="menuitem"
          onClick={() => {
            close();
            void run(() =>
              api(`/resources/${page.id}`, { method: 'PATCH', body: { archived: !page.archived } }),
            ).then(() =>
              notify(
                page.archived
                  ? `“${page.title}” is back in the list.`
                  : `“${page.title}” is in the archive. Find it on the graph.`,
              ),
            );
          }}
        >
          <Archive size={13} /> {page.archived ? 'Bring back from the archive' : 'Archive'}
        </button>
      )}
      {!page.role && (
        <button
          role="menuitem"
          className="danger"
          onClick={() => {
            close();
            void run(() => api(`/resources/${page.id}`, { method: 'DELETE' })).then(() => {
              if (index >= 0) closePane(index);
              notify(`Removed “${page.title}”.`, {
                label: 'Undo',
                run: () => void run(() => api(`/resources/${page.id}/restore`, { body: {} })),
              });
            });
          }}
        >
          <Trash2 size={13} /> Remove this page
        </button>
      )}
    </div>
  );
}

/** One pane in the middle: a small header that says what this is and who can see it, then the page. */
const agentDoing = {
  idle: 'not working on anything',
  working: 'working',
  waiting: 'waiting for a yes',
  failed: 'the last job failed',
};

export function Pane({
  target,
  index,
  active,
  alone,
  grow,
}: {
  target: Target;
  index: number;
  active: boolean;
  alone: boolean;
  /** Its share of the width when two pages are side by side. */
  grow?: number;
}) {
  const { s, setUi, space, resource, run, open, closePane, pick, user, columns } = useWorkspace();
  const [popover, setPopover] = useState<'share' | 'menu' | null>(null);
  const head = useRef<HTMLElement>(null);
  useClickAway(!!popover, () => setPopover(null), head);
  const page = target.type === 'page' ? resource(target.id) : undefined;
  const chat = target.type === 'chat' ? s.conversations.find((c) => c.id === target.id) : undefined;
  const who = target.type === 'who' ? user(target.id) : undefined;
  const others = s.presence
    .filter(
      (p) =>
        p.online && ((page && p.resourceId === page.id) || (chat && p.conversationId === chat.id)),
    )
    .map((p) => user(p.userId))
    .filter((u): u is User => !!u);
  const working = atWork(s, { resourceId: page?.id, conversationId: chat?.id });
  const links = page ? usedIn(s, page) : [];
  const feed = page
    ? s.conversations.find((c) => c.kind === 'discussion' && c.resourceId === page.id)
    : undefined;
  const said = feed
    ? s.messages.filter((m) => m.conversationId === feed.id && !m.replyTo && !m.anchor).length
    : 0;
  const talk = async () => {
    const chatFor =
      feed ??
      (await run(() => api<{ id: string }>('/discussions', { body: { resourceId: page!.id } })));
    if (chatFor) open({ type: 'chat', id: chatFor.id }, true);
  };
  const locked = page?.role === 'orientation';
  const title = page
    ? page.title
    : chat
      ? chatTitle(chat, s)
      : who
        ? who.name
        : target.type === 'graph'
          ? 'Graph'
          : '';
  const sub = page
    ? `${kindName[page.kind]} · ${
        space.kind === 'personal'
          ? 'Only you'
          : page.visibility === 'space'
            ? `Shared with ${space.name}`
            : page.grants?.length
              ? `You and ${page.grants.length} you added`
              : 'Only you'
      }`
    : chat
      ? chat.kind === 'channel'
        ? `Channel · everyone in ${space.name}${(() => {
            const listening = agentsIn(chat, s.users).map((a) => a.name);
            return listening.length ? ` · ${listening.join(', ')} listening` : '';
          })()}`
        : chat.kind === 'agent-private'
          ? 'Private to you'
          : chat.kind === 'dm'
            ? 'Direct messages · only the two of you'
            : 'Page feed'
      : target.type === 'graph'
        ? space.name
        : who?.kind === 'agent'
          ? `${who.role === 'personal' ? 'Your agent · private to you' : `Shared with ${space.name}`} · ${agentDoing[agentState(who.id, s.jobs)]}`
          : 'Person';
  // An agent is renamed where its name is shown, like a page: its owner, or anyone in its workspace.
  const renamable =
    who?.kind === 'agent' &&
    (who.role === 'personal'
      ? who.ownerId === s.me.id
      : s.members.some((m) => m.spaceId === who.spaceId && m.userId === s.me.id));
  return (
    <section
      className={`pane ${active ? 'is-active' : ''} pane-${target.type}`}
      aria-label={title}
      style={grow === undefined ? undefined : { flexGrow: grow }}
      onPointerDownCapture={() => !active && setUi({ active: index, selection: [] })}
    >
      <header className="pane-head" ref={head}>
        <button
          className="menu-button"
          aria-label="Open the list"
          onClick={() => setUi({ nav: true })}
        >
          <Menu size={16} />
        </button>
        <span className="pane-icon">
          {page ? (
            <KindIcon kind={page.kind} size={16} />
          ) : chat?.kind === 'channel' ? (
            <KindIcon kind="channel" size={16} />
          ) : who?.kind === 'agent' ? (
            <Character agent={who} size={20} state={agentState(who.id, s.jobs)} />
          ) : null}
        </span>
        <div className="pane-title">
          {page && !locked ? (
            <input
              defaultValue={page.title}
              key={page.title}
              aria-label="Title"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== page.title)
                  void run(() =>
                    api(`/resources/${page.id}`, { method: 'PATCH', body: { title: next } }),
                  );
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : renamable && who ? (
            <input
              defaultValue={who.name}
              key={who.name}
              aria-label="Name"
              maxLength={40}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== who.name)
                  void run(() =>
                    api(`/agents/${who.id}`, { method: 'PATCH', body: { name: next } }),
                  );
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1 className="truncate">{title}</h1>
          )}
          <small className="truncate">
            {page?.visibility === 'private' && space.kind === 'project' && <Lock size={10} />} {sub}
          </small>
          {links.length > 0 && (
            <span className="used-in">
              {links.map((link, i) => {
                const c =
                  link.type === 'chat' ? s.conversations.find((x) => x.id === link.id) : undefined;
                const r = link.type === 'page' ? resource(link.id) : undefined;
                return (
                  <button key={i} onClick={() => open(link, true)} title="Also here. Open beside.">
                    {c ? `#${c.title}` : r?.title}
                  </button>
                );
              })}
            </span>
          )}
        </div>
        <span className="pane-people">
          {page &&
            s.watches
              .filter((w) => w.resourceId === page.id)
              .map((w) => user(w.agentId))
              .filter((a): a is User => !!a && !working.some((x) => x.id === a.id))
              .map((a) => (
                <button
                  key={a.id}
                  className="looks-after"
                  title={`${a.name} looks after this${s.watches.find((w) => w.agentId === a.id && w.resourceId === page.id)?.rule ? `: ${s.watches.find((w) => w.agentId === a.id && w.resourceId === page.id)!.rule}` : ''}. Ask it about this page.`}
                  onClick={() => setUi({ railOpen: true, railText: `@${a.name} ` })}
                >
                  <Character agent={a} size={18} state={agentState(a.id, s.jobs)} />
                  <small>Ask {a.name}</small>
                </button>
              ))}
          {working.map((a) => (
            <span key={a.id} className="at-work" title={`${agentLabel(s, a.id)} is working here`}>
              <Character agent={a} size={20} state="working" />
              <small>{a.name} is working</small>
            </span>
          ))}
          {others.map((u) => (
            <span key={u.id} title={`${u.name} is here`}>
              <Avatar user={u} size={20} />
            </span>
          ))}
        </span>
        <span className="pane-actions">
          {page && page.kind === 'doc' && said > 0 && (
            <button
              className="talk-chip"
              title="Go to the conversation at the end of this page"
              onClick={(e) =>
                e.currentTarget
                  .closest('.pane')
                  ?.querySelector('.doc-feed')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <span className="talk-faces">
                {[
                  ...new Set(
                    s.messages
                      .filter((m) => m.conversationId === feed!.id && !m.anchor)
                      .map((m) => m.authorId)
                      .reverse(),
                  ),
                ]
                  .slice(0, 2)
                  .map((id) => user(id))
                  .filter((u): u is User => !!u)
                  .map((u) => (
                    <Avatar key={u.id} user={u} size={16} />
                  ))}
              </span>
              {said} said ·{' '}
              {ago(
                s.messages.filter((m) => m.conversationId === feed!.id && !m.anchor).at(-1)!
                  .createdAt,
              )}
            </button>
          )}
          {page && page.kind !== 'doc' && (
            <button
              aria-label="Talk about this page"
              title="The conversation that belongs to this page"
              onClick={() => void talk()}
            >
              <MessagesSquare size={14} /> <span>{said || 'Talk'}</span>
            </button>
          )}
          {page && (
            <button
              aria-label="Share"
              aria-expanded={popover === 'share'}
              onClick={() => setPopover(popover === 'share' ? null : 'share')}
            >
              <Users size={14} /> <span>Share</span>
            </button>
          )}
          {columns === 2 && (
            <button
              aria-label="Open a page beside this one"
              title="Open a page beside this one"
              onClick={() =>
                pick({ title: 'Open beside', chats: true, onPick: (t) => open(t, true) })
              }
            >
              <Columns2 size={15} />
            </button>
          )}
          {page && (
            <button
              aria-label="More"
              aria-expanded={popover === 'menu'}
              onClick={() => setPopover(popover === 'menu' ? null : 'menu')}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
          {!alone && (
            <button aria-label={`Close ${title}`} title="Close" onClick={() => closePane(index)}>
              <X size={15} />
            </button>
          )}
        </span>
        {popover === 'share' && page && <ShareBox page={page} close={() => setPopover(null)} />}
        {popover === 'menu' && page && <PageMenu page={page} close={() => setPopover(null)} />}
      </header>
      <div className="pane-body">
        {page?.kind === 'doc' && <DocPage key={page.id} page={page} />}
        {page?.kind === 'sheet' && <SheetPage key={page.id} page={page} />}
        {page?.kind === 'deck' && <DeckPage key={page.id} page={page} />}
        {page?.kind === 'asset' && <AssetPage key={page.id} page={page} />}
        {page?.kind === 'canvas' && <CanvasPage key={page.id} page={page} active={active} />}
        {chat && <ChatPage key={chat.id} chat={chat} />}
        {target.type === 'graph' && <GraphPage />}
        {who && <WhoPage key={who.id} who={who} />}
      </div>
    </section>
  );
}
