import { GRADES } from './charts';
import type { Rng } from './dice';
import { isValidGoaltending } from './goaltending';
import {
  controlStars,
  generateDraftGoaltender,
  generateDraftStandardPlayer,
  generateGoaltender,
  generateStandardPlayer,
  splitTotal,
} from './player-generation';
import { rngFromDice } from './test-rng';

describe('generateStandardPlayer', () => {
  it('rolls age, total, split, stars, sportsmanship in that order (grade A, total 5, two stars)', () => {
    const player = generateStandardPlayer('A', rngFromDice(3, 4, 3, 4, 5, 1, 1, 6, 6));
    expect(player).toEqual({
      age: { value: 25, roll: 7 },
      total: { value: 5, roll: 7 },
      split: { offense: 4, defense: 1, roll: 5 },
      stars: { value: 2, roll: 2 },
      sportsmanship: { value: 5, roll: 12 },
    });
  });

  it('skips the split roll for a total of 2 (grade D, roll 5)', () => {
    const player = generateStandardPlayer('D', rngFromDice(1, 1, 2, 3, 1, 1, 1, 1));
    expect(player).toEqual({
      age: { value: 20, roll: 2 },
      total: { value: 2, roll: 5 },
      split: { offense: 1, defense: 1, roll: null },
      stars: { value: 1, roll: 2 },
      sportsmanship: { value: 1, roll: 2 },
    });
  });

  it('can produce no stars and the top total (grade A, roll 12)', () => {
    const player = generateStandardPlayer('A', rngFromDice(6, 6, 6, 6, 4, 6, 6, 3, 3));
    expect(player.total).toEqual({ value: 8, roll: 12 });
    expect(player.split).toEqual({ offense: 4, defense: 4, roll: 4 });
    expect(player.stars).toEqual({ value: 0, roll: 12 });
    expect(player.sportsmanship).toEqual({ value: 3, roll: 6 });
  });

  it('uses the grade column of the total chart', () => {
    const totalFor = (grade: 'A' | 'B' | 'C' | 'D' | 'F') =>
      generateStandardPlayer(grade, rngFromDice(1, 1, 5, 5, 1, 6, 6, 1, 1)).total.value;
    // roll 10 on the total chart
    expect(GRADES.map(totalFor)).toEqual([8, 6, 8, 7, 6]);
  });

  it('throws when the dice run out instead of inventing a value', () => {
    expect(() => generateStandardPlayer('A', rngFromDice(1, 1))).toThrow('Scripted dice exhausted');
  });
});

describe('generateGoaltender', () => {
  it('rolls age, goaltending, sportsmanship (grade F, roll 8 gives 36)', () => {
    const goaltender = generateGoaltender('F', rngFromDice(6, 6, 4, 4, 3, 3));
    expect(goaltender).toEqual({
      age: { value: 30, roll: 12 },
      goaltending: { value: 36, roll: 8 },
      sportsmanship: { value: 3, roll: 6 },
    });
  });

  it('uses the grade column (grade A, roll 4 gives 41)', () => {
    const goaltender = generateGoaltender('A', rngFromDice(1, 1, 2, 2, 5, 5));
    expect(goaltender.age).toEqual({ value: 20, roll: 2 });
    expect(goaltender.goaltending).toEqual({ value: 41, roll: 4 });
    expect(goaltender.sportsmanship).toEqual({ value: 4, roll: 10 });
  });
});

describe('draft players', () => {
  it('generates a draft standard player with the draft charts', () => {
    const player = generateDraftStandardPlayer(rngFromDice(6, 5, 5, 5, 6, 2, 2, 4, 4));
    expect(player).toEqual({
      age: { value: 22, roll: 11 },
      total: { value: 7, roll: 10 },
      split: { offense: 2, defense: 5, roll: 6 },
      stars: { value: 1, roll: 4 },
      sportsmanship: { value: 3, roll: 8 },
    });
  });

  it('generates a draft goaltender with the draft charts', () => {
    const goaltender = generateDraftGoaltender(rngFromDice(1, 2, 4, 4, 1, 1));
    expect(goaltender).toEqual({
      age: { value: 18, roll: 3 },
      goaltending: { value: 41, roll: 8 },
      sportsmanship: { value: 1, roll: 2 },
    });
  });
});

describe('reusable building blocks', () => {
  it('splitTotal rolls a d6 except for a total of 2', () => {
    expect(splitTotal(6, rngFromDice(5))).toEqual({ offense: 5, defense: 1, roll: 5 });
    const noDice = rngFromDice();
    expect(splitTotal(2, noDice)).toEqual({ offense: 1, defense: 1, roll: null });
  });

  it('controlStars rolls 2d6 against the total', () => {
    expect(controlStars(8, rngFromDice(2, 2))).toEqual({ value: 2, roll: 4 });
    expect(controlStars(8, rngFromDice(6, 6))).toEqual({ value: 0, roll: 12 });
  });
});

function seededRng(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('generation invariants over many random players', () => {
  it.each(GRADES)('standard players and goaltenders of grade %s stay in range', (grade) => {
    const rng = seededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const p = generateStandardPlayer(grade, rng);
      expect(p.age.value).toBeGreaterThanOrEqual(20);
      expect(p.age.value).toBeLessThanOrEqual(30);
      expect(p.split.offense + p.split.defense).toBe(p.total.value);
      expect(p.split.offense).toBeGreaterThanOrEqual(1);
      expect(p.split.defense).toBeGreaterThanOrEqual(1);
      expect([0, 1, 2]).toContain(p.stars.value);
      expect(p.sportsmanship.value).toBeGreaterThanOrEqual(1);
      expect(p.sportsmanship.value).toBeLessThanOrEqual(5);

      const g = generateGoaltender(grade, rng);
      expect(isValidGoaltending(g.goaltending.value)).toBe(true);
      expect(g.goaltending.value).toBeGreaterThanOrEqual(31);
      expect(g.goaltending.value).toBeLessThanOrEqual(46);
    }
  });

  it('draft players stay in range', () => {
    const rng = seededRng(99);
    for (let i = 0; i < 1000; i++) {
      const p = generateDraftStandardPlayer(rng);
      expect(p.age.value).toBeGreaterThanOrEqual(18);
      expect(p.age.value).toBeLessThanOrEqual(22);
      expect(p.split.offense + p.split.defense).toBe(p.total.value);
      const g = generateDraftGoaltender(rng);
      expect(isValidGoaltending(g.goaltending.value)).toBe(true);
      expect(g.goaltending.value).toBeGreaterThanOrEqual(31);
      expect(g.goaltending.value).toBeLessThanOrEqual(45);
    }
  });
});
