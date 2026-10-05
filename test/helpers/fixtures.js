// Shared test fixtures and image manipulation helpers (test-only).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { loadImage } from './load-image.js';
import { prepareReference } from '../../src/recognize.js';
import { REFERENCES } from '../../src/references.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCREENSHOT = path.join(root, 'test/fixtures/tree-mobile-img0120.png');
export const REFERENCE = path.join(root, REFERENCES.tree.src);

// Test oracle for IMG_0120 (row-major, 0 = blank). Only used for assertions.
export const EXPECTED_STATE = [
  1, 8, 2, 4, 0,
  11, 6, 3, 9, 5,
  22, 12, 19, 14, 10,
  21, 7, 13, 24, 15,
  17, 16, 18, 23, 20,
];

let refPromise;
export function tree() {
  refPromise ??= loadImage(REFERENCE).then((img) => prepareReference(img));
  return refPromise;
}

export function screenshot() {
  return loadImage(SCREENSHOT);
}

export { sharp, loadImage };

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

// Integer pixel box safely inside a (fractional) cell rectangle.
export function cellBox(cell) {
  const x0 = Math.ceil(cell.x), y0 = Math.ceil(cell.y);
  return { x0, y0, x1: Math.floor(cell.x + cell.w), y1: Math.floor(cell.y + cell.h) };
}

/**
 * Rearranges real tile pixels: target cell k receives the content of source
 * cell perm[k]. Returns the new image (grid lines untouched).
 */
export function permuteCells(img, cells, perm) {
  const out = cloneImage(img);
  const boxes = cells.map(cellBox);
  const w = Math.min(...boxes.map((b) => b.x1 - b.x0));
  const h = Math.min(...boxes.map((b) => b.y1 - b.y0));
  perm.forEach((src, dst) => {
    const s = boxes[src], d = boxes[dst];
    for (let y = 0; y < h; y++) {
      const so = ((s.y0 + y) * img.width + s.x0) * 4;
      const dO = ((d.y0 + y) * img.width + d.x0) * 4;
      out.data.set(img.data.subarray(so, so + w * 4), dO);
    }
  });
  return out;
}

export function fillRect(img, x0, y0, x1, y1, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
      const p = (y * img.width + x) * 4;
      img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
    }
  }
}

// Deterministic PRNG for reproducible "random" inputs.
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sharpFromImage(img) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
}
