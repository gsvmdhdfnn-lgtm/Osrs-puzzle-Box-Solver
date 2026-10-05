// Browser-only: cuts the clean reference image into one image per tile
// (1..24) using the grid the recogniser detected in that reference.

export function tileArtwork(referenceImage, reference) {
  const src = document.createElement('canvas');
  src.width = referenceImage.width;
  src.height = referenceImage.height;
  src.getContext('2d').putImageData(referenceImage, 0, 0);

  const art = new Map();
  reference.board.cells.forEach((cell, k) => {
    const tile = reference.labels[k];
    if (tile === 0) return;
    const x = Math.round(cell.x), y = Math.round(cell.y);
    const w = Math.round(cell.x + cell.w) - x, h = Math.round(cell.y + cell.h) - y;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    art.set(tile, c.toDataURL('image/png'));
  });
  return art;
}
