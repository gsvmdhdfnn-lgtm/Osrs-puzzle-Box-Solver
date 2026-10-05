// End-to-end browser test: upload IMG_0120 → recognition → solution →
// walk all 50 moves → solved, at a phone-sized and a desktop viewport.
// Also checks resume after reload, corrupt saved data, Start over, friendly
// errors, and basic layout (overflow, tap targets, text size).
//
// Uses an existing Playwright installation (not a package dependency):
//   npm run test:e2e
// Screenshots are written to test/e2e/screenshots/.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { applyTap, SOLVED_STATE } from '../../src/puzzle-state.js';
import { detectBoard } from '../../src/board-detect.js';
import { EXPECTED_STATE, screenshot as loadScreenshot, cellBox, fillRect, sharpFromImage } from '../helpers/fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/screenshots');
const FIXTURE = path.join(root, 'test/fixtures/tree-mobile-img0120.png');
const TAPS = [...readFileSync(path.join(root, 'test/fixtures/img0120-solution.md'), 'utf8')
  .matchAll(/^\s*\d+\. tap (\d+)$/gm)].map((m) => Number(m[1]));
const BOARDS = [EXPECTED_STATE];
for (const t of TAPS) BOARDS.push(applyTap(BOARDS.at(-1), t));

const VIEWPORTS = [
  { name: 'mobile-390x844', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop-1280x800', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through to global */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/plain' };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Visible-board state as a 25-cell array read from the DOM.
const readBoard = (page) => page.$$eval('#board .tile', (tiles) => {
  const s = new Array(25).fill(0);
  for (const t of tiles) s[Number(t.dataset.cell)] = Number(t.dataset.tile);
  return s;
});
const highlighted = (page) => page.$$eval('#board .tile.next', (els) => els.map((e) => Number(e.dataset.tile)));
const view = (page) => page.evaluate(() => document.body.dataset.view);

// Layout audit of what is currently visible (debug disclosure excluded).
async function audit(page) {
  return page.evaluate(() => {
    const issues = [];
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (document.documentElement.scrollWidth > vw) issues.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const inDebug = (e) => !!e.closest('#debug-body');
    for (const e of document.querySelectorAll('button, label.button, summary')) {
      if (!visible(e) || inDebug(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 44) issues.push(`small tap target (${Math.round(r.height)}px): ${e.textContent.trim().slice(0, 30)}`);
      if (r.left < 0 || r.right > vw + 0.5) issues.push(`clipped horizontally: ${e.textContent.trim().slice(0, 30)}`);
    }
    for (const e of document.querySelectorAll('main *')) {
      if (!visible(e) || inDebug(e) || e.closest('summary')) continue;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && parseFloat(getComputedStyle(e).fontSize) < 14) issues.push(`small text (${getComputedStyle(e).fontSize}): ${e.textContent.trim().slice(0, 30)}`);
    }
    const rect = (sel) => { const e = document.querySelector(sel); if (!e || !visible(e)) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; };
    const layout = { viewport: { width: vw, height: vh }, board: rect('#board'), next: rect('#next'), previous: rect('#previous'), moveLabel: rect('#move-label'), upload: rect('#upload-view .upload-button') };
    if (layout.next && layout.next.bottom > vh) issues.push(`Next button below the fold (bottom ${layout.next.bottom} > ${vh})`);
    if (layout.board && layout.board.right > vw) issues.push('board clipped');
    return { issues, layout };
  });
}

async function uploadBuffer(page, name, buffer) {
  await page.setInputFiles('#upload-view:not([hidden]) input[type=file], #error-view:not([hidden]) input[type=file]', { name, mimeType: 'image/png', buffer });
}

async function runViewport(browser, cfg, results) {
  const context = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const requests = [];
  const methods = new Set();
  page.on('request', (r) => { requests.push(r.url()); methods.add(r.method()); });
  const press = (sel) => (cfg.hasTouch ? page.tap(sel) : page.click(sel));
  const r = { viewport: cfg.name, audits: {} };

  await page.goto(results.base);
  await page.waitForFunction(() => document.body.dataset.view === 'upload');
  r.audits.upload = await audit(page);
  assert.match(await page.textContent('#upload-view'), /processed on your device and isn’t uploaded anywhere/);
  await page.screenshot({ path: path.join(shots, `${cfg.name}-1-upload.png`) });

  // Upload → walkthrough.
  const t0 = Date.now();
  await page.setInputFiles('#file', FIXTURE);
  await page.waitForFunction(() => ['walkthrough', 'error'].includes(document.body.dataset.view), null, { timeout: 60000 });
  r.wallClockToWalkthroughMs = Date.now() - t0;
  assert.equal(await view(page), 'walkthrough', 'expected walkthrough after uploading IMG_0120');
  r.analysisMs = Number(await page.evaluate(() => document.body.dataset.analysisMs));
  assert.equal((await page.textContent('#move-label')).trim(), 'Move 1 of 50');
  assert.deepEqual(await readBoard(page), EXPECTED_STATE);
  assert.deepEqual(await highlighted(page), [TAPS[0]]);
  assert.equal((await page.textContent('#upcoming')).trim(), `Then: ${TAPS.slice(1, 4).join(' · ')}`);
  assert.equal(await page.isDisabled('#previous'), true);
  r.audits.move1 = await audit(page);
  await press('#debug summary');
  await page.waitForFunction(() => /50 taps · rows-first/.test(document.getElementById('debug-body').textContent), null, { timeout: 5000 });
  await press('#debug summary');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, `${cfg.name}-2-move1.png`) });

  // Walk all 50 moves, verifying the simulated board and highlight each step.
  let index = 0;
  const checkAt = async (i) => {
    assert.deepEqual(await readBoard(page), BOARDS[i], `board after ${i} taps`);
    if (i < 50) {
      assert.deepEqual(await highlighted(page), [TAPS[i]], `highlight at move ${i + 1}`);
      assert.equal((await page.textContent('#move-label')).trim(), `Move ${i + 1} of 50`);
    }
  };
  while (index < 50) {
    await checkAt(index);
    await press('#next');
    index++;
    if (index === 20) {
      for (let k = 0; k < 3; k++) { await press('#previous'); index--; await checkAt(index); }
      for (let k = 0; k < 3; k++) { await press('#next'); index++; }
      await checkAt(index);
      r.previousRecovery = 'ok (back 3 from move 21 to 18, then forward again)';
    }
    if (index === 30) {
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.view === 'walkthrough');
      assert.equal(await page.isVisible('#resumed'), true, 'resume note should show');
      await checkAt(30);
      r.resumeAfterReload = 'ok (reloaded at move 31; board, highlight and counter restored)';
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(shots, `${cfg.name}-3-resumed-move31.png`) });
    }
  }

  // Solved.
  assert.equal((await page.textContent('#move-label')).trim(), 'Puzzle solved ✓');
  assert.deepEqual(await readBoard(page), [...SOLVED_STATE]);
  assert.deepEqual(await highlighted(page), []);
  assert.equal(await page.isDisabled('#next'), true);
  assert.equal((await page.textContent('#upcoming')).trim(), '');
  await page.keyboard.press('ArrowRight'); // must not go past completion
  assert.equal((await page.textContent('#move-label')).trim(), 'Puzzle solved ✓');
  r.audits.solved = await audit(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, `${cfg.name}-4-solved.png`) });
  r.walkthrough = 'ok (50/50 moves verified against simulated boards; solved state reached)';

  // Debug details are closed by default and openable.
  assert.equal(await page.evaluate(() => document.getElementById('debug').open), false);
  await press('#debug summary');
  // This page was reloaded mid-walkthrough, so debug shows the saved solution.
  await page.waitForFunction(() => /50 taps \(saved\)/.test(document.getElementById('debug-body').textContent), null, { timeout: 5000 });
  r.debugDetails = 'ok (closed by default; opens with saved solution details after resume)';
  await press('#debug summary');

  // Start over clears saved progress.
  await press('#start-over');
  assert.equal(await view(page), 'upload');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);

  // Corrupt / incompatible saved data is discarded silently.
  for (const bad of ['{not json', JSON.stringify({ v: 1, puzzle: 'tree', start: EXPECTED_STATE, taps: [1, 2, 3], index: 0 })]) {
    await page.evaluate((v) => localStorage.setItem('osrs-puzzle-solver/tree-walkthrough', v), bad);
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.view === 'upload');
    assert.equal(await page.evaluate(() => localStorage.getItem('osrs-puzzle-solver/tree-walkthrough')), null);
  }
  r.corruptStorage = 'ok (malformed and incompatible saved data discarded; upload screen shown)';

  // Friendly errors.
  for (const [name, buffer, title] of results.errorImages) {
    await uploadBuffer(page, name, buffer);
    await page.waitForFunction(() => ['error', 'walkthrough'].includes(document.body.dataset.view), null, { timeout: 60000 });
    assert.equal(await view(page), 'error', `${name} should fail`);
    assert.equal((await page.textContent('#error-title')).trim(), title);
    const text = await page.textContent('#error-view');
    assert.doesNotMatch(text, /ΔE|Error:|at \w+ \(|stack|undefined/);
    (r.errors ??= []).push(`${name} → "${title}"`);
  }
  r.audits.error = await audit(page);
  await page.screenshot({ path: path.join(shots, `${cfg.name}-5-error.png`) });

  assert.deepEqual(errors, [], 'no page/console errors');
  // Only same-origin static files may be requested (nothing is uploaded).
  const origin = new URL(results.base).origin;
  const external = requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
  assert.deepEqual(external, [], 'no requests may leave the page origin');
  r.requests = [...new Set(requests.filter((u) => !u.startsWith('data:')).map((u) => new URL(u).pathname))].sort();
  assert.deepEqual([...methods], ['GET'], 'only GET requests (nothing is uploaded)');
  await context.close();
  return r;
}

const { chromium } = await loadPlaywright();
await mkdir(shots, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;

// Error-case images, generated from the real fixture.
const shot = await loadScreenshot();
const noBoard = await sharpFromImage(shot).extract({ left: 1250, top: 0, width: 1110, height: 1640 }).png().toBuffer();
const flat = await loadScreenshot();
for (const c of detectBoard(flat).cells) { const b = cellBox(c); fillRect(flat, b.x0, b.y0, b.x1, b.y1, [90, 140, 200]); }
const notTree = await sharpFromImage(flat).png().toBuffer();
const errorImages = [
  ['no-board.png', noBoard, 'Puzzle not found'],
  ['not-tree.png', notTree, 'Not the Tree puzzle'],
];

const browser = await chromium.launch();
const results = [];
let failed = false;
try {
  for (const cfg of VIEWPORTS) {
    try {
      results.push(await runViewport(browser, cfg, { base, errorImages }));
    } catch (e) {
      failed = true;
      results.push({ viewport: cfg.name, failure: e.message });
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(results.map(({ requests, ...rest }) => ({ ...rest, requestCount: requests?.length })), null, 2));
if (failed) { console.error('E2E FAILED'); process.exit(1); }
console.log(`E2E PASSED — screenshots in ${path.relative(root, shots)}/`);
