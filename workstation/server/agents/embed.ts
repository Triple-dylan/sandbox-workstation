import type { Store } from '../store.ts';
import { passagesOf, type Passage } from './retrieve.ts';

/** Search only: turns text into vectors. Answers are always written by the agent model. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
const DIMENSIONS = 512;

export interface Embedder {
  id: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export function createOpenAIEmbedder(options: {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}): Embedder {
  const request = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  return {
    id: EMBEDDING_MODEL,
    async embed(texts) {
      if (!texts.length) return [];
      const response = await request(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: DIMENSIONS }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Embedding request failed (${response.status})`);
      const data = (await response.json()) as { data: { index: number; embedding: number[] }[] };
      const out: Float32Array[] = [];
      for (const item of data.data) out[item.index] = unit(Float32Array.from(item.embedding));
      return out;
    },
  };
}

function unit(v: Float32Array) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
function dot(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

type Page = { id: string; stamp: string; title: string; kind: string; text: string };

/**
 * Passages of each page as vectors, kept in the database until the page changes, so asking a
 * question costs one small embedding call for the question itself.
 */
export class VectorIndex {
  private store: Store;
  private embedder: Embedder;
  private refreshing = new Map<string, Promise<void>>();
  constructor(store: Store, embedder: Embedder) {
    this.store = store;
    this.embedder = embedder;
  }

  /** Brings the stored vectors of these pages up to date. Unchanged pages cost nothing. */
  async refresh(pages: Page[]) {
    const stale = pages.filter((p) => this.store.vectorStamp(p.id) !== p.stamp);
    for (const page of stale) {
      const running = this.refreshing.get(page.id);
      if (running) {
        await running;
        continue;
      }
      const work = (async () => {
        const passages = passagesOf(`${page.title}\n${page.text}`).slice(0, 64);
        const vectors = await this.embedder.embed(passages);
        this.store.replaceVectors(
          page.id,
          page.stamp,
          passages.map((text, i) => ({ text, vector: vectors[i] })),
        );
      })().finally(() => this.refreshing.delete(page.id));
      this.refreshing.set(page.id, work);
      await work;
    }
  }

  /**
   * Keyword and meaning results merged by rank (reciprocal rank fusion), best first, at most two
   * passages from any one page. Pages not embedded yet still count through their keyword match.
   */
  async search(query: string, pages: Page[], keyword: Passage[], limit = 8): Promise<Passage[]> {
    if (!query.trim() || !pages.length) return keyword;
    const [q] = await this.embedder.embed([query.slice(0, 2000)]);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const stored = this.store
      .vectorsFor(pages.map((p) => p.id))
      .filter((row) => byId.get(row.resourceId)?.stamp === row.stamp);
    const meaning = stored
      .map((row) => ({ row, score: dot(q, row.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 2);
    const fused = new Map<string, { passage: Passage; pageId: string; score: number }>();
    const add = (pageId: string, passage: Passage, rank: number) => {
      const key = `${passage.title}\u0000${passage.text.slice(0, 120)}`;
      const known = fused.get(key);
      const score = 1 / (60 + rank);
      if (known) known.score += score;
      else fused.set(key, { passage, pageId, score });
    };
    keyword.forEach((p, rank) => {
      const page = pages.find((x) => x.title === p.title);
      add(page?.id ?? p.title, p, rank);
    });
    meaning.forEach(({ row }, rank) => {
      const page = byId.get(row.resourceId)!;
      add(page.id, { title: page.title, kind: page.kind, text: row.text.slice(0, 900) }, rank);
    });
    const perPage = new Map<string, number>();
    const out: Passage[] = [];
    for (const x of [...fused.values()].sort((a, b) => b.score - a.score)) {
      const used = perPage.get(x.pageId) ?? 0;
      if (used >= 2) continue;
      perPage.set(x.pageId, used + 1);
      out.push(x.passage);
      if (out.length >= limit) break;
    }
    return out;
  }
}
