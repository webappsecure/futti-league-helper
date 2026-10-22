import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import { rngFromDice } from '@/rules/test-rng';
import type { OffseasonPlan } from './offseason-plan';
import { buildProgression, progressGoalie, progressionPlayers, progressStandard } from './progression';
import type { ParticipatingTeam } from './roster-changes';

const std = (id: string, age: number, offense: number, defense: number): StandardRosterPlayer => ({
  id, kind: 'standard', name: id.toUpperCase(), age, offense, defense, sportsmanship: 3, controlStars: 0, rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 },
});
const goalie = (id: string, age: number, goaltending: number): GoalieRosterPlayer => ({
  id, kind: 'goalie', name: id.toUpperCase(), age, goaltending, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 },
});

/** Stored ages are one year younger than the age used for the brackets. */
describe('progressStandard brackets', () => {
  // Faces after the d6: split d6 3, then stars 2d6 (1, 1). A 3/3 player (total 6) goes to 7 (3/4 on a 3) or 5 (2/3 on a 3).
  const run = (age: number, roll: number) => progressStandard(std('p', age, 3, 3), roll, rngFromDice(3, 1, 1));
  const total = (r: ReturnType<typeof run>) => (r.after === undefined ? 6 : r.after.offense + r.after.defense);

  it('raises a player of 23 or under on a 1 or 2 only', () => {
    expect([1, 2, 3, 4, 5, 6].map((roll) => total(run(22, roll)))).toEqual([7, 7, 6, 6, 6, 6]);
  });
  it('raises on a 1 and lowers on a 6 from 24 to 29', () => {
    expect([1, 2, 3, 4, 5, 6].map((roll) => total(run(23, roll)))).toEqual([7, 6, 6, 6, 6, 5]);
    expect([1, 6].map((roll) => total(run(28, roll)))).toEqual([7, 5]);
  });
  it('lowers on a 5 or 6 at 30 or over', () => {
    expect([1, 2, 3, 4, 5, 6].map((roll) => total(run(29, roll)))).toEqual([6, 6, 6, 6, 5, 5]);
    expect([4, 5].map((roll) => total(run(35, roll)))).toEqual([6, 5]);
  });
  it('never goes above a total of 8 and does not roll again', () => {
    const r = progressStandard(std('p', 22, 4, 4), 1, rngFromDice());
    expect(r).toEqual({ retired: false });
  });
  it('retires a player whose total falls to 1', () => {
    expect(progressStandard(std('p', 30, 1, 1), 5, rngFromDice())).toEqual({ retired: true });
    expect(progressStandard(std('p', 30, 1, 2), 5, rngFromDice(1, 1, 1))).toMatchObject({ retired: false, after: { offense: 1, defense: 1 } });
  });
  it('leaves the player passed in alone and records the new split and stars dice', () => {
    const p = std('p', 22, 3, 3);
    const r = progressStandard(p, 1, rngFromDice(3, 6, 6));
    expect(p.offense).toBe(3);
    expect(r.after?.rolls).toMatchObject({ split: 3, stars: 12, total: 7 });
    expect(r.after?.age).toBe(22);
  });
});

describe('progressStandard flip rule', () => {
  // Lowering a total of 6 to 5 with a split roll of 3 gives 2/3.
  it('swaps when a higher offense would become a lower one', () => {
    const r = progressStandard(std('p', 25, 4, 2), 6, rngFromDice(3, 1, 1));
    expect([r.after?.offense, r.after?.defense]).toEqual([3, 2]);
  });
  it('swaps in reverse for a higher defense', () => {
    // Raising 2/4 (total 6) to 7 with a split of 1 gives 4/3 (offense higher), so it flips to 3/4.
    const r = progressStandard(std('p', 25, 2, 4), 1, rngFromDice(1, 1, 1));
    expect([r.after?.offense, r.after?.defense]).toEqual([3, 4]);
  });
  it('does not swap an equal player or a split that keeps the order', () => {
    const equal = progressStandard(std('p', 25, 3, 3), 6, rngFromDice(3, 1, 1));
    expect([equal.after?.offense, equal.after?.defense]).toEqual([2, 3]);
    const same = progressStandard(std('p', 25, 4, 2), 1, rngFromDice(1, 1, 1));
    expect([same.after?.offense, same.after?.defense]).toEqual([4, 3]);
  });
});

describe('progressGoalie', () => {
  const steps = (age: number, rating: number, roll: number) => {
    const r = progressGoalie(goalie('g', age, rating), roll);
    return r.retired ? 'retired' : (r.after?.goaltending ?? rating);
  };
  it('follows the brackets', () => {
    expect([1, 2, 3, 4, 5, 6].map((roll) => steps(22, 33, roll))).toEqual([35, 34, 34, 33, 33, 33]);
    expect([1, 2, 3, 4, 5, 6].map((roll) => steps(23, 33, roll))).toEqual([34, 34, 33, 33, 32, 32]);
    expect([1, 2, 3, 4, 5, 6].map((roll) => steps(29, 34, roll))).toEqual([34, 34, 34, 33, 33, 32]);
  });
  it('moves across the base-6 gap', () => {
    expect(steps(22, 36, 2)).toBe(41);
    expect(steps(22, 36, 1)).toBe(42);
    expect(steps(30, 41, 4)).toBe(36);
    expect(steps(30, 41, 6)).toBe(35);
  });
  it('never goes above 46', () => {
    expect(steps(22, 45, 1)).toBe(46);
    expect(steps(22, 46, 1)).toBe(46);
    expect(progressGoalie(goalie('g', 22, 46), 1)).toEqual({ retired: false });
  });
  it('retires at 26 or below', () => {
    expect(steps(30, 31, 4)).toBe('retired');
    expect(steps(30, 32, 6)).toBe('retired');
    expect(steps(30, 33, 6)).toBe(31);
    expect(steps(30, 32, 4)).toBe(31);
  });
});

describe('progressionPlayers and buildProgression', () => {
  const team = (id: string, players: RosterPlayer[]): ParticipatingTeam => ({ franchiseId: id, origin: 'staying', players });
  const teams = [
    team('a', [std('as1', 25, 3, 3), std('as2', 25, 3, 3), std('as3', 25, 3, 3), goalie('ag1', 25, 36)]),
    team('b', [std('bs1', 25, 3, 3), std('bs2', 25, 3, 3), std('bs3', 25, 3, 3), goalie('bg1', 25, 31)]),
  ];
  const plan: OffseasonPlan = {
    seasonId: 's', leagueId: 'L', promoted: [], demoted: [],
    teamChanges: [
      { franchiseId: 'a', protectedId: 'as1', retiredId: 'as2', releasedId: 'as3' },
      { franchiseId: 'b', protectedId: 'bs1', retiredId: 'bs2', releasedId: 'bs3' },
    ],
    freeAgentPicks: [{ franchiseId: 'a', playerId: 'bs3' }, { franchiseId: 'b', playerId: 'as3' }],
    // Rookies are not part of progression.
    draftPool: [std('r1', 19, 3, 3)],
    draftPicks: [{ franchiseId: 'a', playerId: 'r1' }],
  };

  it('lists kept players then free agency picks, skipping retired, released and rookies', () => {
    expect(progressionPlayers(teams[0], teams, plan).map((p) => p.id)).toEqual(['as1', 'ag1', 'bs3']);
    expect(progressionPlayers(teams[1], teams, plan).map((p) => p.id)).toEqual(['bs1', 'bg1', 'as3']);
  });

  it('rolls teams in order and players in roster order, then builds replacements for retirees', () => {
    const made: string[] = [];
    // Every die shows 6: each position player lowers 6 to 5, ag1 goes 36 to 35, and bg1 goes 31 to 26 and retires.
    const result = buildProgression(teams, plan, () => 0.99, () => (made.push('standard'), std('n1', 19, 2, 2)), () => (made.push('goalie'), goalie('n2', 19, 33)));
    expect(result.map((r) => [r.franchiseId, r.playerId, r.roll])).toEqual([
      ['a', 'as1', 6], ['a', 'ag1', 6], ['a', 'bs3', 6], ['b', 'bs1', 6], ['b', 'bg1', 6], ['b', 'as3', 6],
    ]);
    expect(result.filter((r) => r.after !== undefined).map((r) => r.playerId)).toEqual(['as1', 'ag1', 'bs3', 'bs1', 'as3']);
    expect(result.find((r) => r.playerId === 'ag1')?.after).toMatchObject({ goaltending: 35 });
    expect(result.find((r) => r.playerId === 'bg1')).toMatchObject({ replacement: { id: 'n2', kind: 'goalie' } });
    expect(result.find((r) => r.playerId === 'bg1')?.after).toBeUndefined();
    expect(made).toEqual(['goalie']);
  });

  it('builds a position player replacement for a retired position player, after all rolls', () => {
    const low: ParticipatingTeam[] = [team('a', [std('x1', 29, 1, 1), std('x2', 20, 3, 3)])];
    const order: string[] = [];
    let rolls = 0;
    const rng = () => {
      rolls += 1;
      return 0.99;
    };
    const result = buildProgression(low, { seasonId: 's', leagueId: 'L', promoted: [], demoted: [] }, rng, () => (order.push(`standard after ${rolls} dice`), std('n1', 19, 2, 2)), () => goalie('n2', 19, 33));
    expect(result[0]).toMatchObject({ playerId: 'x1', replacement: { id: 'n1' } });
    expect(result[1].replacement).toBeUndefined();
    expect(order).toEqual([`standard after ${rolls} dice`]);
  });
});
