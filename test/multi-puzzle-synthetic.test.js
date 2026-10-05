// SYNTHETIC validation for all seven puzzles (see test/helpers/puzzles.js):
// real reference tile pixels rearranged into new solvable states, pasted into
// the IMG_0120 screenshot and transformed. Not real-device evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeAnyPuzzle } from '../src/recognize.js';
import { PUZZLE_IDS } from '../src/references.js';
import { puzzles, referenceList, syntheticScreenshot, scrambledBoard, closestPairs, swapped, TRANSFORMS, loadImage } from './helpers/puzzles.js';
import sharp from 'sharp';

// Disjoint look-alike pairs found during inspection (asserted, not assumed).
const KNOWN_LOOKALIKES = { tree: [[1, 5], [11, 15]], troll: [[6, 11], [13, 18]], castle: [[6, 10], [21, 24]] };

test('closest look-alike pairs are the ones identified during inspection', async () => {
  const all = await puzzles();
  for (const [id, pairs] of Object.entries(KNOWN_LOOKALIKES)) {
    assert.deepEqual(closestPairs(all.get(id).reference), pairs, id);
  }
});

for (const id of PUZZLE_IDS) {
  test(`${id}: synthetic scrambles, look-alike swaps and transforms recognised exactly`, async () => {
    const all = await puzzles(), refs = await referenceList(), puzzle = all.get(id);
    const states = [
      ['scramble A', scrambledBoard(11 * id.length + 1, 2000)],
      ['scramble B', scrambledBoard(13 * id.length + 7, 2000)],
      ['look-alike swap', swapped(closestPairs(puzzle.reference))],
    ];
    const blanks = new Set();
    for (const [label, state] of states) {
      blanks.add(state.indexOf(0));
      for (const [tname, transform] of Object.entries(TRANSFORMS)) {
        const shot = await loadImage(await transform(await syntheticScreenshot(puzzle, state)));
        const r = recognizeAnyPuzzle(shot, refs);
        const where = `${id} / ${label} / ${tname}`;
        assert.equal(r.ok, true, `${where}: ${r.error?.code} ${r.error?.message}`);
        assert.equal(r.puzzleId, id, where);
        assert.deepEqual(r.state, state, where);
        assert.equal(r.diagnostics.validation.resolvedBy, 'image', `${where}: decided by solvability, not pixels`);
      }
    }
    assert.ok(blanks.size >= 2, 'blank should be in different positions');
  });
}

test('harsh re-compression (60% + JPEG 60) fails safely: never a wrong board', async () => {
  const all = await puzzles(), refs = await referenceList();
  for (const id of PUZZLE_IDS) {
    const state = scrambledBoard(900 + id.length, 2000);
    const small = await (await syntheticScreenshot(all.get(id), state)).resize(1416).png().toBuffer();
    const shot = await loadImage(sharp(await sharp(small).jpeg({ quality: 60 }).toBuffer()));
    const r = recognizeAnyPuzzle(shot, refs);
    if (r.ok) {
      assert.equal(r.puzzleId, id);
      assert.deepEqual(r.state, state);
    }
  }
});
