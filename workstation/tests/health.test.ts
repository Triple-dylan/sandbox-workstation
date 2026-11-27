import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { mountFor, parseMountinfo, storageInfo, storageWarning } from '../server/storage.ts';

// A container with no volume: / is the overlay, /data is just a folder on it.
const NO_VOLUME = [
  '412 380 0:52 / / rw,relatime master:1 - overlay overlay rw,lowerdir=/l,upperdir=/u,workdir=/w',
  '413 412 0:55 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw',
  '414 412 0:56 / /dev rw,nosuid - tmpfs tmpfs rw,size=65536k,mode=755',
].join('\n');

// The same container with a volume mounted at /data.
const WITH_VOLUME = `${NO_VOLUME}\n420 412 252:16 /vol /data rw,relatime - ext4 /dev/vdb rw`;

test('storage: a database on the container overlay is not kept', () => {
  assert.deepEqual(storageInfo('/data/workstation.db', NO_VOLUME), {
    persistent: false,
    storage: 'overlay',
  });
});

test('storage: a database on a mounted volume is kept', () => {
  assert.deepEqual(storageInfo('/data/workstation.db', WITH_VOLUME), {
    persistent: true,
    storage: 'ext4',
  });
  // Deeper folders inside the volume count; a sibling with a shared prefix does not.
  assert.equal(storageInfo('/data/teams/a.db', WITH_VOLUME).persistent, true);
  assert.equal(storageInfo('/database/a.db', WITH_VOLUME).persistent, false);
});

test('storage: memory, tmpfs and unknown mounts', () => {
  assert.deepEqual(storageInfo(':memory:', WITH_VOLUME), { persistent: false, storage: 'memory' });
  assert.equal(
    storageInfo('/dev/shm/a.db', `${NO_VOLUME}\n9 414 0:9 / /dev/shm rw - tmpfs shm rw`).persistent,
    false,
  );
  assert.deepEqual(storageInfo('/data/a.db', ''), { persistent: null, storage: 'unknown' });
});

test('storage: the later of two mounts on the same point wins, and escaped paths read back', () => {
  const stacked = `${WITH_VOLUME}\n421 420 0:60 / /data rw - tmpfs tmpfs rw`;
  assert.equal(storageInfo('/data/a.db', stacked).storage, 'tmpfs');
  const mounts = parseMountinfo('5 1 8:1 / /my\\040data rw - xfs /dev/sda1 rw');
  assert.deepEqual(mounts, [{ point: '/my data', fs: 'xfs' }]);
  assert.equal(mountFor('/my data/x', mounts)?.fs, 'xfs');
});

test('storage: the startup warning names the folder only when data would be lost', () => {
  const lost = storageWarning(
    '/data/workstation.db',
    storageInfo('/data/workstation.db', NO_VOLUME),
  );
  assert.match(lost ?? '', /\/data is on storage that is thrown away \(overlay\)/);
  assert.match(lost ?? '', /Attach a volume/);
  assert.equal(storageWarning('/data/workstation.db', { persistent: true, storage: 'ext4' }), null);
  assert.equal(
    storageWarning('/data/workstation.db', { persistent: null, storage: 'unknown' }),
    null,
  );
  assert.equal(storageWarning(':memory:', { persistent: false, storage: 'memory' }), null);
});

const opened: ReturnType<typeof createApp>[] = [];
after(async () => {
  for (const app of opened) await app.close();
});

test('healthz: reports whether the database is kept, and stays 200 either way', async () => {
  const app = createApp({ dbPath: ':memory:', staticDir: null });
  opened.push(app);
  await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
  const { port } = app.server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.persistent, false);
  assert.equal(body.storage, 'memory');
  assert.equal(typeof body.version, 'number');
});
