import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProgress, decodeProgress } from '../src/progress-storage.js';
import { PUZZLE_IDS } from '../src/references.js';
import { solvePuzzle } from '../src/solver.js';
import { EXPECTED_STATE } from './helpers/fixtures.js';

const taps = solvePuzzle(EXPECTED_STATE).taps;
const good = { puzzleId: 'tree', start: EXPECTED_STATE, taps, index: 17 };

test('round-trips valid progress', () => {
  assert.deepEqual(decodeProgress(encodeProgress(good)), good);
  assert.equal(decodeProgress(encodeProgress({ ...good, index: 0 })).index, 0);
  assert.equal(decodeProgress(encodeProgress({ ...good, index: 50 })).index, 50);
});

test('round-trips the puzzle id for every supported puzzle', () => {
  for (const id of PUZZLE_IDS) {
    assert.equal(decodeProgress(encodeProgress({ ...good, puzzleId: id })).puzzleId, id);
  }
});

test('stores only numbers and the puzzle id — no image data', () => {
  const data = JSON.parse(encodeProgress(good));
  assert.deepEqual(Object.keys(data).sort(), ['index', 'puzzle', 'start', 'taps', 'v']);
  assert.equal(data.puzzle, 'tree');
});

test('Tree progress saved by the previous (v1) release still resumes as Tree', () => {
  const v1 = JSON.stringify({ v: 1, puzzle: 'tree', start: EXPECTED_STATE, taps, index: 17 });
  assert.deepEqual(decodeProgress(v1), good);
  // v1 could only ever hold Tree; anything else in a v1 record is rejected,
  // never reinterpreted as another puzzle.
  for (const other of ['castle', 'gnome', undefined]) {
    assert.equal(decodeProgress(JSON.stringify({ v: 1, puzzle: other, start: EXPECTED_STATE, taps, index: 0 })), null);
  }
});

test('discards corrupt, incomplete or incompatible data', () => {
  const tweak = (patch) => JSON.stringify({ ...JSON.parse(encodeProgress(good)), ...patch });
  const swapped = [...EXPECTED_STATE]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const cases = [
    null, undefined, 42, '', 'not json', '{"v":1', '[]', 'null', '{}',
    tweak({ v: 3 }),
    tweak({ puzzle: 'castle-of-doom' }),          // unknown puzzle id
    tweak({ puzzle: undefined }),
    tweak({ puzzle: 7 }),
    tweak({ start: undefined }),
    tweak({ start: EXPECTED_STATE.slice(0, 24) }),
    tweak({ start: swapped }),                    // unsolvable start
    tweak({ taps: 'abc' }),
    tweak({ taps: taps.slice(0, 49) }),           // does not end solved
    tweak({ taps: [99, ...taps] }),               // out-of-range tile
    tweak({ taps: [1, ...taps] }),                // illegal first tap
    tweak({ index: 51 }),
    tweak({ index: -1 }),
    tweak({ index: 2.5 }),
    tweak({ index: '3' }),
    'x'.repeat(30000),
  ];
  for (const c of cases) assert.equal(decodeProgress(c), null, `accepted ${String(c).slice(0, 60)}`);
  // A puzzle id that is no longer supported is discarded.
  assert.equal(decodeProgress(encodeProgress({ ...good, puzzleId: 'gnome' }), ['tree']), null);
});
