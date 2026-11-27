import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { colIndex, colName, evaluate, toNumber } from './formula.ts';
import type { SheetBody, SheetFormat } from './types.ts';

export const MAX_ROWS = 500;
export const MAX_COLS = 52;

/** A sheet body read safely: rows always present, other settings only when valid. */
export function readSheet(body: string | null | undefined): SheetBody {
  try {
    const parsed = JSON.parse(body ?? '') as Partial<SheetBody>;
    return {
      ...parsed,
      rows: Array.isArray(parsed.rows) ? parsed.rows.map((r) => r.map((c) => String(c ?? ''))) : [],
    };
  } catch {
    return { rows: [] };
  }
}

/**
 * A formula moved by some rows and columns, as Excel does when you paste or fill: every reference
 * moves with it unless it is fixed with $.
 */
export function shiftFormula(text: string, rows: number, cols: number): string {
  if (!text.startsWith('=') || (!rows && !cols)) return text;
  // Text in quotes ("North", ">100") is left alone; only the references between them move.
  return text
    .split(/("(?:[^"]|"")*")/)
    .map((part) =>
      part.startsWith('"')
        ? part
        : part.replace(
            /(?<![A-Za-z$])(\$?)([A-Za-z]{1,2})(\$?)(\d{1,3})(?![\w(])/g,
            (_whole, fc, c, fr, r) => {
              const col = fc ? colIndex(c) : colIndex(c) + cols;
              const row = fr ? Number(r) : Number(r) + rows;
              if (col < 0 || row < 1) return '#REF';
              return `${fc}${colName(col)}${fr}${row}`;
            },
          ),
    )
    .join('');
}

/** A number shown the way its column asks. Text, and errors, are shown as they are. */
export function formatValue(shown: string, format: SheetFormat | undefined): string {
  if (!format || format === 'plain') return shown;
  const n = toNumber(shown);
  if (n === null) return shown;
  if (format === 'percent')
    return `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  const fixed = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (format === 'currency') return n < 0 ? `-$${fixed.slice(1)}` : `$${fixed}`;
  return fixed;
}

/** Tab-separated text, as Excel and Google Sheets put on the clipboard. Quotes where needed. */
export function toTsv(cells: string[][]): string {
  return cells
    .map((row) => row.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t'))
    .join('\n');
}

/** Reads tab-separated text from the clipboard, keeping empty cells and quoted line breaks. */
export function fromTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') ((cell += '"'), i++);
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === '\t') (row.push(cell), (cell = ''));
    else if (ch === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''));
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A table that pastes cleanly into email, Slack, Docs or Excel. */
export function toHtmlTable(cells: string[][], header = true): string {
  const td = (tag: string, c: string) =>
    `<${tag} style="border:1px solid #ccc;padding:4px 8px;${toNumber(c) !== null ? 'text-align:right;' : ''}">${escapeHtml(c)}</${tag}>`;
  return `<table style="border-collapse:collapse">${cells
    .map((row, r) => `<tr>${row.map((c) => td(header && r === 0 ? 'th' : 'td', c)).join('')}</tr>`)
    .join('')}</table>`;
}

/** What each cell shows, formulas worked out and columns formatted. */
export function shownRows(sheet: SheetBody): string[][] {
  return sheet.rows.map((row, r) =>
    row.map((_, c) => formatValue(evaluate(sheet.rows, r, c), sheet.formats?.[c])),
  );
}

/** Rows sorted by one column, numbers by value, text alphabetically, blanks last. */
export function sortRows(rows: string[][], col: number, descending: boolean, keep = 0): string[][] {
  const head = rows.slice(0, keep);
  const rest = rows.slice(keep).map((row, i) => ({ row, i, shown: evaluate(rows, keep + i, col) }));
  rest.sort((a, b) => {
    const x = a.shown;
    const y = b.shown;
    if (!x.trim() || !y.trim()) return !x.trim() === !y.trim() ? a.i - b.i : !x.trim() ? 1 : -1;
    const nx = toNumber(x);
    const ny = toNumber(y);
    const order =
      nx !== null && ny !== null
        ? nx - ny
        : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
    return (descending ? -order : order) || a.i - b.i;
  });
  // Formulas that point within their own row keep pointing at their own row.
  return [...head, ...rest.map(({ row, i }, at) => row.map((c) => shiftFormula(c, at - i, 0)))];
}

/* ---------- Excel files ---------- */

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const textOf = (xml: string) =>
  unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

/**
 * Every tab of an .xlsx workbook as a sheet. Formulas this app can work out are kept; any other
 * formula keeps the value Excel last worked out for it.
 */
export function readXlsx(data: Uint8Array): { tab: string; sheet: SheetBody }[] {
  const files = unzipSync(data, {
    filter: (f) =>
      f.name === 'xl/workbook.xml' ||
      f.name === 'xl/_rels/workbook.xml.rels' ||
      f.name === 'xl/sharedStrings.xml' ||
      f.name === 'xl/styles.xml' ||
      /^xl\/worksheets\/[^/]+\.xml$/.test(f.name),
  });
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf(m[1]),
  );
  const rels = new Map(
    [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      attr(m[0], 'Id'),
      attr(m[0], 'Target'),
    ]),
  );
  // Which cell styles show a percent, so 0.12 comes in as 12%.
  const numFmts = [...read('xl/styles.xml').matchAll(/<numFmt\b[^>]*>/g)].map((m) => ({
    id: Number(attr(m[0], 'numFmtId')),
    code: attr(m[0], 'formatCode') ?? '',
  }));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(read('xl/styles.xml'))?.[1] ?? '';
  const percentStyles = new Set<number>();
  const currencyStyles = new Set<number>();
  [...xfs.matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = numFmts.find((f) => f.id === id)?.code ?? '';
    if (id === 9 || id === 10 || code.includes('%')) percentStyles.add(i);
    else if ((id >= 5 && id <= 8) || /[$€£]/.test(code)) currencyStyles.add(i);
  });
  const tabs = [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unescapeXml(attr(m[0], 'name') ?? 'Sheet'),
    target: rels.get(attr(m[0], 'r:id')) ?? '',
  }));
  return tabs.map(({ name, target }) => {
    const xml = read(`xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`);
    const rows: string[][] = [];
    const cached: string[][] = [];
    const kinds: Record<number, { percent: number; currency: number; all: number }> = {};
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[0], 'r');
      const m = ref && /^([A-Z]+)(\d+)$/.exec(ref);
      if (!m) continue;
      const row = Number(m[2]) - 1;
      const col = colIndex(m[1]);
      if (row >= MAX_ROWS || col >= MAX_COLS) continue;
      const inner = c[2] ?? '';
      const type = attr(c[0], 't');
      const style = Number(attr(c[0], 's') ?? -1);
      const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value =
        type === 's'
          ? (shared[Number(v)] ?? '')
          : type === 'inlineStr'
            ? textOf(inner)
            : type === 'b'
              ? v === '1'
                ? 'TRUE'
                : 'FALSE'
              : unescapeXml(v ?? '');
      if (
        type !== 's' &&
        type !== 'inlineStr' &&
        type !== 'str' &&
        value &&
        toNumber(value) !== null
      ) {
        const k = (kinds[col] ??= { percent: 0, currency: 0, all: 0 });
        k.all++;
        if (percentStyles.has(style)) k.percent++;
        if (currencyStyles.has(style)) k.currency++;
      }
      while (rows.length <= row) rows.push([]);
      while (cached.length <= row) cached.push([]);
      rows[row][col] = formula ? `=${unescapeXml(formula)}` : value;
      cached[row][col] = value;
    }
    const grid = settleFormulas(rows, cached);
    const formats: Record<string, SheetFormat> = {};
    for (const [col, k] of Object.entries(kinds)) {
      if (k.percent * 2 > k.all) formats[col] = 'percent';
      else if (k.currency * 2 > k.all) formats[col] = 'currency';
    }
    return {
      tab: name,
      sheet: { rows: grid, ...(Object.keys(formats).length ? { formats } : {}), freeze: 1 },
    };
  });
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A sheet as an .xlsx file Excel and Google Sheets open: values, formulas, formats and widths. */
export function writeXlsx(title: string, sheet: SheetBody): Uint8Array {
  const tab = escapeXml(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  const styleOf = (col: number) =>
    ({ plain: 0, number: 1, currency: 2, percent: 3 })[sheet.formats?.[col] ?? 'plain'];
  const cols = Object.entries(sheet.widths ?? {})
    .map(
      ([c, w]) =>
        `<col min="${Number(c) + 1}" max="${Number(c) + 1}" width="${Math.round((w / 7) * 10) / 10}" customWidth="1"/>`,
    )
    .join('');
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => {
          if (!raw) return '';
          const ref = `${colName(c)}${r + 1}`;
          const s = styleOf(c) ? ` s="${styleOf(c)}"` : '';
          if (raw.startsWith('=')) {
            const value = evaluate(sheet.rows, r, c);
            const n = toNumber(value);
            return n !== null
              ? `<c r="${ref}"${s}><f>${escapeXml(raw.slice(1))}</f><v>${n}</v></c>`
              : `<c r="${ref}"${s} t="str"><f>${escapeXml(raw.slice(1))}</f><v>${escapeXml(value)}</v></c>`;
          }
          const n = toNumber(raw);
          if (n !== null) return `<c r="${ref}"${s}><v>${n}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(raw)}</t></is></c>`;
        })
        .join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipSync({
    '[Content_Types].xml': strToU8(
      xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
    ),
    '_rels/.rels': strToU8(
      xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    ),
    'xl/workbook.xml': strToU8(
      xml(
        `<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="${tab}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
      ),
    ),
    'xl/styles.xml': strToU8(
      xml(
        `<styleSheet xmlns="${main}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
      ),
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      xml(
        `<worksheet xmlns="${main}" xmlns:r="${rel}">${freeze}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData></worksheet>`,
      ),
    ),
  });
}

/**
 * A sheet from elsewhere, as formulas and the values they last showed. A formula is kept where
 * this app works it out the same; otherwise the cell keeps its value, so nothing shows wrong.
 */
export function settleFormulas(formulas: string[][], values: string[][]): string[][] {
  const width = Math.max(1, ...formulas.map((r) => r.length));
  const grid = formulas.map((r) => Array.from({ length: width }, (_, c) => String(r[c] ?? '')));
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < width; c++) {
      if (!grid[r][c].startsWith('=')) continue;
      const cached = String(values[r]?.[c] ?? '');
      const worked = evaluate(grid, r, c);
      const x = toNumber(worked);
      const y = toNumber(cached);
      const same =
        !worked.startsWith('#') &&
        (x === null || y === null ? worked === cached : Math.abs(x - y) < 0.01);
      if (!same) grid[r][c] = cached;
    }
  return grid;
}

/** A sheet as CSV, showing what each cell shows. */
export function toCsv(sheet: SheetBody): string {
  return shownRows(sheet)
    .map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}
