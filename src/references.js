// Canonical reference images, one per puzzle. A reference is any clean image
// of the *solved* board including its frame; its grid is detected exactly
// like a screenshot's, so replacing tree.webp with a lossless tree.png only
// requires changing `src` here — the recognition algorithm is unchanged.
export const REFERENCES = {
  tree: { name: 'Tree', src: 'assets/reference/tree.webp' },
};
