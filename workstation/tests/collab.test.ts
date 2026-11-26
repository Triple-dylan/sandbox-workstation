import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as Y from 'yjs';
import { createApp } from '../server/app.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';

/** An open editor as the server sees it: a stream it writes to. */
function editor() {
  const seen: any[] = [];
  const res = Object.assign(new EventEmitter(), {
    write: (line: string) => seen.push(JSON.parse(line.slice(6))),
    end: () => {},
  });
  return { res, seen };
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
// The editor keeps its content in the "default" fragment, as ProseMirror nodes holding text.
const line = (doc: Y.Doc) => doc.getXmlFragment('default').get(0) as Y.XmlText;
const words = (doc: Y.Doc) => line(doc).toString();

test('live documents: two people typing at once both keep their words, and it survives a restart', async () => {
  const app = createApp({ dbPath: ':memory:', staticDir: null, runtime: scriptedRuntime });
  const { store, collab } = app;
  const dylan = store.createHuman('Dylan');
  const project = store.createProject(dylan.id, 'Launch');
  const page = store.createResource(dylan.id, { spaceId: project.id, kind: 'doc', body: '# Plan' });

  // Only the first editor to open an empty document fills it from the saved text.
  const a = editor();
  const b = editor();
  collab.watch(page.id, 'client-a', a.res as any);
  collab.watch(page.id, 'client-b', b.res as any);
  assert.equal(a.seen[0].seed, true);
  assert.equal(a.seen[0].body, '# Plan', 'the filler gets the text as the server has it');
  assert.equal(b.seen[0].seed, false);

  // Both type into the same line at the same moment, each from the same starting point.
  const start = new Y.Doc();
  start.getXmlFragment('default').insert(0, [new Y.XmlText('Budget: ')]);
  const epoch = a.seen[0].epoch;
  collab.update(page.id, 'client-a', b64(Y.encodeStateAsUpdate(start)), epoch);
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(start));
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(start));
  const before = Y.encodeStateVector(docA);
  line(docA).insert(8, 'travel 2,800');
  line(docB).insert(8, 'venue 3,000; ');
  collab.update(page.id, 'client-a', b64(Y.encodeStateAsUpdate(docA, before)), epoch);
  collab.update(page.id, 'client-b', b64(Y.encodeStateAsUpdate(docB, before)), epoch);

  // Each hears the other's change, never their own, and both end up with both edits.
  assert.ok(b.seen.some((m) => m.t === 'update' && m.client === 'client-a'));
  assert.ok(!a.seen.some((m) => m.t === 'update' && m.client === 'client-a'));
  for (const m of b.seen.filter((m) => m.t === 'update'))
    Y.applyUpdate(docB, new Uint8Array(Buffer.from(m.update, 'base64')));
  for (const m of a.seen.filter((m) => m.t === 'update'))
    Y.applyUpdate(docA, new Uint8Array(Buffer.from(m.update, 'base64')));
  assert.equal(words(docA), words(docB));
  assert.match(words(docA), /travel 2,800/);
  assert.match(words(docA), /venue 3,000/);

  // Everyone leaves; the history is kept, and the next editor gets it instead of starting over.
  a.res.emit('close');
  b.res.emit('close');
  const c = editor();
  collab.watch(page.id, 'client-c', c.res as any);
  assert.equal(c.seen[0].seed, false);
  const docC = new Y.Doc();
  Y.applyUpdate(docC, new Uint8Array(Buffer.from(c.seen[0].state, 'base64')));
  assert.equal(words(docC), words(docA));

  // The editors' own save is not an outside change...
  assert.equal(app.collab.acceptsSave(page.id, c.seen[0].epoch, '# Plan\n\nBudget'), true);
  store.updateResource(dylan.id, page.id, { body: '# Plan\n\nBudget' });
  assert.ok(!c.seen.some((m) => m.t === 'reset'));
  // ...but an accepted suggestion or a restored version is: open editors start again from it.
  store.updateResource(dylan.id, page.id, { body: '# Plan\n\nBudget, revised by Finance' });
  assert.ok(c.seen.some((m) => m.t === 'reset'));
  assert.equal(store.docState(page.id), null);
  // Whoever refills it gets the accepted text, even if their own screen has not caught up.
  const d = editor();
  collab.watch(page.id, 'client-d', d.res as any);
  assert.equal(d.seen[0].seed, true);
  assert.equal(d.seen[0].body, '# Plan\n\nBudget, revised by Finance');
  // An edit still on its way from before the restart is dropped, not mixed into the new history.
  const stale = new Y.Doc();
  stale.getXmlFragment('default').insert(0, [new Y.XmlText('old text')]);
  assert.equal(collab.update(page.id, 'client-c', b64(Y.encodeStateAsUpdate(stale)), epoch), false);
  assert.notEqual(d.seen[0].epoch, epoch);
  // A save from an editor still on the replaced history is refused, so it can't undo the change.
  assert.equal(collab.acceptsSave(page.id, c.seen[0].epoch, '# Plan\n\nBudget'), false);
  assert.equal(collab.acceptsSave(page.id, d.seen[0].epoch, '# Plan\n\nBudget, revised'), true);
  await app.close();
});
