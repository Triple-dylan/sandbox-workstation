import { useEffect, useRef, useState } from 'react';
import { api } from '../data/client.ts';

type Profile = { id: string; name: string; color: string };
type Config = { accessCode: boolean; mode: 'open' | 'invite'; googleClientId?: string | null };

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
function GoogleButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (c: string) => void;
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
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: 280,
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
  return <div className="join-google" ref={slot} />;
}

/** Reads a sign-in or invite token from the address, then takes it out so it is not left behind. */
export function linkToken(name: 'invite' | 'signin') {
  return new URLSearchParams(location.search).get(name) ?? '';
}
export function clearLink() {
  const url = new URL(location.href);
  url.searchParams.delete('invite');
  url.searchParams.delete('signin');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function Join({ onJoined }: { onJoined: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [config, setConfig] = useState<Config>({ accessCode: false, mode: 'open' });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const invite = linkToken('invite');
  const signin = linkToken('signin');
  const [invited, setInvited] = useState<{ spaceName: string; invitedBy: string } | null>(null);
  const join = async (body: Record<string, string>, route = '/join') => {
    setError('');
    setBusy(true);
    try {
      await api(route, { body: { ...body, ...(invite ? { invite } : {}), code } });
      clearLink();
      onJoined();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    api<Profile[]>('/profiles').then(setProfiles, () => setProfiles([]));
    api<Config>('/config').then(setConfig, () => undefined);
    if (invite)
      api<{ spaceName: string; invitedBy: string }>(`/invite/${encodeURIComponent(invite)}`).then(
        setInvited,
        (e) => setError((e as Error).message),
      );
    // A sign-in link signs in straight away.
    if (signin) void join({ signin });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const byInvite = config.mode === 'invite';
  const google = config.googleClientId || '';
  if (signin)
    return (
      <main className="join">
        <div className="join-card">
          <h2>{error ? 'That link did not work' : 'Signing you in…'}</h2>
          {error && (
            <>
              <p className="join-error" role="alert">
                {error}
              </p>
              <p className="join-note">
                On a device where you are signed in, open Settings and make a new sign-in link.
              </p>
            </>
          )}
        </div>
      </main>
    );
  // Hosted and no invite: say how to get in instead of offering a form that cannot work.
  const closedDoor = byInvite && !invite && !config.accessCode;
  if (google)
    return (
      <main className="join">
        <div className="join-card">
          <header className="join-invite">
            <h1>{invited ? `Join ${invited.spaceName}` : 'Sandbox Workstation'}</h1>
            <p>
              {invited
                ? `${invited.invitedBy} invited you.`
                : closedDoor
                  ? 'Already here? Continue with Google. New people need an invite link from someone in it.'
                  : 'Continue with your Google account.'}
            </p>
          </header>
          {config.accessCode && !invite && (
            <label>
              <span>Setup code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Only for the first people in"
                autoComplete="off"
              />
            </label>
          )}
          <GoogleButton
            clientId={google}
            onCredential={(credential) => void join({ credential }, '/auth/google')}
          />
          {busy && <p className="join-note">Signing you in…</p>}
          {error && (
            <p className="join-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <main className="join">
      <form
        className="join-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void join({ name });
        }}
      >
        {invited ? (
          <header className="join-invite">
            <h1>Join {invited.spaceName}</h1>
            <p>{invited.invitedBy} invited you.</p>
          </header>
        ) : byInvite ? (
          <header className="join-invite">
            <h1>Sandbox Workstation</h1>
            <p>
              {closedDoor
                ? 'This workstation is by invitation. Ask someone in it for an invite link.'
                : 'Already have an account? Open a sign-in link from a device where you are signed in (Settings, Sign in on another device).'}
            </p>
          </header>
        ) : null}
        {!byInvite && !invite && profiles.length > 0 && (
          <section aria-label="People on this server">
            <h2>Continue as</h2>
            <div className="join-profiles">
              {profiles.map((p) => (
                <button type="button" key={p.id} onClick={() => void join({ userId: p.id })}>
                  <span className="avatar" style={{ background: p.color }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {!closedDoor && (
          <>
            <label>
              <span>
                {profiles.length && !byInvite && !invite ? 'Or join as someone new' : 'Your name'}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
                maxLength={40}
              />
            </label>
            {config.accessCode && !invite && (
              <label>
                <span>{byInvite ? 'Setup code' : 'Access code'}</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={byInvite ? 'For the first people in' : 'From whoever invited you'}
                  autoComplete="off"
                />
              </label>
            )}
            <button className="primary" type="submit" disabled={!name.trim() || busy}>
              {invited ? `Join ${invited.spaceName}` : 'Join'}
            </button>
          </>
        )}
        {error && (
          <p className="join-error" role="alert">
            {error}
          </p>
        )}
        {!byInvite && (
          <p className="join-note">
            {config.accessCode
              ? 'Type the name you joined with before to come back as yourself.'
              : 'Local sign-in: anyone who can reach this server can pick any profile. Run it on your own machine or a trusted network.'}
          </p>
        )}
      </form>
    </main>
  );
}
