# Osrs-puzzle-Box-Solver

Free, fully client-side OSRS Mobile puzzle-box helper. Current slice: **Tree
recognition proof** — upload an untouched mobile screenshot and the page
locates the 5×5 board, identifies all 24 tiles and the blank against a clean
reference, validates the result and shows diagnostics. (No solver or tap
guidance yet.)

A separate, pure solver module (`src/solver.js`) turns a validated board state
into a sequence of tile numbers to tap. It is not wired into the page yet.

## Run the proof page

ES modules need to be served over HTTP (not `file://`):

```sh
npm run serve        # python3 -m http.server 8080
# open http://localhost:8080/
```

Pick a screenshot, or press **Use test screenshot (IMG_0120)**.

## Tests

```sh
npm install          # dev-only: sharp, used by tests to decode images
npm test
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
| `src/browser/load-image.js` | Browser-only File/URL → ImageData |
| `index.html`, `ui/` | Minimal presentation |

Everything in `src/` is dependency-free plain JavaScript (enforced by a test).
