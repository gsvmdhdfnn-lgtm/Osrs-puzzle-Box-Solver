// Presentation only: wires the file input to the recognition pipeline and
// renders its result and diagnostics. No recognition logic lives here.
import { prepareReference, recognizePuzzle } from '../src/recognize.js';
import { REFERENCES } from '../src/references.js';
import { imageDataFromBlob, imageDataFromUrl } from '../src/browser/load-image.js';

const SAMPLE = 'test/fixtures/tree-mobile-img0120.png';
const $ = (id) => document.getElementById(id);
let referencePromise;

function reference() {
  referencePromise ??= imageDataFromUrl(REFERENCES.tree.src).then((img) => prepareReference(img));
  return referencePromise;
}

$('file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) analyse(() => imageDataFromBlob(file), file.name);
});
$('sample').addEventListener('click', () => analyse(() => imageDataFromUrl(SAMPLE), 'IMG_0120 (test fixture)'));

async function analyse(load, name) {
  setStatus(`Analysing ${name}…`);
  $('result').hidden = true;
  try {
    const [img, ref] = await Promise.all([load(), reference()]);
    await new Promise((r) => setTimeout(r, 0)); // let the status repaint
    const result = recognizePuzzle(img, ref);
    render(img, result);
    window.lastResult = result; // handy when inspecting from the console
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'bad');
    console.error(err);
  }
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

function render(img, result) {
  const d = result.diagnostics;
  if (result.ok) {
    setStatus(`Recognised. Board confidence ${fmt(d.boardConfidence)} · solvable (${d.validation.inversions} inversions) · resolved by ${d.validation.resolvedBy}.`, 'ok');
  } else {
    setStatus(`Recognition failed [${result.error.code}]: ${result.error.message}`, 'bad');
  }
  $('result').hidden = false;
  drawOverlay(img, result);
  renderState(result);
  renderSummary(d);
  renderCells(d);
  renderPairs(d);
  $('json').textContent = JSON.stringify(d, null, 1);
}

function drawOverlay(img, result) {
  const canvas = $('overlay');
  const board = result.diagnostics.boardDetection;
  // Crop around the board when found, otherwise show the whole image.
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (board.ok) {
    const pad = board.rect.w * 0.12;
    sx = Math.max(0, Math.floor(board.rect.x - pad));
    sy = Math.max(0, Math.floor(board.rect.y - pad));
    sw = Math.min(img.width - sx, Math.ceil(board.rect.w + 2 * pad));
    sh = Math.min(img.height - sy, Math.ceil(board.rect.h + 2 * pad));
  }
  const scale = Math.min(1, 520 / Math.max(sw, sh));
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = img.width; tmp.height = img.height;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(tmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if (!board.ok) return;

  const cellInfo = result.diagnostics.tiles?.cells ?? [];
  ctx.lineWidth = 2;
  ctx.font = `bold ${Math.round(board.pitch.x * scale * 0.3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  board.cells.forEach((c, i) => {
    const x = (c.x - sx) * scale, y = (c.y - sy) * scale, w = c.w * scale, h = c.h * scale;
    const info = cellInfo[i];
    const good = info ? info.confident : true;
    ctx.strokeStyle = good ? 'rgba(40, 220, 90, 0.9)' : 'rgba(255, 60, 60, 0.95)';
    ctx.strokeRect(x, y, w, h);
    if (info) {
      const label = info.tile === 0 ? '·' : String(info.tile);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + w / 2 - w * 0.22, y + h / 2 - h * 0.2, w * 0.44, h * 0.4);
      ctx.fillStyle = good ? '#fff' : '#ff8080';
      ctx.fillText(label, x + w / 2, y + h / 2);
    }
  });
}

function renderState(result) {
  const table = $('state');
  table.replaceChildren();
  const cells = result.diagnostics.tiles?.cells;
  const state = result.state ?? result.diagnostics.candidate?.state;
  if (!state) { table.innerHTML = '<tr><td>—</td></tr>'; return; }
  for (let r = 0; r < 5; r++) {
    const tr = table.insertRow();
    for (let c = 0; c < 5; c++) {
      const v = state[r * 5 + c];
      const td = tr.insertCell();
      td.textContent = v;
      if (v === 0) td.classList.add('blank');
      if (!result.ok || (cells && !cells[r * 5 + c].confident)) td.classList.add('weak');
    }
  }
  if (!result.ok) table.title = 'Candidate only — recognition was rejected.';
}

function renderSummary(d) {
  const b = d.boardDetection;
  const rows = [
    ['Image', `${d.image.width} × ${d.image.height}`],
    ['Board detection', b.ok ? `found · confidence ${fmt(b.confidence)}` : `not found · ${b.reason}`],
  ];
  if (b.ok) {
    rows.push(
      ['Board rect', `x ${fmt(b.rect.x, 1)}, y ${fmt(b.rect.y, 1)}, ${fmt(b.rect.w, 1)} × ${fmt(b.rect.h, 1)}`],
      ['Tile pitch', `${fmt(b.pitch.x, 2)} × ${fmt(b.pitch.y, 2)} px`],
      ['Detection scores', Object.entries(b.scores).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')],
    );
  }
  if (d.tiles) {
    const cc = d.tiles.colourCorrection;
    rows.push(
      ['Mean / worst ΔE', `${fmt(d.tiles.meanDeltaE, 2)} / ${fmt(d.tiles.worstDeltaE, 2)}`],
      ['Weakest margin', fmt(d.tiles.minMargin)],
      ['Colour correction', cc ? `gain ${cc.gain.map((v) => fmt(v)).join(', ')} · offset ${cc.offset.map((v) => fmt(v)).join(', ')}${cc.clamped ? ' (clamped)' : ''}` : 'off'],
    );
  }
  if (d.validation) rows.push(['Validation', `permutation ✓ · inversions ${d.validation.inversions} · ${d.validation.solvable ? 'solvable' : 'UNSOLVABLE'}`]);
  if (d.boardConfidence != null) rows.push(['Overall confidence', fmt(d.boardConfidence)]);
  if (d.timingsMs) rows.push(['Time', Object.entries(d.timingsMs).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(', ')]);
  $('summary').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
}

function renderCells(d) {
  const t = $('cells');
  t.replaceChildren();
  if (!d.tiles) return;
  header(t, ['Cell', 'Tile', 'Best ΔE', '2nd tile', '2nd ΔE', 'Full margin', 'Discriminative (chosen / other ΔE, mask px)', 'Margin', 'Source', 'OK']);
  for (const c of d.tiles.cells) {
    const disc = c.discriminative ? `${fmt(c.discriminative.chosenDeltaE, 2)} / ${fmt(c.discriminative.otherDeltaE, 2)} vs ${c.discriminative.against} (${c.discriminative.maskPixels})` : '';
    const tr = row(t, [`r${c.row + 1} c${c.col + 1}`, c.tile, fmt(c.bestDeltaE, 2), c.secondTile, fmt(c.secondDeltaE, 2), fmt(c.fullMargin), disc, fmt(c.margin), c.marginSource, c.confident ? '✓' : '✗']);
    tr.lastChild.className = c.confident ? 'flag-ok' : 'flag-bad';
  }
}

function renderPairs(d) {
  const t = $('pairs');
  t.replaceChildren();
  const pairs = d.tiles?.lookalikePairs ?? [];
  if (!pairs.length) return;
  header(t, ['Tiles', 'Cells', 'Ref ΔE', 'Mask px', 'Chosen ΔE', 'Rejected ΔE', 'Margin', 'Swapped', 'Decided']);
  for (const p of [...pairs].sort((a, b) => a.referenceDeltaE - b.referenceDeltaE)) {
    const tr = row(t, [p.tiles.join(' / '), p.cells.map((i) => `r${Math.floor(i / 5) + 1}c${(i % 5) + 1}`).join(', '), fmt(p.referenceDeltaE, 2), p.maskPixels, fmt(p.chosenDeltaE, 2), fmt(p.rejectedDeltaE, 2), fmt(p.margin), p.swapped ? 'yes' : 'no', p.decided ? '✓' : '✗']);
    tr.lastChild.className = p.decided ? 'flag-ok' : 'flag-bad';
  }
}

function header(t, cols) { const tr = t.createTHead().insertRow(); for (const c of cols) tr.appendChild(el('th', c)); }
function row(t, vals) { const tr = (t.tBodies[0] ?? t.createTBody()).insertRow(); for (const v of vals) tr.insertCell().textContent = v ?? ''; return tr; }
function el(tag, text) { const e = document.createElement(tag); e.textContent = text; return e; }
function fmt(v, digits = 3) { return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : String(v); }
