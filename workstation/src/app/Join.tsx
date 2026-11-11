import { useEffect, useState } from 'react';
import { api } from '../data/client.ts';

type Profile = { id: string; name: string; color: string };

export function Join({ onJoined }: { onJoined: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Profile[]>('/profiles').then(setProfiles, () => setProfiles([]));
  }, []);
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
        {error && (
          <p className="join-error" role="alert">
            {error}
          </p>
        )}
        <p className="join-note">
          Local demo sign-in: anyone who can reach this server can pick any profile. Run it on your
          own machine or a trusted network.
        </p>
      </form>
    </main>
  );
}
