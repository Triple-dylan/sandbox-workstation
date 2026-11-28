import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_FORMS } from '../shared/types.ts';
import { ring, tileNames, tilePatterns } from '../src/features/agents/tiles.ts';

test('every agent form has its own named tile pattern', () => {
  const patterns = AGENT_FORMS.map((f) => tilePatterns[f]);
  assert.equal(new Set(patterns).size, AGENT_FORMS.length, 'no two forms look the same');
  assert.equal(new Set(AGENT_FORMS.map((f) => tileNames[f])).size, AGENT_FORMS.length);
});

test('tile marks are 3x3, mirror-symmetric and never sparse', () => {
  for (const p of Object.values(tilePatterns)) {
    assert.match(p, /^[x.]{9}$/);
    for (let r = 0; r < 3; r++) assert.equal(p[r * 3], p[r * 3 + 2]);
    assert.ok(p.split('x').length - 1 >= 4);
  }
  assert.deepEqual([...ring].sort(), [0, 1, 2, 3, 5, 6, 7, 8]);
});
