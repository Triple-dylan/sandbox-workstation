import type { Row, Sql, Value } from './index.ts';
import { Queue } from './index.ts';

/** What the SQLite backend needs: node:sqlite's DatabaseSync, or the in-page sql.js stand-in. */
export interface SqliteDatabase {
  prepare(sql: string): {
    get(...args: any[]): unknown;
    all(...args: any[]): unknown[];
    run(...args: any[]): { changes: number | bigint };
  };
  exec(sql: string): void;
  close(): void;
}

const bind = (args: Value[]) => args.map((a) => (typeof a === 'boolean' ? Number(a) : a));

/**
 * SQLite behind the async interface. SQLite answers at once, so a call outside a transaction runs
 * its statement before it returns. While a transaction is open or waiting, other calls queue behind
 * it, in order, so their statements don't land inside it.
 */
export function sqliteSql(db: SqliteDatabase): Sql {
  const queue = new Queue();
  const flat: Sql = {
    dialect: 'sqlite',
    get: async (sql, ...args) => db.prepare(sql).get(...bind(args)) as Row | undefined,
    all: async (sql, ...args) => db.prepare(sql).all(...bind(args)) as Row[],
    run: async (sql, ...args) => ({ changes: Number(db.prepare(sql).run(...bind(args)).changes) }),
    exec: async (script) => db.exec(script),
    // A transaction inside a transaction joins it.
    transaction: (fn) => fn(flat),
    close: async () => db.close(),
  };
  const outside =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> =>
      queue.waiting ? queue.run(() => fn(...a)) : fn(...a);
  return {
    dialect: 'sqlite',
    get: outside(flat.get),
    all: outside(flat.all),
    run: outside(flat.run),
    exec: outside(flat.exec),
    close: outside(flat.close),
    transaction: (fn) =>
      queue.run(async () => {
        db.exec('begin immediate');
        try {
          const result = await fn(flat);
          db.exec('commit');
          return result;
        } catch (error) {
          db.exec('rollback');
          throw error;
        }
      }),
  };
}
