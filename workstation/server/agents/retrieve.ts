/**
 * Retrieval for agents. Pages are split into passages and ranked against the request with BM25,
 * so an agent reads the parts that matter instead of the first lines of everything. The split of a
 * page is kept until that page changes.
 */
export type Passage = { title: string; kind: string; text: string };
type Indexed = {
  stamp: string;
  passages: { text: string; terms: Map<string, number>; length: number }[];
};

const STOP = new Set(
  'a an and are as at be but by for from has have how i if in into is it its of on or our so that the their them then there these they this to was we were what when where which who why will with you your'.split(
    ' ',
  ),
);
export function terms(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9$%.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .map((w) => (w.length >= 5 ? w.replace(/(ing|ed|es|s)$/, '') : w))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Splits text at headings and blank lines, then packs the pieces into passages of a useful size. */
export function passagesOf(text: string, size = 560) {
  const blocks = text
    .split(/\n(?=#{1,6}\s)|\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const block of blocks) {
    const heading = /^#{1,6}\s/.test(block);
    if (current && (heading || current.length + block.length > size)) {
      out.push(current);
      current = '';
    }
    current = current ? `${current}\n${block}` : block;
    while (current.length > size * 1.6) {
      out.push(current.slice(0, size));
      current = current.slice(size);
    }
  }
  if (current) out.push(current);
  return out;
}

export class Retriever {
  private index = new Map<string, Indexed>();
  /** How many page splits were reused rather than rebuilt; reported for tests and tuning. */
  hits = 0;
  private entry(id: string, stamp: string, text: string) {
    const known = this.index.get(id);
    if (known?.stamp === stamp) {
      this.hits++;
      return known;
    }
    const made: Indexed = {
      stamp,
      passages: passagesOf(text).map((passage) => {
        const counts = new Map<string, number>();
        const words = terms(passage);
        for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
        return { text: passage, terms: counts, length: words.length || 1 };
      }),
    };
    this.index.set(id, made);
    if (this.index.size > 4000) this.index.delete(this.index.keys().next().value!);
    return made;
  }
  /** The passages most relevant to a request, best first, at most two from any one page. */
  search(
    query: string,
    pages: { id: string; stamp: string; title: string; kind: string; text: string }[],
    limit = 8,
  ): Passage[] {
    const wanted = [...new Set(terms(query))];
    if (!wanted.length) return [];
    const all = pages.flatMap((page) =>
      this.entry(page.id, page.stamp, `${page.title}\n${page.text}`).passages.map((p) => ({
        page,
        p,
      })),
    );
    if (!all.length) return [];
    const average = all.reduce((n, x) => n + x.p.length, 0) / all.length;
    const seenIn = new Map<string, number>();
    for (const w of wanted) seenIn.set(w, all.filter((x) => x.p.terms.has(w)).length);
    const scored = all
      .map((x) => {
        let score = 0;
        for (const w of wanted) {
          const f = x.p.terms.get(w) ?? 0;
          if (!f) continue;
          const n = seenIn.get(w)!;
          const idf = Math.log(1 + (all.length - n + 0.5) / (n + 0.5));
          score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * x.p.length) / average));
        }
        // A page whose title is asked for by name is very likely the one meant.
        const title = terms(x.page.title);
        if (title.length && title.every((w) => wanted.includes(w))) score *= 1.6;
        return { ...x, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const perPage = new Map<string, number>();
    const out: Passage[] = [];
    for (const x of scored) {
      const used = perPage.get(x.page.id) ?? 0;
      if (used >= 2) continue;
      perPage.set(x.page.id, used + 1);
      out.push({ title: x.page.title, kind: x.page.kind, text: x.p.text.slice(0, 900) });
      if (out.length >= limit) break;
    }
    return out;
  }
}

/** Remembers recent answers to an identical task, so asking the same thing of unchanged pages costs nothing. */
export class AnswerCache<T> {
  private items = new Map<string, { at: number; value: T }>();
  hits = 0;
  private ttl: number;
  constructor(ttlMs = 10 * 60_000) {
    this.ttl = ttlMs;
  }
  static key(parts: unknown) {
    const text = JSON.stringify(parts);
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = (Math.imul(b, 33) + text.charCodeAt(i)) | 0;
    }
    return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length}`;
  }
  get(key: string) {
    const item = this.items.get(key);
    if (!item || Date.now() - item.at > this.ttl) return undefined;
    this.hits++;
    return item.value;
  }
  set(key: string, value: T) {
    this.items.set(key, { at: Date.now(), value });
    if (this.items.size > 300) this.items.delete(this.items.keys().next().value!);
  }
}
