import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const output = new URL('../public/resources/', import.meta.url);
const files = [
  'Rebuild Plan.md',
  'Conversation Context.md',
  'Object and Access Model.md',
  'Research Review.md',
];
await mkdir(output, { recursive: true });
const manifest = [];
for (const file of files) {
  const content = await readFile(new URL(file, root));
  await writeFile(new URL(file, output), content);
  manifest.push({ file, sha256: createHash('sha256').update(content).digest('hex') });
}
await writeFile(
  new URL('manifest.json', output),
  JSON.stringify(
    {
      note: 'Local review snapshots of repository sources, not new shared-resource identities.',
      sources: manifest,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared ${files.length} repository sources for the local proof.`);
