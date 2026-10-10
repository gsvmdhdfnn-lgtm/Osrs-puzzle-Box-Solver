// Plain-language, puzzle-neutral messages for failures shown to players.
// Technical details are never shown to players.

const TILES_UNCLEAR = {
  title: 'Tiles unclear',
  text: "Some tiles couldn't be identified confidently, so no solution is shown. Try a clearer screenshot with nothing covering the puzzle.",
};
const NOT_READABLE = {
  title: 'Puzzle not readable',
  text: "The tiles read from this screenshot don't form a valid puzzle. Please try another screenshot.",
};

const MESSAGES = {
  BOARD_NOT_FOUND: {
    title: 'Puzzle not found',
    text: "Couldn't find the puzzle box in this screenshot. Open the puzzle in OSRS and make sure the whole board is visible, then take a new screenshot. If this was a light box, those aren't supported yet — coming soon.",
  },
  UNSUPPORTED_PUZZLE: {
    title: 'Puzzle not supported',
    text: "This doesn't look like one of the supported puzzle boxes. If this was a light box, those aren't supported yet — coming soon.",
  },
  PUZZLE_AMBIGUOUS: {
    title: 'Puzzle unclear',
    text: "The puzzle picture couldn't be identified confidently, so no solution is shown. Try a clearer screenshot with nothing covering the puzzle.",
  },
  POOR_MATCH: TILES_UNCLEAR,
  AMBIGUOUS: TILES_UNCLEAR,
  INVALID_STATE: NOT_READABLE,
  UNSOLVABLE: NOT_READABLE,
  UNEXPECTED: {
    title: 'Something went wrong',
    text: 'Something went wrong while reading the screenshot. Please try again.',
  },
};

export function userMessage(code) {
  return MESSAGES[code] ?? MESSAGES.UNEXPECTED;
}
