import { roll2d6, rollDie } from './dice';
import { rngFromDice } from './test-rng';

describe('rollDie', () => {
  it('maps the rng range onto 1 to 6', () => {
    expect(rollDie(() => 0)).toBe(1);
    for (let k = 1; k <= 6; k++) {
      expect(rollDie(() => k / 6 - 1e-9)).toBe(k);
    }
    expect(rollDie(() => 0.999999999)).toBe(6);
  });

  it('puts each face boundary on the next face', () => {
    for (let k = 1; k < 6; k++) {
      expect(rollDie(() => k / 6)).toBe(k + 1);
    }
  });

  it('rejects values outside [0, 1)', () => {
    expect(() => rollDie(() => 1)).toThrow(RangeError);
    expect(() => rollDie(() => -0.1)).toThrow(RangeError);
    expect(() => rollDie(() => NaN)).toThrow(RangeError);
  });
});

describe('roll2d6', () => {
  it('adds two dice', () => {
    expect(roll2d6(rngFromDice(1, 1))).toBe(2);
    expect(roll2d6(rngFromDice(3, 4))).toBe(7);
    expect(roll2d6(rngFromDice(6, 6))).toBe(12);
  });
});

describe('rngFromDice', () => {
  it('replays faces in order', () => {
    const rng = rngFromDice(2, 5, 1);
    expect([rollDie(rng), rollDie(rng), rollDie(rng)]).toEqual([2, 5, 1]);
  });

  it('throws when the script runs out', () => {
    const rng = rngFromDice(3);
    rollDie(rng);
    expect(() => rollDie(rng)).toThrow('Scripted dice exhausted');
  });

  it('rejects faces that are not d6 faces', () => {
    expect(() => rngFromDice(0)).toThrow(RangeError);
    expect(() => rngFromDice(7)).toThrow(RangeError);
    expect(() => rngFromDice(2.5)).toThrow(RangeError);
  });
});
