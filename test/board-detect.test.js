import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBoard } from '../src/board-detect.js';
import { screenshot, loadImage, REFERENCE, sharpFromImage } from './helpers/fixtures.js';

// Hand-measured from IMG_0120 for assertion only (inner edge of the frame).
const MEASURED = { left: 631, top: 687, right: 1138, bottom: 1193, tile: 95 };

test('locates the board in the IMG_0120 screenshot', async () => {
  const b = detectBoard(await screenshot());
  assert.equal(b.ok, true, b.reason);
  assert.ok(b.confidence >= 0.8, `confidence ${b.confidence}`);
  const first = b.cells[0], last = b.cells[24];
  assert.ok(Math.abs(first.x - MEASURED.left) <= 1.5, `left ${first.x}`);
  assert.ok(Math.abs(first.y - MEASURED.top) <= 1.5, `top ${first.y}`);
  assert.ok(Math.abs(last.x + last.w - MEASURED.right) <= 1.5, `right ${last.x + last.w}`);
  assert.ok(Math.abs(last.y + last.h - MEASURED.bottom) <= 1.5, `bottom ${last.y + last.h}`);
  for (const c of b.cells) {
    assert.ok(Math.abs(c.w - MEASURED.tile) <= 1.5 && Math.abs(c.h - MEASURED.tile) <= 1.5, `cell ${c.row},${c.col} ${c.w}×${c.h}`);
  }
});

test('locates the grid of the clean reference image (different scale and source)', async () => {
  const b = detectBoard(await loadImage(REFERENCE));
  assert.equal(b.ok, true, b.reason);
  // Reference tiles are 36 px, lines 3 px, frame inner edge at 12 px.
  assert.ok(Math.abs(b.cells[0].x - 12) <= 0.5 && Math.abs(b.cells[0].y - 12) <= 0.5);
  for (const c of b.cells) assert.ok(Math.abs(c.w - 36) <= 0.5 && Math.abs(c.h - 36) <= 0.5);
});

test('board position follows the image content (translation)', async () => {
  const img = await screenshot();
  const shifted = await loadImage(sharpFromImage(img).extend({ top: 137, left: 251, bottom: 0, right: 0, background: '#203040' }));
  const a = detectBoard(img), b = detectBoard(shifted);
  assert.ok(b.ok);
  assert.ok(Math.abs(b.cells[0].x - a.cells[0].x - 251) < 0.5);
  assert.ok(Math.abs(b.cells[0].y - a.cells[0].y - 137) < 0.5);
});

test('reports failure with diagnostics when no board is present', async () => {
  const img = await screenshot();
  // The right-hand part of the screenshot: inventory, minimap, no puzzle.
  const noBoard = await loadImage(sharpFromImage(img).extract({ left: 1250, top: 0, width: 1110, height: 1640 }));
  const b = detectBoard(noBoard);
  assert.equal(b.ok, false);
  assert.match(b.reason, /grid/i);
  assert.ok(Array.isArray(b.attempts) && b.attempts.length > 0);
});
