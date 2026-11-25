/**
 * Turning things from elsewhere into pages. Each kind of file becomes the page it most naturally is:
 * a transcript or text file a document, a table a sheet, a slide file a deck, a picture an asset.
 * These functions only read text; nothing here talks to the server.
 */
export type Parsed =
  | { kind: 'doc'; title: string; body: string; type: string }
  | { kind: 'sheet'; title: string; body: string; type: string }
  | { kind: 'deck'; title: string; body: string; type: string };

export const baseName = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Untitled';
const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/** Comma or tab separated text, with quoted cells. */
export function parseTable(text: string, delimiter = ',') {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') ((cell += '"'), i++);
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delimiter) (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const width = Math.min(26, Math.max(1, ...rows.map((r) => r.length)));
  return rows
    .slice(0, 500)
    .map((r) => Array.from({ length: width }, (_, c) => (r[c] ?? '').trim()));
}

/**
 * A captions or meeting transcript (.vtt, .srt, or "Name: words" lines) as readable text: timings
 * and cue numbers removed, each speaker's consecutive lines joined.
 */
export function parseTranscript(text: string) {
  const turns: { who: string; said: string }[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    let line = raw.trim();
    if (
      !line ||
      line === 'WEBVTT' ||
      /^\d+$/.test(line) ||
      /-->/.test(line) ||
      /^(NOTE|STYLE|Kind:|Language:)/.test(line)
    )
      continue;
    let who = '';
    const voice = /^<v\s+([^>]+)>(.*)$/.exec(line);
    if (voice) ((who = voice[1].trim()), (line = voice[2]));
    line = line.replace(/<[^>]+>/g, '').trim();
    const named = /^([A-Z][\w .'-]{0,40}?):\s+(.+)$/.exec(line);
    if (!who && named) ((who = named[1].trim()), (line = named[2]));
    if (!line) continue;
    const last = turns.at(-1);
    if (last && (last.who === who || !who)) last.said += ` ${line}`;
    else turns.push({ who, said: line });
  }
  return turns.map((t) => (t.who ? `**${t.who}:** ${t.said}` : t.said)).join('\n\n');
}

const plain = (html: string) => strip(html).trim();
const strip = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n');

/** Text files of every kind we read directly. Returns nothing for a kind we do not understand. */
export function parseText(name: string, text: string): Parsed | null {
  const kind = ext(name);
  const title = baseName(name);
  if (kind === 'csv' || kind === 'tsv')
    return {
      kind: 'sheet',
      title,
      type: 'table',
      body: JSON.stringify({ rows: parseTable(text, kind === 'tsv' ? '\t' : ',') }),
    };
  if (kind === 'vtt' || kind === 'srt')
    return {
      kind: 'doc',
      title,
      type: 'transcript',
      body: `# ${title}\n\n${parseTranscript(text)}`,
    };
  if (kind === 'md' || kind === 'markdown')
    return { kind: 'doc', title, type: 'document', body: text };
  if (kind === 'html' || kind === 'htm')
    return { kind: 'doc', title, type: 'web page', body: `# ${title}\n\n${plain(text)}` };
  if (kind === 'json')
    return {
      kind: 'doc',
      title,
      type: 'data',
      body: `# ${title}\n\n\`\`\`json\n${text.slice(0, 150_000)}\n\`\`\``,
    };
  if (kind === 'txt' || kind === 'text' || kind === 'log' || kind === '') {
    // A text file that reads like a conversation is kept as a transcript.
    const lines = text.split('\n').filter((l) => l.trim());
    const spoken = lines.filter((l) => /^([A-Z][\w .'-]{0,40}?):\s+\S/.test(l.trim())).length;
    const transcript = lines.length >= 4 && spoken / lines.length > 0.5;
    return {
      kind: 'doc',
      title,
      type: transcript ? 'transcript' : 'document',
      body: `# ${title}\n\n${transcript ? parseTranscript(text) : text.trim()}`,
    };
  }
  return null;
}

const runs = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) =>
    strip(m[1]),
  );

/** A Word document's main part as Markdown: headings, bullets and paragraphs. */
export function parseDocx(name: string, documentXml: string): Parsed {
  const title = baseName(name);
  const paragraphs = [...documentXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => {
    const text = runs(m[0], 'w:t').join('');
    const heading = /<w:pStyle w:val="(?:Heading|Title)(\d)?"/.exec(m[0]);
    if (!text.trim()) return '';
    if (heading) return `${'#'.repeat(Math.min(3, Number(heading[1] ?? 1)))} ${text}`;
    if (/<w:numPr>/.test(m[0])) return `- ${text}`;
    return text;
  });
  return {
    kind: 'doc',
    title,
    type: 'document',
    body: paragraphs.filter(Boolean).join('\n\n') || `# ${title}`,
  };
}

/** A PowerPoint file's slides, in order, as a deck: first text box the title, the rest the body. */
export function parsePptx(name: string, slideXml: string[]): Parsed {
  const slides = slideXml.map((xml) => {
    const boxes = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
      .map((m) =>
        [...m[0].matchAll(/<a:p>[\s\S]*?<\/a:p>/g)]
          .map((p) => runs(p[0], 'a:t').join(''))
          .filter((t) => t.trim()),
      )
      .filter((lines) => lines.length);
    const [first, ...rest] = boxes;
    return {
      title: (first ?? []).join(' ').slice(0, 160),
      body: rest
        .flatMap((lines) => (lines.length > 1 ? lines.map((l) => `- ${l}`) : lines))
        .join('\n'),
    };
  });
  return {
    kind: 'deck',
    title: baseName(name),
    type: 'slides',
    body: JSON.stringify({
      slides: slides.length ? slides : [{ title: baseName(name), body: '' }],
    }),
  };
}
