// Test-only: decode an image file (or sharp pipeline) into ImageData-shaped
// RGBA so the pure recognition modules can run under Node.
import sharp from 'sharp';

export async function loadImage(input) {
  const pipeline = typeof input === 'string' || Buffer.isBuffer(input) ? sharp(input) : input;
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
