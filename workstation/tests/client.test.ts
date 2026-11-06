import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import {
  audienceKey,
  audienceOptions,
  defaultAudience,
  describeAudience,
  stillValid,
} from '../src/features/conversations/audience.ts';
import { fits, freeSpot, placeNote, snap } from '../src/features/canvas/layout.ts';
import { NOTES_GROUP, graphOf } from '../src/features/graph/tree.ts';

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

test('composer defaults: project goes to the first channel, personal space to your agent', () => {
  const { dylan, project, snapshot } = world();
  const s = snapshot(dylan.id);
  const projectDefault = defaultAudience(s, project.id)!;
  assert.equal(projectDefault.kind, 'conversation');
  assert.equal(describeAudience(s, projectDefault).label, '#general');
  const personal = s.spaces.find((x) => x.kind === 'personal')!;
  const personalDefault = defaultAudience(s, personal.id)!;
  assert.equal(personalDefault.kind, 'private-agent');
  assert.equal(describeAudience(s, personalDefault).detail, 'Private to you');
});

test('composer offers all five situations; Discuss only with a selected item', () => {
  const { store, dylan, project, snapshot } = world();
  const note = store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'Pricing tiers',
  });
  const s = snapshot(dylan.id);
  const kinds = (selected: typeof note | null) =>
    new Set<string>(audienceOptions(s, project.id, selected).map((o) => o.audience.kind));
  const withSelection = kinds(note);
  for (const kind of ['conversation', 'instruct', 'delegate', 'private-agent', 'person', 'discuss'])
    assert.ok(withSelection.has(kind), `missing ${kind}`);
  assert.ok(!kinds(null).has('discuss'));
  const keys = audienceOptions(s, project.id, note).map((o) => audienceKey(o.audience));
  assert.equal(new Set(keys).size, keys.length, 'each audience keeps its own draft');
});

test('a note title follows its first line until someone renames it', () => {
  const { store, dylan, project } = world();
  const note = store.createResource(dylan.id, { spaceId: project.id, kind: 'note', body: 'P' });
  assert.equal(note.title, 'P');
  assert.equal(
    store.updateResource(dylan.id, note.id, { body: 'Pricing tiers\nmore' }).title,
    'Pricing tiers',
  );
  store.updateResource(dylan.id, note.id, { title: 'Pricing' });
  assert.equal(store.updateResource(dylan.id, note.id, { body: 'Changed' }).title, 'Pricing');
});

test('remembered audiences are dropped when their target disappears', () => {
  const { store, dylan, maya, project, snapshot } = world();
  const note = store.createResource(dylan.id, { spaceId: project.id, kind: 'note', body: 'Temp' });
  assert.ok(stillValid(snapshot(dylan.id), { kind: 'discuss', resourceId: note.id }));
  store.deleteResource(dylan.id, note.id);
  assert.ok(!stillValid(snapshot(dylan.id), { kind: 'discuss', resourceId: note.id }));
  assert.ok(stillValid(snapshot(dylan.id), { kind: 'person', userId: maya.id }));
  assert.ok(!stillValid(snapshot(dylan.id), { kind: 'conversation', conversationId: 'gone' }));
});

test('canvas layout snaps to the grid, avoids overlap and shrinks before giving up', () => {
  const bounds = { width: 600, height: 400 };
  assert.equal(snap(37), 48);
  const first = placeNote(100, 100, bounds, [])!;
  assert.equal(first.x % 24, 0);
  assert.equal(first.width, 336);
  assert.ok(!fits({ ...first, x: first.x + 24 }, bounds, [first]));
  const crowded = placeNote(580, 100, bounds, [{ x: 0, y: 96, width: 336, height: 48 }])!;
  assert.ok(crowded.width < 336);
  assert.equal(placeNote(10, 10, { width: 100, height: 40 }, []), null);
  const spot = freeSpot({ width: 288, height: 120 }, bounds, [first])!;
  assert.ok(fits(spot, bounds, [first]));
});

test('graph is a tree with notes grouped, and hides items the viewer cannot see', () => {
  const { store, dylan, maya, project, snapshot } = world();
  store.createResource(dylan.id, { spaceId: project.id, kind: 'note', body: 'Shared idea' });
  store.createResource(dylan.id, {
    spaceId: project.id,
    kind: 'note',
    body: 'Mine',
    visibility: 'private',
  });
  const s = snapshot(maya.id);
  const space = s.spaces.find((x) => x.id === project.id)!;
  const { nodes, links } = graphOf(s, space);
  assert.equal(nodes[0].kind, 'root');
  assert.ok(nodes.some((n) => n.id === NOTES_GROUP));
  assert.ok(nodes.some((n) => n.label === 'Shared idea'));
  assert.ok(!nodes.some((n) => n.label === 'Mine'));
  assert.equal(links.length, nodes.length - 1, 'every node except the root has one parent');
});
