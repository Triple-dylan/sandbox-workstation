import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openDb } from '../server/db.ts';
import { numberPlaceholders, type Sql } from '../server/sql/index.ts';
import { openSql } from '../server/sql/open.ts';
import { sqliteSql } from '../server/sql/sqlite.ts';

// Postgres tests run when TEST_DATABASE_URL points at a server with an empty database to use (CI
// starts one). Each run works in a schema of its own and drops it afterwards.
const postgresUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !postgresUrl) throw new Error('CI must set TEST_DATABASE_URL');

test('placeholders become $1, $2 outside strings, quoted names and comments', () => {
  assert.equal(
    numberPlaceholders(`select ?, 'a?''?', "b?" from t where x = ? -- why?\n and y = ? /* ? */`),
    `select $1, 'a?''?', "b?" from t where x = $2 -- why?\n and y = $3 /* ? */`,
  );
  assert.equal(numberPlaceholders('select 1'), 'select 1');
});

const schemas: string[] = [];
async function freshPostgres(): Promise<Sql> {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = await openSql(postgresUrl!);
  await admin.exec(`create schema ${schema}`);
  await admin.close();
  schemas.push(schema);
  const url = new URL(postgresUrl!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return openSql(url.toString());
}
after(async () => {
  if (!postgresUrl || !schemas.length) return;
  const admin = await openSql(postgresUrl);
  for (const schema of schemas) await admin.exec(`drop schema if exists ${schema} cascade`);
  await admin.close();
});

const backends: [string, () => Promise<Sql>][] = [
  ['sqlite', async () => sqliteSql(openDb(':memory:'))],
];
if (postgresUrl) backends.push(['postgres', freshPostgres]);

for (const [name, open] of backends)
  describe(`${name} backend`, () => {
    test('reads and writes with ? placeholders and says what changed', async () => {
      const sql = await open();
      const insert = `insert into sessions (token, user_id) values (?, ?)`;
      assert.deepEqual(await sql.run(insert, 'a', 'u1'), { changes: 1 });
      await sql.run(insert, 'b', 'u1');
      assert.equal(
        (await sql.get('select user_id from sessions where token = ?', 'a'))?.user_id,
        'u1',
      );
      assert.equal(await sql.get('select * from sessions where token = ?', 'zzz'), undefined);
      const rows = await sql.all(
        'select token from sessions where user_id = ? order by token',
        'u1',
      );
      assert.deepEqual(
        rows.map((r) => r.token),
        ['a', 'b'],
      );
      assert.deepEqual(await sql.run('delete from sessions where user_id = ?', 'u1'), {
        changes: 2,
      });
      await sql.close();
    });

    test('counts, sums and big integers come back as numbers', async () => {
      const sql = await open();
      await sql.run(
        `insert into connections (user_id, provider, account, access, expires_at) values (?, ?, ?, ?, ?)`,
        'u1',
        'google',
        'me',
        'x',
        Date.UTC(2030, 0, 1),
      );
      const row = await sql.get(
        `select count(*) as n, sum(expires_at) as total, max(expires_at) as latest from connections`,
      );
      assert.deepEqual(
        { ...row },
        { n: 1, total: Date.UTC(2030, 0, 1), latest: Date.UTC(2030, 0, 1) },
      );
      assert.equal(
        (await sql.get(`select cast(? as text) as q, '?' as literal`, 'x'))?.literal,
        '?',
      );
      await sql.close();
    });

    test('bytes go in and come back the same', async () => {
      const sql = await open();
      const vector = new Float32Array([0.25, -1, 3.5]);
      await sql.run(
        `insert into passage_vectors (resource_id, idx, stamp, text, vector) values (?, ?, ?, ?, ?)`,
        'r1',
        0,
        's',
        'hello',
        new Uint8Array(vector.buffer),
      );
      const bytes = (await sql.get('select vector from passage_vectors'))!.vector as Uint8Array;
      assert.deepEqual(
        [
          ...new Float32Array(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          ),
        ],
        [0.25, -1, 3.5],
      );
      await sql.close();
    });

    test('on conflict do nothing works the same on both', async () => {
      const sql = await open();
      const add = `insert into grants (resource_id, user_id) values (?, ?) on conflict do nothing`;
      assert.equal((await sql.run(add, 'r', 'u')).changes, 1);
      assert.equal((await sql.run(add, 'r', 'u')).changes, 0);
      await sql.close();
    });

    test('rows keep the order they were made in through rowid', async () => {
      const sql = await open();
      for (const token of ['c', 'a', 'b'])
        await sql.run('insert into sessions (token, user_id) values (?, ?)', token, 'u');
      const rows = await sql.all('select token from sessions order by rowid');
      assert.deepEqual(
        rows.map((r) => r.token),
        ['c', 'a', 'b'],
      );
      await sql.close();
    });

    test('a transaction commits, or rolls back when it throws', async () => {
      const sql = await open();
      await sql.transaction(async (tx) => {
        await tx.run('insert into sessions (token, user_id) values (?, ?)', 'kept', 'u');
        await tx.transaction(async (inner) => {
          await inner.run('insert into sessions (token, user_id) values (?, ?)', 'nested', 'u');
        });
      });
      await assert.rejects(
        sql.transaction(async (tx) => {
          await tx.run('insert into sessions (token, user_id) values (?, ?)', 'dropped', 'u');
          throw new Error('stop');
        }),
        /stop/,
      );
      const rows = await sql.all('select token from sessions order by token');
      assert.deepEqual(
        rows.map((r) => r.token),
        ['kept', 'nested'],
      );
      await sql.close();
    });

    test('work asked for during a transaction runs after it, in order', async () => {
      const sql = await open();
      const order: string[] = [];
      const tx = sql.transaction(async (t) => {
        await t.run('insert into sessions (token, user_id) values (?, ?)', 'one', 'u');
        await new Promise((r) => setTimeout(r, 20));
        order.push('tx');
      });
      const outside = sql
        .run('update sessions set user_id = ? where token = ?', 'v', 'one')
        .then(() => order.push('outside'));
      await Promise.all([tx, outside]);
      if (name === 'sqlite') {
        // SQLite has one connection, so the update waits and then finds the row.
        assert.deepEqual(order, ['tx', 'outside']);
        assert.equal((await sql.get('select user_id from sessions'))?.user_id, 'v');
      }
      await sql.close();
    });
  });

if (postgresUrl) {
  test('postgres has every table and column SQLite has', async () => {
    const lite = openDb(':memory:');
    const pg = await freshPostgres();
    const tables = lite
      .prepare(`select name from sqlite_master where type = 'table'`)
      .all()
      .map((r) => String(r.name));
    const missing: string[] = [];
    for (const table of tables) {
      const pgColumns = new Set(
        (
          await pg.all(
            `select column_name from information_schema.columns where table_schema = current_schema() and table_name = ?`,
            table,
          )
        ).map((r) => r.column_name),
      );
      if (!pgColumns.size) missing.push(`table ${table}`);
      else
        for (const column of lite.prepare(`select name from pragma_table_info(?)`).all(table))
          if (!pgColumns.has(column.name)) missing.push(`${table}.${String(column.name)}`);
    }
    lite.close();
    await pg.close();
    assert.deepEqual(
      missing,
      [],
      'Add these to server/sql/postgres-schema.ts (new tables in postgresSchema, new columns in postgresMigrations)',
    );
  });

  test('starting several servers at once brings the schema up once, safely', async () => {
    const first = await freshPostgres();
    const url = new URL(postgresUrl);
    url.searchParams.set('options', `-c search_path=${schemas.at(-1)}`);
    const again = await Promise.all([1, 2, 3].map(() => openSql(url.toString())));
    const row = await first.get(
      `select count(*) as n from information_schema.tables where table_schema = current_schema()`,
    );
    assert.ok(row!.n > 20);
    for (const sql of [first, ...again]) await sql.close();
  });
}
