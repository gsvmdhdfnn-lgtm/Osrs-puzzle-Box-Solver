// The browser runtime must stay dependency-free plain JavaScript: modules in
// src/ may only import other relative modules, never packages or Node APIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
}

test('src/ only uses relative imports', () => {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] ?? m[2];
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${path.relative(dir, file)} imports '${spec}'`);
    }
  }
});
