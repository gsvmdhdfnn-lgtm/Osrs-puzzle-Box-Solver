// Test-only: random solvable boards produced by legal moves from the solved
// board (seeded, so every run uses the same boards).
import { SOLVED_STATE, SIZE } from '../../src/puzzle-state.js';
import { mulberry32 } from './fixtures.js';

/** Applies `moves` random legal blank moves (never immediately undoing one). */
export function scrambledBoard(seed, moves) {
  const rnd = mulberry32(seed);
  const s = [...SOLVED_STATE];
  let blank = s.indexOf(0), prev = -1;
  for (let k = 0; k < moves; k++) {
    const r = Math.floor(blank / SIZE), c = blank % SIZE;
    const options = [];
    if (r > 0) options.push(blank - SIZE);
    if (r < SIZE - 1) options.push(blank + SIZE);
    if (c > 0) options.push(blank - 1);
    if (c < SIZE - 1) options.push(blank + 1);
    const choices = options.filter((o) => o !== prev);
    const next = choices[Math.floor(rnd() * choices.length)];
    s[blank] = s[next];
    s[next] = 0;
    prev = blank;
    blank = next;
  }
  return s;
}
