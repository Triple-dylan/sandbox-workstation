import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw, X } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { Choice } from '../../app/Choice.tsx';
import { ago } from '../../app/util.tsx';
import { Character } from './Character.tsx';
import type { Id, User } from '../../../shared/types.ts';

/**
 * An agent seat's page: an agent that runs somewhere else (Claude Code, Codex, Hermes, a Grok bot)
 * and signs in to Sandbox's MCP server with a token. Its owner brings it into workspaces, makes and
 * revokes tokens, and retires it. Everyone else sees whose it is and how to reach it.
 */

type SeatToken = { id: Id; label: string; createdAt: string; lastUsedAt: string | null };
type Seat = { agent: User; spaceIds: Id[]; tokens: SeatToken[] };
export type NewToken = { id: Id; label: string; token: string };

/** A token is shown once, when it is made. The form that makes a seat leaves its first one here. */
const fresh = new Map<Id, NewToken>();
export function showOnce(agentId: Id, token: NewToken) {
  fresh.set(agentId, token);
}

const mcpUrl = () => `${location.origin}/mcp`;

/** The lines to paste into each agent, with this Sandbox's address and the token filled in. */
export function connectLines(token: string) {
  const url = mcpUrl();
  return [
    {
      name: 'Claude Code',
      text: `claude mcp add --transport http sandbox ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      name: 'Codex',
      text: `# ~/.codex/config.toml\n[mcp_servers.sandbox]\nurl = "${url}"\nbearer_token_env_var = "SANDBOX_TOKEN"\n\n# then, in the shell that runs Codex\nexport SANDBOX_TOKEN=${token}`,
    },
    {
      name: 'Any other MCP client',
      text: `URL: ${url}\nHeader: Authorization: Bearer ${token}`,
    },
  ];
}

export function SeatPage({ who }: { who: User }) {
  const { s, run, notify, ui, closePane } = useWorkspace();
  const owner = s.users.find((u) => u.id === who.ownerId);
  const mine = who.ownerId === s.me.id;
  const [seat, setSeat] = useState<Seat | null>(null);
  const [shown, setShown] = useState<NewToken | null>(() => fresh.get(who.id) ?? null);
  const [label, setLabel] = useState('');
  const [retiring, setRetiring] = useState(false);
  const load = useCallback(async () => {
    const all = await api<Seat[]>('/seats').catch(() => [] as Seat[]);
    setSeat(all.find((x) => x.agent.id === who.id) ?? null);
  }, [who.id]);
  useEffect(() => {
    fresh.delete(who.id);
    if (mine) void load();
  }, [mine, load, who.id]);

  const copy = (text: string, what: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => notify(`${what} copied.`),
      () => notify('Copy did not work here. Select the text and copy it.'),
    );
  const act = async (work: () => Promise<unknown>) => {
    const ok = await run(work);
    if (ok !== undefined) await load();
    return ok;
  };

  const header = (
    <p className="agent-reach">
      {who.name} runs outside Sandbox{owner ? `, on ${owner.name}'s machine or server` : ''}, and
      signs in with a token. In its workspaces it is a member like a person: it reads what they
      share, never anyone's private pages, and its page changes wait for someone to accept them. Tag{' '}
      <b>@{who.name}</b> in a chat and it sees the message next time it checks its inbox.
    </p>
  );
  if (!mine)
    return (
      <div className="agent-page">
        {header}
        <p className="feed-empty">Only {owner?.name ?? 'its owner'} can change its settings.</p>
      </div>
    );

  const spaces = s.spaces.filter((x) => x.kind === 'project');
  const joined = spaces.filter((x) => seat?.spaceIds.includes(x.id));
  const open = spaces.filter((x) => !seat?.spaceIds.includes(x.id));
  return (
    <div className="agent-page seat-page">
      {header}
      <div className="agent-cols">
        <section className="agent-setup" aria-label="Connect">
          <h3>
            <Character agent={who} size={18} /> Connect {who.name}
          </h3>
          {shown ? (
            <div className="seat-token">
              <p>
                <b>Copy this token now.</b> It is shown once and works until you revoke it. Anyone
                who has it can act as {who.name} in its workspaces.
              </p>
              <span className="link-out">
                <input
                  readOnly
                  value={shown.token}
                  aria-label="Token"
                  onFocus={(e) => e.target.select()}
                />
                <button className="primary" onClick={() => copy(shown.token, 'Token')}>
                  <Copy size={13} /> Copy
                </button>
              </span>
              {connectLines(shown.token).map((line) => (
                <div key={line.name} className="seat-line">
                  <span>
                    {line.name}
                    <button className="plain" onClick={() => copy(line.text, line.name)}>
                      <Copy size={12} /> Copy
                    </button>
                  </span>
                  <pre>{line.text}</pre>
                </div>
              ))}
              <button className="plain" onClick={() => setShown(null)}>
                Done, I've copied it
              </button>
            </div>
          ) : (
            <p className="muted">
              Its address is <code>{mcpUrl()}</code>. An agent that signs in with a browser, like
              Claude Code, needs only that: add it without a token and approve the Sandbox page that
              opens. Otherwise make a token for each machine or tool it runs on and paste the
              connect line it gives you.
            </p>
          )}

          <SeatCheckPanel agentId={who.id} name={who.name} version={seat} />

          <h3>Tokens</h3>
          {seat?.tokens.length === 0 && <p className="feed-empty">None. It can't sign in.</p>}
          {seat?.tokens.map((t) => (
            <p key={t.id} className="who-line">
              <span>
                <KeyRound size={12} /> {t.label}{' '}
                <small className="muted">
                  {t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : 'never used'}
                </small>
              </span>
              <button
                onClick={() =>
                  void act(() => api(`/seats/${who.id}/tokens/${t.id}`, { method: 'DELETE' })).then(
                    (ok) => ok && notify(`${t.label} revoked. It stops working now.`),
                  )
                }
              >
                <X size={11} /> Revoke
              </button>
            </p>
          ))}
          {!who.retired && (
            <form
              className="seat-new-token"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() =>
                  api<NewToken>(`/seats/${who.id}/tokens`, {
                    body: { label: label.trim() || 'Token' },
                  }),
                ).then((made) => {
                  if (!made) return;
                  setShown(made as NewToken);
                  setLabel('');
                });
              }}
            >
              <input
                value={label}
                maxLength={60}
                placeholder="Where it runs, like Laptop"
                aria-label="Token name"
                onChange={(e) => setLabel(e.target.value)}
              />
              <button type="submit">
                <Plus size={12} /> New token
              </button>
            </form>
          )}
        </section>

        <section className="agent-side">
          <h3>Workspaces</h3>
          {joined.length === 0 && (
            <p className="feed-empty">None yet. It can only work in workspaces you add it to.</p>
          )}
          {joined.map((x) => (
            <p key={x.id} className="who-line">
              <span>{x.name}</span>
              <button
                onClick={() =>
                  void act(() => api(`/seats/${who.id}/spaces/${x.id}`, { method: 'DELETE' }))
                }
              >
                <X size={11} /> Remove
              </button>
            </p>
          ))}
          {!who.retired && open.length > 0 && (
            <Choice
              label="Add to a workspace"
              value={'' as Id}
              options={[
                ['' as Id, 'Add to a workspace'],
                ...open.map((x) => [x.id, x.name] as const),
              ]}
              onChange={(spaceId) =>
                spaceId && void act(() => api(`/seats/${who.id}/spaces`, { body: { spaceId } }))
              }
            />
          )}

          {!who.retired && (
            <button
              type="button"
              className="agent-retire"
              onBlur={() => setRetiring(false)}
              onClick={() => {
                if (!retiring) return setRetiring(true);
                void act(() => api(`/seats/${who.id}/retire`, { body: {} })).then((ok) => {
                  if (!ok) return;
                  const index = ui.panes.findIndex((t) => t.type === 'who' && t.id === who.id);
                  if (index >= 0) closePane(index);
                  notify(`${who.name} is retired. Its tokens stopped working; its history stays.`);
                });
              }}
            >
              {retiring ? 'Click again to retire' : 'Retire this agent'}
            </button>
          )}

          <h3>What it did</h3>
          <SeatLog agentId={who.id} />
        </section>
      </div>
    </div>
  );
}

type Activity = {
  id: string;
  at: string;
  tool: string;
  wrote: boolean;
  ok: boolean;
  page: { id: Id; title: string } | null;
  chat: { id: Id; title: string } | null;
  workspace: { id: Id; name: string } | null;
  hidden: boolean;
  detail: string;
};

/** Each MCP tool as a few words, ahead of what it was about. */
const DID: Record<string, string> = {
  whoami: 'Checked who it is',
  list_workspaces: 'Listed its workspaces',
  list_pages: 'Listed pages',
  read_page: 'Read',
  search: 'Searched for',
  list_chats: 'Listed chats',
  read_chat: 'Read',
  inbox: 'Checked its inbox',
  post_message: 'Posted in',
  suggest_edit: 'Suggested an edit to',
  suggest_cells: 'Suggested changes to',
  suggest_page: 'Suggested a new page',
  suggestion_status: 'Checked on a suggestion',
  working_on: 'Working on',
  sign_in: 'Tried to sign in',
};
const SHOWN = 30;

/**
 * What the seat read and wrote through the MCP server, newest first, for its owner. Something
 * opened to it that you can't see yourself is shown as such, never named.
 */
function SeatLog({ agentId }: { agentId: Id }) {
  const { open } = useWorkspace();
  const [log, setLog] = useState<Activity[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      api<Activity[]>(`/seats/${agentId}/activity`).then(
        (rows) => live && setLog(rows),
        () => live && setLog([]),
      );
    void load();
    // Its calls don't change anything you are looking at, so this looks again now and then.
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [agentId]);
  if (!log) return null;
  if (log.length === 0) return <p className="feed-empty">Nothing yet. It hasn't signed in.</p>;
  return (
    <div className="seat-log">
      {(all ? log : log.slice(0, SHOWN)).map((a) => (
        <p key={a.id} className={`seat-log-row${a.ok ? '' : ' failed'}`}>
          <span className={a.wrote ? 'wrote' : undefined}>
            {DID[a.tool] ?? a.tool}{' '}
            {a.page ? (
              <button className="link" onClick={() => open({ type: 'page', id: a.page!.id }, true)}>
                {a.page.title || 'Untitled'}
              </button>
            ) : a.chat ? (
              <button className="link" onClick={() => open({ type: 'chat', id: a.chat!.id }, true)}>
                {a.chat.title || 'a chat'}
              </button>
            ) : a.hidden ? (
              <i>something you can't see</i>
            ) : a.tool === 'search' ? (
              <q>{a.detail}</q>
            ) : a.workspace ? (
              <>in {a.workspace.name}</>
            ) : null}
            {!a.ok && <small> · didn't work{a.detail ? `: ${a.detail}` : ''}</small>}
          </span>
          <time>{ago(a.at)}</time>
        </p>
      ))}
      {log.length > SHOWN && (
        <button className="plain" onClick={() => setAll((v) => !v)}>
          {all ? 'Show recent only' : `Show all ${log.length}`}
        </button>
      )}
    </div>
  );
}

type Check = {
  state: 'retired' | 'no-tokens' | 'refused' | 'connected' | 'idle' | 'never';
  lastSeen: { at: string; label: string } | null;
  lastCall: { at: string; tool: string; ok: boolean } | null;
  lastRefused: { at: string; detail: string } | null;
  liveTokens: number;
  workspaces: number;
  pasted?: { state: 'live' | 'revoked' | 'not-this-agent'; label: string | null };
};

/** One sentence for where its connection stands, with what to do when it can't sign in. */
function verdict(c: Check, name: string) {
  const seen = c.lastSeen ? `${ago(c.lastSeen.at)} with ${c.lastSeen.label}` : '';
  switch (c.state) {
    case 'retired':
      return `${name} is retired, so it can't sign in.`;
    case 'no-tokens':
      return `${name} has no live token. Make one below, or sign it in from its browser.`;
    case 'refused':
      return `Its last sign-in was turned away ${ago(c.lastRefused!.at)}. ${c.lastRefused!.detail} Give it a new token.`;
    case 'connected':
      return `Connected. It last signed in ${seen}.`;
    case 'idle':
      return `It works, but it isn't connected now. It last signed in ${seen}.`;
    case 'never':
      return `It hasn't signed in yet. Paste a connect line into it, or check a token below.`;
  }
}

const PASTED = {
  live: (label: string | null) => `That token works. It's ${label}.`,
  revoked: (label: string | null) => `That token was ${label} and no longer works.`,
  'not-this-agent': () => `That isn't one of this agent's tokens.`,
};

/**
 * Test connection: whether the seat can sign in and when it last did. A token pasted here is
 * checked against this seat's own without counting as a sign-in, and is never kept.
 */
function SeatCheckPanel({
  agentId,
  name,
  version,
}: {
  agentId: Id;
  name: string;
  version: unknown;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const test = useCallback(
    async (pasted?: string) => {
      setBusy(true);
      try {
        setCheck(
          await api<Check>(`/seats/${agentId}/check`, {
            body: pasted === undefined ? {} : { token: pasted },
          }),
        );
      } catch {
        setCheck(null);
      } finally {
        setBusy(false);
      }
    },
    [agentId],
  );
  // Look again whenever the seat changes, like a token made or revoked.
  useEffect(() => void test(), [test, version]);
  const good = check?.state === 'connected' || check?.state === 'idle';
  return (
    <div className="seat-check" aria-live="polite">
      <h3>Connection</h3>
      {check && (
        <>
          <p className={`seat-check-line ${good ? 'ok' : check.state === 'never' ? '' : 'bad'}`}>
            {verdict(check, name)}
          </p>
          {check.lastCall && (
            <p className="muted">
              Last call {ago(check.lastCall.at)}: {DID[check.lastCall.tool] ?? check.lastCall.tool}
              {check.lastCall.ok ? '' : ", which didn't work"}.
            </p>
          )}
          {check.workspaces === 0 && check.state !== 'retired' && (
            <p className="muted">It's in no workspaces yet, so it can sign in but see nothing.</p>
          )}
          {check.pasted && (
            <p className="seat-check-line">{PASTED[check.pasted.state](check.pasted.label)}</p>
          )}
        </>
      )}
      <form
        className="seat-new-token"
        onSubmit={(e) => {
          e.preventDefault();
          void test(token.trim() ? token : undefined).then(() => setToken(''));
        }}
      >
        <input
          type="password"
          value={token}
          autoComplete="off"
          placeholder="Paste a token to check it (optional)"
          aria-label="Token to check"
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          <RefreshCw size={12} /> Test connection
        </button>
      </form>
    </div>
  );
}
