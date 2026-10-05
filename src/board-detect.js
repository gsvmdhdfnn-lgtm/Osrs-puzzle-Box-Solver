// Locates the 5×5 puzzle grid in an arbitrary screenshot.
//
// Strategy: the board's most distinctive structure is its 4 internal vertical
// and 4 internal horizontal grid lines — thin, warm dark brown, perfectly parallel,
// equally spaced, each about 5 tiles long, and crossing one another. We:
//   1. build a "line colour" mask (dark warm brown, so dark grey/black/blue
//      artwork is not mistaken for grid lines),
//   2. collect long straight runs of that mask per column (vertical) and per
//      row (horizontal) and merge adjacent runs into line candidates,
//   3. search for 4 equally spaced vertical candidates and 4 equally spaced
//      horizontal candidates with the same spacing that cross each other,
//   4. verify the hypothesis (line darkness, outer frame present, regularity)
//      and turn it into a confidence score.
// Nothing about the position, scale or blank location is assumed. Several
// darkness thresholds are tried so colour/compression variation is tolerated.

const MAX_GAP = 2;

const DEFAULTS = {
  darkThresholds: [60, 80, 100, 120],
  minConfidence: 0.6,
};

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} img
 * @returns {{ok:true, rect, cells, pitch, lineWidth, confidence, scores, threshold, attempts}
 *          | {ok:false, reason:string, confidence:number, attempts}}
 */
export function detectBoard(img, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const attempts = [];
  let best = null;
  for (const t of opts.darkThresholds) {
    const r = detectWithThreshold(img, t);
    attempts.push(r ? { threshold: t, confidence: round(r.confidence), scores: r.scores } : { threshold: t, confidence: 0, scores: null });
    if (r && (!best || r.confidence > best.confidence)) best = r;
  }
  if (!best) {
    return { ok: false, reason: 'No regular 5×5 grid of dark lines was found in the image.', confidence: 0, attempts };
  }
  if (best.confidence < opts.minConfidence) {
    return {
      ok: false,
      reason: `A grid-like structure was found but board-detection confidence ${round(best.confidence)} is below ${opts.minConfidence}.`,
      confidence: best.confidence,
      candidate: best.rect,
      attempts,
    };
  }
  const edges = refineEdges(img, best);
  const { xs, ys, ...rest } = best;
  return { ok: true, ...rest, edges, cells: cellsFromEdges(edges), attempts };
}

// Sub-pixel tile boundaries. The mask-based line positions are threshold
// dependent (anti-aliased line edges come and go), so each boundary is
// re-measured on a luminance profile taken across it and averaged along the
// whole board: a tile edge is where the profile crosses halfway between the
// line/frame darkness and the adjacent tile brightness.
// Returns { x: [[left,right] of each column], y: [[top,bottom] of each row] }.
function refineEdges(img, best) {
  const { xs, ys, pitch, lineWidth } = best;
  const p = (pitch.x + pitch.y) / 2;
  const profX = luminanceProfile(img, true, xs[0] - 0.3 * p, xs[5] + 0.3 * p, ys[0], ys[5]);
  const profY = luminanceProfile(img, false, ys[0] - 0.3 * p, ys[5] + 0.3 * p, xs[0], xs[5]);
  // Line-colour profiles (255 = no line-coloured pixels, 0 = all), used where
  // the artwork is as dark as the grid lines and luminance cannot separate them.
  const mask = darkMask(img, best.threshold);
  const lineX = maskProfile(mask, img, true, xs[0] - 0.3 * p, xs[5] + 0.3 * p, ys[0], ys[5]);
  const lineY = maskProfile(mask, img, false, ys[0] - 0.3 * p, ys[5] + 0.3 * p, xs[0], xs[5]);
  return {
    x: tileSpans([profX, lineX], xs, p, lineWidth),
    y: tileSpans([profY, lineY], ys, p, lineWidth),
  };
}

// Mean luminance per column (vertical=true) or per row over [a,b] × [c,d].
function luminanceProfile(img, vertical, a, b, c, d) {
  const { width: W, height: H, data } = img;
  const lo = Math.max(0, Math.floor(a)), hi = Math.min((vertical ? W : H) - 1, Math.ceil(b));
  const c0 = Math.max(0, Math.ceil(c)), c1 = Math.min((vertical ? H : W) - 1, Math.floor(d));
  const values = new Float64Array(hi - lo + 1);
  for (let o = lo; o <= hi; o++) {
    let sum = 0;
    for (let i = c0; i <= c1; i++) {
      const q = (vertical ? i * W + o : o * W + i) * 4;
      sum += 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
    }
    values[o - lo] = sum / (c1 - c0 + 1);
  }
  return { lo, values, at: (x) => values[Math.min(values.length - 1, Math.max(0, x - lo))] };
}

function maskProfile(mask, img, vertical, a, b, c, d) {
  const { width: W, height: H } = img;
  const lo = Math.max(0, Math.floor(a)), hi = Math.min((vertical ? W : H) - 1, Math.ceil(b));
  const c0 = Math.max(0, Math.ceil(c)), c1 = Math.min((vertical ? H : W) - 1, Math.floor(d));
  const values = new Float64Array(hi - lo + 1);
  for (let o = lo; o <= hi; o++) {
    let sum = 0;
    for (let i = c0; i <= c1; i++) sum += mask[vertical ? i * W + o : o * W + i];
    values[o - lo] = 255 * (1 - sum / (c1 - c0 + 1));
  }
  return { lo, values, at: (x) => values[Math.min(values.length - 1, Math.max(0, x - lo))] };
}

// Prefer luminance (sub-pixel accurate on anti-aliased edges); use the
// line-colour profile when the tile next to the line is not clearly brighter.
function pickProfile([lum, line], mid, lineAt, p, lineWidth, dir) {
  const r = Math.max(1, Math.round(Math.max(lineWidth, 0.06 * p) / 2));
  let core = Infinity;
  for (let x = Math.round(lineAt) - r; x <= Math.round(lineAt) + r; x++) core = Math.min(core, lum.at(x));
  const band = [];
  for (let t = 0.1; t <= 0.3; t += 0.02) band.push(lum.at(Math.round(lineAt - dir * t * p)));
  band.sort((u, v) => u - v);
  return band[band.length >> 1] - core >= 15 ? lum : line;
}

function tileSpans(profs, centres, p, lineWidth) {
  const prof = { pick: (mid, line, dir) => pickProfile(profs, mid, line, p, lineWidth, dir) };
  const spans = [];
  for (let k = 0; k < 5; k++) {
    const startLine = centres[k], endLine = centres[k + 1];
    const mid = (startLine + endLine) / 2;
    spans.push([
      edgeFrom(prof.pick(mid, startLine, -1), mid, startLine, p, lineWidth, -1),
      edgeFrom(prof.pick(mid, endLine, +1), mid, endLine, p, lineWidth, +1),
    ]);
  }
  return spans;
}

// Locate the tile edge next to the boundary line at `line` (dir = +1 when the
// line lies after the tile, -1 when before). The edge is the steepest
// tile→line luminance drop near the mask-based estimate, refined to sub-pixel
// precision with a parabola; steepest-drop is used rather than a half-level
// crossing because tile art may itself darken gradually towards the frame.
// Falls back to the mask estimate if there is no clear edge.
function edgeFrom(prof, mid, line, p, lineWidth, dir) {
  const fallback = line - dir * lineWidth / 2;
  const reach = Math.max(2, Math.round(0.06 * p));
  // drop(b): luminance step across pixel boundary b, positive when the
  // line side is darker.
  const drop = (b) => (dir > 0 ? prof.at(b - 1) - prof.at(b) : prof.at(b) - prof.at(b - 1));
  let bestB = -1, bestD = -Infinity;
  for (let b = Math.round(fallback) - reach; b <= Math.round(fallback) + reach; b++) {
    if (dir > 0 ? b > mid + 1 : b < mid - 1) {
      const d = drop(b);
      if (d > bestD) { bestD = d; bestB = b; }
    }
  }
  if (bestB < 0 || bestD < 6) return fallback;
  const l = drop(bestB - 1), r = drop(bestB + 1);
  const denom = l - 2 * bestD + r;
  const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * denom))) : 0;
  return bestB + offset;
}

function cellsFromEdges(edges) {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const [x0, x1] = edges.x[c], [y0, y1] = edges.y[r];
      cells.push({ row: r, col: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return cells;
}

function detectWithThreshold(img, threshold) {
  const { width: W, height: H } = img;
  const mask = darkMask(img, threshold);
  const minRun = Math.max(16, Math.round(0.06 * Math.min(W, H)));

  const vLines = lineCandidates(mask, W, H, minRun, true);
  const hLines = lineCandidates(mask, W, H, minRun, false);

  const vQuads = equallySpacedQuads(vLines);
  const hQuads = equallySpacedQuads(hLines);
  if (!vQuads.length || !hQuads.length) return null;

  let best = null;
  for (const vq of vQuads) {
    for (const hq of hQuads) {
      const geo = pairQuads(vq, hq);
      if (!geo) continue;
      const scored = scoreGeometry(mask, W, H, geo);
      if (!best || scored.confidence > best.confidence) best = scored;
    }
  }
  if (!best) return null;
  best.threshold = threshold;
  return best;
}

// Grid lines and frame are a dark, warm brown. Accept dark pixels that are
// not clearly blue (red channel at least roughly as strong as blue).
function darkMask(img, threshold) {
  const { width, height, data } = img;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    // Warm brown: dark, red ≥ green, and clearly less blue than red. Neutral
    // or bluish dark artwork (grey stone, black fur, night sky) is excluded.
    if (r <= threshold && g <= threshold && b <= threshold && g <= r + 4 && r - b >= 16) mask[i] = 1;
  }
  return mask;
}

// Long straight runs of mask pixels, grouped across neighbouring
// columns (vertical) or rows (horizontal) when their extents agree.
// Returned candidate: { pos (centre across the line), width, start, end, len }.
function lineCandidates(mask, W, H, minRun, vertical) {
  const outer = vertical ? W : H;
  const inner = vertical ? H : W;
  const at = vertical ? (o, i) => mask[i * W + o] : (o, i) => mask[o * W + i];
  const finished = [];
  let open = [];
  for (let o = 0; o < outer; o++) {
    // Runs of mask pixels; gaps of up to MAX_GAP pixels (compression noise
    // inside a line) are bridged.
    const runs = [];
    let s = -1, last = -1;
    for (let i = 0; i <= inner; i++) {
      const on = i < inner && at(o, i);
      if (on) {
        if (s < 0) s = i;
        last = i;
      } else if (s >= 0 && i - last > MAX_GAP) {
        if (last - s + 1 >= minRun) runs.push([s, last]);
        s = -1;
      }
    }
    if (s >= 0 && last - s + 1 >= minRun) runs.push([s, last]);
    const next = [];
    for (const [a, b] of runs) {
      const len = b - a + 1;
      const tol = Math.max(3, 0.03 * len);
      let g = null;
      for (const cand of open) {
        if (Math.abs(cand.a - a) <= tol && Math.abs(cand.b - b) <= tol) { g = cand; break; }
      }
      if (g) {
        open.splice(open.indexOf(g), 1);
        g.last = o; g.n++; g.sumPos += o; g.as.push(a); g.bs.push(b);
        next.push(g);
      } else {
        next.push({ first: o, last: o, n: 1, sumPos: o, a, b, as: [a], bs: [b] });
      }
    }
    finished.push(...open);
    open = next;
  }
  finished.push(...open);
  return finished.map((g) => {
    const start = median(g.as), end = median(g.bs);
    return { pos: g.sumPos / g.n, width: g.n, start, end, len: end - start + 1 };
  }).sort((p, q) => p.pos - q.pos);
}

// All sets of 4 thin, parallel candidates with equal spacing p whose extents
// agree and whose length is consistent with spanning 5 tiles (+ frame).
function equallySpacedQuads(lines) {
  const quads = [];
  const thin = lines.filter((l) => l.width * 12 <= l.len);
  const sameExtent = (p, q) => {
    const tol = 0.06 * Math.max(p.len, q.len) + 2;
    return Math.abs(p.start - q.start) <= tol && Math.abs(p.end - q.end) <= tol;
  };
  for (let i = 0; i < thin.length; i++) {
    for (let j = i + 1; j < thin.length; j++) {
      const p = thin[j].pos - thin[i].pos;
      if (p < 8) continue;
      if (!sameExtent(thin[i], thin[j])) continue;
      const tol = Math.max(1.5, 0.03 * p);
      const third = thin.filter((l) => Math.abs(l.pos - (thin[j].pos + p)) <= tol && sameExtent(thin[i], l));
      for (const k of third) {
        const fourth = thin.filter((l) => Math.abs(l.pos - (k.pos + p)) <= tol && sameExtent(thin[i], l));
        for (const l of fourth) {
          const q = [thin[i], thin[j], k, l];
          const pitch = (l.pos - thin[i].pos) / 3;
          const len = median(q.map((x) => x.len));
          if (len < 4.6 * pitch || len > 7 * pitch) continue;
          quads.push({ lines: q, pitch, start: median(q.map((x) => x.start)), end: median(q.map((x) => x.end)) });
        }
      }
    }
  }
  return quads;
}

// Combine a vertical and a horizontal quad into a board hypothesis if they
// share a pitch and actually cross each other in the expected places.
function pairQuads(vq, hq) {
  const px = vq.pitch, py = hq.pitch;
  if (Math.abs(px - py) > 0.06 * Math.max(px, py)) return null;
  const xs = vq.lines.map((l) => l.pos);
  const ys = hq.lines.map((l) => l.pos);
  const left = xs[0] - px, right = xs[3] + px;
  const top = ys[0] - py, bottom = ys[3] + py;
  const tol = 0.35 * Math.max(px, py);
  // Vertical lines must run from (about) the top frame to the bottom frame,
  // horizontal ones from the left frame to the right frame.
  if (vq.start > top + tol || vq.end < bottom - tol) return null;
  if (hq.start > left + tol || hq.end < right - tol) return null;
  if (vq.start < top - 1.5 * py || vq.end > bottom + 1.5 * py) return null;
  if (hq.start < left - 1.5 * px || hq.end > right + 1.5 * px) return null;
  const lineWidth = median([...vq.lines, ...hq.lines].map((l) => l.width));
  return { xs: [left, ...xs, right], ys: [top, ...ys, bottom], px, py, lineWidth };
}

function scoreGeometry(mask, W, H, geo) {
  const { xs, ys, px, py, lineWidth } = geo;
  const pitch = (px + py) / 2;

  // Regularity of the internal spacing.
  // One pixel of slack absorbs quantisation on small (e.g. reference) images.
  const err = (d, p) => Math.max(0, Math.abs(d - p) - 1) / p;
  const dev = Math.max(...[1, 2, 3].map((k) => err(xs[k + 1] - xs[k], px)),
    ...[1, 2, 3].map((k) => err(ys[k + 1] - ys[k], py)));
  const regularity = clamp01(1 - dev / 0.06);
  const squareness = clamp01(1 - Math.abs(px - py) / pitch / 0.06);

  // Every one of the 6+6 boundary lines (4 internal + 2 frame edges each way)
  // should be dark along its whole length between the outer boundaries.
  // The outer frame edge is extrapolated, and the frame has a bevel, so it
  // gets a slightly wider search window than the measured internal lines.
  const lineDark = [];
  const reach = (k) => (k === 0 || k === 5 ? Math.max(1, Math.round(0.08 * pitch)) : 1);
  for (let k = 0; k < 6; k++) lineDark.push(sampleLine(mask, W, H, xs[k], ys[0], ys[5], true, reach(k)));
  for (let k = 0; k < 6; k++) lineDark.push(sampleLine(mask, W, H, ys[k], xs[0], xs[5], false, reach(k)));
  const internal = [1, 2, 3, 4, 7, 8, 9, 10].map((k) => lineDark[k]);
  const frame = [0, 5, 6, 11].map((k) => lineDark[k]);
  const internalLines = clamp01((Math.min(...internal) - 0.6) / 0.35);
  const frameEdges = clamp01((Math.min(...frame) - 0.6) / 0.35);

  // Tile interiors should mostly *not* be line-coloured (only the blank is).
  let solidTiles = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const f = darkFraction(mask, W, H, xs[c] + 0.2 * px, ys[r] + 0.2 * py, xs[c + 1] - 0.2 * px, ys[r + 1] - 0.2 * py);
      if (f > 0.9) solidTiles++;
    }
  }
  const tileContent = solidTiles <= 1 ? 1 : clamp01(1 - (solidTiles - 1) / 4);

  const scores = {
    regularity: round(regularity),
    squareness: round(squareness),
    internalLines: round(internalLines),
    frameEdges: round(frameEdges),
    tileContent: round(tileContent),
  };
  const confidence = Math.min(regularity, squareness, internalLines, frameEdges, tileContent);

  return {
    confidence,
    scores,
    rect: { x: xs[0], y: ys[0], w: xs[5] - xs[0], h: ys[5] - ys[0] },
    gridX: xs.map(round),
    gridY: ys.map(round),
    pitch: { x: round(px), y: round(py) },
    lineWidth,
    xs,
    ys,
  };
}

// Fraction of mask pixels along a line at `pos` from a..b. To tolerate
// sub-pixel error, each sample takes the best pixel within ±reach across.
function sampleLine(mask, W, H, pos, a, b, vertical, reach) {
  let hit = 0, total = 0;
  const p0 = Math.round(pos);
  for (let t = Math.ceil(a); t <= Math.floor(b); t++) {
    let on = 0;
    for (let d = -reach; d <= reach; d++) {
      const x = vertical ? p0 + d : t;
      const y = vertical ? t : p0 + d;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (mask[y * W + x]) { on = 1; break; }
    }
    hit += on; total++;
  }
  return total ? hit / total : 0;
}

function darkFraction(mask, W, H, x0, y0, x1, y1) {
  let hit = 0, total = 0;
  for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(H - 1, Math.floor(y1)); y++) {
    for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++) {
      hit += mask[y * W + x]; total++;
    }
  }
  return total ? hit / total : 0;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function round(v) { return Math.round(v * 1000) / 1000; }
