import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openSql } from '../server/sql/open.ts';
import { openQueue } from '../server/sql/queue.ts';
import { backends, freshPostgresUrl, postgresUrl } from './postgres-helper.ts';

/** A clock the test moves by hand. */
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, pass: (ms: number) => (t += ms) };
};

for (const [name, open] of backends)
  describe(`${name} job queue`, () => {
    test('jobs of one key run one at a time in order; other keys run beside them', async () => {
      const sql = await open();
      const time = clock();
      const queue = await openQueue(sql, { now: time.now });
      await queue.enqueue('sync', 'sheet-a', { n: 1 });
      await queue.enqueue('sync', 'sheet-a', { n: 2 });
      await queue.enqueue('sync', 'sheet-b', { n: 3 });

      const first = await queue.claim<{ n: number }>('sync', 'w1', 60_000, 10);
      assert.deepEqual(
        first.map((j) => j.payload.n),
        [1, 3],
        'one job per key',
      );
      assert.deepEqual(await queue.claim('sync', 'w2', 60_000, 10), [], 'a-2 waits for a-1');
      assert.ok(await queue.complete(first[0].id, 'w1'));
      const next = await queue.claim<{ n: number }>('sync', 'w2', 60_000, 10);
      assert.deepEqual(
        next.map((j) => j.payload.n),
        [2],
      );
      await sql.close();
    });

    test('a failed job is tried again later, waiting longer each time, then stays failed', async () => {
      const sql = await open();
      const time = clock();
      const queue = await openQueue(sql, { now: time.now, retryBaseMs: 1000 });
      const id = (await queue.enqueue('sync', 'k', {}, { maxAttempts: 3 }))!;
      await queue.enqueue('sync', 'k', { behind: true });

      let [job] = await queue.claim('sync', 'w', 60_000);
      assert.ok(await queue.fail(job.id, 'w', new Error('Google is down')));
      assert.deepEqual(await queue.claim('sync', 'w', 60_000), [], 'not before its wait');
      time.pass(1000);
      [job] = await queue.claim('sync', 'w', 60_000);
      assert.equal(job.id, id, 'the retry runs before the job behind it');
      await queue.fail(job.id, 'w', new Error('still down'));
      time.pass(1999);
      assert.deepEqual(
        await queue.claim('sync', 'w', 60_000),
        [],
        'the second wait is twice as long',
      );
      time.pass(1);
      [job] = await queue.claim('sync', 'w', 60_000);
      await queue.fail(job.id, 'w', new Error('gave up'));

      const failed = await queue.job(id);
      assert.equal(failed?.state, 'failed');
      assert.equal(failed?.attempts, 3);
      assert.equal(failed?.lastError, 'gave up');
      assert.deepEqual(
        (await queue.failed('sync')).map((j) => j.id),
        [id],
      );
      const [behind] = await queue.claim<{ behind: boolean }>('sync', 'w', 60_000);
      assert.equal(behind.payload.behind, true, 'the jobs behind it go on');
      await sql.close();
    });

    test("a dead worker's job is taken again when its lease runs out", async () => {
      const sql = await open();
      const time = clock();
      const queue = await openQueue(sql, { now: time.now });
      await queue.enqueue('sync', 'k', {});
      const [job] = await queue.claim('sync', 'dead', 5000);
      time.pass(4999);
      assert.deepEqual(await queue.claim('sync', 'live', 5000), []);
      time.pass(1);
      const [again] = await queue.claim('sync', 'live', 5000);
      assert.equal(again.id, job.id);
      assert.equal(await queue.complete(job.id, 'dead'), false, 'the old worker lost it');
      assert.equal(await queue.fail(job.id, 'dead', 'late'), false);
      assert.equal(await queue.complete(job.id, 'live'), true);
      assert.equal((await queue.job(job.id))?.state, 'done');
      await sql.close();
    });

    test('a dedupe name keeps one waiting job; a newer one takes over from a failure', async () => {
      const sql = await open();
      const time = clock();
      const queue = await openQueue(sql, { now: time.now });
      const first = await queue.enqueue('sync', 'k', { v: 1 }, { dedupe: 'push:sheet' });
      assert.ok(first);
      assert.equal(await queue.enqueue('sync', 'k', { v: 2 }, { dedupe: 'push:sheet' }), null);
      const [running] = await queue.claim('sync', 'w', 60_000);
      const second = await queue.enqueue('sync', 'k', { v: 3 }, { dedupe: 'push:sheet' });
      assert.ok(second, 'a new one can wait while the first runs');
      assert.ok(await queue.fail(running.id, 'w', 'oops'));
      assert.equal((await queue.job(first!))?.state, 'done');
      assert.match(String((await queue.job(first!))?.lastError), /Superseded/);
      const [next] = await queue.claim<{ v: number }>('sync', 'w', 60_000);
      assert.equal(next.payload.v, 3);
      await sql.close();
    });

    test('drain runs everything due, completing or failing each job', async () => {
      const sql = await open();
      const time = clock();
      const queue = await openQueue(sql, { now: time.now });
      for (let i = 0; i < 6; i++) await queue.enqueue('sync', `k${i % 2}`, { i });
      const seen: number[] = [];
      const ran = await queue.drain<{ i: number }>('sync', 'w', async (job) => {
        seen.push(job.payload.i);
        if (job.payload.i === 4) throw new Error('no');
      });
      assert.equal(ran, 6);
      // Each key in its own order.
      assert.deepEqual(
        seen.filter((i) => i % 2 === 0),
        [0, 2, 4],
      );
      assert.deepEqual(
        seen.filter((i) => i % 2 === 1),
        [1, 3, 5],
      );
      time.pass(1);
      assert.equal(await queue.prune(0), 5, 'done jobs are pruned; the failed one waits to retry');
      await sql.close();
    });
  });

if (postgresUrl)
  test('several servers taking jobs at once never take the same one or break key order', async () => {
    const url = await freshPostgresUrl();
    const servers = await Promise.all([1, 2, 3, 4].map(() => openSql(url)));
    const queues = await Promise.all(servers.map((sql) => openQueue(sql)));
    for (let i = 0; i < 40; i++) await queues[0].enqueue('sync', `k${i % 5}`, { i });
    const running = new Map<string, number>();
    const order = new Map<string, number[]>();
    const takenBy = new Map<string, string>();
    await Promise.all(
      queues.map((queue, s) =>
        queue.drain<{ i: number }>(
          'sync',
          `server-${s}`,
          async (job) => {
            assert.equal(takenBy.get(job.id), undefined, `job ${job.payload.i} taken twice`);
            takenBy.set(job.id, `server-${s}`);
            assert.equal(running.get(job.key) ?? 0, 0, `two jobs of ${job.key} at once`);
            running.set(job.key, 1);
            await new Promise((r) => setTimeout(r, 2));
            order.set(job.key, [...(order.get(job.key) ?? []), job.payload.i]);
            running.set(job.key, 0);
          },
          { concurrency: 3 },
        ),
      ),
    );
    assert.equal(takenBy.size, 40);
    for (const [key, seen] of order)
      assert.deepEqual(
        seen,
        [...seen].sort((a, b) => a - b),
        key,
      );
    assert.ok(new Set(takenBy.values()).size > 1, 'more than one server did work');
    for (const sql of servers) await sql.close();
  });
