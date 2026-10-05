// Pure pixel helpers. An "image" here is anything shaped like ImageData:
// { width, height, data } where data is RGBA, 4 bytes per pixel, row-major.
// No DOM or Node APIs are used so the same code runs in the browser and tests.

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Area-average (box filter) resample of an arbitrary, possibly fractional,
 * source rectangle into an n×n RGB float tile. Each output pixel is the
 * coverage-weighted mean of the source pixels under its footprint, which
 * behaves well both when shrinking (screenshot → reference scale) and when
 * the footprint is smaller than one source pixel.
 * Returns Float64Array of length n*n*3 (linear-light RGB, 0..1).
 */
export function resampleRect(img, rect, n) {
  const xs = axisWeights(rect.x, rect.w, n, img.width);
  const ys = axisWeights(rect.y, rect.h, n, img.height);
  const out = new Float64Array(n * n * 3);
  const { data, width } = img;
  for (let oy = 0; oy < n; oy++) {
    const wy = ys[oy];
    for (let ox = 0; ox < n; ox++) {
      const wx = xs[ox];
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let j = 0; j < wy.length; j += 2) {
        const row = wy[j] * width;
        const fy = wy[j + 1];
        for (let i = 0; i < wx.length; i += 2) {
          const w = fy * wx[i + 1];
          const p = (row + wx[i]) * 4;
          r += w * SRGB_TO_LINEAR[data[p]];
          g += w * SRGB_TO_LINEAR[data[p + 1]];
          b += w * SRGB_TO_LINEAR[data[p + 2]];
          wsum += w;
        }
      }
      const o = (oy * n + ox) * 3;
      out[o] = r / wsum;
      out[o + 1] = g / wsum;
      out[o + 2] = b / wsum;
    }
  }
  return out;
}

// For each of n output samples spanning [start, start+len), the list of
// (sourceIndex, coverage) pairs, flattened. Source indices are clamped.
function axisWeights(start, len, n, limit) {
  const step = len / n;
  const res = [];
  for (let k = 0; k < n; k++) {
    const a = start + k * step;
    const b = a + step;
    const list = [];
    for (let s = Math.floor(a); s < b; s++) {
      const cover = Math.min(b, s + 1) - Math.max(a, s);
      if (cover <= 1e-9) continue;
      list.push(Math.min(limit - 1, Math.max(0, s)), cover);
    }
    res.push(list);
  }
  return res;
}

/** Convert a linear-RGB float tile (from resampleRect) to CIELAB (D65). */
export function linearRgbToLab(tile) {
  const out = new Float64Array(tile.length);
  for (let i = 0; i < tile.length; i += 3) {
    const r = tile[i], g = tile[i + 1], b = tile[i + 2];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    out[i] = 116 * fy - 16;
    out[i + 1] = 500 * (fx - fy);
    out[i + 2] = 200 * (fy - fz);
  }
  return out;
}

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
