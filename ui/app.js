// Presentation and flow for the puzzle walkthrough. All recognition,
// identification, solving and walkthrough logic lives in src/; this file only
// wires it to the page. The screenshot never leaves the device: the only
// network requests are for the reference artwork shipped with the page and
// the anonymous usage counts below (see report()).
import { prepareReference, recognizeAnyPuzzle } from '../src/recognize.js';
import { solvePuzzle } from '../src/solver.js';
import { createWalkthrough } from '../src/walkthrough.js';
import { encodeProgress, decodeProgress, PROGRESS_KEY } from '../src/progress-storage.js';
import { userMessage } from '../src/user-messages.js';
import { REFERENCES } from '../src/references.js';
import { imageDataFromBlob, imageDataFromUrl } from '../src/browser/load-image.js';
import { tileArtwork } from './tile-art.js';

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

// ------------------------------------------------------------------ views

function show(view) {
  document.body.dataset.view = view;
  for (const v of ['upload', 'analysing', 'error', 'walkthrough']) $(`${v}-view`).hidden = v !== view;
}

function showError(code) {
  const msg = userMessage(code);
  reportFailed(code);
  $('error-title').textContent = msg.title;
  $('error-text').textContent = msg.text;
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
    const recognition = recognizeAnyPuzzle(img, loaded.map((l) => l.reference));
    if (!recognition.ok) return showError(recognition.error.code);

    const solution = solvePuzzle(recognition.state);
    document.body.dataset.analysisMs = String(Math.round(performance.now() - t0));
    if (!solution.ok) return showError(solution.error.code);

    await startWalkthrough(recognition.puzzleId, recognition.state, solution.taps, 0, false, myFlow);
    if (myFlow === flow) report('/read/[puzzle]', `/read/${recognition.puzzleId}`);
  } catch (err) {
    if (myFlow !== flow) return;
    console.error(err);
    showError('UNEXPECTED');
  }
}

// ----------------------------------------------------------- walkthrough

async function startWalkthrough(puzzleId, start, taps, index, resumed, expectedFlow) {
  const art = await artworkFor(puzzleId);
  if (expectedFlow !== flow) return; // superseded by a newer user action
  const walkthrough = createWalkthrough(start, taps);
  session = { puzzleId, walkthrough, start, index: walkthrough.clamp(index) };
  // A resumed walkthrough already past halfway was counted before the reload.
  session.reportedHalfway = session.index >= halfwayIndex(taps.length);
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

// Up to `count` upcoming taps from the current index: tile → { step, arrow }.
// A tile only moves when it is tapped, so every tile shown is still in its
// current cell when its turn comes. The preview stops before the first tile
// that would be tapped a second time, so what is lit is always the exact
// next moves in order, with no gaps.
function upcomingTaps(w, index, count) {
  const byTile = new Map();
  for (let k = 0; k < count && index + k < w.total; k++) {
    const v = w.view(index + k);
    if (byTile.has(v.nextTile)) break;
    byTile.set(v.nextTile, { step: k + 1, arrow: moveArrow(v.board, v.nextTile) });
  }
  return byTile;
}

function markFor(entry) {
  const mark = document.createElement('span');
  mark.className = `mark ${display.mark}`;
  if (display.mark !== 'numbers') {
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = entry.arrow;
    mark.append(arrow);
  }
  if (display.mark !== 'arrows') {
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(entry.step);
    mark.append(num);
  }
  return mark;
}

function render() {
  const w = session.walkthrough;
  const view = w.view(session.index);
  const board = $('board');
  board.classList.toggle('solved', view.complete);
  const upcoming = upcomingTaps(w, session.index, display.steps);
  for (const tile of board.children) {
    const t = Number(tile.dataset.tile);
    const cell = view.board.indexOf(t);
    tile.style.setProperty('--r', String(Math.floor(cell / 5)));
    tile.style.setProperty('--c', String(cell % 5));
    tile.dataset.cell = String(cell);
    const entry = upcoming.get(t);
    tile.classList.toggle('next', entry?.step === 1);
    tile.classList.toggle('later', entry != null && entry.step > 1);
    tile.querySelector('.mark')?.remove();
    if (entry) {
      tile.dataset.step = String(entry.step);
      tile.append(markFor(entry));
    } else {
      delete tile.dataset.step;
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

// Move forward (delta > 0) or back (delta < 0) by |delta| taps.
function step(delta) {
  if (!session || document.body.dataset.view !== 'walkthrough') return;
  const w = session.walkthrough;
  const index = w.clamp(session.index + delta);
  if (index === session.index) return;
  session.index = index;
  $('resumed').hidden = true;
  render();
  if (delta > 0 && index >= halfwayIndex(w.taps.length)) reportHalfway();
  if (delta > 0 && w.view(index).complete) reportSolved();
}

// Anonymous usage counts, logged as page views with Vercel Web Analytics:
//   /read/<puzzle>    a screenshot was read and a solution shown
//   /halfway/<puzzle> the walkthrough reached its halfway move (once per walkthrough)
//   /solved/<puzzle>  the walkthrough reached the last move (once per walkthrough)
//   /failed/<reason>  a screenshot couldn't be used (the error code only)
// Only these paths are sent — never the screenshot, board or move data — and
// they are silently skipped if analytics is unavailable or blocked.
function report(route, path) {
  try {
    window.va?.('pageview', { route, path });
  } catch { /* analytics must never affect the puzzle */ }
}

// Move index at which a walkthrough counts as halfway (rounded up).
function halfwayIndex(total) {
  return Math.ceil(total / 2);
}

function reportHalfway() {
  if (session.reportedHalfway) return;
  session.reportedHalfway = true;
  report('/halfway/[puzzle]', `/halfway/${session.puzzleId}`);
}

function reportSolved() {
  if (session.reportedSolved) return;
  session.reportedSolved = true;
  report('/solved/[puzzle]', `/solved/${session.puzzleId}`);
}

const FAILURE_CODES = ['BOARD_NOT_FOUND', 'UNSUPPORTED_PUZZLE', 'PUZZLE_AMBIGUOUS', 'POOR_MATCH',
  'AMBIGUOUS', 'INVALID_STATE', 'UNSOLVABLE', 'UNEXPECTED'];
function reportFailed(code) {
  const known = FAILURE_CODES.includes(code) ? code : 'UNEXPECTED';
  report('/failed/[reason]', `/failed/${known.toLowerCase().replaceAll('_', '-')}`);
}

// ------------------------------------------------------- display options
// How many upcoming taps to highlight and how to mark them. A per-device
// preference only, kept apart from puzzle progress.
const DISPLAY_KEY = 'osrs-puzzle-solver/display';
const STEP_CHOICES = [1, 3, 5];
const MARK_CHOICES = ['arrows', 'numbers', 'both'];
const display = loadDisplay();

function loadDisplay() {
  const fallback = { steps: 1, mark: 'arrows' };
  try {
    const saved = JSON.parse(localStorage.getItem(DISPLAY_KEY));
    return {
      steps: STEP_CHOICES.includes(saved?.steps) ? saved.steps : fallback.steps,
      mark: MARK_CHOICES.includes(saved?.mark) ? saved.mark : fallback.mark,
    };
  } catch {
    return fallback;
  }
}

function setDisplay(change) {
  Object.assign(display, change);
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(display)); } catch { /* preference just isn't remembered */ }
  renderOptions();
  if (session) render();
}

function renderOptions() {
  for (const b of document.querySelectorAll('#options [data-steps]')) b.setAttribute('aria-pressed', String(Number(b.dataset.steps) === display.steps));
  for (const b of document.querySelectorAll('#options [data-mark]')) b.setAttribute('aria-pressed', String(b.dataset.mark === display.mark));
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
// Tapping a highlighted tile moves forward to (and including) that tile's
// step, so after making several moves in OSRS one tap catches the page up.
$('board').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (tile?.dataset.step) step(Number(tile.dataset.step));
});
$('options').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.steps) setDisplay({ steps: Number(b.dataset.steps) });
  else if (b?.dataset.mark) setDisplay({ mark: b.dataset.mark });
});
renderOptions();
$('previous').addEventListener('click', () => step(-1));
$('start-over').addEventListener('click', () => {
  flow++;
  clearProgress();
  session = null;
  show('upload');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
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
    await startWalkthrough(saved.puzzleId, saved.start, saved.taps, saved.index, true, myFlow);
  } catch {
    if (myFlow !== flow) return;
    clearProgress();
    show('upload');
  }
})();
