import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizePuzzle } from '../src/recognize.js';
import { isSolvable } from '../src/puzzle-state.js';
import { detectBoard } from '../src/board-detect.js';
import { tree, screenshot, loadImage, REFERENCE, EXPECTED_STATE, permuteCells, mulberry32 } from './helpers/fixtures.js';

test('IMG_0120: reconstructs the expected state from the untouched screenshot', async () => {
  const r = recognizePuzzle(await screenshot(), await tree());
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.state, EXPECTED_STATE);
  const d = r.diagnostics;
  assert.equal(d.validation.solvable, true);
  assert.equal(d.validation.resolvedBy, 'image');
  assert.ok(d.boardDetection.confidence >= 0.8);
  assert.ok(d.boardConfidence >= 0.8, `board confidence ${d.boardConfidence}`);
  for (const c of d.tiles.cells) {
    assert.equal(typeof c.bestDeltaE, 'number');
    assert.equal(typeof c.secondDeltaE, 'number');
    assert.ok(c.confident, `cell ${c.row},${c.col} not confident`);
  }
});

test('IMG_0120: look-alike tiles 1/5 and 11/15 are separated by image evidence', async () => {
  const r = recognizePuzzle(await screenshot(), await tree());
  const cells = r.diagnostics.tiles.cells;
  for (const tile of [1, 5, 11, 15]) {
    const c = cells.find((x) => x.tile === tile);
    assert.equal(c.marginSource, 'discriminative', `tile ${tile}`);
    assert.ok(c.margin >= 0.5, `tile ${tile} margin ${c.margin}`);
  }
  const pairs = r.diagnostics.tiles.lookalikePairs;
  for (const t of [[1, 5], [11, 15]]) {
    const p = pairs.find((x) => x.tiles.includes(t[0]) && x.tiles.includes(t[1]));
    assert.ok(p && p.decided && p.margin >= 0.4, JSON.stringify(p));
  }
});

test('the clean reference image itself is recognised as the solved board', async () => {
  const r = recognizePuzzle(await loadImage(REFERENCE), await tree());
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.state, [...Array(24)].map((_, i) => i + 1).concat(0));
});

// Rearranging the real screenshot's own tile pixels produces new boards with
// known states (including the blank in other positions), so the recogniser is
// exercised on states it has never seen — with genuine device rendering.
async function rearranged(perm) {
  const img = await screenshot();
  const board = detectBoard(img);
  return { img: permuteCells(img, board.cells, perm), state: perm.map((src) => EXPECTED_STATE[src]) };
}
const identity = () => [...Array(25).keys()];

test('swapping only the 1 and 5 tiles: recognised from pixels, then rejected as unsolvable', async () => {
  const perm = identity();
  [perm[0], perm[9]] = [perm[9], perm[0]]; // cells holding tiles 1 and 5
  const { img, state } = await rearranged(perm);
  const r = recognizePuzzle(img, await tree());
  // Image evidence must report what is actually shown, not what is solvable.
  assert.deepEqual(r.diagnostics.candidate.state, state);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'UNSOLVABLE');
});

test('swapping both look-alike pairs (1↔5 and 11↔15) is recognised exactly', async () => {
  const perm = identity();
  [perm[0], perm[9]] = [perm[9], perm[0]];
  [perm[5], perm[19]] = [perm[19], perm[5]];
  const { img, state } = await rearranged(perm);
  assert.equal(isSolvable(state), true);
  const r = recognizePuzzle(img, await tree());
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.state, state);
  assert.equal(r.diagnostics.validation.resolvedBy, 'image');
});

test('random solvable rearrangements of the real tiles, blank anywhere', async () => {
  const ref = await tree();
  const rnd = mulberry32(2024);
  const blankPositions = new Set();
  for (let t = 0; t < 6; t++) {
    let perm;
    do {
      perm = identity();
      for (let i = 24; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    } while (!isSolvable(perm.map((s) => EXPECTED_STATE[s])));
    const { img, state } = await rearranged(perm);
    blankPositions.add(state.indexOf(0));
    const r = recognizePuzzle(img, ref);
    assert.equal(r.ok, true, `trial ${t}: ${r.error?.message}`);
    assert.deepEqual(r.state, state, `trial ${t}`);
  }
  assert.ok(blankPositions.size >= 4, 'blank should land in several different cells');
});
