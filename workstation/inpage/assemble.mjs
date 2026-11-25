// Folds the built script and styles into one file that needs no server.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../dist-inpage/', import.meta.url);
const assets = readdirSync(new URL('assets/', dir));
const text = (ext) =>
  readFileSync(new URL(`assets/${assets.find((f) => f.endsWith(ext))}`, dir), 'utf8');
const js = text('.js')
  .replace(/<\/script/g, '<\\/script')
  // Publishing rejects a literal replacement character; the escape means the same inside strings.
  .replace(/\uFFFD/g, '\\uFFFD');
const out = `<title>Sandbox Workstation</title>
<style>html,body{height:100%}${text('.css')}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const target = process.argv[2] ?? new URL('workstation.html', dir).pathname;
writeFileSync(target, out);
console.log(`${target} ${(out.length / 1e6).toFixed(2)} MB`);
