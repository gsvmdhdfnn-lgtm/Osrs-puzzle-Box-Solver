import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userMessage } from '../src/user-messages.js';

const CODES = ['BOARD_NOT_FOUND', 'UNSUPPORTED_PUZZLE', 'PUZZLE_AMBIGUOUS', 'POOR_MATCH', 'AMBIGUOUS', 'INVALID_STATE', 'UNSOLVABLE', 'UNEXPECTED'];

test('every failure code maps to a plain-language, puzzle-neutral message', () => {
  for (const code of CODES) {
    const m = userMessage(code);
    assert.ok(m.title && m.text.length > 20, code);
    assert.doesNotMatch(m.text, /ΔE|margin|Error:|undefined|\bat \w+ \(/, code);
    assert.doesNotMatch(m.title + m.text, /\b(Tree|Gnome|Cerberus|Troll|Zulrah|Castle)\b/, `${code} must not name a puzzle`);
  }
  assert.deepEqual(userMessage('SOMETHING_NEW'), userMessage('UNEXPECTED'));
});

test('the six required outcomes have distinct messages', () => {
  const outcomes = ['BOARD_NOT_FOUND', 'UNSUPPORTED_PUZZLE', 'PUZZLE_AMBIGUOUS', 'AMBIGUOUS', 'UNSOLVABLE', 'UNEXPECTED'];
  const titles = outcomes.map((c) => userMessage(c).title);
  assert.equal(new Set(titles).size, outcomes.length, titles.join(' / '));
  assert.deepEqual(userMessage('POOR_MATCH'), userMessage('AMBIGUOUS'));      // both: tiles unclear
  assert.deepEqual(userMessage('INVALID_STATE'), userMessage('UNSOLVABLE'));  // both: not readable
});
