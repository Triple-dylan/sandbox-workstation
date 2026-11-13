import { LayoutDashboard } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { Md } from '../app/util.tsx';
import { PageFeed } from './PageFeed.tsx';
import type { Resource } from '../../shared/types.ts';

/** Something brought in and kept as it is: a picture, or the text of a file. It can go on any canvas. */
export function AssetPage({ page }: { page: Resource }) {
  const { pick, run, open, notify } = useWorkspace();
  const picture = page.body.startsWith('data:');
  const place = () =>
    pick({
      title: 'Put it on which canvas?',
      filter: (r) => r.kind === 'canvas' && r.spaceId === page.spaceId,
      onPick: (t) =>
        t.type === 'page' &&
        void run(() =>
          api('/resources', {
            body: {
              spaceId: page.spaceId,
              parentId: t.id,
              kind: 'embed',
              body: JSON.stringify({ resourceId: page.id }),
              placement: { x: 96, y: 96, width: 320, height: 240 },
            },
          }),
        ).then((ok) => {
          if (!ok) return;
          open(t, true);
          notify('Placed on the canvas.');
        }),
    });
  return (
    <div className="asset-page">
      <div className="asset-body">
        <p className="asset-meta">
          {page.source
            ? `Brought in from ${page.source.name} · ${page.source.type} · ${new Date(page.source.at).toLocaleDateString()}`
            : 'Asset'}
          <button onClick={place}>
            <LayoutDashboard size={13} /> Put on a canvas
          </button>
        </p>
        {picture ? <img src={page.body} alt={page.title} /> : <Md text={page.body} />}
      </div>
      <PageFeed page={page} />
    </div>
  );
}
