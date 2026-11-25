import { useEffect, useRef, useState } from 'react';
import { api } from '../data/client.ts';

type Profile = { id: string; name: string; color: string };

export function Join({ onJoined }: { onJoined: () => void }) {
  const googleButton = useRef<HTMLDivElement>(null);
  const [auth, setAuth] = useState<{ googleClientId: string | null; local: boolean } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ googleClientId: string | null; local: boolean }>('/auth/config').then(setAuth, () =>
      setError('Unable to load sign-in. Please reload.'),
    );
  }, []);
  useEffect(() => {
    if (auth?.local) void api<Profile[]>('/profiles').then(setProfiles, () => setProfiles([]));
    if (!auth?.googleClientId) return;
    let active = true;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!active || !googleButton.current) return;
      const google = (window as any).google.accounts.id;
      google.initialize({
        client_id: auth.googleClientId,
        callback: async ({ credential }: { credential: string }) => {
          try {
            await api('/auth/google', { body: { credential } });
            onJoined();
          } catch (error) {
            setError((error as Error).message);
          }
        },
      });
      google.renderButton(googleButton.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      });
    };
    script.onerror = () => setError('Google sign-in could not load. Please reload.');
    document.head.appendChild(script);
    return () => {
      active = false;
      script.remove();
    };
  }, [auth, onJoined]);
  const join = async (body: { name?: string; userId?: string }) => {
    setError('');
    try {
      await api('/join', { body });
      onJoined();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="join">
      <form
        className="join-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void join({ name });
        }}
      >
        <h1>Sandbox Workstation</h1>
        <div ref={googleButton} />
        {!auth && !error && <p>Loading sign-in…</p>}
        {auth?.local && (
          <>
            {profiles.length > 0 && (
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
            <label>
              <span>{profiles.length ? 'Or join as someone new' : 'Your name'}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
                maxLength={40}
              />
            </label>
            <button className="primary" type="submit" disabled={!name.trim()}>
              Join
            </button>
          </>
        )}
        {error && (
          <p className="join-error" role="alert">
            {error}
          </p>
        )}
        {auth?.local && (
          <p className="join-note">
            Local demo sign-in: anyone who can reach this server can pick any profile. Run it on
            your own machine or a trusted network.
          </p>
        )}
      </form>
    </main>
  );
}
