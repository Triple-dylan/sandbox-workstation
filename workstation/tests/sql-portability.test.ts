import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { numberPlaceholders } from '../server/sql/index.ts';
import { openSql } from '../server/sql/open.ts';

// The store's SQL must also be SQL that Postgres understands, ahead of the move (see
// server/sql/index.ts for the usual swaps). This asks Postgres to parse and plan every query
// written in server/store.ts, against the Postgres schema. It runs where TEST_DATABASE_URL is set.
const postgresUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !postgresUrl) throw new Error('CI must set TEST_DATABASE_URL');

/** Quoted strings and templates in the store that start like a query; `${…}` stands for values. */
function storeQueries() {
  const source = readFileSync(new URL('../server/store.ts', import.meta.url), 'utf8');
  const queries = new Set<string>();
  for (const m of source.matchAll(/(['`])((?:select|insert|update|delete|with)\s[\s\S]*?)\1/gi))
    queries.add(m[2].replace(/\$\{[^}]*\}/g, '?'));
  return [...queries];
}

test('the store finds its queries to check', () => {
  assert.ok(storeQueries().length > 100);
});

test('every query in the store is one Postgres understands', { skip: !postgresUrl }, async () => {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = await openSql(postgresUrl!);
  await admin.exec(`create schema ${schema}`);
  const url = new URL(postgresUrl!);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const sql = await openSql(url.toString());
  const refused: string[] = [];
  try {
    for (const [i, query] of storeQueries().entries())
      try {
        await sql.exec(`prepare q${i} as ${numberPlaceholders(query)}`);
      } catch (error) {
        refused.push(`${(error as Error).message}: ${query.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
  } finally {
    await sql.close();
    await admin.exec(`drop schema ${schema} cascade`);
    await admin.close();
  }
  assert.deepEqual(refused, [], 'Write these so SQLite and Postgres both accept them');
});
