import pg from 'pg';
import type { Row, Sql, Value } from './index.ts';
import { numberPlaceholders } from './index.ts';
import { postgresMigrations, postgresSchema } from './postgres-schema.ts';

/** Counts, sums and bigint columns come back as numbers, as they do from SQLite. */
const types = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === pg.types.builtins.INT8 || oid === pg.types.builtins.NUMERIC) return Number;
    return pg.types.getTypeParser(oid, format);
  },
};

type Client = pg.Pool | pg.PoolClient;

const bind = (args: Value[]) =>
  args.map((a) => (a instanceof Uint8Array && !Buffer.isBuffer(a) ? Buffer.from(a) : a));

const statements = new Map<string, string>();
const numbered = (sql: string) => {
  let text = statements.get(sql);
  if (text === undefined) {
    text = numberPlaceholders(sql);
    if (statements.size < 5000) statements.set(sql, text);
  }
  return text;
};

function handle(client: Client, transaction: Sql['transaction'], close: Sql['close']): Sql {
  const query = (sql: string, args: Value[]) => client.query(numbered(sql), bind(args));
  return {
    dialect: 'postgres',
    get: async (sql, ...args) => (await query(sql, args)).rows[0] as Row | undefined,
    all: async (sql, ...args) => (await query(sql, args)).rows as Row[],
    run: async (sql, ...args) => ({ changes: (await query(sql, args)).rowCount ?? 0 }),
    exec: async (script) => {
      await client.query(script);
    },
    transaction,
    close,
  };
}

/** Postgres behind the async interface, through a connection pool. */
export function postgresSql(pool: pg.Pool): Sql {
  return handle(
    pool,
    async (fn) => {
      const client = await pool.connect();
      const tx: Sql = handle(
        client,
        (inner) => inner(tx),
        async () => {},
      );
      try {
        await client.query('begin');
        const result = await fn(tx);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    () => pool.end(),
  );
}

/** Opens a pool on `url` and brings the schema up to date before returning. */
export async function openPostgres(url: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10, types });
  const sql = postgresSql(pool);
  try {
    await migratePostgres(sql);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return sql;
}

/**
 * Creates what is missing. Every step is safe to repeat, and a lock held for the transaction
 * means two servers starting at once don't both run it.
 */
export async function migratePostgres(sql: Sql) {
  await sql.transaction(async (tx) => {
    await tx.exec(`select pg_advisory_xact_lock(hashtext('sandbox-schema'))`);
    await tx.exec(postgresSchema);
    for (const step of postgresMigrations) await tx.exec(step);
  });
}
