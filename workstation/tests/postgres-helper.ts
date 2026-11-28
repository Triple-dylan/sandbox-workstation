import { after } from 'node:test';
import { randomBytes } from 'node:crypto';
import { openDb } from '../server/db.ts';
import type { Sql } from '../server/sql/index.ts';
import { openSql } from '../server/sql/open.ts';
import { sqliteSql } from '../server/sql/sqlite.ts';

/**
 * Postgres tests run when TEST_DATABASE_URL points at a Postgres with pgvector and a database to
 * use (CI starts one). Each test gets a schema of its own, dropped when the file's tests end.
 * pgvector is installed once in `public`, where every test schema finds it.
 */
export const postgresUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !postgresUrl) throw new Error('CI must set TEST_DATABASE_URL');

const schemas: string[] = [];
let ready: Promise<void> | null = null;

async function prepare() {
  const admin = await openSql(postgresUrl!);
  try {
    await admin.exec('create extension if not exists vector schema public');
  } catch {
    // Another test file installed it at the same moment.
  } finally {
    await admin.close();
  }
}

/** The URL of a new, empty schema in the test database, made up to date when it is opened. */
export async function freshPostgresUrl() {
  ready ??= prepare();
  await ready;
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = await openSql(postgresUrl!);
  await admin.exec(`create schema ${schema}`);
  await admin.close();
  schemas.push(schema);
  const url = new URL(postgresUrl!);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}

export const freshPostgres = async (): Promise<Sql> => openSql(await freshPostgresUrl());

after(async () => {
  if (!postgresUrl || !schemas.length) return;
  const admin = await openSql(postgresUrl);
  for (const schema of schemas) await admin.exec(`drop schema if exists ${schema} cascade`);
  await admin.close();
});

/** Each backend to test, by name: SQLite in memory always, Postgres when there is one. */
export const backends: [name: 'sqlite' | 'postgres', open: () => Promise<Sql>][] = [
  ['sqlite', async () => sqliteSql(openDb(':memory:'))],
  ...(postgresUrl ? [['postgres', freshPostgres] as ['postgres', () => Promise<Sql>]] : []),
];
