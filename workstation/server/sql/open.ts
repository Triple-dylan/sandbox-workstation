import { openDb } from '../db.ts';
import type { Sql } from './index.ts';
import { sqliteSql } from './sqlite.ts';

export const isPostgresUrl = (target: string) => /^postgres(ql)?:\/\//i.test(target);

/**
 * Opens the database: a `postgres://` URL opens Postgres (schema brought up to date), anything else
 * is a SQLite file path or `:memory:`. The Postgres driver is only loaded when it is used.
 */
export async function openSql(target: string): Promise<Sql> {
  if (!isPostgresUrl(target)) return sqliteSql(openDb(target));
  const { openPostgres } = await import('./postgres.ts');
  return openPostgres(target);
}
