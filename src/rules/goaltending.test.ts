import { addGoaltending, isGoaltendingRetired, isValidGoaltending } from './goaltending';

describe('isValidGoaltending', () => {
  it('accepts ratings whose digits are both 1 to 6', () => {
    for (const rating of [11, 16, 26, 31, 36, 41, 46, 61, 66]) {
      expect(isValidGoaltending(rating)).toBe(true);
    }
  });

  it('rejects other numbers', () => {
    for (const rating of [30, 37, 40, 47, 7, 3.5, 0, 67, 71, NaN]) {
      expect(isValidGoaltending(rating)).toBe(false);
    }
  });
});

describe('addGoaltending', () => {
  it('skips the gap between 36 and 41', () => {
    expect(addGoaltending(36, 1)).toBe(41);
    expect(addGoaltending(41, -1)).toBe(36);
  });

  it('crosses the gap with larger steps', () => {
    expect(addGoaltending(35, 2)).toBe(41);
    expect(addGoaltending(36, 2)).toBe(42);
    expect(addGoaltending(42, -2)).toBe(36);
    expect(addGoaltending(41, -2)).toBe(35);
  });

  it('goes below 31 into the 20s', () => {
    expect(addGoaltending(31, -1)).toBe(26);
    expect(addGoaltending(31, -2)).toBe(25);
  });

  it('adds within a decade normally', () => {
    expect(addGoaltending(42, 3)).toBe(45);
    expect(addGoaltending(45, -3)).toBe(42);
    expect(addGoaltending(43, 0)).toBe(43);
  });

  it('clamps to the given max', () => {
    expect(addGoaltending(46, 1, { max: 46 })).toBe(46);
    expect(addGoaltending(45, 2, { max: 46 })).toBe(46);
  });

  it('clamps to the given min', () => {
    expect(addGoaltending(31, -2, { min: 31 })).toBe(31);
    expect(addGoaltending(32, -2, { min: 31 })).toBe(31);
  });

  it('applies min and max together', () => {
    expect(addGoaltending(41, 5, { min: 31, max: 46 })).toBe(46);
    expect(addGoaltending(33, -5, { min: 31, max: 46 })).toBe(31);
  });

  it('rejects an invalid rating, bound or step count', () => {
    expect(() => addGoaltending(37, 1)).toThrow(RangeError);
    expect(() => addGoaltending(36, 1, { max: 47 })).toThrow(RangeError);
    expect(() => addGoaltending(36, 1.5)).toThrow(RangeError);
  });

  it('rejects reversed bounds', () => {
    expect(() => addGoaltending(41, 1, { min: 46, max: 31 })).toThrow(RangeError);
    expect(addGoaltending(41, 1, { min: 41, max: 41 })).toBe(41);
  });

  it('throws instead of leaving the 11 to 66 domain', () => {
    expect(() => addGoaltending(66, 1)).toThrow(RangeError);
    expect(() => addGoaltending(11, -1)).toThrow(RangeError);
  });
});

describe('isGoaltendingRetired', () => {
  it('retires at or below 26', () => {
    expect(isGoaltendingRetired(26)).toBe(true);
    expect(isGoaltendingRetired(25)).toBe(true);
    expect(isGoaltendingRetired(11)).toBe(true);
  });

  it('keeps 31 and above', () => {
    expect(isGoaltendingRetired(31)).toBe(false);
    expect(isGoaltendingRetired(46)).toBe(false);
  });

  it('rejects an invalid rating', () => {
    expect(() => isGoaltendingRetired(30)).toThrow(RangeError);
  });
});
