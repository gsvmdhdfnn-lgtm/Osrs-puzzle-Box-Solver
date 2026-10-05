// Serialisation and strict validation of saved walkthrough progress. Only
// numbers are stored (start state, taps, current move) — never the image.
// Anything corrupt, incomplete or incompatible decodes to null so the app can
// simply discard it.

import { validatePermutation, isSolvable, isLegalTap, applyTap, isSolved } from './puzzle-state.js';

export const PROGRESS_KEY = 'osrs-puzzle-solver/tree-walkthrough';
export const PROGRESS_VERSION = 1;
const MAX_TAPS = 2000;

export function encodeProgress({ start, taps, index }) {
  return JSON.stringify({ v: PROGRESS_VERSION, puzzle: 'tree', start, taps, index });
}

/** @returns {{start:number[], taps:number[], index:number} | null} */
export function decodeProgress(raw) {
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.v !== PROGRESS_VERSION || data.puzzle !== 'tree') return null;

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
  return { start: [...start], taps: [...taps], index };
}
