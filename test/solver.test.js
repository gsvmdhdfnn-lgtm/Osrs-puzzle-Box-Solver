import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { solvePuzzle } from '../src/solver.js';
import { applyTap, isSolved, isSolvable, SOLVED_STATE } from '../src/puzzle-state.js';
import { EXPECTED_STATE } from './helpers/fixtures.js';
import { scrambledBoard } from './helpers/scramble.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Replays taps, asserting each one is legal; returns the final state. */
function replay(start, taps) {
  let s = [...start];
  taps.forEach((t, i) => {
    const blank = s.indexOf(0), at = s.indexOf(t);
    const adjacent = Math.abs(Math.floor(blank / 5) - Math.floor(at / 5)) + Math.abs((blank % 5) - (at % 5)) === 1;
    assert.ok(adjacent, `tap #${i + 1} (tile ${t}) is not adjacent to the blank`);
    s = applyTap(s, t);
  });
  return s;
}

function readFixtureTaps() {
  const md = readFileSync(path.join(here, 'fixtures/img0120-solution.md'), 'utf8');
  return [...md.matchAll(/^\s*(\d+)\. tap (\d+)$/gm)].map((m, i) => {
    assert.equal(Number(m[1]), i + 1, 'fixture taps must be numbered consecutively');
    return Number(m[2]);
  });
}

const transposeTile = (t) => (t === 0 ? 0 : ((t - 1) % 5) * 5 + Math.floor((t - 1) / 5) + 1);
const transpose = (s) => {
  const out = new Array(25);
  s.forEach((v, i) => { out[(i % 5) * 5 + Math.floor(i / 5)] = transposeTile(v); });
  return out;
};

// ---------------------------------------------------------------- IMG_0120

test('IMG_0120: solves the recognised state; every tap legal; ends exactly solved', () => {
  const r = solvePuzzle(EXPECTED_STATE);
  assert.equal(r.ok, true, r.error?.message);
  assert.equal(r.length, r.taps.length);
  assert.ok(r.taps.every((t) => Number.isInteger(t) && t >= 1 && t <= 24), 'taps are tile numbers 1..24');
  assert.deepEqual(replay(EXPECTED_STATE, r.taps), [...SOLVED_STATE]);
});

test('IMG_0120: matches the human-readable regression fixture exactly', () => {
  const fixture = readFixtureTaps();
  assert.equal(fixture.length, 50);
  assert.deepEqual(replay(EXPECTED_STATE, fixture), [...SOLVED_STATE]);
  const r = solvePuzzle(EXPECTED_STATE);
  assert.deepEqual(r.taps, fixture);
  assert.equal(r.orientation, 'rows-first');
  assert.equal(r.candidates['rows-first'].length, 50);
  assert.equal(r.candidates['columns-first'].length, 68);
});

// ---------------------------------------------------- orientation handling

test('selects the shorter orientation; ties prefer rows-first', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const r = solvePuzzle(scrambledBoard(seed, 2000));
    const rows = r.candidates['rows-first'].length, cols = r.candidates['columns-first'].length;
    assert.equal(r.length, Math.min(rows, cols));
    assert.equal(r.orientation, cols < rows ? 'columns-first' : 'rows-first');
  }
});

test('columns-first is the rows-first plan on the transposed board', () => {
  // Solving the transposed board swaps the roles of the two orientations.
  for (const s of [EXPECTED_STATE, scrambledBoard(11, 2000)]) {
    const a = solvePuzzle(s), b = solvePuzzle(transpose(s));
    assert.equal(a.candidates['rows-first'].length, b.candidates['columns-first'].length);
    assert.equal(a.candidates['columns-first'].length, b.candidates['rows-first'].length);
    assert.deepEqual(replay(transpose(s), b.taps), [...SOLVED_STATE]);
  }
});

// ------------------------------------------------------------ edge inputs

test('already-solved input returns an empty tap sequence', () => {
  const r = solvePuzzle([...SOLVED_STATE]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.taps, []);
});

test('one move from solved returns that single tap', () => {
  const s = applyTap([...SOLVED_STATE], 24);
  assert.deepEqual(solvePuzzle(s).taps, [24]);
});

test('rejects malformed, duplicate, missing and out-of-range states', () => {
  const dup = [...SOLVED_STATE]; dup[0] = 2;
  const missingBlank = [...SOLVED_STATE]; missingBlank[24] = 25;
  const cases = [
    null, undefined, 'abc', {}, [],
    SOLVED_STATE.slice(0, 24),
    [...SOLVED_STATE, 0],
    dup,
    missingBlank,
    [...SOLVED_STATE.slice(0, 24), -1],
    [...SOLVED_STATE.slice(0, 24), 0.5],
    [...SOLVED_STATE.slice(0, 23), '24', 0],
  ];
  for (const c of cases) {
    const r = solvePuzzle(c);
    assert.equal(r.ok, false, `accepted ${JSON.stringify(c)}`);
    assert.equal(r.error.code, 'INVALID_STATE');
    assert.equal(r.taps, undefined);
  }
});

test('rejects mathematically unsolvable permutations', () => {
  const swapped = [...SOLVED_STATE];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const oracleSwapped = [...EXPECTED_STATE];
  [oracleSwapped[0], oracleSwapped[9]] = [oracleSwapped[9], oracleSwapped[0]]; // tiles 1 ↔ 5
  for (const s of [swapped, oracleSwapped, scrambledBoard(5, 500).map((v) => (v === 23 ? 24 : v === 24 ? 23 : v))]) {
    assert.equal(isSolvable(s), false);
    const r = solvePuzzle(s);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'UNSOLVABLE');
  }
});

test('deterministic: identical input gives identical output', () => {
  for (const s of [EXPECTED_STATE, scrambledBoard(42, 2000)]) {
    const a = solvePuzzle([...s]), b = solvePuzzle([...s]);
    assert.deepEqual(a.taps, b.taps);
    assert.equal(a.orientation, b.orientation);
  }
});

test('does not mutate its input', () => {
  const s = [...EXPECTED_STATE];
  solvePuzzle(s);
  assert.deepEqual(s, EXPECTED_STATE);
});

// ------------------------------------------------------------ random set

test('short scrambles (5–60 legal moves) solve correctly', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = scrambledBoard(1000 + seed, 5 + (seed % 12) * 5);
    const r = solvePuzzle(s);
    assert.equal(r.ok, true);
    assert.ok(isSolved(replay(s, r.taps)), `seed ${seed}`);
  }
});

const RANDOM_BOARDS = 100;
test(`${RANDOM_BOARDS} deeply scrambled boards (2000 legal moves each): legal, solved, length/runtime report`, (t) => {
  const lengths = [], times = [];
  let peakBufferBytes = 0;
  for (let seed = 1; seed <= RANDOM_BOARDS; seed++) {
    const s = scrambledBoard(seed, 2000);
    const r = solvePuzzle(s);
    assert.equal(r.ok, true, `seed ${seed}: ${r.error?.message}`);
    assert.ok(isSolved(replay(s, r.taps)), `seed ${seed} not solved`);
    lengths.push(r.length);
    times.push(r.timingsMs.total);
    peakBufferBytes = Math.max(peakBufferBytes, r.peakBufferBytes);
  }
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const pct = (a, p) => sorted(a)[Math.ceil(p * a.length) - 1];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const report = {
    taps: { mean: +mean(lengths).toFixed(1), median: pct(lengths, 0.5), p95: pct(lengths, 0.95), max: Math.max(...lengths), min: Math.min(...lengths) },
    runtimeMs: { mean: +mean(times).toFixed(0), median: pct(times, 0.5), p95: pct(times, 0.95), max: Math.max(...times) },
    peakBufferMB: +(peakBufferBytes / 1e6).toFixed(1),
  };
  t.diagnostic(`random-board report: ${JSON.stringify(report)}`);
  const oracle = solvePuzzle(EXPECTED_STATE);
  t.diagnostic(`IMG_0120 report: ${JSON.stringify({ taps: oracle.length, orientation: oracle.orientation, rowsFirst: oracle.candidates['rows-first'].length, columnsFirst: oracle.candidates['columns-first'].length, timingsMs: oracle.timingsMs })}`);

  // Regression guards: generous so slower machines pass, tight enough to catch
  // a quality or performance collapse.
  assert.ok(report.taps.mean <= 170, `mean taps ${report.taps.mean}`);
  assert.ok(report.taps.max <= 230, `max taps ${report.taps.max}`);
  assert.ok(report.runtimeMs.max <= 5000, `max runtime ${report.runtimeMs.max} ms`);
  assert.ok(peakBufferBytes <= 16e6);
});
