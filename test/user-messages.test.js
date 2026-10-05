import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userMessage } from '../src/user-messages.js';

test('every failure code maps to a plain-language message', () => {
  for (const code of ['BOARD_NOT_FOUND', 'POOR_MATCH', 'AMBIGUOUS', 'INVALID_STATE', 'UNSOLVABLE', 'UNEXPECTED']) {
    const m = userMessage(code);
    assert.ok(m.title && m.text.length > 20, code);
    assert.doesNotMatch(m.text, /ΔE|margin|Error:|undefined|\bat \w+ \(/, code);
  }
  assert.deepEqual(userMessage('SOMETHING_NEW'), userMessage('UNEXPECTED'));
  assert.match(userMessage('POOR_MATCH').text, /Tree puzzle/);
});
