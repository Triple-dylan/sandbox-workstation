/**
 * A small spreadsheet engine: numbers, "text", cell references, + - * / ( ), SUM, AVERAGE, MIN, MAX
 * and COUNT over ranges, and the conditional SUMIF(S), COUNTIF(S) and AVERAGEIF(S), MINIFS and MAXIFS.
 */
export const colName = (index: number) => {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1)
    name = String.fromCharCode(65 + (n % 26)) + name;
  return name;
};
export const colIndex = (name: string) =>
  [...name.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Reads "$1,200.50" or "12%" as a number; anything else is not a number. */
export function toNumber(text: string): number | null {
  const clean = text.trim().replace(/[$€£,\s]/g, '');
  if (!clean) return null;
  const percent = clean.endsWith('%');
  const n = Number(percent ? clean.slice(0, -1) : clean);
  return Number.isFinite(n) ? (percent ? n / 100 : n) : null;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'ref'; v: string }
  | { t: 'name'; v: string }
  | { t: 'str'; v: string }
  | { t: 'op'; v: string };
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /\s*(?:(\d+\.?\d*|\.\d+)|(\$?[A-Za-z]{1,2}\$?\d{1,3})(?![A-Za-z(])|([A-Za-z]+)|"((?:[^"]|"")*)"|([-+*/(),:]))/y;
  let at = 0;
  while (at < source.length) {
    pattern.lastIndex = at;
    const m = pattern.exec(source);
    if (!m) {
      if (!source.slice(at).trim()) break;
      throw new Error('syntax');
    }
    at = pattern.lastIndex;
    if (m[1]) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2]) tokens.push({ t: 'ref', v: m[2].replace(/\$/g, '').toUpperCase() });
    else if (m[3]) tokens.push({ t: 'name', v: m[3].toUpperCase() });
    else if (m[4] !== undefined) tokens.push({ t: 'str', v: m[4].replace(/""/g, '"') });
    else tokens.push({ t: 'op', v: m[5] });
  }
  return tokens;
}

/** The value a cell shows: its text, or the result of its formula. Errors show as "#ERR". */
export function evaluate(
  rows: string[][],
  row: number,
  col: number,
  seen = new Set<string>(),
): string {
  const raw = rows[row]?.[col] ?? '';
  if (!raw.startsWith('=')) return raw;
  const key = `${row}:${col}`;
  if (seen.has(key)) return '#LOOP';
  seen.add(key);
  try {
    const tokens = tokenize(raw.slice(1));
    let at = 0;
    const peek = () => tokens[at];
    const take = (v?: string) => {
      const token = tokens[at++];
      if (!token || (v && token.v !== v)) throw new Error('syntax');
      return token;
    };
    const cell = (ref: string) => {
      const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
      const value = evaluate(rows, Number(m[2]) - 1, colIndex(m[1]), new Set(seen));
      if (value.startsWith('#')) throw new Error(value);
      return toNumber(value);
    };
    /** The cells a reference or range names, in reading order. */
    const refs = (): string[] => {
      const from = take();
      if (from.t !== 'ref') throw new Error('syntax');
      if (peek()?.v !== ':') return [from.v];
      take(':');
      const to = take();
      if (to.t !== 'ref') throw new Error('syntax');
      const a = /^([A-Z]+)(\d+)$/.exec(from.v)!;
      const b = /^([A-Z]+)(\d+)$/.exec(to.v)!;
      const out: string[] = [];
      for (let r = Math.min(+a[2], +b[2]); r <= Math.max(+a[2], +b[2]); r++)
        for (
          let c = Math.min(colIndex(a[1]), colIndex(b[1]));
          c <= Math.max(colIndex(a[1]), colIndex(b[1]));
          c++
        )
          out.push(`${colName(c)}${r}`);
      return out;
    };
    const range = (): (number | null)[] => refs().map(cell);
    /** What a cell shows, as text, for matching against a condition. */
    const shown = (ref: string) => {
      const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
      return evaluate(rows, Number(m[2]) - 1, colIndex(m[1]), new Set(seen));
    };
    /** SUMIF, COUNTIFS and the rest: ranges kept as cells, conditions kept as text. */
    const conditional = (name: string): number => {
      const args: ({ refs: string[] } | { text: string })[] = [];
      while (peek() && peek().v !== ')') {
        const next = peek();
        if (next.t === 'ref') args.push({ refs: refs() });
        else if (next.t === 'str') args.push({ text: String(take().v) });
        else args.push({ text: String(sum()) });
        if (peek()?.v === ',') take(',');
      }
      take(')');
      const asRefs = (a: (typeof args)[number] | undefined) => {
        if (!a || !('refs' in a)) throw new Error('syntax');
        return a.refs;
      };
      const asText = (a: (typeof args)[number] | undefined) => {
        if (!a) throw new Error('syntax');
        return 'text' in a ? a.text : a.refs.length === 1 ? shown(a.refs[0]) : '#ERR';
      };
      const plural = name.endsWith('S');
      let target: string[] | null;
      const pairs: { refs: string[]; test: string }[] = [];
      if (plural) {
        // SUMIFS(sum, range, test, …); COUNTIFS(range, test, …).
        const start = name === 'COUNTIFS' ? 0 : 1;
        target = start ? asRefs(args[0]) : null;
        if ((args.length - start) % 2 || args.length - start < 2) throw new Error('syntax');
        for (let i = start; i < args.length; i += 2)
          pairs.push({ refs: asRefs(args[i]), test: asText(args[i + 1]) });
      } else {
        // SUMIF(range, test, [sum]); COUNTIF(range, test).
        if (args.length < 2 || args.length > 3) throw new Error('syntax');
        pairs.push({ refs: asRefs(args[0]), test: asText(args[1]) });
        target = name === 'COUNTIF' ? null : args[2] ? asRefs(args[2]) : pairs[0].refs;
      }
      const size = pairs[0].refs.length;
      if (pairs.some((p) => p.refs.length !== size) || (target && target.length !== size))
        throw new Error('#SIZE');
      const tests = pairs.map((p) => matcher(p.test));
      const hits: number[] = [];
      for (let i = 0; i < size; i++)
        if (pairs.every((p, k) => tests[k](shown(p.refs[i])))) hits.push(i);
      if (name.startsWith('COUNT')) return hits.length;
      const numbers = hits.map((i) => cell(target![i])).filter((v): v is number => v !== null);
      if (name.startsWith('SUM')) return numbers.reduce((a, b) => a + b, 0);
      if (name === 'MINIFS') return numbers.length ? Math.min(...numbers) : 0;
      if (name === 'MAXIFS') return numbers.length ? Math.max(...numbers) : 0;
      if (!numbers.length) throw new Error('#DIV');
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    };
    const primary = (): number => {
      const token = take();
      if (token.t === 'num') return token.v;
      if (token.t === 'ref') return cell(token.v) ?? 0;
      if (token.t === 'op' && token.v === '(') {
        const value = sum();
        take(')');
        return value;
      }
      if (token.t === 'op' && token.v === '-') return -primary();
      if (token.t === 'name') {
        take('(');
        if (CONDITIONAL.has(token.v)) return conditional(token.v);
        const values: (number | null)[] = [];
        while (peek() && peek().v !== ')') {
          if (peek().t === 'ref') values.push(...range());
          else values.push(sum());
          if (peek()?.v === ',') take(',');
        }
        take(')');
        const numbers = values.filter((v): v is number => v !== null);
        if (token.v === 'SUM') return numbers.reduce((a, b) => a + b, 0);
        if (token.v === 'COUNT') return numbers.length;
        if (!numbers.length) return 0;
        if (token.v === 'AVERAGE' || token.v === 'AVG')
          return numbers.reduce((a, b) => a + b, 0) / numbers.length;
        if (token.v === 'MIN') return Math.min(...numbers);
        if (token.v === 'MAX') return Math.max(...numbers);
        throw new Error('name');
      }
      throw new Error('syntax');
    };
    const product = (): number => {
      let value = primary();
      while (peek()?.v === '*' || peek()?.v === '/') {
        const op = take().v;
        const right = primary();
        value = op === '*' ? value * right : value / right;
      }
      return value;
    };
    function sum(): number {
      let value = product();
      while (peek()?.v === '+' || peek()?.v === '-') {
        const op = take().v;
        const right = product();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    }
    const result = sum();
    if (at < tokens.length) throw new Error('syntax');
    if (!Number.isFinite(result)) return '#DIV';
    return String(Math.round(result * 100) / 100);
  } catch (error) {
    const message = (error as Error).message;
    return message.startsWith('#') ? message : '#ERR';
  }
}

const CONDITIONAL = new Set([
  'SUMIF',
  'SUMIFS',
  'COUNTIF',
  'COUNTIFS',
  'AVERAGEIF',
  'AVERAGEIFS',
  'MINIFS',
  'MAXIFS',
]);

/**
 * A condition as SUMIF reads it: "North" (same text, any case), 100 (same number), or a comparison
 * such as ">100", "<=5" or "<>North". An empty condition matches empty cells.
 */
export function matcher(test: string): (value: string) => boolean {
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(test)!;
  const op = m[1] ?? '=';
  const want = m[2];
  const wantN = toNumber(want);
  return (value) => {
    const n = toNumber(value);
    if (wantN !== null && n !== null) {
      if (op === '=') return n === wantN;
      if (op === '<>') return n !== wantN;
      if (op === '<') return n < wantN;
      if (op === '>') return n > wantN;
      if (op === '<=') return n <= wantN;
      return n >= wantN;
    }
    const same = value.trim().toLowerCase() === want.trim().toLowerCase();
    if (op === '=') return same;
    if (op === '<>') return !same;
    // A size comparison against text, or of text against a number, never matches.
    return false;
  };
}

/**
 * A sheet change an agent proposes, written one cell per line: "B3 = 2800" or "B5 = =SUM(B2:B4)".
 * Null when any line is not a cell and a value, so a malformed change is never half applied.
 */
export function cellEdits(text: string): { row: number; col: number; value: string }[] | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 60) return null;
  const edits = [];
  for (const line of lines) {
    const m = /^([A-Za-z]{1,2})([0-9]{1,3})\s*=\s?(.*)$/.exec(line);
    if (!m) return null;
    const row = Number(m[2]) - 1;
    const col = colIndex(m[1]);
    if (row < 0 || row > 499 || col < 0 || col > 51) return null;
    edits.push({ row, col, value: m[3] });
  }
  return edits;
}

/** A sheet as an agent reads it: column letters, row numbers, and each formula with its result. */
export function sheetText(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const head = ['', ...Array.from({ length: width }, (_, c) => colName(c))].join(' | ');
  const body = rows
    .map((row, r) =>
      [
        String(r + 1),
        ...Array.from({ length: width }, (_, c) => {
          const raw = row[c] ?? '';
          return raw.startsWith('=') ? `${raw} → ${evaluate(rows, r, c)}` : raw;
        }),
      ].join(' | '),
    )
    .filter((line) => line.replace(/[\d| ]/g, '').length > 0);
  return [head, ...body].join('\n');
}
