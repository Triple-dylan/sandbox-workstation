import type { Sql } from './index.ts';
import { EMBEDDING_DIMENSIONS } from './postgres-schema.ts';

/** One stored passage of a page with its search vector (unit length, so dot product = cosine). */
export interface Passage {
  text: string;
  vector: Float32Array;
}

/** A passage that matched a question, with how close it is (higher is closer). */
export interface Match {
  resourceId: string;
  text: string;
  score: number;
}

/**
 * The search vectors of pages' passages. On Postgres they are pgvector values found through an
 * HNSW index; on SQLite they are bytes compared one by one, as before. Both answer the same.
 */
export interface PassageVectors {
  /** When the stored vectors of a page were made (its updatedAt then), if any. */
  stamp(resourceId: string): Promise<string | null>;
  /** Replaces all of a page's passages at once. */
  replace(resourceId: string, stamp: string, passages: Passage[]): Promise<void>;
  /**
   * The passages closest to `query`, best first, from these pages only and only where the stored
   * stamp is the page's current one. Callers pass only pages the asker may read.
   */
  nearest(
    query: Float32Array,
    pages: { id: string; stamp: string }[],
    limit: number,
  ): Promise<Match[]>;
}

const asText = (v: Float32Array) => `[${Array.from(v).join(',')}]`;
const asBytes = (v: Float32Array) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
const fromBytes = (bytes: Uint8Array) =>
  new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * Up to this many pages, Postgres compares every passage of them (exact, and fast through the
 * primary key). Past it, the HNSW index finds candidates across the whole table and they are
 * filtered to the pages asked about.
 */
export const EXACT_UP_TO_PAGES = 500;

/** Whether pgvector can keep scanning its index until enough rows pass a filter (0.8 and later). */
const iterativeScans = new WeakMap<Sql, Promise<boolean>>();
function hasIterativeScans(sql: Sql) {
  let known = iterativeScans.get(sql);
  if (!known) {
    known = sql.get(`select extversion from pg_extension where extname = 'vector'`).then((row) => {
      const [major, minor] = String(row?.extversion ?? '0.0')
        .split('.')
        .map(Number);
      return major > 0 || minor >= 8;
    });
    iterativeScans.set(sql, known);
  }
  return known;
}

async function nearestOnPostgres(
  sql: Sql,
  query: Float32Array,
  pages: { id: string; stamp: string }[],
  limit: number,
): Promise<Match[]> {
  const q = asText(query);
  const ids = pages.map((p) => p.id);
  const stamps = pages.map((p) => p.stamp);
  // `<#>` is the negative inner product, so ascending order is closest first.
  if (pages.length <= EXACT_UP_TO_PAGES) {
    const rows = await sql.all(
      `select resource_id, text, -(embedding <#> cast(? as vector)) as score
       from passage_vectors
       where (resource_id, stamp) in (select * from unnest(cast(? as text[]), cast(? as text[])))
       order by embedding <#> cast(? as vector)
       limit ?`,
      q,
      ids,
      stamps,
      q,
      limit,
    );
    return rows.map(toMatch);
  }
  const current = new Map(pages.map((p) => [p.id, p.stamp]));
  const iterative = await hasIterativeScans(sql);
  const rows = await sql.transaction(async (tx) => {
    // Without this, older pgvector stops after its first 40 candidates even if few pass the filter.
    if (iterative) await tx.exec(`set local hnsw.iterative_scan = relaxed_order`);
    else await tx.exec(`set local hnsw.ef_search = 400`);
    return tx.all(
      `select resource_id, stamp, text, -(embedding <#> cast(? as vector)) as score
       from passage_vectors
       where resource_id = any(cast(? as text[]))
       order by embedding <#> cast(? as vector)
       limit ?`,
      q,
      ids,
      q,
      limit * 4,
    );
  });
  return rows
    .filter((r) => current.get(String(r.resource_id)) === String(r.stamp))
    .map(toMatch)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const toMatch = (r: Record<string, unknown>): Match => ({
  resourceId: String(r.resource_id),
  text: String(r.text),
  score: Number(r.score),
});

export function passageVectors(sql: Sql): PassageVectors {
  const postgres = sql.dialect === 'postgres';
  const check = (v: Float32Array) => {
    if (postgres && v.length !== EMBEDDING_DIMENSIONS)
      throw new Error(`Search vectors have ${EMBEDDING_DIMENSIONS} numbers, not ${v.length}`);
  };
  return {
    async stamp(resourceId) {
      const row = await sql.get(
        'select stamp from passage_vectors where resource_id = ? limit 1',
        resourceId,
      );
      return row ? String(row.stamp) : null;
    },

    async replace(resourceId, stamp, passages) {
      passages.forEach((p) => check(p.vector));
      await sql.transaction(async (tx) => {
        await tx.run('delete from passage_vectors where resource_id = ?', resourceId);
        for (const [i, p] of passages.entries())
          if (postgres)
            await tx.run(
              'insert into passage_vectors (resource_id, idx, stamp, text, embedding) values (?, ?, ?, ?, cast(? as vector))',
              resourceId,
              i,
              stamp,
              p.text,
              asText(p.vector),
            );
          else
            await tx.run(
              'insert into passage_vectors (resource_id, idx, stamp, text, vector) values (?, ?, ?, ?, ?)',
              resourceId,
              i,
              stamp,
              p.text,
              asBytes(p.vector),
            );
      });
    },

    async nearest(query, pages, limit) {
      if (!pages.length || limit <= 0) return [];
      check(query);
      if (postgres) return nearestOnPostgres(sql, query, pages, limit);
      const current = new Map(pages.map((p) => [p.id, p.stamp]));
      const rows = await sql.all(
        `select resource_id, stamp, text, vector from passage_vectors where resource_id in (${pages.map(() => '?').join(',')})`,
        ...pages.map((p) => p.id),
      );
      return rows
        .filter((r) => current.get(String(r.resource_id)) === String(r.stamp))
        .map((r) => ({
          resourceId: String(r.resource_id),
          text: String(r.text),
          score: dot(query, fromBytes(r.vector as Uint8Array)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
