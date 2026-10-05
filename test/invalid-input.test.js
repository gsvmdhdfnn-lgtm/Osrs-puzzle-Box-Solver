// Inputs that must fail explicitly instead of producing a plausible board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizePuzzle } from '../src/recognize.js';
import { detectBoard } from '../src/board-detect.js';
import { tree, screenshot, loadImage, sharpFromImage, cloneImage, cellBox, fillRect, mulberry32 } from './helpers/fixtures.js';

function noiseImage(w, h, seed) {
  const rnd = mulberry32(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i & 3) === 3 ? 255 : Math.floor(rnd() * 256);
  return { width: w, height: h, data };
}

function assertFails(r, codes) {
  assert.equal(r.ok, false, 'expected failure but got a board');
  assert.equal(r.state, null);
  assert.ok(codes.includes(r.error.code), `unexpected code ${r.error.code}: ${r.error.message}`);
  assert.ok(r.error.message.length > 10);
}

test('random noise image', async () => {
  assertFails(recognizePuzzle(noiseImage(1200, 800, 1), await tree()), ['BOARD_NOT_FOUND']);
});

test('uniform image', async () => {
  const img = noiseImage(800, 600, 2);
  fillRect(img, 0, 0, 800, 600, [60, 40, 10]);
  assertFails(recognizePuzzle(img, await tree()), ['BOARD_NOT_FOUND']);
});

test('screenshot with the puzzle covered', async () => {
  const img = await screenshot();
  const b = detectBoard(img);
  fillRect(img, Math.floor(b.rect.x) - 40, Math.floor(b.rect.y) - 40, Math.ceil(b.rect.x + b.rect.w) + 40, Math.ceil(b.rect.y + b.rect.h) + 40, [128, 128, 128]);
  assertFails(recognizePuzzle(img, await tree()), ['BOARD_NOT_FOUND']);
});

test('screenshot cropped through the middle of the board', async () => {
  const img = await screenshot();
  const half = await loadImage(sharpFromImage(img).extract({ left: 0, top: 0, width: 880, height: 1640 }));
  assertFails(recognizePuzzle(half, await tree()), ['BOARD_NOT_FOUND']);
});

test('board frame and grid intact but tile pictures replaced by noise', async () => {
  const img = await screenshot();
  const b = detectBoard(img);
  const rnd = mulberry32(3);
  for (const c of b.cells) {
    const { x0, y0, x1, y1 } = cellBox(c);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * img.width + x) * 4;
      img.data[p] = 100 + rnd() * 155; img.data[p + 1] = 100 + rnd() * 155; img.data[p + 2] = 100 + rnd() * 155;
    }
  }
  assertFails(recognizePuzzle(img, await tree()), ['POOR_MATCH', 'AMBIGUOUS', 'UNSOLVABLE']);
});

test('every tile mirrored (a different picture on the same grid)', async () => {
  const src = await screenshot();
  const img = cloneImage(src);
  for (const c of detectBoard(src).cells) {
    const { x0, y0, x1, y1 } = cellBox(c);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const s = (y * src.width + (x1 - 1 - (x - x0))) * 4, d = (y * src.width + x) * 4;
      img.data.set(src.data.subarray(s, s + 4), d);
    }
  }
  assertFails(recognizePuzzle(img, await tree()), ['POOR_MATCH', 'AMBIGUOUS', 'UNSOLVABLE']);
});

test('one tile obscured (e.g. a tooltip over the board)', async () => {
  const img = await screenshot();
  const c = detectBoard(img).cells[12];
  const { x0, y0, x1, y1 } = cellBox(c);
  fillRect(img, x0, y0, x1, y1, [70, 130, 200]);
  assertFails(recognizePuzzle(img, await tree()), ['POOR_MATCH', 'AMBIGUOUS', 'UNSOLVABLE']);
});
