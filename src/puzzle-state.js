// Board-state validation for a 5×5 sliding puzzle. A state is a row-major
// array of 25 numbers: tiles 1..24 and 0 for the blank. Solved order is
// 1..24 followed by the blank.

export const SIZE = 5;

/** Checks that the state contains each of 0..24 exactly once. */
export function validatePermutation(state) {
  const n = SIZE * SIZE;
  if (!Array.isArray(state) || state.length !== n) {
    return { ok: false, reason: `Expected ${n} cells, got ${state?.length}.` };
  }
  const seen = new Array(n).fill(0);
  for (const v of state) {
    if (!Number.isInteger(v) || v < 0 || v >= n) return { ok: false, reason: `Invalid tile value ${v}.` };
    seen[v]++;
  }
  const missing = [], duplicated = [];
  seen.forEach((c, v) => { if (c === 0) missing.push(v); if (c > 1) duplicated.push(v); });
  if (missing.length || duplicated.length) {
    return { ok: false, reason: `Tiles missing: [${missing}] duplicated: [${duplicated}].`, missing, duplicated };
  }
  return { ok: true };
}

/** Number of pairs of tiles (ignoring the blank) that are out of order. */
export function countInversions(state) {
  const tiles = state.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inv++;
  }
  return inv;
}

/**
 * Solvability for an N×N sliding puzzle whose goal has the blank last.
 * Every move preserves (inversions + blank row distance × (N-1)) parity; for
 * odd N a vertical move changes inversions by an even amount (N-1 tiles
 * jumped), so the blank's row is irrelevant and the inversion count must be
 * even. For even N the blank's row from the bottom also contributes.
 */
export function isSolvable(state, size = SIZE) {
  const inv = countInversions(state);
  if (size % 2 === 1) return inv % 2 === 0;
  const blankRowFromBottom = size - Math.floor(state.indexOf(0) / size);
  return (inv + blankRowFromBottom) % 2 === 1;
}

export function toGrid(state, size = SIZE) {
  const rows = [];
  for (let r = 0; r < size; r++) rows.push(state.slice(r * size, (r + 1) * size));
  return rows;
}

/** The canonical solved state: 1..24 then the blank. */
export const SOLVED_STATE = Object.freeze([...Array(SIZE * SIZE - 1)].map((_, i) => i + 1).concat(0));

export function isSolved(state) {
  return state.length === SOLVED_STATE.length && state.every((v, i) => v === SOLVED_STATE[i]);
}

/** True when `tile` is orthogonally adjacent to the blank. */
export function isLegalTap(state, tile, size = SIZE) {
  if (!Number.isInteger(tile) || tile <= 0) return false;
  const t = state.indexOf(tile), b = state.indexOf(0);
  if (t < 0 || b < 0) return false;
  const dr = Math.abs(Math.floor(t / size) - Math.floor(b / size));
  const dc = Math.abs((t % size) - (b % size));
  return dr + dc === 1;
}

/**
 * Taps `tile`, sliding it into the blank. Returns a new state; throws if the
 * tap is not legal so callers can never silently apply an impossible move.
 */
export function applyTap(state, tile, size = SIZE) {
  if (!isLegalTap(state, tile, size)) {
    throw new Error(`Illegal tap: tile ${tile} is not adjacent to the blank.`);
  }
  const next = [...state];
  const t = next.indexOf(tile), b = next.indexOf(0);
  next[b] = tile;
  next[t] = 0;
  return next;
}
