import { unzipSync, strFromU8 } from 'fflate';
import { api } from '../../data/client.ts';
import { readImage } from '../canvas/image.ts';
import { baseName, parseDocx, parsePptx, parseText, type Parsed } from './parse.ts';

type Made = { id: string; title: string };
export type Brought = { made: Made[]; skipped: string[] };

async function read(
  file: File,
): Promise<
  (Parsed & { asset?: false }) | { kind: 'asset'; title: string; body: string; type: string } | null
> {
  const name = file.name;
  if (file.type.startsWith('image/')) {
    const image = await readImage(file, 1400);
    return { kind: 'asset', title: baseName(name), body: image.dataUrl, type: 'picture' };
  }
  if (/\.(docx|pptx)$/i.test(name)) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => f.name === 'word/document.xml' || /^ppt\/slides\/slide\d+\.xml$/.test(f.name),
    });
    if (/\.docx$/i.test(name) && files['word/document.xml'])
      return parseDocx(name, strFromU8(files['word/document.xml']));
    const slides = Object.keys(files)
      .filter((f) => f.startsWith('ppt/slides/'))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))
      .map((f) => strFromU8(files[f]));
    return slides.length ? parsePptx(name, slides) : null;
  }
  if (file.size > 4_000_000) return null;
  return parseText(name, await file.text());
}

/**
 * Brings files into a space as pages. Each keeps a note of the file it came from. Anything we
 * cannot read is named back to the person rather than silently dropped.
 */
export async function bringIn(
  files: File[],
  where: { spaceId: string; parentId?: string | null; visibility?: 'space' | 'private' },
): Promise<Brought> {
  const made: Made[] = [];
  const skipped: string[] = [];
  for (const file of files.slice(0, 20)) {
    try {
      const parsed = await read(file);
      if (!parsed) {
        skipped.push(file.name);
        continue;
      }
      made.push(
        await api<Made>('/resources', {
          body: {
            spaceId: where.spaceId,
            parentId: where.parentId ?? null,
            visibility: where.visibility ?? 'space',
            kind: parsed.kind,
            title: parsed.title,
            body: parsed.body,
            source: { name: file.name, type: parsed.type },
          },
        }),
      );
    } catch {
      skipped.push(file.name);
    }
  }
  return { made, skipped };
}
