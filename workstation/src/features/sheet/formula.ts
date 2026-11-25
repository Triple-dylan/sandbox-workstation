/** A small spreadsheet engine: numbers, cell references, + - * / ( ), and SUM, AVERAGE, MIN, MAX, COUNT over ranges. */
export const colName = (index: number) => {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1)
    name = String.fromCharCode(65 + (n % 26)) + name;
  return name;
};
const colIndex = (name: string) =>
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
  | { t: 'op'; v: string };
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z]{1,2}\d{1,3})|([A-Za-z]+)|([-+*/(),:]))/y;
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
    else if (m[2]) tokens.push({ t: 'ref', v: m[2].toUpperCase() });
    else if (m[3]) tokens.push({ t: 'name', v: m[3].toUpperCase() });
    else tokens.push({ t: 'op', v: m[4] });
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
    const range = (): (number | null)[] => {
      const from = take();
      if (from.t !== 'ref') throw new Error('syntax');
      if (peek()?.v !== ':') return [cell(from.v)];
      take(':');
      const to = take();
      if (to.t !== 'ref') throw new Error('syntax');
      const a = /^([A-Z]+)(\d+)$/.exec(from.v)!;
      const b = /^([A-Z]+)(\d+)$/.exec(to.v)!;
      const values: (number | null)[] = [];
      for (let r = Math.min(+a[2], +b[2]); r <= Math.max(+a[2], +b[2]); r++)
        for (
          let c = Math.min(colIndex(a[1]), colIndex(b[1]));
          c <= Math.max(colIndex(a[1]), colIndex(b[1]));
          c++
        )
          values.push(cell(`${colName(c)}${r}`));
      return values;
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
