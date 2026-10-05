// Test-only helpers for the seven puzzle references and synthetic boards.
//
// SYNTHETIC boards are built by rearranging a reference's own tile pixels,
// scaling the board to OSRS Mobile size and pasting it over the Tree board in
// the real IMG_0120 screenshot. They exercise detection, identification and
// matching on new states/transforms, but they are NOT real-device evidence:
// real game rendering differs from the reference images.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadImage } from './load-image.js';
import { prepareReference } from '../../src/recognize.js';
import { REFERENCES, PUZZLE_IDS } from '../../src/references.js';
import { scrambledBoard } from './scramble.js';
import { SOLVED_STATE, isSolvable } from '../../src/puzzle-state.js';
import { SCREENSHOT } from './fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Outer frame of the Tree board in IMG_0120 (hand-measured; test data only).
const BOARD_OUTER = { left: 600, top: 655, width: 575, height: 572 };

let all;
/** Map id → { id, img, reference } for every supported puzzle (cached). */
export function puzzles() {
  all ??= Promise.all(PUZZLE_IDS.map(async (id) => {
    const img = await loadImage(path.join(root, REFERENCES[id].src));
    return [id, { id, img, reference: prepareReference(img, { id }) }];
  })).then((entries) => new Map(entries));
  return all;
}

export async function referenceList(exclude = []) {
  return [...(await puzzles()).values()].filter((p) => !exclude.includes(p.id)).map((p) => p.reference);
}

/** Reference image with its tiles rearranged into `state` (0 = blank). */
export function arrange({ img, reference }, state) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const boxes = reference.board.cells.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }));
  const w = Math.min(...boxes.map((b) => b.w)), h = Math.min(...boxes.map((b) => b.h));
  state.forEach((tile, dst) => {
    const s = boxes[reference.labels.indexOf(tile)], d = boxes[dst];
    for (let y = 0; y < h; y++) {
      const so = ((s.y + y) * img.width + s.x) * 4, dO = ((d.y + y) * img.width + d.x) * 4;
      out.data.set(img.data.subarray(so, so + w * 4), dO);
    }
  });
  return out;
}

/** sharp pipeline of a full synthetic screenshot showing `state` of a puzzle. */
export async function syntheticScreenshot(puzzle, state, kernel = 'lanczos3') {
  const a = arrange(puzzle, state);
  const board = await sharp(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.length), { raw: { width: a.width, height: a.height, channels: 4 } })
    .resize(BOARD_OUTER.width, BOARD_OUTER.height, { kernel, fit: 'fill' }).png().toBuffer();
  return sharp(await sharp(SCREENSHOT).composite([{ input: board, left: BOARD_OUTER.left, top: BOARD_OUTER.top }]).png().toBuffer());
}

const reencode = async (p) => sharp(await p.png().toBuffer());
export const TRANSFORMS = {
  'resize 50%': (p) => p.resize(1180),
  'JPEG q75': async (p) => sharp(await p.jpeg({ quality: 75 }).toBuffer()),
  'brightness −8%': (p) => p.modulate({ brightness: 0.92 }),
  'saturation +10%, resize 75%': async (p) => (await reencode(p.modulate({ saturation: 1.1 }))).resize(1770, null, { kernel: 'cubic' }),
};

/** The two most similar disjoint tile pairs of a reference (by mean ΔE). */
export function closestPairs(reference, count = 2) {
  const pairs = [];
  for (let a = 0; a < 25; a++) for (let b = a + 1; b < 25; b++) {
    const ta = reference.labels[a], tb = reference.labels[b];
    if (ta && tb) pairs.push([reference.refDist[a][b], ta, tb]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const used = new Set(), out = [];
  for (const [, ta, tb] of pairs) {
    if (used.has(ta) || used.has(tb)) continue;
    used.add(ta); used.add(tb); out.push([ta, tb]);
    if (out.length === count) break;
  }
  return out;
}

/** Solved board with the given tile pairs swapped (two swaps keep it solvable). */
export function swapped(pairs) {
  const s = [...SOLVED_STATE];
  for (const [a, b] of pairs) { const i = s.indexOf(a), j = s.indexOf(b); [s[i], s[j]] = [s[j], s[i]]; }
  if (!isSolvable(s)) throw new Error('swapped state unsolvable');
  return s;
}

export { scrambledBoard, loadImage };
