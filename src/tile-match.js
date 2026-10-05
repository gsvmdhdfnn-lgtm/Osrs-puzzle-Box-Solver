// Identifies the 25 board cells (24 tiles + blank) against a clean reference.
//
// Only the cell rectangles produced by board detection are ever sampled, so
// nothing outside the board can influence matching.
//
// 1. Every cell is resampled (area average) to the reference's native tile
//    resolution and converted to CIELAB, so differences are perceptual.
// 2. cost[cell][ref] = mean ΔE76 between them, minimised over a few sub-pixel
//    alignment shifts of the cell rectangle (absorbs grid-measurement error).
// 3. A global optimal one-to-one assignment (Hungarian) maps cells to tiles,
//    so each tile and the blank are used exactly once.
// 4. Some reference tiles are nearly identical (e.g. plain-sky tiles 1 and
//    5). For such "look-alike" pairs, a full-tile average is dominated by the
//    shared pixels, so they are re-decided using only the pixels where the two
//    reference tiles genuinely differ ("discriminative mask"). The decision is
//    made jointly for the two cells involved, and its margin is reported.
//    Before step 3 is final, a global per-channel colour correction (gain +
//    offset in gamma-encoded sRGB, tightly bounded) is fitted from a first
//    matching pass over the picture tiles and all cells are re-matched. This
//    compensates for device colour profiles / brightness without inventing
//    structure. The blank is a flat UI-drawn square whose colour does not
//    follow the picture tiles' rendering (in the test fixture it is brighter
//    than the reference while the picture is darker), so it is excluded from
//    the fit and always compared uncorrected.
// 5. Every cell gets a confidence margin; poor matches are reported, never
//    silently accepted.

import { resampleRect, linearRgbToLab } from './image.js';
import { solveAssignment } from './hungarian.js';

export const MATCH_DEFAULTS = {
  // Alignment shifts in reference-pixel units, applied to the cell rect.
  shifts: [-0.5, 0, 0.5],
  // Global colour correction bounds (gain and offset per sRGB channel).
  colourCorrection: true,
  gainRange: [0.6, 1.6],
  offsetRange: [-0.15, 0.15],
  // Pixels ignored around every tile edge (grid-line bleed).
  border: 1,
  // Two reference tiles whose mean ΔE is below this are treated as look-alikes.
  lookalikeDeltaE: 12,
  // A pixel belongs to a look-alike pair's discriminative mask if the two
  // reference tiles differ there by more than this ΔE.
  maskDeltaE: 10,
  minMaskPixels: 6,
  // A match is rejected outright if its mean ΔE exceeds this. Genuine
  // matches on the test fixture and its variants stay below ~7.
  maxMatchDeltaE: 12,
  // A cell is confident when (second - best) / second ≥ this.
  minMargin: 0.2,
  maxTileSize: 48,
};

/**
 * Builds a reusable reference from a clean solved-board image whose grid has
 * already been detected. Solved order: cell k (row-major) holds tile k+1,
 * and the last cell is the blank (tile 0).
 */
export function buildReference(img, board, options = {}) {
  const opts = { ...MATCH_DEFAULTS, ...options };
  const size = Math.min(opts.maxTileSize, Math.round(Math.min(...board.cells.map((c) => Math.min(c.w, c.h)))));
  const linear = board.cells.map((c) => resampleRect(img, c, size));
  const tiles = linear.map(linearRgbToLab);
  const labels = tiles.map((_, k) => (k + 1) % 25);
  const n = tiles.length;

  // Pairwise reference distances and discriminative masks for look-alikes.
  const refDist = [...Array(n)].map(() => new Float64Array(n));
  const masks = new Map();
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = meanDeltaE(tiles[a], tiles[b], size, opts.border, null);
      refDist[a][b] = refDist[b][a] = d;
      if (d < opts.lookalikeDeltaE) {
        masks.set(pairKey(a, b), discriminativeMask(tiles[a], tiles[b], size, opts));
      }
    }
  }
  return { size, tiles, linear, labels, refDist, masks, board };
}

/**
 * @returns {{ assignment:number[], state:number[], cells:object[], lookalikes:object[],
 *             unresolved:number[][], meanDeltaE:number, worstDeltaE:number, minMargin:number }}
 */
export function matchTiles(img, board, reference, options = {}) {
  const opts = { ...MATCH_DEFAULTS, ...options };
  const { size, tiles: refTiles } = reference;
  const n = refTiles.length;

  // Shifted samples of every cell, at reference resolution (linear RGB).
  const linearVariants = board.cells.map((c) => {
    const sx = c.w / size, sy = c.h / size;
    const out = [];
    for (const dy of opts.shifts) {
      for (const dx of opts.shifts) {
        out.push(resampleRect(img, { x: c.x + dx * sx, y: c.y + dy * sy, w: c.w, h: c.h }, size));
      }
    }
    return out;
  });

  const blankRef = reference.labels.indexOf(0);
  const rawVariants = linearVariants.map((vs) => vs.map(linearRgbToLab));
  let variants = rawVariants;
  // Blank comparisons always use uncorrected colour (see header).
  const variantsFor = (cell, ref) => (ref === blankRef ? rawVariants[cell] : variants[cell]);
  const score = (cell, ref, mask) => {
    let best = Infinity;
    for (const v of variantsFor(cell, ref)) best = Math.min(best, meanDeltaE(v, refTiles[ref], size, opts.border, mask));
    return best;
  };
  const bestVariant = (cell, ref) => {
    let best = Infinity, idx = 0;
    variantsFor(cell, ref).forEach((v, k) => {
      const d = meanDeltaE(v, refTiles[ref], size, opts.border, null);
      if (d < best) { best = d; idx = k; }
    });
    return idx;
  };

  let cost = [...Array(n)].map((_, i) => Array.from({ length: n }, (_, j) => score(i, j, null)));
  let assignment = solveAssignment(cost);

  let colour = null;
  if (opts.colourCorrection) {
    colour = fitColourCorrection(linearVariants, reference.linear, assignment, bestVariant, size, opts, blankRef);
    variants = linearVariants.map((vs) => vs.map((v) => linearRgbToLab(applyColour(v, colour))));
    cost = [...Array(n)].map((_, i) => Array.from({ length: n }, (_, j) => score(i, j, null)));
    assignment = solveAssignment(cost);
  }

  // Joint, mask-based re-decision for every pair of cells holding look-alikes.
  const lookalikes = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = assignment[i], b = assignment[j];
      const mask = reference.masks.get(pairKey(a, b));
      if (!mask) continue;
      const entry = {
        cells: [i, j],
        tiles: [reference.labels[a], reference.labels[b]],
        referenceDeltaE: round(reference.refDist[a][b]),
        maskPixels: mask.count,
      };
      if (mask.count < opts.minMaskPixels) {
        entry.decided = false;
        entry.reason = 'reference tiles have no distinguishing pixels';
        lookalikes.push(entry);
        continue;
      }
      const keep = score(i, a, mask) + score(j, b, mask);
      const swap = score(i, b, mask) + score(j, a, mask);
      if (swap < keep) { assignment[i] = b; assignment[j] = a; }
      const chosen = Math.min(keep, swap), other = Math.max(keep, swap);
      entry.swapped = swap < keep;
      entry.tiles = [reference.labels[assignment[i]], reference.labels[assignment[j]]];
      entry.chosenDeltaE = round(chosen / 2);
      entry.rejectedDeltaE = round(other / 2);
      entry.margin = round(other > 0 ? (other - chosen) / other : 0);
      entry.decided = entry.margin >= opts.minMargin;
      lookalikes.push(entry);
    }
  }

  // Per-cell diagnostics. If the runner-up is a look-alike of the chosen
  // tile, the full-tile margin is meaningless; the discriminative margin
  // against that runner-up is used instead.
  const cells = board.cells.map((c, i) => {
    const a = assignment[i];
    const best = cost[i][a];
    let second = Infinity, secondRef = -1;
    for (let j = 0; j < n; j++) if (j !== a && cost[i][j] < second) { second = cost[i][j]; secondRef = j; }
    const fullMargin = second > 0 ? (second - best) / second : 0;
    const info = {
      row: c.row,
      col: c.col,
      tile: reference.labels[a],
      bestDeltaE: round(best),
      secondTile: reference.labels[secondRef],
      secondDeltaE: round(second),
      fullMargin: round(fullMargin),
      margin: round(fullMargin),
      marginSource: 'full-tile',
    };
    const mask = reference.masks.get(pairKey(a, secondRef));
    if (mask && mask.count >= opts.minMaskPixels) {
      const mBest = score(i, a, mask), mOther = score(i, secondRef, mask);
      info.discriminative = { against: reference.labels[secondRef], maskPixels: mask.count, chosenDeltaE: round(mBest), otherDeltaE: round(mOther) };
      info.margin = round(mOther > 0 ? (mOther - mBest) / mOther : 0);
      info.marginSource = 'discriminative';
    } else if (mask) {
      info.margin = 0;
      info.marginSource = 'indistinguishable';
    }
    info.confident = info.margin >= opts.minMargin && best <= opts.maxMatchDeltaE;
    return info;
  });

  const deltas = cells.map((c) => c.bestDeltaE);
  return {
    tileSize: size,
    colourCorrection: colour && {
      gain: colour.gain.map(round),
      offset: colour.offset.map(round),
      clamped: colour.clamped,
    },
    assignment,
    state: assignment.map((a) => reference.labels[a]),
    cells,
    lookalikes,
    meanDeltaE: round(deltas.reduce((s, v) => s + v, 0) / n),
    worstDeltaE: Math.max(...deltas),
    minMargin: Math.min(...cells.map((c) => c.margin)),
    costMatrix: cost.map((row) => row.map(round)),
  };
}

// Least-squares per-channel gain/offset (in encoded sRGB) mapping the cells
// onto their provisionally assigned reference tiles, clamped to modest bounds.
// `blankRef` (the reference index of the blank) is excluded from the fit.
function fitColourCorrection(cellVariants, refLinear, assignment, bestVariant, size, opts, blankRef) {
  const gain = [1, 1, 1], offset = [0, 0, 0];
  let clamped = false;
  for (let ch = 0; ch < 3; ch++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
    assignment.forEach((ref, cell) => {
      if (ref === blankRef) return;
      const v = cellVariants[cell][bestVariant(cell, ref)];
      const r = refLinear[ref];
      for (let y = opts.border; y < size - opts.border; y++) {
        for (let x = opts.border; x < size - opts.border; x++) {
          const o = (y * size + x) * 3 + ch;
          const a = encode(v[o]), b = encode(r[o]);
          sx += a; sy += b; sxx += a * a; sxy += a * b; cnt++;
        }
      }
    });
    const varX = sxx / cnt - (sx / cnt) ** 2;
    let g = varX > 1e-9 ? (sxy / cnt - (sx / cnt) * (sy / cnt)) / varX : 1;
    const gc = Math.min(opts.gainRange[1], Math.max(opts.gainRange[0], g));
    let o = sy / cnt - gc * (sx / cnt);
    const oc = Math.min(opts.offsetRange[1], Math.max(opts.offsetRange[0], o));
    if (gc !== g || oc !== o) clamped = true;
    gain[ch] = gc; offset[ch] = oc;
  }
  return { gain, offset, clamped };
}

function applyColour(tile, { gain, offset }) {
  const out = new Float64Array(tile.length);
  for (let i = 0; i < tile.length; i++) {
    const ch = i % 3;
    out[i] = decode(Math.min(1, Math.max(0, encode(tile[i]) * gain[ch] + offset[ch])));
  }
  return out;
}

function encode(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; }
function decode(c) { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }

function discriminativeMask(ta, tb, size, opts) {
  const bits = new Uint8Array(size * size);
  let count = 0;
  for (let y = opts.border; y < size - opts.border; y++) {
    for (let x = opts.border; x < size - opts.border; x++) {
      const k = y * size + x;
      if (deltaE(ta, tb, k * 3) > opts.maskDeltaE) { bits[k] = 1; count++; }
    }
  }
  return { bits, count };
}

function meanDeltaE(ta, tb, size, border, mask) {
  let sum = 0, cnt = 0;
  for (let y = border; y < size - border; y++) {
    for (let x = border; x < size - border; x++) {
      const k = y * size + x;
      if (mask && !mask.bits[k]) continue;
      sum += deltaE(ta, tb, k * 3);
      cnt++;
    }
  }
  return cnt ? sum / cnt : Infinity;
}

function deltaE(ta, tb, o) {
  const dl = ta[o] - tb[o], da = ta[o + 1] - tb[o + 1], db = ta[o + 2] - tb[o + 2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

function pairKey(a, b) { return a < b ? `${a},${b}` : `${b},${a}`; }
function round(v) { return Math.round(v * 1000) / 1000; }
