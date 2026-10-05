# Osrs-puzzle-Box-Solver

Free, fully client-side OSRS Mobile puzzle-box helper (Tree puzzle only for
now). Upload an untouched screenshot with the puzzle open: the page finds the
board, identifies every tile, solves it and walks you through it one
highlighted tile at a time (Previous / Next). Progress is kept in this
browser's local storage (numbers only, never the screenshot) so it survives a
reload or app switch. Nothing is uploaded anywhere.

## Run the page

ES modules need to be served over HTTP (not `file://`):

```sh
npm run serve        # python3 -m http.server 8080
# open http://localhost:8080/
```

Upload a screenshot (`test/fixtures/tree-mobile-img0120.png` works).

## Tests

```sh
npm install          # dev-only: sharp, used by tests to decode images
npm test
npm run test:e2e     # real browser, 390×844 and 1280×800; needs a Playwright
                     # install (not a dependency); screenshots → test/e2e/screenshots/
```

## Layout

| Path | Role |
| --- | --- |
| `src/board-detect.js` | Finds the grid (4+4 equally spaced dark lines + frame), sub-pixel tile edges, detection confidence |
| `src/tile-match.js` | Lab tile comparison, Hungarian assignment, colour correction, look-alike disambiguation, per-cell margins |
| `src/recognize.js` | Pipeline + accept/fail policy (`recognizePuzzle`, `prepareReference`) |
| `src/puzzle-state.js` | Permutation validation, solvability (inversion parity), legal taps (`applyTap`) |
| `src/solver.js` | `solvePuzzle(state)` → tap sequence. Staged exact search (BFS per tile group, optimal 3×3 finish), best of rows-first / columns-first |
| `src/hungarian.js`, `src/image.js` | Assignment solver; resampling and colour conversion |
| `src/references.js` | Reference image per puzzle (swap `tree.webp` for a lossless PNG here) |
| `src/walkthrough.js` | Tap-by-tap walkthrough state (pure) |
| `src/progress-storage.js` | Saved-progress encoding and strict validation |
| `src/user-messages.js` | Plain-language error messages |
| `src/browser/load-image.js` | Browser-only File/URL → ImageData |
| `index.html`, `ui/` | Page, styles, tile artwork, debug details |

Everything in `src/` is dependency-free plain JavaScript (enforced by a test).
