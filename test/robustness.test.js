// Transformed versions of the IMG_0120 fixture: passing must not depend on
// one exact image (resolution, resampling kernel, compression, blur, crop,
// framing and modest colour changes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizePuzzle } from '../src/recognize.js';
import { tree, sharp, loadImage, SCREENSHOT, EXPECTED_STATE } from './helpers/fixtures.js';

const W = 2360;
const jpeg = async (pipeline, quality) => sharp(await pipeline.jpeg({ quality }).toBuffer());

const VARIANTS = {
  'downscaled to 33%': () => sharp(SCREENSHOT).resize(Math.round(W * 0.33)),
  'downscaled to 50%': () => sharp(SCREENSHOT).resize(Math.round(W * 0.5)),
  'downscaled to 75% (cubic)': () => sharp(SCREENSHOT).resize(Math.round(W * 0.75), null, { kernel: 'cubic' }),
  'downscaled to 80% (nearest neighbour)': () => sharp(SCREENSHOT).resize(Math.round(W * 0.8), null, { kernel: 'nearest' }),
  'upscaled to 125%': () => sharp(SCREENSHOT).resize(Math.round(W * 1.25)),
  'JPEG quality 75': () => jpeg(sharp(SCREENSHOT), 75),
  'JPEG quality 40': () => jpeg(sharp(SCREENSHOT), 40),
  'gaussian blur σ=1.5': () => sharp(SCREENSHOT).blur(1.5),
  '60% + JPEG 70': async () => jpeg(sharp(await sharp(SCREENSHOT).resize(Math.round(W * 0.6)).png().toBuffer()), 70),
  'cropped (board off-centre)': () => sharp(SCREENSHOT).extract({ left: 401, top: 213, width: 1500, height: 1300 }),
  'padded to portrait': () => sharp(SCREENSHOT).extend({ top: 900, bottom: 700, background: '#335577' }),
  'brightness +5%': () => sharp(SCREENSHOT).modulate({ brightness: 1.05 }),
  'brightness −8%': () => sharp(SCREENSHOT).modulate({ brightness: 0.92 }),
  'gamma shift': () => sharp(SCREENSHOT).gamma(2.2, 2.0),
  'saturation +10%': () => sharp(SCREENSHOT).modulate({ saturation: 1.1 }),
};

for (const [name, make] of Object.entries(VARIANTS)) {
  test(`IMG_0120 ${name}`, async () => {
    const img = await loadImage(await make());
    const r = recognizePuzzle(img, await tree());
    assert.equal(r.ok, true, `${r.error?.code}: ${r.error?.message}`);
    assert.deepEqual(r.state, EXPECTED_STATE);
    for (const tile of [1, 5, 11, 15]) {
      const c = r.diagnostics.tiles.cells.find((x) => x.tile === tile);
      assert.ok(c.margin >= 0.4, `tile ${tile} margin ${c.margin}`);
    }
  });
}
