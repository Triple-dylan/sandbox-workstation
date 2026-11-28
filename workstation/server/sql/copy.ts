import type { SqliteDatabase } from './sqlite.ts';
import type { Sql, Value } from './index.ts';
import { EMBEDDING_DIMENSIONS } from './postgres-schema.ts';

/** Rows per insert statement; Postgres takes at most 65,535 values in one. */
const BATCH = 200;

export interface CopyReport {
  /** Rows copied, by table. */
  copied: Record<string, number>;
  /** Search vectors left behind because they are not 512 numbers long; they are made again. */
  skippedVectors: number;
}

/**
 * Copies every row of a SQLite database into an empty Postgres one (schema already up to date),
 * in one transaction: all of it lands or none does. Rows go in the order SQLite made them, so
 * Postgres's `rowid` keeps the same order. Search vectors become pgvector values.
 */
export async function copySqliteToPostgres(from: SqliteDatabase, to: Sql): Promise<CopyReport> {
  if (to.dialect !== 'postgres') throw new Error('The copy goes into Postgres');
  const tables = (
    from.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as {
      name: string;
    }[]
  ).map((t) => t.name);
  const report: CopyReport = { copied: {}, skippedVectors: 0 };
  await to.transaction(async (tx) => {
    for (const table of tables) {
      const target = new Set(
        (
          await tx.all(
            `select column_name from information_schema.columns where table_schema = current_schema() and table_name = ?`,
            table,
          )
        ).map((r) => String(r.column_name)),
      );
      if (!target.size) throw new Error(`Postgres has no ${table} table; update the schema first`);
      if (await tx.get(`select 1 from ${table} limit 1`))
        throw new Error(
          `Postgres already has rows in ${table}; the copy only goes into an empty database`,
        );
    }
    for (const table of tables) {
      const columns = (
        from.prepare(`select name from pragma_table_info(?)`).all(table) as { name: string }[]
      ).map((c) => c.name);
      const vectors = table === 'passage_vectors';
      const names = vectors ? columns.map((c) => (c === 'vector' ? 'embedding' : c)) : columns;
      const placeholders = names.map((n) => (n === 'embedding' ? 'cast(? as vector)' : '?'));
      const rows = from.prepare(`select * from ${table} order by rowid`).all() as Record<
        string,
        Value
      >[];
      let copied = 0;
      for (let start = 0; start < rows.length; start += BATCH) {
        const values: Value[] = [];
        let count = 0;
        for (const row of rows.slice(start, start + BATCH)) {
          const out = columns.map((c) => row[c] ?? null);
          if (vectors) {
            const i = columns.indexOf('vector');
            const bytes = row.vector as Uint8Array;
            const v = new Float32Array(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            );
            if (v.length !== EMBEDDING_DIMENSIONS) {
              report.skippedVectors++;
              continue;
            }
            out[i] = `[${Array.from(v).join(',')}]`;
          }
          values.push(...out);
          count++;
        }
        if (!count) continue;
        await tx.run(
          `insert into ${table} (${names.join(', ')}) values ${Array.from(
            { length: count },
            () => `(${placeholders.join(', ')})`,
          ).join(', ')}`,
          ...values,
        );
        copied += count;
      }
      report.copied[table] = copied;
    }
  });
  return report;
}
