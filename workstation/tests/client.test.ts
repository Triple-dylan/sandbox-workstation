import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { graphOf, noFilter, relationsOf } from '../src/features/graph/tree.ts';
import { colName, evaluate, toNumber } from '../src/features/sheet/formula.ts';
import { scopeOf } from '../src/app/scope.ts';
import { proposalText } from '../src/features/agents/proposal.ts';

function world() {
  const store = new Store(openDb(':memory:'));
  const dylan = store.createHuman('Dylan');
  const maya = store.createHuman('Maya');
  const project = store.createProject(dylan.id, 'Launch');
  store.addMember(dylan.id, project.id, maya.id);
  const snapshot = (userId: string) =>
    store.snapshot(userId, [], { id: 'scripted', label: 'Scripted' });
  return { store, dylan, maya, project, snapshot };
}

test('sheet formulas: sums, references, arithmetic, and errors that explain themselves', () => {
  const rows = [
    ['Item', 'Cost', 'Qty', 'Total'],
    ['Cups', '$28', '18', '=B2*C2'],
    ['Bowls', '36', '14', '=B3*C3'],
    ['', '=SUM(B2:B3)', '=AVERAGE(C2:C3)', '=SUM(D2:D3)'],
    ['=A5', '=1/0', '=NOPE(1)', '=(B2+B3)*2-4/2'],
    ['=MAX(B2:C3)', '=MIN(B2,B3)', '=COUNT(A1:D3)', '=-B2+1,000'],
  ];
  assert.equal(evaluate(rows, 1, 3), '504');
  assert.equal(evaluate(rows, 3, 1), '64');
  assert.equal(evaluate(rows, 3, 2), '16');
  assert.equal(evaluate(rows, 3, 3), '1008');
  assert.equal(evaluate(rows, 4, 0), '#LOOP');
  assert.equal(evaluate(rows, 4, 1), '#DIV');
  assert.equal(evaluate(rows, 4, 2), '#ERR');
  assert.equal(evaluate(rows, 4, 3), '126');
  assert.equal(evaluate(rows, 5, 0), '36');
  assert.equal(evaluate(rows, 5, 1), '28');
  assert.equal(evaluate(rows, 5, 2), '6');
  assert.equal(evaluate(rows, 5, 3), '#ERR');
  assert.equal(evaluate(rows, 0, 0), 'Item');
  assert.equal(toNumber('$1,200.50'), 1200.5);
  assert.equal(toNumber('12%'), 0.12);
  assert.equal(toNumber('yes'), null);
  assert.equal(colName(0), 'A');
  assert.equal(colName(27), 'AB');
});

test('graph: folders and pages only, filters narrow it, private pages show only to their owner', () => {
  const { store, dylan, maya, project, snapshot } = world();
  const folder = store.createFolder(dylan.id, { spaceId: project.id, title: 'Vendors' });
  const doc = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Shortlist',
    body: 'See the Budget sheet.',
    parentId: folder.id,
  });
  const sheet = store.createResource(maya.id, {
    spaceId: project.id,
    kind: 'sheet',
    title: 'Budget sheet',
    body: '',
  });
  const canvas = store.createResource(dylan.id, { spaceId: project.id, kind: 'canvas', body: '' });
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'sticky',
    body: 'On the canvas',
    parentId: canvas.id,
  });
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'embed',
    parentId: canvas.id,
    body: JSON.stringify({ resourceId: sheet.id }),
  });
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'doc',
    title: 'Mine',
    body: '',
    visibility: 'private',
  });
  const s = snapshot(maya.id);
  const space = s.spaces.find((x) => x.id === project.id)!;
  const { nodes, links } = graphOf(s, space);
  assert.equal(nodes[0].kind, 'root');
  assert.ok(nodes.some((n) => n.label === 'Shortlist' && n.parentId === folder.id));
  assert.ok(!nodes.some((n) => n.label === 'On the canvas'), 'canvas pieces are not graph nodes');
  assert.ok(!nodes.some((n) => n.label === 'Mine'));
  assert.ok(graphOf(snapshot(dylan.id), space).nodes.some((n) => n.label === 'Mine' && n.private));
  assert.equal(links.length, nodes.length - 1, 'every node except the root has one parent');
  // Relations: one page names another; a canvas shows a page as a card.
  const relations = relationsOf(s, space);
  assert.ok(relations.some((r) => r.source === doc.id && r.target === sheet.id));
  assert.ok(relations.some((r) => r.source === canvas.id && r.target === sheet.id));
  // Filters.
  const sheets = graphOf(s, space, { ...noFilter, kind: 'sheet' });
  assert.deepEqual(
    sheets.nodes.filter((n) => n.kind !== 'root').map((n) => n.label),
    ['Budget sheet'],
  );
  const mine = graphOf(s, space, { ...noFilter, mine: true });
  assert.ok(mine.nodes.every((n) => n.kind === 'root' || n.label === 'Budget sheet'));
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(graphOf(s, space, { ...noFilter, recent: true }, future).nodes.length, 1);
});

test('the agent bar names what it will look at, from what is on screen', () => {
  const { store, dylan, project, snapshot } = world();
  const page = store.createResource(dylan.id, { spaceId: project.id, kind: 'doc', body: 'x' });
  const s = snapshot(dylan.id);
  const channel = s.conversations.find((c) => c.kind === 'channel')!;
  const ui = (panes: any[], selection: string[] = [], active = 0) =>
    ({ panes, selection, active }) as any;
  assert.equal(scopeOf(ui([{ type: 'graph' }]), s, 2).label, 'Whole space');
  assert.deepEqual(scopeOf(ui([{ type: 'page', id: page.id }]), s, 2), {
    label: 'This page',
    resourceIds: [page.id],
    conversationIds: [],
  });
  assert.equal(scopeOf(ui([{ type: 'chat', id: channel.id }]), s, 2).label, 'This channel');
  const both = scopeOf(
    ui([
      { type: 'page', id: page.id },
      { type: 'chat', id: channel.id },
    ]),
    s,
    2,
  );
  assert.equal(both.label, 'Both pages');
  assert.deepEqual(both.conversationIds, [channel.id]);
  // In a narrow window only the pane in front counts.
  const narrow = scopeOf(
    ui(
      [
        { type: 'page', id: page.id },
        { type: 'chat', id: channel.id },
      ],
      [],
      1,
    ),
    s,
    1,
  );
  assert.equal(narrow.label, 'This channel');
  const picked = scopeOf(ui([{ type: 'page', id: page.id }], ['a', 'b']), s, 2);
  assert.equal(picked.label, '2 selected');
  assert.deepEqual(picked.resourceIds, ['a', 'b', page.id]);
});

test('suggestions read plainly to the person deciding', () => {
  assert.equal(proposalText({ kind: 'edit-doc', title: 'a', body: 'b' }, 'Brief').yes, 'Accept');
  assert.equal(proposalText({ kind: 'create-doc', title: 'Plan', body: '' }).yes, 'Keep');
  assert.match(proposalText({ kind: 'add-step', title: 'Ship', body: '' }).title, /Ship/);
});
