// Plain-language messages for failures shown to players. Technical details
// stay in the debug disclosure.

const MESSAGES = {
  BOARD_NOT_FOUND: {
    title: 'Puzzle not found',
    text: "Couldn't find the puzzle box in this screenshot. Open the puzzle in OSRS and make sure the whole board is visible, then take a new screenshot.",
  },
  POOR_MATCH: {
    title: 'Not the Tree puzzle',
    text: "This doesn't look like the Tree puzzle. Only the Tree puzzle is supported at the moment.",
  },
  AMBIGUOUS: {
    title: 'Tiles unclear',
    text: "Some tiles couldn't be identified confidently, so no solution is shown. Try a clearer screenshot with nothing covering the puzzle.",
  },
  INVALID_STATE: {
    title: 'Puzzle not readable',
    text: "The tiles read from this screenshot don't form a valid puzzle. Please try another screenshot.",
  },
  UNSOLVABLE: {
    title: 'Puzzle not readable',
    text: "The tiles read from this screenshot don't form a valid puzzle. Please try another screenshot.",
  },
  UNEXPECTED: {
    title: 'Something went wrong',
    text: 'Something went wrong while reading the screenshot. Please try again.',
  },
};

export function userMessage(code) {
  return MESSAGES[code] ?? MESSAGES.UNEXPECTED;
}
