// 5×5 sliding-puzzle solver producing a tap sequence (tile numbers).
//
// Strategy: staged exact search. Tiles are placed in small groups; each
// stage is solved *optimally for that stage* by breadth-first search over an
// abstract state holding only the blank and that stage's tiles (all other
// unlocked tiles are interchangeable), then those tiles are locked:
//
//   1. 1 2 3          2. 4 5 (a row/column's last two tiles must be placed
//   3. 6 11 16 21        together, or the final corner is unreachable)
//   4. 7 8 9 10       5. 12 17 22
//   6. remaining 3×3 — solved optimally with IDA* (Manhattan + linear
//      conflict; at most 31 moves)
//
// The whole plan is run twice — as written ("rows-first") and on the
// transposed board ("columns-first") — and the shorter result is returned
// (ties → rows-first). Every stage's state space is bounded in advance
// (largest: 20^5 ≈ 3.2M states), so runtime and memory are predictable and
// there is no time-based cut-off: identical input always gives identical
// output. No lookup tables, no dependencies, no I/O.

import { SIZE, validatePermutation, isSolvable } from './puzzle-state.js';

const N = SIZE * SIZE;

const PLAN = [
  [1, 2, 3],
  [4, 5],
  [6, 11, 16, 21],
  [7, 8, 9, 10],
  [12, 17, 22],
];
const FINAL = [13, 14, 15, 18, 19, 20, 23, 24];

// Goal cell of a tile (blank's goal is the last cell).
const goalOf = (t) => (t === 0 ? N - 1 : t - 1);

const NEIGHBOURS = [...Array(N)].map((_, i) => {
  const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
});

// Transposition maps the board onto itself with rows and columns swapped.
// It is an involution on cells and on tile numbers (blank stays 0).
const transposeCell = (i) => (i % SIZE) * SIZE + Math.floor(i / SIZE);
const transposeTile = (t) => (t === 0 ? 0 : transposeCell(t - 1) + 1);
const transposeState = (s) => {
  const out = new Array(N);
  for (let i = 0; i < N; i++) out[transposeCell(i)] = transposeTile(s[i]);
  return out;
};

/**
 * @param {number[]} state row-major, 25 entries, tiles 1..24 and 0 = blank
 * @returns {{ ok: true, taps: number[], length: number, orientation: string,
 *             candidates: object, timingsMs: object, peakBufferBytes: number }
 *         | { ok: false, error: { code: string, message: string } }}
 */
export function solvePuzzle(state) {
  const perm = validatePermutation(state);
  if (!perm.ok) return { ok: false, error: { code: 'INVALID_STATE', message: perm.reason } };
  if (!isSolvable(state)) {
    return {
      ok: false,
      error: { code: 'UNSOLVABLE', message: 'This arrangement cannot be reached from the solved puzzle (odd number of inversions).' },
    };
  }

  const t0 = now();
  const rows = solveWithPlan(state);
  const t1 = now();
  const colsRaw = solveWithPlan(transposeState(state));
  const t2 = now();
  const cols = { ...colsRaw, taps: colsRaw.taps.map(transposeTile) };

  const pick = cols.taps.length < rows.taps.length ? cols : rows;
  const orientation = pick === rows ? 'rows-first' : 'columns-first';
  return {
    ok: true,
    taps: pick.taps,
    length: pick.taps.length,
    orientation,
    candidates: {
      'rows-first': summary(rows),
      'columns-first': summary(cols),
    },
    timingsMs: { rowsFirst: round(t1 - t0), columnsFirst: round(t2 - t1), total: round(t2 - t0) },
    peakBufferBytes: Math.max(rows.peakBufferBytes, cols.peakBufferBytes),
  };
}

function summary(r) {
  return { length: r.taps.length, cancelledTaps: r.cancelledTaps, stages: r.stages };
}

// Runs the staged plan on one orientation. Returns taps (tile numbers).
function solveWithPlan(state) {
  const board = Int8Array.from(state);
  const locked = new Uint8Array(N);
  const raw = [];
  const stages = [];
  let peakBufferBytes = 0;

  const play = (cells) => {
    let blank = board.indexOf(0);
    for (const cell of cells) {
      raw.push(board[cell]);
      board[blank] = board[cell];
      board[cell] = 0;
      blank = cell;
    }
  };

  for (const group of PLAN) {
    const r = bfsStage(board, group, locked);
    play(r.blankPath);
    for (const t of group) locked[goalOf(t)] = 1;
    stages.push({ tiles: group, taps: r.blankPath.length, statesExplored: r.explored, stateSpace: r.stateSpace });
    peakBufferBytes = Math.max(peakBufferBytes, r.bufferBytes);
  }
  const fin = idaFinal(board, locked);
  play(fin.blankPath);
  stages.push({ tiles: FINAL, taps: fin.blankPath.length, statesExplored: fin.explored, stateSpace: 181440 });

  for (let i = 0; i < N; i++) {
    if (board[i] !== (i === N - 1 ? 0 : i + 1)) throw new Error('Internal solver error: board not solved.');
  }

  // Tapping the same tile twice in a row undoes the first tap (this can
  // happen across a stage boundary), so such pairs are removed.
  const taps = [];
  for (const t of raw) {
    if (taps.length && taps[taps.length - 1] === t) taps.pop();
    else taps.push(t);
  }
  return { taps, cancelledTaps: raw.length - taps.length, stages, peakBufferBytes };
}

/**
 * Optimal placement of `group` given locked cells. Abstract state = local
 * (unlocked-cell) indices of [blank, ...group] in base F. BFS records, per
 * visited state, only which direction the blank arrived from (1 byte), from
 * which the path is rebuilt backwards.
 * Returns the sequence of cells the blank moves into.
 */
function bfsStage(board, group, locked) {
  const free = [];
  const local = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (!locked[i]) { local[i] = free.length; free.push(i); }
  const F = free.length;
  const D = group.length + 1;
  const size = F ** D;

  // weight[d] = F^(D-1-d): digit 0 is the blank.
  const weight = new Int32Array(D);
  for (let d = D - 1, w = 1; d >= 0; d--, w *= F) weight[d] = w;

  // Flat adjacency over local cells: up to 4 unlocked neighbours each, with
  // the arrival direction id (1..4 → DELTAS) stored alongside.
  const DELTAS = [-SIZE, SIZE, -1, 1];
  const nbrCount = new Uint8Array(F);
  const nbrCell = new Int32Array(F * 4);
  const nbrDir = new Uint8Array(F * 4);
  for (let l = 0; l < F; l++) {
    for (const n of NEIGHBOURS[free[l]]) {
      if (locked[n]) continue;
      const k = l * 4 + nbrCount[l]++;
      nbrCell[k] = local[n];
      nbrDir[k] = DELTAS.indexOf(n - free[l]) + 1;
    }
  }

  const goal = new Int32Array(group.map((t) => local[goalOf(t)]));
  const pos = new Int32Array(D);
  const decode = (x) => { for (let d = D - 1; d >= 0; d--) { const q = (x / F) | 0; pos[d] = x - q * F; x = q; } };

  pos[0] = local[board.indexOf(0)];
  for (let d = 1; d < D; d++) pos[d] = local[board.indexOf(group[d - 1])];
  let start = 0;
  for (let d = 0; d < D; d++) start += pos[d] * weight[d];

  const bufferBytes = size * 5; // Uint8 directions + Int32 queue
  let atGoal = true;
  for (let d = 1; d < D; d++) if (pos[d] !== goal[d - 1]) atGoal = false;
  if (atGoal) return { blankPath: [], explored: 1, stateSpace: size, bufferBytes };

  const cameFrom = new Uint8Array(size); // 0 = unseen, 1..4 = arrival direction, 5 = start
  const queue = new Int32Array(size);
  const w0 = weight[0];
  let head = 0, tail = 0, found = -1;
  cameFrom[start] = 5;
  queue[tail++] = start;

  search: while (head < tail) {
    const x = queue[head++];
    decode(x);
    const b = pos[0];
    // Group tiles already in place, ignoring any tile the move displaces.
    let misplaced = 0;
    for (let d = 1; d < D; d++) if (pos[d] !== goal[d - 1]) misplaced++;
    const end = b * 4 + nbrCount[b];
    for (let k = b * 4; k < end; k++) {
      const nb = nbrCell[k];
      let y = x + (nb - b) * w0;
      let moved = 0;
      for (let d = 1; d < D; d++) if (pos[d] === nb) { y += (b - nb) * weight[d]; moved = d; break; }
      if (cameFrom[y]) continue;
      cameFrom[y] = nbrDir[k];
      queue[tail++] = y;
      // Only the moved tile (if any) changes placement.
      let m = misplaced;
      if (moved) m += (b !== goal[moved - 1]) - (nb !== goal[moved - 1]);
      if (m === 0) { found = y; break search; }
    }
  }
  if (found < 0) throw new Error(`Internal solver error: stage [${group}] unreachable.`);

  // Rebuild: walk back from the goal using the stored arrival directions.
  const blankPath = [];
  for (let x = found; cameFrom[x] !== 5;) {
    decode(x);
    const nb = pos[0];
    const prevCell = free[nb] - DELTAS[cameFrom[x] - 1];
    const b = local[prevCell];
    blankPath.push(free[nb]);
    let prev = x + (b - nb) * weight[0];
    for (let d = 1; d < D; d++) if (pos[d] === b) { prev += (nb - b) * weight[d]; break; }
    x = prev;
  }
  blankPath.reverse();
  return { blankPath, explored: tail, stateSpace: size, bufferBytes };
}

/**
 * Optimal solution of the final 3×3 region (all other cells locked) by IDA*
 * with Manhattan distance + linear conflict. Fixed neighbour order makes it
 * deterministic. Returns the cells the blank moves into.
 */
function idaFinal(board, locked) {
  const b = Int8Array.from(board);
  const gr = (t) => Math.floor(goalOf(t) / SIZE), gc = (t) => goalOf(t) % SIZE;
  const freeCells = [];
  for (let i = 0; i < N; i++) if (!locked[i]) freeCells.push(i);
  const rowsUsed = [...new Set(freeCells.map((i) => Math.floor(i / SIZE)))];
  const colsUsed = [...new Set(freeCells.map((i) => i % SIZE))];

  const heuristic = () => {
    let h = 0;
    for (const i of freeCells) {
      const t = b[i];
      if (t) h += Math.abs(Math.floor(i / SIZE) - gr(t)) + Math.abs((i % SIZE) - gc(t));
    }
    // Linear conflict: two tiles in their goal row (column), reversed.
    for (const r of rowsUsed) {
      for (const c1 of colsUsed) {
        const a = b[r * SIZE + c1];
        if (!a || gr(a) !== r) continue;
        for (const c2 of colsUsed) {
          if (c2 <= c1) continue;
          const z = b[r * SIZE + c2];
          if (z && gr(z) === r && gc(z) < gc(a)) h += 2;
        }
      }
    }
    for (const c of colsUsed) {
      for (const r1 of rowsUsed) {
        const a = b[r1 * SIZE + c];
        if (!a || gc(a) !== c) continue;
        for (const r2 of rowsUsed) {
          if (r2 <= r1) continue;
          const z = b[r2 * SIZE + c];
          if (z && gc(z) === c && gr(z) < gr(a)) h += 2;
        }
      }
    }
    return h;
  };

  let blank = b.indexOf(0), explored = 0;
  const path = [];
  const dfs = (g, bound, prev) => {
    const h = heuristic();
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return -1;
    if (++explored > 5e6) throw new Error('Internal solver error: 3×3 search exceeded its bound.');
    let min = Infinity;
    for (const nb of NEIGHBOURS[blank]) {
      if (nb === prev || locked[nb]) continue;
      const from = blank;
      b[from] = b[nb]; b[nb] = 0; blank = nb; path.push(nb);
      const r = dfs(g + 1, bound, from);
      if (r === -1) return -1;
      path.pop(); b[nb] = b[from]; b[from] = 0; blank = from;
      if (r < min) min = r;
    }
    return min;
  };
  let bound = heuristic();
  for (;;) {
    const r = dfs(0, bound, -1);
    if (r === -1) break;
    bound = r;
  }
  return { blankPath: path, explored };
}

function round(v) { return Math.round(v * 10) / 10; }
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
