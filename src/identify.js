// Automatic puzzle identification: which supported puzzle does a detected
// board show? Each of the 25 cells is sampled once into a small CIELAB
// thumbnail; every reference's 25 tile thumbnails are compared against them
// with a one-to-one (Hungarian) assignment, so a reference only scores well
// if *all* of its tiles are present. A puzzle is selected only when its score
// is good in absolute terms AND clearly better than every other reference;
// otherwise identification fails rather than guessing.

import { resampleRect, linearRgbToLab } from './image.js';
import { solveAssignment } from './hungarian.js';

export const IDENTIFY_DEFAULTS = {
  thumbSize: 12,
  border: 1,
  // Mean ΔE of the best reference must not exceed this (correct puzzles
  // score ~4–6 on test material; other puzzles ~20+).
  maxScore: 12,
  // The runner-up's score must be at least this many times the winner's.
  minRatio: 2.5,
};

/** Small Lab thumbnails of the given cell rectangles (sampled once). */
export function cellThumbnails(img, cells, options = {}) {
  const { thumbSize } = { ...IDENTIFY_DEFAULTS, ...options };
  return cells.map((c) => linearRgbToLab(resampleRect(img, c, thumbSize)));
}

/**
 * @param {Float64Array[]} cellThumbs thumbnails of the screenshot's 25 cells
 * @param {{id:string, idThumbs:Float64Array[]}[]} references
 * @returns {{ ok:boolean, id?:string, code?:string, message?:string,
 *             scores:{id:string, score:number}[], ratio:number }}
 */
export function identifyPuzzle(cellThumbs, references, options = {}) {
  const opts = { ...IDENTIFY_DEFAULTS, ...options };
  const scores = references.map((ref) => {
    const cost = cellThumbs.map((c) => ref.idThumbs.map((r) => meanDeltaE(c, r, opts)));
    const assignment = solveAssignment(cost);
    const total = assignment.reduce((s, j, i) => s + cost[i][j], 0);
    return { id: ref.id, score: round(total / cellThumbs.length) };
  }).sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1));

  const [best, second] = scores;
  // Ratio of runner-up to winner; a perfect tie (both 0) counts as ratio 1.
  const ratio = !second ? Infinity
    : best.score > 0 ? round(second.score / best.score)
      : second.score > 0 ? Infinity : 1;
  const result = { scores, ratio, maxScore: opts.maxScore, minRatio: opts.minRatio };
  if (!best || best.score > opts.maxScore) {
    return { ...result, ok: false, code: 'UNSUPPORTED_PUZZLE', message: `No supported puzzle matches (best ${best?.id} ΔE ${best?.score} > ${opts.maxScore}).` };
  }
  if (second && ratio < opts.minRatio) {
    return { ...result, ok: false, code: 'PUZZLE_AMBIGUOUS', message: `Cannot tell ${best.id} (ΔE ${best.score}) from ${second.id} (ΔE ${second.score}); ratio ${ratio} < ${opts.minRatio}.` };
  }
  return { ...result, ok: true, id: best.id };
}

function meanDeltaE(a, b, { thumbSize: T, border }) {
  let sum = 0, n = 0;
  for (let y = border; y < T - border; y++) {
    for (let x = border; x < T - border; x++) {
      const o = (y * T + x) * 3;
      const dl = a[o] - b[o], da = a[o + 1] - b[o + 1], db = a[o + 2] - b[o + 2];
      sum += Math.sqrt(dl * dl + da * da + db * db);
      n++;
    }
  }
  return sum / n;
}

function round(v) { return Math.round(v * 1000) / 1000; }
