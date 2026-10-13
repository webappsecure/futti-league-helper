import {
  GRADES,
  draftAge,
  draftGoaltending,
  draftTotal,
  initialAge,
  initialGoaltending,
  initialTotal,
  splitFor,
  splitNeedsRoll,
  sportsmanshipFor,
  starsFor,
  type Grade,
} from './charts';
import { isValidGoaltending } from './goaltending';

const rolls2d6 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('single-column 2d6 charts', () => {
  it('initial age is 18 plus the roll', () => {
    expect(rolls2d6.map(initialAge)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it('draft age', () => {
    expect(rolls2d6.map(draftAge)).toEqual([18, 18, 19, 19, 20, 20, 20, 21, 21, 22, 22]);
  });

  it('draft total of offense and defense', () => {
    expect(rolls2d6.map(draftTotal)).toEqual([8, 4, 6, 2, 4, 3, 4, 4, 7, 6, 8]);
  });

  it('draft goaltending', () => {
    expect(rolls2d6.map(draftGoaltending)).toEqual([31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45]);
  });

  it('sportsmanship', () => {
    expect(rolls2d6.map(sportsmanshipFor)).toEqual([1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5]);
  });
});

describe('initial total by grade', () => {
  const expected: Record<Grade, number[]> = {
    A: [2, 3, 6, 4, 7, 5, 6, 7, 8, 8, 8],
    B: [4, 2, 3, 4, 6, 5, 7, 8, 6, 7, 5],
    C: [5, 5, 2, 3, 5, 4, 6, 7, 8, 6, 7],
    D: [8, 4, 6, 2, 4, 3, 5, 5, 7, 6, 8],
    F: [4, 5, 4, 3, 4, 2, 5, 3, 6, 7, 8],
  };

  it.each(GRADES)('grade %s', (grade) => {
    expect(rolls2d6.map((roll) => initialTotal(grade, roll))).toEqual(expected[grade]);
  });

  it('always yields a total from 2 to 8', () => {
    for (const grade of GRADES) {
      for (const roll of rolls2d6) {
        const total = initialTotal(grade, roll);
        expect(total).toBeGreaterThanOrEqual(2);
        expect(total).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('initial goaltending by grade', () => {
  const expected: Record<Grade, number[]> = {
    A: [36, 36, 41, 41, 42, 43, 44, 45, 45, 46, 46],
    B: [35, 35, 36, 36, 41, 42, 43, 44, 44, 45, 45],
    C: [34, 34, 35, 35, 36, 41, 42, 43, 43, 44, 44],
    D: [33, 33, 34, 34, 35, 36, 41, 42, 42, 43, 43],
    F: [32, 32, 33, 33, 34, 35, 36, 41, 41, 42, 42],
  };

  it.each(GRADES)('grade %s', (grade) => {
    expect(rolls2d6.map((roll) => initialGoaltending(grade, roll))).toEqual(expected[grade]);
  });

  it('only yields valid ratings', () => {
    for (const grade of GRADES) {
      for (const roll of rolls2d6) {
        expect(isValidGoaltending(initialGoaltending(grade, roll))).toBe(true);
      }
    }
    for (const roll of rolls2d6) expect(isValidGoaltending(draftGoaltending(roll))).toBe(true);
  });
});

describe('split of offense and defense', () => {
  // [d6 face 1..6] => [offense, defense]
  const expected: Record<number, [number, number][]> = {
    2: [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]],
    3: [[2, 1], [2, 1], [2, 1], [1, 2], [1, 2], [1, 2]],
    4: [[2, 2], [2, 2], [2, 2], [2, 2], [3, 1], [1, 3]],
    5: [[3, 2], [3, 2], [2, 3], [2, 3], [4, 1], [1, 4]],
    6: [[3, 3], [3, 3], [4, 2], [2, 4], [5, 1], [1, 5]],
    7: [[4, 3], [4, 3], [3, 4], [3, 4], [5, 2], [2, 5]],
    8: [[4, 4], [4, 4], [4, 4], [4, 4], [5, 3], [3, 5]],
  };

  it.each([2, 3, 4, 5, 6, 7, 8])('total %i', (total) => {
    const actual = [1, 2, 3, 4, 5, 6].map((face) => {
      const { offense, defense } = splitFor(total, face);
      return [offense, defense];
    });
    expect(actual).toEqual(expected[total]);
  });

  it('always sums to the total with each at least 1 and at most 5', () => {
    for (let total = 2; total <= 8; total++) {
      for (let face = 1; face <= 6; face++) {
        const { offense, defense } = splitFor(total, face);
        expect(offense + defense).toBe(total);
        expect(offense).toBeGreaterThanOrEqual(1);
        expect(defense).toBeGreaterThanOrEqual(1);
        expect(offense).toBeLessThanOrEqual(5);
        expect(defense).toBeLessThanOrEqual(5);
      }
    }
  });

  it('only a total of 2 skips the roll', () => {
    expect(splitNeedsRoll(2)).toBe(false);
    for (let total = 3; total <= 8; total++) expect(splitNeedsRoll(total)).toBe(true);
  });
});

describe('control stars', () => {
  // [roll 2..12] => stars
  const expected: Record<number, number[]> = {
    2: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    3: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    4: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    5: [2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    6: [2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    7: [2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    8: [2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0],
  };

  it.each([2, 3, 4, 5, 6, 7, 8])('total %i', (total) => {
    expect(rolls2d6.map((roll) => starsFor(total, roll))).toEqual(expected[total]);
  });

  it('never gains stars as the roll rises', () => {
    for (let total = 2; total <= 8; total++) {
      const stars = rolls2d6.map((roll) => starsFor(total, roll));
      for (let i = 1; i < stars.length; i++) expect(stars[i]).toBeLessThanOrEqual(stars[i - 1]);
    }
  });
});

describe('out-of-domain input', () => {
  it('rejects rolls outside the chart', () => {
    expect(() => initialAge(1)).toThrow(RangeError);
    expect(() => initialAge(13)).toThrow(RangeError);
    expect(() => draftAge(2.5)).toThrow(RangeError);
    expect(() => sportsmanshipFor(0)).toThrow(RangeError);
    expect(() => splitFor(5, 0)).toThrow(RangeError);
    expect(() => splitFor(5, 7)).toThrow(RangeError);
    expect(() => starsFor(5, 1)).toThrow(RangeError);
  });

  it('rejects totals outside 2 to 8', () => {
    expect(() => splitFor(1, 3)).toThrow(RangeError);
    expect(() => splitFor(9, 3)).toThrow(RangeError);
    expect(() => starsFor(9, 7)).toThrow(RangeError);
    expect(() => splitNeedsRoll(0)).toThrow(RangeError);
  });

  it('rejects an unknown grade', () => {
    expect(() => initialTotal('E' as Grade, 7)).toThrow(RangeError);
    expect(() => initialGoaltending('Z' as Grade, 7)).toThrow(RangeError);
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', '', 'a'])(
    'rejects %p as a grade',
    (grade) => {
      expect(() => initialTotal(grade as Grade, 7)).toThrow(RangeError);
      expect(() => initialGoaltending(grade as Grade, 7)).toThrow(RangeError);
    },
  );
});
