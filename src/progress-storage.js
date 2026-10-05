// Serialisation and strict validation of saved walkthrough progress. Only
// numbers and the puzzle id are stored (puzzle, start state, taps, current
// move) — never the image. Anything corrupt, incomplete or incompatible
// decodes to null so the app can simply discard it.
//
// Versions: v2 records carry any supported puzzle id. v1 records (written by
// the Tree-only release) are accepted only with puzzle 'tree', which was the
// only value v1 could hold, so old Tree progress resumes as Tree.

import { validatePermutation, isSolvable, isLegalTap, applyTap, isSolved } from './puzzle-state.js';
import { PUZZLE_IDS } from './references.js';

export const PROGRESS_KEY = 'osrs-puzzle-solver/tree-walkthrough'; // key kept from v1 so old progress is found
export const PROGRESS_VERSION = 2;
const MAX_TAPS = 2000;

export function encodeProgress({ puzzleId, start, taps, index }) {
  return JSON.stringify({ v: PROGRESS_VERSION, puzzle: puzzleId, start, taps, index });
}

/** @returns {{puzzleId:string, start:number[], taps:number[], index:number} | null} */
export function decodeProgress(raw, supportedIds = PUZZLE_IDS) {
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  let puzzleId;
  if (data.v === 1 && data.puzzle === 'tree') puzzleId = 'tree';
  else if (data.v === 2 && typeof data.puzzle === 'string' && supportedIds.includes(data.puzzle)) puzzleId = data.puzzle;
  else return null;

  const { start, taps, index } = data;
  if (!validatePermutation(start).ok || !isSolvable(start)) return null;
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return null;
  if (!taps.every((t) => Number.isInteger(t) && t >= 1 && t <= 24)) return null;
  if (!Number.isInteger(index) || index < 0 || index > taps.length) return null;

  let s = [...start];
  for (const t of taps) {
    if (!isLegalTap(s, t)) return null;
    s = applyTap(s, t);
  }
  if (!isSolved(s)) return null;
  return { puzzleId, start: [...start], taps: [...taps], index };
}
