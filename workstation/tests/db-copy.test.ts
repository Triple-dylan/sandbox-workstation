import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { copySqliteToPostgres } from '../server/sql/copy.ts';
import { passageVectors } from '../server/sql/vectors.ts';
import { sqliteSql } from '../server/sql/sqlite.ts';
import { freshPostgres, postgresUrl } from './postgres-helper.ts';

test(
  'a SQLite database copies into Postgres whole, in order, with its search vectors',
  { skip: !postgresUrl },
  async () => {
    const db = openDb(':memory:');
    const store = new Store(db);
    const dylan = store.createHuman('Dylan');
    const maya = store.createHuman('Maya');
    const project = store.createProject(dylan.id, 'Launch');
    store.addMember(dylan.id, project.id, maya.id);
    const vector = new Float32Array(512).fill(1 / Math.sqrt(512));
    const lite = passageVectors(sqliteSql(db));
    await lite.replace('page', 's1', [{ text: 'hello', vector }]);
    await lite.replace('odd', 's1', [{ text: 'short', vector: new Float32Array(3) }]);
    const tables = db
      .prepare(`select name from sqlite_master where type = 'table'`)
      .all()
      .map((r) => String(r.name));
    const counts = Object.fromEntries(
      tables.map((t) => [t, Number(db.prepare(`select count(*) as n from ${t}`).get()!.n)]),
    );

    const pg = await freshPostgres();
    const report = await copySqliteToPostgres(db, pg);
    assert.equal(report.skippedVectors, 1);
    for (const table of tables) {
      const expected = counts[table] - (table === 'passage_vectors' ? 1 : 0);
      assert.equal(report.copied[table], expected, table);
      assert.equal((await pg.get(`select count(*) as n from ${table}`))!.n, expected, table);
    }
    const people = await pg.all(`select name from users where kind = 'human' order by rowid`);
    assert.deepEqual(
      people.map((r) => r.name),
      ['Dylan', 'Maya'],
    );
    const found = await passageVectors(pg).nearest(vector, [{ id: 'page', stamp: 's1' }], 1);
    assert.equal(found[0]?.text, 'hello');
    assert.ok(Math.abs(found[0].score - 1) < 1e-5);

    // A second copy into the same database is refused and changes nothing.
    await assert.rejects(copySqliteToPostgres(db, pg), /already has rows/);
    assert.equal((await pg.get(`select count(*) as n from users`))!.n, counts.users);
    await pg.close();
    db.close();
  },
);
