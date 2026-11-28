import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORB_FORMS } from '../shared/types.ts';
import { bloomPaths, ring, tilePatterns, tracePaths } from '../src/features/agents/lookShapes.ts';

test('each agent look has its own shape for every agent form', () => {
  for (const shapes of [tracePaths.map((p) => p.d), tilePatterns, bloomPaths]) {
    assert.equal(shapes.length, ORB_FORMS.length);
    assert.equal(new Set(shapes).size, shapes.length, 'no two forms look the same');
  }
});

test('tile marks are 3x3, mirror-symmetric and never empty', () => {
  for (const p of tilePatterns) {
    assert.match(p, /^[x.]{9}$/);
    for (let r = 0; r < 3; r++) assert.equal(p[r * 3], p[r * 3 + 2]);
    assert.ok(p.split('x').length - 1 >= 4);
  }
  assert.deepEqual([...ring].sort(), [0, 1, 2, 3, 5, 6, 7, 8]);
});

test('trace and bloom shapes stay inside the 24px box', () => {
  for (const d of [...tracePaths.map((p) => p.d), ...bloomPaths]) {
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    assert.ok(nums.every((n) => n >= 0.5 && n <= 23.5));
  }
});
