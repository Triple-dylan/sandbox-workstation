import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AgentMark } from '../features/agents/Character.tsx';
import { api } from '../data/client.ts';
import { isDark } from './theme.ts';
import { inviteFrom } from './invite.ts';
import type { Snapshot } from '../../shared/types.ts';

type GoogleId = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (r: { credential: string }) => void;
      }): void;
      renderButton(el: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

/** Google's sign-in button, loaded from Google only when this server uses it. */
export function GoogleButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const latest = useRef(onCredential);
  latest.current = onCredential;
  useEffect(() => {
    const draw = () => {
      const google = (window as unknown as { google?: GoogleId }).google;
      if (!google || !slot.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => latest.current(r.credential),
      });
      google.accounts.id.renderButton(slot.current, {
        theme: isDark() ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: 300,
      });
    };
    const src = 'https://accounts.google.com/gsi/client';
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if ((window as unknown as { google?: GoogleId }).google) draw();
      else existing.addEventListener('load', draw);
      return () => existing.removeEventListener('load', draw);
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', draw);
    document.head.appendChild(script);
    return () => script.removeEventListener('load', draw);
  }, [clientId]);
  return <div className="welcome-google" ref={slot} />;
}

/** Three agents at rest: the product's people-and-agents idea, before anyone has signed in. */
function Agents() {
  const dark = isDark();
  const agents = [
    { state: 'listening', color: dark ? 'rgb(150, 196, 232)' : 'rgb(40, 92, 140)' },
    { state: 'composing', color: dark ? 'rgb(232, 190, 150)' : 'rgb(150, 88, 34)' },
    { state: 'connecting', color: dark ? 'rgb(170, 222, 180)' : 'rgb(40, 120, 70)' },
  ] as const;
  return (
    <div className="welcome-agents" aria-hidden="true">
      {agents.map((o) => (
        <AgentMark key={o.state} form={o.state} size={52} color={o.color} />
      ))}
    </div>
  );
}

/** The two-sided layout every welcome step shares: what this is on one side, what to do on the other. */
export function Layout({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <main className="welcome">
      <section className="welcome-hero">
        <Agents />
        {hero}
      </section>
      <section className="welcome-door">{children}</section>
    </main>
  );
}

/**
 * What Sandbox is, said the same way on every way in: by Google, by name on a local server, by a
 * sign-in link. It names the two kinds of agent so nobody meets them unexplained.
 */
export function SignInHero() {
  return (
    <>
      <h1>Sandbox</h1>
      <p className="welcome-lede">Where your team and its agents work on the same pages.</p>
      <ul className="welcome-points">
        <li>
          <b>Pages you build together</b>
          <span>Documents, sheets, decks and canvases, edited live by everyone in them.</span>
        </li>
        <li>
          <b>Your own agent, everywhere you go</b>
          <span>
            One agent for your account, private to you. It turns what you bring into your private
            space into pages, and brings what it knows about you into every workspace.
          </span>
        </li>
        <li>
          <b>An agent for each workspace</b>
          <span>
            Shared by the team, it answers from that workspace's pages and brings in the right
            specialist. It never sees your private space.
          </span>
        </li>
      </ul>
    </>
  );
}

export function SignIn({
  clientId,
  invited,
  busy,
  error,
  onCredential,
}: {
  clientId: string;
  invited: { spaceName: string; invitedBy: string } | null;
  busy: boolean;
  error: string;
  onCredential: (credential: string) => void;
}) {
  return (
    <Layout hero={<SignInHero />}>
      {invited ? (
        <p className="welcome-invited">
          <b>{invited.invitedBy}</b> invited you to <b>{invited.spaceName}</b>.
        </p>
      ) : (
        <h2>Sign in to continue</h2>
      )}
      <GoogleButton clientId={clientId} onCredential={onCredential} />
      {busy && <p className="welcome-note">Signing you in…</p>}
      {error && (
        <p className="welcome-error" role="alert">
          {error}
        </p>
      )}
      <p className="welcome-note">
        {invited
          ? `You'll land in ${invited.spaceName} once you're signed in.`
          : "New here? Signing in makes your account. Then start a workspace of your own, or join one you've been invited to."}
      </p>
    </Layout>
  );
}

/**
 * For someone in no workspace yet: start one they own, or join one with an invite link. Both stay
 * available later from the space switcher; a person can belong to as many workspaces as they like.
 */
export function StartOrJoin({
  s,
  onDone,
  onSkip,
}: {
  s: Snapshot;
  onDone: () => Promise<void> | void;
  onSkip: () => void;
}) {
  const may = s.mayStartWorkspace !== false;
  const [choice, setChoice] = useState<'start' | 'join'>(may ? 'start' : 'join');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = s.me.name.split(' ')[0];
  const go = async (work: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await work();
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const token = inviteFrom(link);
  return (
    <Layout
      hero={
        <>
          <h1>Welcome, {first}</h1>
          <p className="welcome-lede">
            A workspace is where a team works: its pages, channels and its own agent. You can be in
            as many as you like and switch between them from the list.
          </p>
          <p className="welcome-lede">
            Your agent is already set up. It comes with you into every workspace, and keeps your
            private space, where only you and it can look.
          </p>
        </>
      }
    >
      <div className="welcome-choices" role="radiogroup" aria-label="How to start">
        {may && (
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'start'}
            className="welcome-choice"
            onClick={() => setChoice('start')}
          >
            <b>Start a workspace</b>
            <span>For a team or a project. You own it and invite who you want.</span>
          </button>
        )}
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'join'}
          className="welcome-choice"
          onClick={() => setChoice('join')}
        >
          <b>Join a workspace</b>
          <span>Paste the invite link someone in it sent you.</span>
        </button>
      </div>
      {choice === 'start' ? (
        <form
          className="welcome-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void go(() => api('/projects', { body: { name: name.trim() } }));
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name, e.g. Spring launch"
            aria-label="Workspace name"
            maxLength={60}
            autoFocus
          />
          <button className="primary" type="submit" disabled={!name.trim() || busy}>
            Start
          </button>
        </form>
      ) : (
        <form
          className="welcome-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (token) void go(() => api('/invites/accept', { body: { token } }));
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Invite link"
            aria-label="Invite link"
            autoFocus
          />
          <button className="primary" type="submit" disabled={!token || busy}>
            Join
          </button>
        </form>
      )}
      {!may && (
        <p className="welcome-note">
          Starting workspaces is limited here. Ask someone for an invite link.
        </p>
      )}
      {error && (
        <p className="welcome-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="welcome-skip" onClick={onSkip}>
        Look around my private space first
      </button>
    </Layout>
  );
}
