// Presentation and flow for the puzzle walkthrough. All recognition,
// identification, solving and walkthrough logic lives in src/; this file only
// wires it to the page. Nothing leaves the device: the only network requests
// are for the reference artwork shipped with the page.
import { prepareReference, recognizeAnyPuzzle } from '../src/recognize.js';
import { solvePuzzle } from '../src/solver.js';
import { createWalkthrough } from '../src/walkthrough.js';
import { encodeProgress, decodeProgress, PROGRESS_KEY } from '../src/progress-storage.js';
import { userMessage } from '../src/user-messages.js';
import { REFERENCES } from '../src/references.js';
import { imageDataFromBlob, imageDataFromUrl } from '../src/browser/load-image.js';
import { tileArtwork } from './tile-art.js';
import { renderDebug } from './debug.js';

const $ = (id) => document.getElementById(id);

// All supported reference images → prepared references. Loaded once; tile
// artwork is cut lazily for the puzzle actually shown.
let referencesPromise;
function loadReferences() {
  referencesPromise ??= Promise.all(Object.values(REFERENCES).map(async (entry) => {
    const img = await imageDataFromUrl(entry.src);
    return { entry, img, reference: prepareReference(img, { id: entry.id }) };
  }));
  return referencesPromise;
}
const artCache = new Map();
async function artworkFor(puzzleId) {
  if (!artCache.has(puzzleId)) {
    const loaded = (await loadReferences()).find((r) => r.entry.id === puzzleId);
    if (!loaded) throw new Error(`Unknown puzzle ${puzzleId}`);
    artCache.set(puzzleId, tileArtwork(loaded.img, loaded.reference));
  }
  return artCache.get(puzzleId);
}

let session = null;     // { puzzleId, walkthrough, start, index }
// Incremented by every user action (upload, Start over). Async work started
// for an earlier action checks it and does nothing once it is stale, so a
// slow resume or analysis can never render or save over a newer action.
let flow = 0;
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
  const myFlow = ++flow;
  show('analysing');
  clearProgress();
  // Let "Reading puzzle…" paint before the (synchronous) heavy work starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const t0 = performance.now();
  try {
    const [loaded, img] = await Promise.all([loadReferences(), imageDataFromBlob(file)]);
    if (myFlow !== flow) return;
    const t1 = performance.now();
    const recognition = recognizeAnyPuzzle(img, loaded.map((l) => l.reference));
    const t2 = performance.now();
    debugInfo = { recognition, timingsMs: { load: t1 - t0, recognise: t2 - t1 } };
    if (!recognition.ok) return showError(recognition.error.code, recognition.error.message);

    const solution = solvePuzzle(recognition.state);
    const t3 = performance.now();
    debugInfo = { recognition, solution, timingsMs: { load: t1 - t0, recognise: t2 - t1, solve: t3 - t2, total: t3 - t0 } };
    document.body.dataset.analysisMs = String(Math.round(t3 - t0));
    if (!solution.ok) return showError(solution.error.code, solution.error.message);

    await startWalkthrough(recognition.puzzleId, recognition.state, solution.taps, 0, false, myFlow);
  } catch (err) {
    if (myFlow !== flow) return;
    console.error(err);
    showError('UNEXPECTED', String(err?.message ?? err));
  }
}

// ----------------------------------------------------------- walkthrough

async function startWalkthrough(puzzleId, start, taps, index, resumed, expectedFlow) {
  const art = await artworkFor(puzzleId);
  if (expectedFlow !== flow) return; // superseded by a newer user action
  const walkthrough = createWalkthrough(start, taps);
  session = { puzzleId, walkthrough, start, index: walkthrough.clamp(index) };
  buildBoard(art);
  $('board').dataset.puzzle = puzzleId;
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

function moveArrow(board, tile) {
  const from = board.indexOf(tile);
  const blank = board.indexOf(0);
  const fromRow = Math.floor(from / 5);
  const fromCol = from % 5;
  const blankRow = Math.floor(blank / 5);
  const blankCol = blank % 5;
  if (fromRow === blankRow) return blankCol > fromCol ? '→' : '←';
  return blankRow > fromRow ? '↓' : '↑';
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
      badge.textContent = moveArrow(view.board, t);
      tile.append(badge);
    }
  }
  const name = REFERENCES[session.puzzleId]?.name ?? 'Puzzle';
  board.setAttribute('aria-label', view.complete
    ? `Solved ${name} puzzle`
    : `${name} puzzle. Tap the highlighted tile (tile ${view.nextTile}).`);

  const label = $('move-label');
  label.textContent = view.complete ? 'Puzzle solved ✓' : `Move ${view.moveNumber} of ${view.total}`;
  label.classList.toggle('solved', view.complete);
  $('previous').disabled = !view.canPrevious;
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
    localStorage.setItem(PROGRESS_KEY, encodeProgress({ puzzleId: session.puzzleId, start: session.start, taps: session.walkthrough.taps, index: session.index }));
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
$('board').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (tile?.classList.contains('next')) step(1);
});
$('previous').addEventListener('click', () => step(-1));
$('start-over').addEventListener('click', () => {
  flow++;
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
// While a resume is being prepared the upload screen stays hidden, so a new
// screenshot cannot be chosen until the app has settled into one state.
(async () => {
  loadReferences().catch(() => {}); // warm up; errors surface on use
  const saved = loadProgress();
  if (!saved) return show('upload');
  const myFlow = flow;
  try {
    debugInfo = { resumed: saved };
    await startWalkthrough(saved.puzzleId, saved.start, saved.taps, saved.index, true, myFlow);
  } catch {
    if (myFlow !== flow) return;
    clearProgress();
    show('upload');
  }
})();
