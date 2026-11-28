import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EXACT_UP_TO_PAGES, passageVectors } from '../server/sql/vectors.ts';
import { backends, postgresUrl, freshPostgres } from './postgres-helper.ts';

/** A repeatable pseudo-random unit vector of 512 numbers. */
function unitVector(seed: number) {
  const v = new Float32Array(512);
  let x = seed * 2654435761;
  for (let i = 0; i < v.length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    v[i] = x / 2147483648 - 0.5;
  }
  let n = 0;
  for (const a of v) n += a * a;
  n = Math.sqrt(n);
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
/** Moves `v` a little toward `toward`, so it is the closest of the random vectors. */
const near = (v: Float32Array, toward: Float32Array, amount: number) => {
  const out = v.map((a, i) => a * (1 - amount) + toward[i] * amount);
  let n = 0;
  for (const a of out) n += a * a;
  return out.map((a) => a / Math.sqrt(n));
};

const results: Record<string, { resourceId: string; text: string; score: number }[]> = {};

for (const [name, open] of backends)
  describe(`${name} search vectors`, () => {
    test('finds the closest passages of current, readable pages, best first', async () => {
      const sql = await open();
      const vectors = passageVectors(sql);
      const question = unitVector(1);
      assert.equal(await vectors.stamp('budget'), null);
      await vectors.replace('budget', 's1', [
        { text: 'Q1 budget total', vector: near(unitVector(2), question, 0.9) },
        { text: 'Travel line', vector: unitVector(3) },
      ]);
      await vectors.replace('roadmap', 's1', [
        { text: 'Launch in March', vector: near(unitVector(4), question, 0.6) },
      ]);
      await vectors.replace('private', 's1', [
        { text: 'Salary notes', vector: near(unitVector(5), question, 0.95) },
      ]);
      await vectors.replace('old', 's1', [{ text: 'Stale', vector: question }]);
      assert.equal(await vectors.stamp('budget'), 's1');

      const pages = [
        { id: 'budget', stamp: 's1' },
        { id: 'roadmap', stamp: 's1' },
        // Changed since its vectors were made, so they don't count.
        { id: 'old', stamp: 's2' },
        // 'private' is not passed: the asker may not read it.
      ];
      const found = await vectors.nearest(question, pages, 2);
      assert.deepEqual(
        found.map((m) => m.text),
        ['Q1 budget total', 'Launch in March'],
      );
      assert.ok(found[0].score > found[1].score && found[0].score <= 1.0001);
      assert.deepEqual(await vectors.nearest(question, [], 5), []);
      results[name] = await vectors.nearest(question, pages, 10);
      await sql.close();
    });

    test("replacing a page's passages drops the old ones", async () => {
      const sql = await open();
      const vectors = passageVectors(sql);
      const q = unitVector(9);
      await vectors.replace('p', 'a', [
        { text: 'one', vector: q },
        { text: 'two', vector: unitVector(10) },
      ]);
      await vectors.replace('p', 'b', [{ text: 'three', vector: unitVector(11) }]);
      assert.equal(await vectors.stamp('p'), 'b');
      const found = await vectors.nearest(q, [{ id: 'p', stamp: 'b' }], 10);
      assert.deepEqual(
        found.map((m) => m.text),
        ['three'],
      );
      await sql.close();
    });
  });

if (postgresUrl) {
  test('Postgres and SQLite rank the same passages the same way', () => {
    assert.deepEqual(
      results.postgres.map((m) => m.text),
      results.sqlite.map((m) => m.text),
    );
    results.postgres.forEach((m, i) =>
      assert.ok(Math.abs(m.score - results.sqlite[i].score) < 1e-5),
    );
  });

  test('Postgres finds the closest among many pages through its HNSW index', async () => {
    const sql = await freshPostgres();
    const vectors = passageVectors(sql);
    const count = EXACT_UP_TO_PAGES + 100;
    const pages = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, stamp: 's' }));
    await sql.transaction(async (tx) => {
      for (const [i, page] of pages.entries())
        await tx.run(
          'insert into passage_vectors (resource_id, idx, stamp, text, embedding) values (?, 0, ?, ?, cast(? as vector))',
          page.id,
          page.stamp,
          `page ${i}`,
          `[${Array.from(unitVector(100 + i)).join(',')}]`,
        );
    });
    await sql.exec('analyze passage_vectors');
    const index = await sql.get(
      `select indexdef from pg_indexes where tablename = 'passage_vectors' and indexname = 'passage_vectors_embedding'`,
    );
    assert.match(String(index?.indexdef), /hnsw \(embedding vector_ip_ops\)/);
    const question = near(unitVector(7), unitVector(100 + 42), 0.5);
    const exact = pages
      .map((_, i) => ({ text: `page ${i}`, score: dot(question, unitVector(100 + i)) }))
      .sort((a, b) => b.score - a.score);
    const found = await vectors.nearest(question, pages, 3);
    assert.equal(found[0].text, 'page 42');
    assert.equal(found[0].text, exact[0].text);
    // Asked about some of the pages only: nothing from the others comes back.
    const some = pages.filter((_, i) => i % 2 === 0 || i === 43);
    const fromSome = await vectors.nearest(
      question,
      [...some, ...some.slice(0, EXACT_UP_TO_PAGES)],
      5,
    );
    assert.ok(fromSome.every((m) => some.some((p) => p.id === m.resourceId)));
    assert.equal(fromSome[0].text, 'page 42');
    await assert.rejects(
      vectors.replace('bad', 's', [{ text: 'short', vector: new Float32Array(3) }]),
      /512 numbers/,
    );
    await sql.close();
  });
}
