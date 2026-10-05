// Top-level recognition pipeline: screenshot → validated 5×5 board state.
// Pure logic; no DOM access. Presentation code only consumes the result.

import { detectBoard } from './board-detect.js';
import { buildReference, matchTiles, MATCH_DEFAULTS } from './tile-match.js';
import { validatePermutation, isSolvable, countInversions, toGrid } from './puzzle-state.js';
import { cellThumbnails, identifyPuzzle } from './identify.js';

/**
 * Prepare a reference from a clean, solved puzzle image. The reference's grid
 * is located with the same detector used for screenshots, so any clean image
 * of the solved board (lossy WebP today, lossless PNG later) works unchanged.
 */
export function prepareReference(referenceImage, options = {}) {
  const board = detectBoard(referenceImage, options.detect);
  if (!board.ok) {
    throw new Error(`Reference image${options.id ? ` '${options.id}'` : ''}: ${board.reason}`);
  }
  const reference = buildReference(referenceImage, board, options.match);
  reference.id = options.id ?? null;
  reference.idThumbs = cellThumbnails(referenceImage, board.cells, options.identify);
  return reference;
}

/**
 * Detects the board once, identifies which supported puzzle it shows, then
 * runs full tile recognition against that puzzle's reference only.
 * @param references prepared references, each with a stable `id`
 * @returns the same shape as recognizePuzzle plus `puzzleId` (null on failure
 *          before a puzzle was selected) and `diagnostics.identification`.
 */
export function recognizeAnyPuzzle(screenshot, references, options = {}) {
  const t0 = now();
  const board = detectBoard(screenshot, options.detect);
  const t1 = now();
  if (!board.ok) {
    const diagnostics = {
      image: { width: screenshot.width, height: screenshot.height },
      boardDetection: summariseBoard(board),
      timingsMs: { detect: t1 - t0 },
    };
    return { ...fail('BOARD_NOT_FOUND', board.reason, diagnostics), puzzleId: null };
  }

  const identification = identifyPuzzle(cellThumbnails(screenshot, board.cells, options.identify), references, options.identify);
  const t2 = now();
  if (!identification.ok) {
    const diagnostics = {
      image: { width: screenshot.width, height: screenshot.height },
      boardDetection: summariseBoard(board),
      identification,
      timingsMs: { detect: round(t1 - t0), identify: round(t2 - t1) },
    };
    return { ...fail(identification.code, identification.message, diagnostics), puzzleId: null };
  }

  const reference = references.find((r) => r.id === identification.id);
  const result = recognizeOnBoard(screenshot, board, reference, options, t1 - t0);
  result.diagnostics.identification = identification;
  result.diagnostics.timingsMs.identify = round(t2 - t1);
  return { ...result, puzzleId: identification.id };
}

/**
 * @returns {{
 *   ok: boolean,
 *   state: number[]|null,       // row-major, 0 = blank (only when ok)
 *   grid: number[][]|null,
 *   error?: { code: string, message: string },
 *   diagnostics: object,
 * }}
 */
export function recognizePuzzle(screenshot, reference, options = {}) {
  const t0 = now();
  const board = detectBoard(screenshot, options.detect);
  const t1 = now();
  if (!board.ok) {
    const diagnostics = {
      image: { width: screenshot.width, height: screenshot.height },
      boardDetection: summariseBoard(board),
      timingsMs: { detect: t1 - t0 },
    };
    return fail('BOARD_NOT_FOUND', board.reason, diagnostics);
  }
  return recognizeOnBoard(screenshot, board, reference, options, t1 - t0);
}

// Full tile recognition and validation on an already-detected board.
function recognizeOnBoard(screenshot, board, reference, options, detectMs) {
  const matchOpts = { ...MATCH_DEFAULTS, ...options.match };
  const diagnostics = {
    image: { width: screenshot.width, height: screenshot.height },
    boardDetection: summariseBoard(board),
  };

  const t1 = now();
  const match = matchTiles(screenshot, board, reference, matchOpts);
  const t2 = now();
  diagnostics.timingsMs = { detect: round(detectMs), match: round(t2 - t1) };
  diagnostics.tiles = {
    tileSize: match.tileSize,
    colourCorrection: match.colourCorrection,
    meanDeltaE: match.meanDeltaE,
    worstDeltaE: match.worstDeltaE,
    minMargin: match.minMargin,
    cells: match.cells,
    lookalikePairs: match.lookalikes,
  };

  let state = match.state;
  const candidate = { state, grid: toGrid(state) };
  diagnostics.candidate = candidate;

  // 1. Every cell must actually resemble its tile.
  const poor = match.cells.filter((c) => c.bestDeltaE > matchOpts.maxMatchDeltaE);
  if (poor.length) {
    return fail('POOR_MATCH',
      `${poor.length} cell(s) do not resemble any reference tile (worst ΔE ${Math.max(...poor.map((c) => c.bestDeltaE))} > ${matchOpts.maxMatchDeltaE}). ` +
      'The image may not show this puzzle, or the board is obscured.', diagnostics);
  }

  // 2. Ambiguity. Cells whose margin is below the minimum are unresolved.
  //    Image evidence must settle everything except at most one swappable
  //    pair; only that single remaining pair may be decided by solvability
  //    (a swap of two tiles always flips solvability, so exactly one of the
  //    two orderings is reachable).
  const weak = match.cells.map((c, i) => (c.margin < matchOpts.minMargin ? i : -1)).filter((i) => i >= 0);
  let resolvedBy = 'image';
  if (weak.length) {
    const pair = weak.length === 2 && isMutualPair(match, weak[0], weak[1]);
    if (!pair) {
      diagnostics.ambiguousCells = weak;
      return fail('AMBIGUOUS',
        `Recognition is not confident for ${weak.length} cell(s) (minimum margin ${match.minMargin} < ${matchOpts.minMargin}); refusing to guess.`,
        diagnostics);
    }
    const [i, j] = weak;
    const swapped = [...state];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    if (!isSolvable(state) && isSolvable(swapped)) state = swapped;
    resolvedBy = 'solvability (one ambiguous pair)';
    diagnostics.ambiguousCells = weak;
  }

  // 3. Validation.
  const perm = validatePermutation(state);
  if (!perm.ok) return fail('INVALID_STATE', perm.reason, diagnostics);
  const solvable = isSolvable(state);
  diagnostics.validation = { permutation: true, inversions: countInversions(state), solvable, resolvedBy };
  if (!solvable) {
    return fail('UNSOLVABLE',
      'The recognised arrangement is not reachable from the solved puzzle, so at least one tile must have been misidentified.',
      diagnostics);
  }

  diagnostics.boardConfidence = round(Math.min(board.confidence, marginConfidence(match.minMargin, matchOpts.minMargin)));
  return { ok: true, state, grid: toGrid(state), diagnostics };
}

// Map the weakest tile margin onto 0..1 where the acceptance threshold is 0.5.
function marginConfidence(margin, min) {
  return Math.max(0, Math.min(1, margin / (2 * min)));
}

function isMutualPair(match, i, j) {
  const ci = match.cells[i], cj = match.cells[j];
  return ci.secondTile === cj.tile && cj.secondTile === ci.tile;
}

function summariseBoard(board) {
  if (!board.ok) {
    return { ok: false, reason: board.reason, confidence: round(board.confidence ?? 0), candidate: board.candidate ?? null, attempts: board.attempts };
  }
  return {
    ok: true,
    confidence: round(board.confidence),
    scores: board.scores,
    rect: mapRound(board.rect),
    pitch: board.pitch,
    lineWidth: board.lineWidth,
    threshold: board.threshold,
    edges: { x: board.edges.x.map((e) => e.map(round)), y: board.edges.y.map((e) => e.map(round)) },
    cells: board.cells.map(mapRound),
    attempts: board.attempts,
  };
}

function fail(code, message, diagnostics) {
  return { ok: false, state: null, grid: null, error: { code, message }, diagnostics };
}

function mapRound(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v]));
}
function round(v) { return Math.round(v * 1000) / 1000; }
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
