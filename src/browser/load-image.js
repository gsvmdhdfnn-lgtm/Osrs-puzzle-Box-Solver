// Browser-only adapter: File/Blob/URL → ImageData via a canvas. Kept apart
// from the pure recognition modules so they stay runnable under Node.

export async function imageDataFromBlob(blob) {
  // createImageBitmap applies EXIF orientation ('from-image') by default.
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height, { colorSpace: 'srgb' });
  } finally {
    bitmap.close?.();
  }
}

export async function imageDataFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return imageDataFromBlob(await res.blob());
}
