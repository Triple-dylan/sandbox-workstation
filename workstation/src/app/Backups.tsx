import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';

type Status = {
  count: number;
  keep: number;
  newest: { name: string; takenAt: string; bytes: number } | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const size = (bytes: number) =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1e6).toFixed(1)} MB`;

/**
 * Backups, in Settings, for the people who run this server (`BACKUP_OWNERS`). Everyone else, and a
 * server with backups off, sees nothing here.
 */
export function Backups() {
  const { notify } = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<Status>('/backups').then(
      (s) => live && setStatus(s),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  if (!status) return null;
  const backUpNow = () => {
    setBusy(true);
    api<{ name: string; takenAt: string; bytes: number }>('/backup', { body: {} })
      .then(
        (made) => {
          setStatus((s) =>
            s
              ? {
                  ...s,
                  newest: made,
                  count: s.newest?.name === made.name ? s.count : Math.min(s.keep, s.count + 1),
                }
              : s,
          );
          notify('Backup saved.');
        },
        (e) => notify((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className="setting stack">
      <span>Backups</span>
      <span className="setting-pair">
        <small className="muted truncate">
          {status.newest
            ? `Newest ${when(status.newest.takenAt)}, ${size(status.newest.bytes)}`
            : 'None yet'}
        </small>
        <button className="plain" disabled={busy} onClick={backUpNow}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        {status.newest && (
          <a className="plain" href="/api/backup" download>
            <Download size={13} /> Download
          </a>
        )}
      </span>
      <small>
        A copy of the whole server is taken every night; the last {status.keep} are kept (
        {status.count} now). Only the people who run this server see this.
      </small>
    </div>
  );
}
