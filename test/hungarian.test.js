import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveAssignment } from '../src/hungarian.js';
import { mulberry32 } from './helpers/fixtures.js';

function permutations(n) {
  if (n === 1) return [[0]];
  const out = [];
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  }
  return out;
}
const total = (c, a) => a.reduce((s, j, i) => s + c[i][j], 0);

test('matches brute force on random 6×6 matrices', () => {
  const rnd = mulberry32(7);
  const perms = permutations(6);
  for (let t = 0; t < 30; t++) {
    const c = [...Array(6)].map(() => [...Array(6)].map(() => Math.round(rnd() * 100) / 10));
    const a = solveAssignment(c);
    assert.deepEqual([...a].sort(), [0, 1, 2, 3, 4, 5]);
    const best = Math.min(...perms.map((p) => total(c, p)));
    assert.ok(Math.abs(total(c, a) - best) < 1e-9);
  }
});

test('prefers the globally cheaper assignment over greedy choices', () => {
  // Greedy row-by-row would give row 0 → col 0 (1) then row 1 → col 1 (100).
  const c = [[1, 2], [3, 100]];
  assert.deepEqual(solveAssignment(c), [1, 0]);
});
