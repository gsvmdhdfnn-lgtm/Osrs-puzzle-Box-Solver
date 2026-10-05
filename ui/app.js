// Presentation and flow for the Tree puzzle walkthrough. All recognition,
// solving and walkthrough logic lives in src/; this file only wires it to the
// page. Nothing leaves the device: the only network request is for the
// reference artwork shipped with the page.
import { prepareReference, recognizePuzzle } from '../src/recognize.js';
import { solvePuzzle } from '../src/solver.js';
import { createWalkthrough } from '../src/walkthrough.js';
import { encodeProgress, decodeProgress, PROGRESS_KEY } from '../src/progress-storage.js';
import { userMessage } from '../src/user-messages.js';
import { REFERENCES } from '../src/references.js';
import { imageDataFromBlob, imageDataFromUrl } from '../src/browser/load-image.js';
import { tileArtwork } from './tile-art.js';
import { renderDebug } from './debug.js';

const $ = (id) => document.getElementById(id);

// Reference image → recogniser reference + per-tile artwork. Loaded once.
let referencePromise;
function loadReference() {
  referencePromise ??= imageDataFromUrl(REFERENCES.tree.src).then((img) => {
    const reference = prepareReference(img);
    return { reference, art: tileArtwork(img, reference) };
  });
  return referencePromise;
}

let session = null;     // { walkthrough, start, index }
let debugInfo = {};

// ------------------------------------------------------------------ views

function show(view) {
  document.body.dataset.view = view;
  for (const v of ['upload', 'analysing', 'error', 'walkthrough']) $(`${v}-view`).hidden = v !== view;
  if ($('debug').open) renderDebug($('debug-body'), debugInfo);
}

function showError(code, detail) {
  const msg = userMessage(code);
  $('error-title').textContent = msg.title;
  $('error-text').textContent = msg.text;
  debugInfo = { ...debugInfo, error: { code, message: detail ?? msg.text } };
  show('error');
}

// ------------------------------------------------------------- analysis

async function analyse(file) {
  show('analysing');
  clearProgress();
  // Let "Reading puzzle…" paint before the (synchronous) heavy work starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const t0 = performance.now();
  try {
    const [{ reference }, img] = await Promise.all([loadReference(), imageDataFromBlob(file)]);
    const t1 = performance.now();
    const recognition = recognizePuzzle(img, reference);
    const t2 = performance.now();
    debugInfo = { recognition, timingsMs: { load: t1 - t0, recognise: t2 - t1 } };
    if (!recognition.ok) return showError(recognition.error.code, recognition.error.message);

    const solution = solvePuzzle(recognition.state);
    const t3 = performance.now();
    debugInfo = { recognition, solution, timingsMs: { load: t1 - t0, recognise: t2 - t1, solve: t3 - t2, total: t3 - t0 } };
    document.body.dataset.analysisMs = String(Math.round(t3 - t0));
    if (!solution.ok) return showError(solution.error.code, solution.error.message);

    await startWalkthrough(recognition.state, solution.taps, 0, false);
  } catch (err) {
    console.error(err);
    showError('UNEXPECTED', String(err?.message ?? err));
  }
}

// ----------------------------------------------------------- walkthrough

async function startWalkthrough(start, taps, index, resumed) {
  const { art } = await loadReference();
  const walkthrough = createWalkthrough(start, taps);
  session = { walkthrough, start, index: walkthrough.clamp(index) };
  buildBoard(art);
  $('resumed').hidden = !resumed;
  show('walkthrough');
  render();
}

function buildBoard(art) {
  const board = $('board');
  board.replaceChildren();
  for (let t = 1; t <= 24; t++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.tile = String(t);
    const img = document.createElement('img');
    img.src = art.get(t);
    img.alt = '';
    img.draggable = false;
    tile.append(img);
    board.append(tile);
  }
}

function render() {
  const view = session.walkthrough.view(session.index);
  const board = $('board');
  board.classList.toggle('solved', view.complete);
  for (const tile of board.children) {
    const t = Number(tile.dataset.tile);
    const cell = view.board.indexOf(t);
    tile.style.setProperty('--r', String(Math.floor(cell / 5)));
    tile.style.setProperty('--c', String(cell % 5));
    tile.dataset.cell = String(cell);
    const isNext = t === view.nextTile;
    tile.classList.toggle('next', isNext);
    tile.querySelector('.badge')?.remove();
    if (isNext) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(t);
      tile.append(badge);
    }
  }
  board.setAttribute('aria-label', view.complete
    ? 'Solved Tree puzzle'
    : `Tree puzzle. Tap the highlighted tile (tile ${view.nextTile}).`);

  const label = $('move-label');
  label.textContent = view.complete ? 'Puzzle solved ✓' : `Move ${view.moveNumber} of ${view.total}`;
  label.classList.toggle('solved', view.complete);
  $('upcoming').textContent = view.complete ? '' : view.upcoming.length ? `Then: ${view.upcoming.join(' · ')}` : 'Last move';
  $('previous').disabled = !view.canPrevious;
  $('next').disabled = !view.canNext;
  saveProgress();
}

function step(delta) {
  if (!session || document.body.dataset.view !== 'walkthrough') return;
  const w = session.walkthrough;
  const index = delta > 0 ? w.next(session.index) : w.previous(session.index);
  if (index === session.index) return;
  session.index = index;
  $('resumed').hidden = true;
  render();
}

// ------------------------------------------------------------ persistence

function saveProgress() {
  if (!session) return;
  try {
    localStorage.setItem(PROGRESS_KEY, encodeProgress({ start: session.start, taps: session.walkthrough.taps, index: session.index }));
  } catch { /* storage unavailable (private mode / quota): walkthrough still works */ }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
}

function loadProgress() {
  let raw = null;
  try { raw = localStorage.getItem(PROGRESS_KEY); } catch { return null; }
  if (raw == null) return null;
  const saved = decodeProgress(raw);
  if (!saved) clearProgress(); // corrupt or incompatible: discard silently
  return saved;
}

// ----------------------------------------------------------------- wiring

for (const id of ['file', 'file-retry']) {
  $(id).addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (file) analyse(file);
  });
}
$('next').addEventListener('click', () => step(1));
$('previous').addEventListener('click', () => step(-1));
$('start-over').addEventListener('click', () => {
  clearProgress();
  session = null;
  debugInfo = {};
  show('upload');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
});
$('debug').addEventListener('toggle', () => {
  if ($('debug').open) renderDebug($('debug-body'), debugInfo);
});

// Start: resume saved progress if valid, otherwise show the upload screen.
(async () => {
  loadReference().catch(() => {}); // warm up; errors surface on use
  const saved = loadProgress();
  if (!saved) return show('upload');
  try {
    debugInfo = { resumed: saved };
    await startWalkthrough(saved.start, saved.taps, saved.index, true);
  } catch {
    clearProgress();
    show('upload');
  }
})();
