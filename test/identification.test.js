// Automatic puzzle identification: correct selection, rejection of
// unsupported boards, and refusal to guess between indistinguishable puzzles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeAnyPuzzle } from '../src/recognize.js';
import { identifyPuzzle, cellThumbnails, IDENTIFY_DEFAULTS } from '../src/identify.js';
import { detectBoard } from '../src/board-detect.js';
import { PUZZLE_IDS } from '../src/references.js';
import { screenshot, cellBox, fillRect } from './helpers/fixtures.js';
import { puzzles, referenceList, syntheticScreenshot, scrambledBoard, loadImage } from './helpers/puzzles.js';

test('IMG_0120 (genuine screenshot) is identified as Tree by a clear margin', async () => {
  const shot = await screenshot();
  const id = identifyPuzzle(cellThumbnails(shot, detectBoard(shot).cells), await referenceList());
  assert.equal(id.ok, true);
  assert.equal(id.id, 'tree');
  assert.ok(id.scores[0].score <= IDENTIFY_DEFAULTS.maxScore);
  assert.ok(id.ratio >= 4, `runner-up ratio ${id.ratio}`);
});

test('every puzzle is identified correctly from a scrambled synthetic board', async () => {
  const all = await puzzles(), refs = await referenceList();
  for (const id of PUZZLE_IDS) {
    const shot = await loadImage(await syntheticScreenshot(all.get(id), scrambledBoard(500 + id.length, 2000)));
    const b = detectBoard(shot);
    const r = identifyPuzzle(cellThumbnails(shot, b.cells), refs);
    assert.equal(r.ok, true, `${id}: ${r.message}`);
    assert.equal(r.id, id);
    assert.ok(r.ratio >= 3, `${id}: ratio ${r.ratio}`);
  }
});

test('cross-puzzle rejection: a puzzle whose reference is missing is never matched to another', async () => {
  const all = await puzzles();
  for (const id of PUZZLE_IDS) {
    const shot = await loadImage(await syntheticScreenshot(all.get(id), scrambledBoard(700 + id.length, 2000)));
    const r = recognizeAnyPuzzle(shot, await referenceList([id]));
    assert.equal(r.ok, false, `${id} was accepted as ${r.puzzleId}`);
    assert.equal(r.error.code, 'UNSUPPORTED_PUZZLE', `${id}: ${r.error.code}`);
    assert.equal(r.puzzleId, null);
  }
});

test('ambiguous identification: two indistinguishable references → refuse to guess', async () => {
  const refs = await referenceList();
  const tree = refs.find((r) => r.id === 'tree');
  const shot = await screenshot();
  const r = recognizeAnyPuzzle(shot, [...refs, { ...tree, id: 'tree-duplicate' }]);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PUZZLE_AMBIGUOUS');
  assert.equal(r.state, null);
});

test('identifyPuzzle decision rule: absolute limit and winner ratio', () => {
  // Thumbnails differing only in L*, so mean ΔE = |difference|.
  const thumb = (v) => { const t = new Float64Array(12 * 12 * 3); for (let i = 0; i < t.length; i += 3) t[i] = v; return t; };
  const cells = [...Array(25)].map(() => thumb(50));
  const ref = (id, v) => ({ id, idThumbs: [...Array(25)].map(() => thumb(v)) });
  assert.equal(identifyPuzzle(cells, [ref('a', 52), ref('b', 70)]).id, 'a');                  // 2 vs 20
  assert.equal(identifyPuzzle(cells, [ref('a', 60), ref('b', 90)]).id, 'a');                  // 10 vs 40
  assert.equal(identifyPuzzle(cells, [ref('a', 65), ref('b', 90)]).code, 'UNSUPPORTED_PUZZLE'); // best 15 > 12
  assert.equal(identifyPuzzle(cells, [ref('a', 54), ref('b', 59)]).code, 'PUZZLE_AMBIGUOUS');   // 4 vs 9 (ratio 2.25)
  assert.equal(identifyPuzzle(cells, [ref('a', 50), ref('b', 50)]).code, 'PUZZLE_AMBIGUOUS');   // exact tie at 0
  assert.equal(identifyPuzzle(cells, [ref('a', 50), ref('b', 51)]).id, 'a');                  // 0 vs 1
  assert.equal(identifyPuzzle(cells, [ref('a', 52)]).id, 'a');                                // single reference
});

test('a framed grid with unknown artwork is rejected as unsupported', async () => {
  const shot = await screenshot();
  for (const c of detectBoard(shot).cells) { const b = cellBox(c); fillRect(shot, b.x0, b.y0, b.x1, b.y1, [90, 140, 200]); }
  const r = recognizeAnyPuzzle(shot, await referenceList());
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'UNSUPPORTED_PUZZLE');
});
