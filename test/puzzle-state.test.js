import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePermutation, isSolvable, countInversions, toGrid } from '../src/puzzle-state.js';
import { EXPECTED_STATE } from './helpers/fixtures.js';

const SOLVED = [...Array(24)].map((_, i) => i + 1).concat(0);

test('solved board is a valid, solvable permutation', () => {
  assert.deepEqual(validatePermutation(SOLVED), { ok: true });
  assert.equal(countInversions(SOLVED), 0);
  assert.equal(isSolvable(SOLVED), true);
});

test('swapping any two tiles makes the board unsolvable', () => {
  const s = [...SOLVED];
  [s[0], s[4]] = [s[4], s[0]];
  assert.equal(isSolvable(s), false);
  [s[5], s[9]] = [s[9], s[5]];
  assert.equal(isSolvable(s), true);
});

test('blank position does not affect solvability on a 5-wide board', () => {
  // Sliding the blank left along the bottom row and up a column are legal
  // moves, so every resulting state must remain solvable.
  const s = [...SOLVED];
  [s[24], s[23]] = [s[23], s[24]];
  assert.equal(isSolvable(s), true);
  [s[23], s[18]] = [s[18], s[23]];
  assert.equal(isSolvable(s), true);
});

test('IMG_0120 oracle state is valid and solvable', () => {
  assert.equal(validatePermutation(EXPECTED_STATE).ok, true);
  assert.equal(isSolvable(EXPECTED_STATE), true);
});

test('missing, duplicate, out-of-range and wrong-length states are rejected', () => {
  const dup = [...SOLVED]; dup[3] = 1;
  const r = validatePermutation(dup);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [4]);
  assert.deepEqual(r.duplicated, [1]);
  assert.equal(validatePermutation([...SOLVED.slice(0, 24), 25]).ok, false);
  assert.equal(validatePermutation(SOLVED.slice(1)).ok, false);
});

test('toGrid produces 5 rows of 5', () => {
  assert.deepEqual(toGrid(SOLVED)[4], [21, 22, 23, 24, 0]);
});

test('even-width boards use the blank row in the parity rule', () => {
  // 4×4: solved, and solved with blank moved up one row (legal move).
  const solved4 = [...Array(15)].map((_, i) => i + 1).concat(0);
  assert.equal(isSolvable(solved4, 4), true);
  const up = [...solved4]; [up[15], up[11]] = [up[11], up[15]];
  assert.equal(isSolvable(up, 4), true);
  const swapped = [...solved4]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(isSolvable(swapped, 4), false);
});

test('applyTap moves an adjacent tile into the blank and rejects anything else', async () => {
  const { applyTap, isLegalTap, isSolved, SOLVED_STATE } = await import('../src/puzzle-state.js');
  assert.equal(isSolved([...SOLVED_STATE]), true);
  const moved = applyTap([...SOLVED_STATE], 20); // tile above the blank
  assert.deepEqual(moved.slice(15), [16, 17, 18, 19, 0, 21, 22, 23, 24, 20]);
  assert.equal(moved[19], 0);
  assert.equal(moved[24], 20);
  assert.equal(isSolved(moved), false);
  for (const bad of [19, 18, 1, 0, 25, -1, 1.5]) {
    assert.equal(isLegalTap(SOLVED_STATE, bad), false, `tile ${bad}`);
    assert.throws(() => applyTap([...SOLVED_STATE], bad), /Illegal tap/);
  }
  // Row wrap-around is not adjacency: blank at cell 5 (row 2 start), tile at cell 4 (row 1 end).
  const s = [...SOLVED_STATE];
  [s[5], s[24]] = [s[24], s[5]];
  assert.equal(isLegalTap(s, 5), false);
});
