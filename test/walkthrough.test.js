import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createWalkthrough } from '../src/walkthrough.js';
import { applyTap, isLegalTap, SOLVED_STATE } from '../src/puzzle-state.js';
import { solvePuzzle } from '../src/solver.js';
import { EXPECTED_STATE } from './helpers/fixtures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_TAPS = [...readFileSync(path.join(here, 'fixtures/img0120-solution.md'), 'utf8')
  .matchAll(/^\s*\d+\. tap (\d+)$/gm)].map((m) => Number(m[1]));
const walk = () => createWalkthrough(EXPECTED_STATE, solvePuzzle(EXPECTED_STATE).taps);

test('fixture and solver agree (50 taps)', () => {
  assert.equal(FIXTURE_TAPS.length, 50);
  assert.deepEqual(walk().taps, FIXTURE_TAPS);
});

test('move 1 highlights the first solver tap on the original board', () => {
  const v = walk().view(0);
  assert.equal(v.moveNumber, 1);
  assert.equal(v.total, 50);
  assert.equal(v.nextTile, FIXTURE_TAPS[0]);
  assert.deepEqual([...v.board], EXPECTED_STATE);
  assert.deepEqual(v.upcoming, FIXTURE_TAPS.slice(1, 4));
  assert.equal(v.canPrevious, false);
  assert.equal(v.canNext, true);
  assert.equal(v.complete, false);
});

test('advancing applies exactly that legal tap, and the next highlight is the next instruction', () => {
  const w = walk();
  for (let i = 0; i < w.total; i++) {
    const before = w.view(i), after = w.view(w.next(i));
    assert.ok(isLegalTap(before.board, before.nextTile), `move ${i + 1} not legal`);
    assert.deepEqual([...after.board], applyTap(before.board, before.nextTile), `move ${i + 1}`);
    assert.equal(after.index, i + 1);
    if (i + 1 < w.total) assert.equal(after.nextTile, FIXTURE_TAPS[i + 1]);
  }
});

test('Previous restores the prior board exactly', () => {
  const w = walk();
  for (let i = 1; i <= w.total; i++) {
    const back = w.view(w.previous(i));
    assert.deepEqual(back, w.view(i - 1));
    assert.equal(back.nextTile, FIXTURE_TAPS[i - 1]);
  }
});

test('walking through all 50 IMG_0120 moves produces the solved state with no next tile', () => {
  const w = walk();
  let i = 0;
  for (let k = 0; k < 50; k++) i = w.next(i);
  const v = w.view(i);
  assert.equal(v.complete, true);
  assert.deepEqual([...v.board], [...SOLVED_STATE]);
  assert.equal(v.nextTile, null);
  assert.deepEqual(v.upcoming, []);
  assert.equal(v.canNext, false);
  assert.equal(v.canPrevious, true);
});

test('cannot advance beyond completion or go before move 1', () => {
  const w = walk();
  assert.equal(w.next(50), 50);
  assert.equal(w.next(w.next(50)), 50);
  assert.equal(w.previous(0), 0);
  assert.equal(w.view(-5).index, 0);
  assert.equal(w.view(999).index, 50);
  assert.equal(w.view(1.5).index, 0);
});

test('an already-solved board is immediately complete', () => {
  const v = createWalkthrough([...SOLVED_STATE], []).view(0);
  assert.equal(v.complete, true);
  assert.equal(v.nextTile, null);
  assert.equal(v.canNext, false);
  assert.equal(v.canPrevious, false);
});

test('rejects illegal or incomplete tap sequences and invalid starts', () => {
  assert.throws(() => createWalkthrough(EXPECTED_STATE, [1]), /Illegal tap/);
  assert.throws(() => createWalkthrough(EXPECTED_STATE, FIXTURE_TAPS.slice(0, 49)), /does not end/);
  assert.throws(() => createWalkthrough([1, 2, 3], []), /Invalid start/);
});
