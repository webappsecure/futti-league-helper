import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import { starsFor } from '@/rules/charts';
import { rngFromDice } from '@/rules/test-rng';
import { adjustRoster, replacementGrade } from './rating-adjust';

const standard = (offense: number, defense: number): StandardRosterPlayer => ({
  id: 'p',
  kind: 'standard',
  name: 'SMITH',
  age: 24,
  offense,
  defense,
  sportsmanship: 3,
  controlStars: 0,
  rolls: { age: 7, total: 7, split: 3, stars: 2, sportsmanship: 6 },
});

const goalie = (goaltending: number): GoalieRosterPlayer => ({
  id: 'g',
  kind: 'goalie',
  name: 'JONES',
  age: 27,
  goaltending,
  sportsmanship: 4,
  rolls: { age: 8, goaltending: 6, sportsmanship: 7 },
});

// Stars use a 2d6 roll, so one standard player needs two faces; 3+3 = 6.
const sides = (player: RosterPlayer) => (player.kind === 'standard' ? [player.offense, player.defense] : []);
const one = (player: RosterPlayer, movement: 'promoted' | 'demoted') =>
  adjustRoster([player], movement, rngFromDice(3, 3))[0];

describe('adjustRoster for a promoted team', () => {
  it('takes one point off offense and defense', () => {
    expect(sides(one(standard(4, 3), 'promoted'))).toEqual([3, 2]);
  });
  it('stops at 1', () => {
    expect(sides(one(standard(1, 2), 'promoted'))).toEqual([1, 1]);
    expect(sides(one(standard(1, 1), 'promoted'))).toEqual([1, 1]);
  });
  it('moves a goalie two steps down across 41 and 36', () => {
    expect(adjustRoster([goalie(42)], 'promoted', rngFromDice())[0]).toMatchObject({ goaltending: 36 });
    expect(adjustRoster([goalie(41)], 'promoted', rngFromDice())[0]).toMatchObject({ goaltending: 35 });
  });
  it('stops a goalie at 31', () => {
    expect(adjustRoster([goalie(32)], 'promoted', rngFromDice())[0]).toMatchObject({ goaltending: 31 });
    expect(adjustRoster([goalie(31)], 'promoted', rngFromDice())[0]).toMatchObject({ goaltending: 31 });
  });
});

describe('adjustRoster for a demoted team', () => {
  it('adds a point to both when the total stays within 8', () => {
    expect(sides(one(standard(3, 3), 'demoted'))).toEqual([4, 4]);
    expect(sides(one(standard(2, 1), 'demoted'))).toEqual([3, 2]);
  });
  it('raises only the lower side when both would pass 8', () => {
    expect(sides(one(standard(4, 3), 'demoted'))).toEqual([4, 4]);
    expect(sides(one(standard(3, 4), 'demoted'))).toEqual([4, 4]);
    expect(sides(one(standard(5, 2), 'demoted'))).toEqual([5, 3]);
  });
  it('leaves a player alone when even the lower rise would pass 8', () => {
    expect(sides(one(standard(4, 4), 'demoted'))).toEqual([4, 4]);
    expect(sides(one(standard(5, 3), 'demoted'))).toEqual([5, 3]);
  });
  it('caps each side at 5', () => {
    expect(sides(one(standard(5, 1), 'demoted'))).toEqual([5, 2]);
  });
  it('moves a goalie two steps up across 36 and 41, stopping at 46', () => {
    expect(adjustRoster([goalie(36)], 'demoted', rngFromDice())[0]).toMatchObject({ goaltending: 42 });
    expect(adjustRoster([goalie(35)], 'demoted', rngFromDice())[0]).toMatchObject({ goaltending: 41 });
    expect(adjustRoster([goalie(45)], 'demoted', rngFromDice())[0]).toMatchObject({ goaltending: 46 });
    expect(adjustRoster([goalie(46)], 'demoted', rngFromDice())[0]).toMatchObject({ goaltending: 46 });
  });
});

describe('adjustRoster in general', () => {
  it('rerolls control stars from the new total and records the roll', () => {
    const result = one(standard(3, 3), 'demoted') as StandardRosterPlayer;
    expect(result.controlStars).toBe(starsFor(8, 6));
    expect(result.rolls.stars).toBe(6);
    const lowered = one(standard(3, 3), 'promoted') as StandardRosterPlayer;
    expect(lowered.controlStars).toBe(starsFor(4, 6));
  });
  it('keeps everything else, keeps the order and does not change the input', () => {
    const input: RosterPlayer[] = [standard(3, 3), goalie(40 + 1)];
    const before = structuredClone(input);
    const result = adjustRoster(input, 'demoted', rngFromDice(3, 3));
    expect(input).toEqual(before);
    expect(result.map((p) => p.kind)).toEqual(['standard', 'goalie']);
    expect(result[0]).toMatchObject({ id: 'p', name: 'SMITH', age: 24, sportsmanship: 3 });
    expect(result[1]).toMatchObject({ id: 'g', name: 'JONES', age: 27, sportsmanship: 4 });
  });
});

describe('replacementGrade', () => {
  it('rolls A, B or C for a promoted vacancy', () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => replacementGrade('promoted', r))).toEqual(['A', 'B', 'B', 'C', 'C', 'C']);
  });
  it('rolls C, D or F for a demoted vacancy', () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => replacementGrade('demoted', r))).toEqual(['C', 'D', 'D', 'F', 'F', 'F']);
  });
  it('rejects a roll outside 1 to 6', () => {
    expect(() => replacementGrade('promoted', 0)).toThrow(RangeError);
    expect(() => replacementGrade('demoted', 7)).toThrow(RangeError);
    expect(() => replacementGrade('demoted', 2.5)).toThrow(RangeError);
  });
});
