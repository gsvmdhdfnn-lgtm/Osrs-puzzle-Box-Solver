// Canonical reference images, one per supported puzzle, keyed by a stable
// internal id (used in saved progress — never rename an id). A reference is
// any clean image of the *solved* board including its frame; its grid is
// detected exactly like a screenshot's, so a file can be replaced (e.g. the
// lossy Zulrah JPEG by a lossless PNG) by changing `src` only.
export const REFERENCES = {
  tree: { id: 'tree', name: 'Tree', src: 'assets/reference/tree.webp' },
  gnome: { id: 'gnome', name: 'Gnome', src: 'assets/reference/gnome.png' },
  cerberus: { id: 'cerberus', name: 'Cerberus', src: 'assets/reference/cerberus.png' },
  troll: { id: 'troll', name: 'Troll', src: 'assets/reference/troll.png' },
  zulrah: { id: 'zulrah', name: 'Zulrah', src: 'assets/reference/zulrah.jpg' },
  castle: { id: 'castle', name: 'Castle', src: 'assets/reference/castle.webp' },
  'gothic-castle': { id: 'gothic-castle', name: 'Gothic castle', src: 'assets/reference/gothic-castle.webp' },
};

export const PUZZLE_IDS = Object.freeze(Object.keys(REFERENCES));
