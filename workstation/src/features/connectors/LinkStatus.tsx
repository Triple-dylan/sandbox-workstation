import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import { readSheet } from '../../../shared/sheet.ts';
import type { Resource } from '../../../shared/types.ts';
import { ago } from '../../app/util.tsx';

const NAMES = { google: 'Google Sheets', microsoft: 'Excel' } as const;

/**
 * Where a linked sheet lives and when it last matched. Opening it brings in the original's
 * changes; edits here go out as they are made.
 */
export function LinkStatus({ page }: { page: Resource }) {
  const { run, user } = useWorkspace();
  const link = readSheet(page.body).link;
  const [busy, setBusy] = useState(false);
  const sync = () => {
    setBusy(true);
    void run(() => api(`/resources/${page.id}/sync`, { body: {} })).finally(() => setBusy(false));
  };
  useEffect(() => {
    if (link && (!link.syncedAt || Date.now() - Date.parse(link.syncedAt) > 30_000)) sync();
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);
  if (!link) return null;
  const name = NAMES[link.provider];
  return (
    <span className={`link-status ${link.error ? 'is-error' : ''}`}>
      {link.error ? <TriangleAlert size={13} /> : null}
      <span
        className="truncate"
        title={
          link.error ??
          `Linked by ${user(link.linkedBy)?.name ?? 'someone'}, tab "${link.tab}". Changes go both ways.`
        }
      >
        {link.error
          ? link.error
          : `${name} · ${link.syncedAt ? `in sync ${ago(link.syncedAt)}` : 'not synced yet'}`}
      </span>
      <button
        onClick={sync}
        disabled={busy}
        title={`Bring in ${name}'s latest`}
        aria-label="Sync now"
      >
        <RefreshCw size={12} className={busy ? 'spin' : ''} />
      </button>
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        title={`Open in ${name}`}
        aria-label={`Open in ${name}`}
      >
        <ExternalLink size={12} />
      </a>
    </span>
  );
}
