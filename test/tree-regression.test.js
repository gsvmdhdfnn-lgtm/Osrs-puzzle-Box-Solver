// Critical regression: IMG_0120 (a genuine OSRS Mobile screenshot) must give
// exactly the approved baseline's recognition and 50-tap solution. The
// fixture was captured from the Tree V0 baseline (commit 6084d39) before any
// multi-puzzle changes. Only timings are excluded (not deterministic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { recognizePuzzle, recognizeAnyPuzzle } from '../src/recognize.js';
import { solvePuzzle } from '../src/solver.js';
import { tree, screenshot } from './helpers/fixtures.js';
import { referenceList } from './helpers/puzzles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PINNED = JSON.parse(readFileSync(path.join(here, 'fixtures/img0120-recognition.json'), 'utf8'));
const FIXTURE_TAPS = [...readFileSync(path.join(here, 'fixtures/img0120-solution.md'), 'utf8')
  .matchAll(/^\s*\d+\. tap (\d+)$/gm)].map((m) => Number(m[1]));
const plain = (o) => JSON.parse(JSON.stringify(o));

test('single-reference Tree recognition of IMG_0120 is identical to the pinned baseline', async () => {
  const r = recognizePuzzle(await screenshot(), await tree());
  const { timingsMs, ...diagnostics } = r.diagnostics;
  assert.deepEqual(plain({ ok: r.ok, state: r.state, diagnostics }), { ok: PINNED.ok, state: PINNED.state, diagnostics: PINNED.diagnostics });
});

test('automatic identification picks Tree for IMG_0120 and reproduces the pinned evidence', async () => {
  const r = recognizeAnyPuzzle(await screenshot(), await referenceList());
  assert.equal(r.ok, true, r.error?.message);
  assert.equal(r.puzzleId, 'tree');
  assert.deepEqual(r.state, PINNED.state);
  const { timingsMs, identification, ...rest } = r.diagnostics;
  assert.deepEqual(plain(rest), PINNED.diagnostics);
  assert.equal(identification.ok, true);
});

test('IMG_0120 still solves to the same 50 taps', () => {
  const s = solvePuzzle(PINNED.state);
  assert.deepEqual(s.taps, PINNED.solution.taps);
  assert.deepEqual(s.taps, FIXTURE_TAPS);
  assert.equal(s.orientation, PINNED.solution.orientation);
  assert.deepEqual(plain(s.candidates), PINNED.solution.candidates);
});
