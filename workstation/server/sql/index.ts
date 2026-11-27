/**
 * One async way to run SQL, with a SQLite backend (node:sqlite, or the sql.js shim in the in-page
 * preview) and a Postgres backend (pg). Queries use `?` placeholders on both; the Postgres backend
 * rewrites them to `$1…`. Write SQL both understand: `on conflict … do nothing` rather than
 * `insert or ignore`, `lower(name)` rather than `collate nocase`, explicit column lists on inserts.
 *
 * This module stays free of `pg` so the in-page bundle can import it; `open.ts` picks a backend.
 */

export type Row = Record<string, any>;
/** A value to bind. Lists of text are Postgres arrays (`cast(? as text[])`); SQLite has none. */
export type Value = string | number | bigint | boolean | null | Uint8Array | readonly string[];

export interface Sql {
  readonly dialect: 'sqlite' | 'postgres';
  get(sql: string, ...args: Value[]): Promise<Row | undefined>;
  all(sql: string, ...args: Value[]): Promise<Row[]>;
  /** Runs a statement and says how many rows it changed. */
  run(sql: string, ...args: Value[]): Promise<{ changes: number }>;
  /** Runs one or more statements with no arguments (schema, pragmas). */
  exec(script: string): Promise<void>;
  /**
   * Runs `fn` in one transaction: committed if it resolves, rolled back if it throws. Inside, use
   * only the `tx` handle it is given; calls on the outer handle wait until the transaction ends.
   */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Rewrites `?` placeholders to Postgres's `$1, $2…`, leaving question marks inside quoted strings,
 * quoted names and comments alone.
 */
export function numberPlaceholders(sql: string) {
  let out = '';
  let n = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    let end = i + 1;
    if (c === "'" || c === '"') end = closing(sql, i, c);
    else if (c === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i);
      end = newline === -1 ? sql.length : newline;
    } else if (c === '/' && sql[i + 1] === '*') {
      const stop = sql.indexOf('*/', i + 2);
      end = stop === -1 ? sql.length : stop + 2;
    }
    out += c === '?' ? `$${++n}` : sql.slice(i, end);
    i = end;
  }
  return out;
}

/** Index just past the quote that closes the one at `start` (a doubled quote is an escape). */
function closing(sql: string, start: number, quote: string) {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] !== quote) i++;
    else if (sql[i + 1] === quote) i += 2;
    else return i + 1;
  }
  return sql.length;
}

/** Runs async work one piece at a time, in the order it was asked for. */
export class Queue {
  private tail: Promise<unknown> = Promise.resolve();
  /** Pieces asked for and not yet finished. */
  waiting = 0;
  run<T>(work: () => Promise<T>): Promise<T> {
    this.waiting++;
    const result = this.tail.then(work).finally(() => this.waiting--);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
