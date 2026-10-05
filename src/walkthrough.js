// Tap-by-tap walkthrough state. Pure: no DOM, no storage.
//
// Index i means "i taps have been made". At index i < total the player must
// tap taps[i] next ("Move i+1 of total"); at index === total the puzzle is
// solved and there is no next tile. Every board along the way is simulated
// up front with applyTap, so an illegal tap or a sequence that does not end
// solved is rejected when the walkthrough is created.

import { applyTap, isSolved, validatePermutation } from './puzzle-state.js';

export function createWalkthrough(start, taps) {
  const perm = validatePermutation(start);
  if (!perm.ok) throw new Error(`Invalid start state: ${perm.reason}`);
  if (!Array.isArray(taps)) throw new Error('Taps must be an array.');
  const boards = [Object.freeze([...start])];
  for (const t of taps) boards.push(Object.freeze(applyTap(boards[boards.length - 1], t)));
  if (!isSolved(boards[boards.length - 1])) throw new Error('Tap sequence does not end in the solved state.');

  const total = taps.length;
  const clamp = (i) => Math.max(0, Math.min(total, Number.isInteger(i) ? i : 0));

  return {
    total,
    taps: Object.freeze([...taps]),
    clamp,
    next: (i) => clamp(i + 1),
    previous: (i) => clamp(i - 1),
    view(index) {
      const i = clamp(index);
      const complete = i === total;
      return {
        index: i,
        total,
        board: boards[i],
        complete,
        moveNumber: complete ? total : i + 1,
        nextTile: complete ? null : taps[i],
        upcoming: taps.slice(i + 1, i + 4),
        canPrevious: i > 0,
        canNext: !complete,
      };
    },
  };
}
