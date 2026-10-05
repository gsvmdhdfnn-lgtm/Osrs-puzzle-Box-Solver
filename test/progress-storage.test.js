import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProgress, decodeProgress } from '../src/progress-storage.js';
import { solvePuzzle } from '../src/solver.js';
import { EXPECTED_STATE } from './helpers/fixtures.js';

const taps = solvePuzzle(EXPECTED_STATE).taps;
const good = { start: EXPECTED_STATE, taps, index: 17 };

test('round-trips valid progress', () => {
  assert.deepEqual(decodeProgress(encodeProgress(good)), good);
  assert.equal(decodeProgress(encodeProgress({ ...good, index: 0 })).index, 0);
  assert.equal(decodeProgress(encodeProgress({ ...good, index: 50 })).index, 50);
});

test('stores only numbers — no image data', () => {
  const data = JSON.parse(encodeProgress(good));
  assert.deepEqual(Object.keys(data).sort(), ['index', 'puzzle', 'start', 'taps', 'v']);
});

test('discards corrupt, incomplete or incompatible data', () => {
  const tweak = (patch) => JSON.stringify({ ...JSON.parse(encodeProgress(good)), ...patch });
  const swapped = [...EXPECTED_STATE]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const cases = [
    null, undefined, 42, '', 'not json', '{"v":1', '[]', 'null', '{}',
    tweak({ v: 2 }),
    tweak({ puzzle: 'castle' }),
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
});
