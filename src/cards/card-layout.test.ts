import {
  CARD_HEIGHT_IN,
  CARD_WIDTH_IN,
  CARDS_PER_ROW,
  ROWS_PER_SHEET,
  SHEET_HEIGHT_IN,
  SHEET_MARGIN_IN,
  SHEET_WIDTH_IN,
  backgroundFor,
  paginate,
} from './card-layout';

describe('geometry', () => {
  it('fits 8 by 4 cards inside the margins', () => {
    expect(CARDS_PER_ROW * CARD_WIDTH_IN).toBeLessThanOrEqual(SHEET_WIDTH_IN - 2 * SHEET_MARGIN_IN);
    expect(ROWS_PER_SHEET * CARD_HEIGHT_IN).toBeLessThanOrEqual(SHEET_HEIGHT_IN - 2 * SHEET_MARGIN_IN);
  });
});

describe('backgroundFor', () => {
  it('maps positions to images with the second of each pair mirrored', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(backgroundFor)).toEqual([
      { image: 'player1', mirrored: false },
      { image: 'player1', mirrored: true },
      { image: 'player2', mirrored: false },
      { image: 'player2', mirrored: true },
      { image: 'player3', mirrored: false },
      { image: 'player3', mirrored: true },
      { image: 'goalie', mirrored: false },
      { image: 'goalie', mirrored: true },
    ]);
  });

  it('rejects positions outside a row', () => {
    expect(() => backgroundFor(8)).toThrow(RangeError);
    expect(() => backgroundFor(-1)).toThrow(RangeError);
  });
});

describe('paginate', () => {
  it('puts four teams on a sheet', () => {
    expect(paginate(0)).toEqual([]);
    expect(paginate(4)).toEqual([[0, 1, 2, 3]]);
    expect(paginate(5)).toEqual([[0, 1, 2, 3], [4]]);
    expect(paginate(20)).toHaveLength(5);
  });
});
