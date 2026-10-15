export const CARD_WIDTH_IN = 1.312;
export const CARD_HEIGHT_IN = 2;
export const SHEET_WIDTH_IN = 11;
export const SHEET_HEIGHT_IN = 8.5;
export const SHEET_MARGIN_IN = 0.25;
export const CARDS_PER_ROW = 8;
export const ROWS_PER_SHEET = 4;
export const BACKGROUND_OPACITY = 0.15;

export type BackgroundImage = 'player1' | 'player2' | 'player3' | 'goalie';

/** The artwork for the card at a row position (0-5 standard players, 6-7 goaltenders); the second of each pair is mirrored. */
export function backgroundFor(position: number): { image: BackgroundImage; mirrored: boolean } {
  if (!Number.isInteger(position) || position < 0 || position >= CARDS_PER_ROW) {
    throw new RangeError(`Not a card position: ${position}`);
  }
  const images: BackgroundImage[] = ['player1', 'player2', 'player3', 'goalie'];
  return { image: images[Math.floor(position / 2)], mirrored: position % 2 === 1 };
}

/** Splits team indexes into sheets of four rows. */
export function paginate(teamCount: number): number[][] {
  const sheets: number[][] = [];
  for (let i = 0; i < teamCount; i += ROWS_PER_SHEET) {
    sheets.push(Array.from({ length: Math.min(ROWS_PER_SHEET, teamCount - i) }, (_, k) => i + k));
  }
  return sheets;
}
