// Genuine OSRS Mobile screenshot of the Gothic castle puzzle (IMG_0233),
// opened over dark, warm-brown swamp scenery. The released detector rejected
// it (BOARD_NOT_FOUND): at threshold 60 the grid is found but the frame bevel
// is too light; at higher thresholds the grid lines run on into the scenery.
// The frame-edge fallback in board-detect.js recovers it.
//
// Fixture note: the file is the copy that reached development via chat upload
// (2360×1640 PNG, 16-bit, Display P3 profile), not the camera-roll JPEG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBoard } from '../src/board-detect.js';
import { recognizeAnyPuzzle } from '../src/recognize.js';
import { solvePuzzle } from '../src/solver.js';
import { createWalkthrough } from '../src/walkthrough.js';
import { isSolvable, isSolved } from '../src/puzzle-state.js';
import { loadImage } from './helpers/load-image.js';
import { referenceList } from './helpers/puzzles.js';
import { screenshot, fillRect } from './helpers/fixtures.js';

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/gothic-castle-img0233.png');
const EXPECTED = [
  1, 3, 9, 8, 5,
  6, 2, 4, 10, 0,
  11, 7, 12, 13, 14,
  16, 17, 18, 19, 24,
  21, 22, 23, 20, 15,
];
let shotPromise;
const shot = () => (shotPromise ??= loadImage(FIXTURE));
const crop = (img, x0, y0, w, h) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data };
};

test('IMG_0233: board detected via the frame-edge fallback', async () => {
  const b = detectBoard(await shot());
  assert.equal(b.ok, true, b.reason);
  assert.ok(b.confidence >= 0.6, `confidence ${b.confidence}`);
  assert.deepEqual(b.fallback && { frameThreshold: b.fallback.frameThreshold }, { frameThreshold: b.threshold + 20 });
  // Every normal threshold attempt failed on its own.
  assert.ok(b.attempts.every((a) => a.confidence < 0.6));
});

test('IMG_0233: identified as Gothic castle with the expected, solvable state', async () => {
  const r = recognizeAnyPuzzle(await shot(), await referenceList());
  assert.equal(r.ok, true, r.error?.message);
  assert.equal(r.puzzleId, 'gothic-castle');
  assert.deepEqual(r.state, EXPECTED);
  assert.equal(isSolvable(r.state), true);
  assert.equal(r.diagnostics.validation.resolvedBy, 'image');
});

test('IMG_0233: 21-tap solution whose walkthrough reaches solved', () => {
  const s = solvePuzzle(EXPECTED);
  assert.equal(s.ok, true);
  assert.equal(s.length, 21);
  const w = createWalkthrough(EXPECTED, s.taps);
  let i = 0;
  while (w.view(i).canNext) i = w.next(i);
  assert.equal(isSolved(w.view(i).board), true);
});

test('fallback is not used when normal detection passes (IMG_0120)', async () => {
  const b = detectBoard(await screenshot());
  assert.equal(b.ok, true);
  assert.equal(b.fallback, undefined);
});

test('fallback does not accept non-puzzle regions of the IMG_0233 scene', async () => {
  const img = await shot();
  const blanked = { ...img, data: new Uint8ClampedArray(img.data) };
  fillRect(blanked, 600, 600, 1250, 1250, [60, 60, 50]);
  const cases = {
    'top band': crop(img, 0, 0, 2360, 560),
    'left of board': crop(img, 0, 0, 590, 1640),
    'right of board': crop(img, 1270, 0, 1090, 1640),
    'below board': crop(img, 0, 1260, 2360, 380),
    'board blanked out': blanked,
  };
  const refs = await referenceList();
  for (const [name, c] of Object.entries(cases)) {
    const r = recognizeAnyPuzzle(c, refs);
    assert.equal(r.ok, false, `${name} accepted as ${r.puzzleId}`);
    assert.equal(r.error.code, 'BOARD_NOT_FOUND', `${name}: ${r.error.code}`);
  }
});
