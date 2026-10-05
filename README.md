# Osrs-puzzle-Box-Solver

Free, fully client-side OSRS Mobile puzzle-box helper. Current slice: **Tree
recognition proof** — upload an untouched mobile screenshot and the page
locates the 5×5 board, identifies all 24 tiles and the blank against a clean
reference, validates the result and shows diagnostics. (No solver or tap
guidance yet.)

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
| `src/puzzle-state.js` | Permutation validation and solvability (inversion parity) |
| `src/hungarian.js`, `src/image.js` | Assignment solver; resampling and colour conversion |
| `src/references.js` | Reference image per puzzle (swap `tree.webp` for a lossless PNG here) |
| `src/browser/load-image.js` | Browser-only File/URL → ImageData |
| `index.html`, `ui/` | Minimal presentation |

Everything in `src/` is dependency-free plain JavaScript (enforced by a test).
