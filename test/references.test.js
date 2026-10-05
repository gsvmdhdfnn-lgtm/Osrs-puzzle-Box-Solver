// The seven canonical references: files, stable ids, grid geometry, and each
// solved reference recognised (automatically identified) as solved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { REFERENCES, PUZZLE_IDS } from '../src/references.js';
import { recognizeAnyPuzzle } from '../src/recognize.js';
import { SOLVED_STATE } from '../src/puzzle-state.js';
import { puzzles, referenceList } from './helpers/puzzles.js';

// Expected geometry, measured by hand from each image (test data only).
const GEOMETRY = {
  tree: { tile: 36, x0: 12, y0: 12 },
  gnome: { tile: 46, x0: 19, y0: 18 },
  cerberus: { tile: 46, x0: 19, y0: 18 },
  troll: { tile: 46, x0: 19, y0: 18 },
  zulrah: { tile: 46, x0: 19, y0: 18 },
  castle: { tile: 46, x0: 19, y0: 18 },
  'gothic-castle': { tile: 46, x0: 19, y0: 18 },
};

test('stable puzzle ids and reference files', () => {
  assert.deepEqual([...PUZZLE_IDS], ['tree', 'gnome', 'cerberus', 'troll', 'zulrah', 'castle', 'gothic-castle']);
  for (const id of PUZZLE_IDS) {
    assert.equal(REFERENCES[id].id, id);
    assert.ok(existsSync(REFERENCES[id].src), REFERENCES[id].src);
  }
  assert.equal(REFERENCES.tree.src, 'assets/reference/tree.webp', 'Tree reference must not be replaced');
});

for (const id of Object.keys(GEOMETRY)) {
  test(`${id}: grid detected with exact tile geometry`, async () => {
    const { reference } = (await puzzles()).get(id);
    const b = reference.board, g = GEOMETRY[id];
    assert.ok(b.confidence >= 0.9, `confidence ${b.confidence}`);
    assert.ok(Math.abs(b.cells[0].x - g.x0) <= 0.6 && Math.abs(b.cells[0].y - g.y0) <= 0.6, `cell0 ${b.cells[0].x},${b.cells[0].y}`);
    for (const c of b.cells) {
      assert.ok(Math.abs(c.w - g.tile) <= 0.6 && Math.abs(c.h - g.tile) <= 0.6, `cell ${c.row},${c.col}: ${c.w}×${c.h}`);
    }
    assert.equal(reference.labels.indexOf(0), 24, 'blank is the bottom-right cell of the solved reference');
  });

  test(`${id}: solved reference is identified and recognised as solved`, async () => {
    const { img } = (await puzzles()).get(id);
    const r = recognizeAnyPuzzle(img, await referenceList());
    assert.equal(r.ok, true, r.error?.message);
    assert.equal(r.puzzleId, id);
    assert.deepEqual(r.state, [...SOLVED_STATE]);
  });
}
