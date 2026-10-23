import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from './roster';
import { limitTeamStars, teamStars } from './control-stars';

const std = (id: string, strength: number, stars: 0 | 1 | 2, sportsmanship = 3): StandardRosterPlayer => ({
  id, kind: 'standard', name: id.toUpperCase(), age: 25, offense: Math.ceil(strength / 2), defense: Math.floor(strength / 2), sportsmanship, controlStars: stars,
  rolls: { age: 7, total: 7, split: null, stars: 9, sportsmanship: 3 },
});
const goalie = (id: string): GoalieRosterPlayer => ({ id, kind: 'goalie', name: id.toUpperCase(), age: 25, goaltending: 33, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 } });
/** Six position players p1 (best, 8) to p6 (worst, 3) with the given stars, then two goaltenders. */
const team = (stars: (0 | 1 | 2)[]): RosterPlayer[] => [...stars.map((s, i) => std(`p${i + 1}`, 8 - i, s)), goalie('g1'), goalie('g2')];
const starsOf = (players: readonly RosterPlayer[]): number[] => players.filter((p) => p.kind === 'standard').map((p) => (p as StandardRosterPlayer).controlStars);

describe('limitTeamStars', () => {
  it('leaves a team in range alone', () => {
    const t = team([1, 0, 0, 1, 0, 0]);
    expect(limitTeamStars(t)).toEqual(t);
    expect(limitTeamStars(team([2, 2, 2, 0, 0, 0]))).toEqual(team([2, 2, 2, 0, 0, 0]));
  });
  it('gives a single star to each of the best players when there are none', () => {
    expect(starsOf(limitTeamStars(team([0, 0, 0, 0, 0, 0])))).toEqual([1, 1, 0, 0, 0, 0]);
  });
  it('adds one star to the best player with fewer than two when there is one', () => {
    expect(starsOf(limitTeamStars(team([0, 0, 0, 0, 0, 1])))).toEqual([1, 0, 0, 0, 0, 1]);
    expect(starsOf(limitTeamStars(team([2, 0, 0, 0, 0, 0])))).toEqual([2, 0, 0, 0, 0, 0]);
  });
  it('skips a best player who already has two stars', () => {
    expect(starsOf(limitTeamStars(team([2, 0, 0, 0, 0, 0])))).toEqual([2, 0, 0, 0, 0, 0]);
    expect(teamStars(limitTeamStars(team([0, 2, 0, 0, 0, 0])))).toBe(2);
  });
  it('starts another pass when the first cannot reach the minimum', () => {
    const short = [std('a', 8, 0), goalie('g1')];
    expect(starsOf(limitTeamStars(short))).toEqual([2]);
  });
  it('takes one star at a time from the worst players with stars when there are too many', () => {
    expect(starsOf(limitTeamStars(team([2, 2, 2, 2, 2, 2])))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(starsOf(limitTeamStars(team([2, 2, 1, 1, 1, 1])))).toEqual([2, 2, 1, 1, 0, 0]);
  });
  it('removes only one star from the single worst player when one over', () => {
    expect(starsOf(limitTeamStars(team([2, 2, 2, 1, 0, 0])))).toEqual([2, 2, 2, 0, 0, 0]);
    expect(starsOf(limitTeamStars(team([1, 1, 1, 1, 2, 2])))).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it('never goes below 0 or above 2', () => {
    for (const stars of [[0, 0, 0, 0, 0, 0], [2, 2, 2, 2, 2, 2], [1, 0, 2, 0, 2, 2]] as (0 | 1 | 2)[][]) {
      const result = starsOf(limitTeamStars(team(stars)));
      expect(result.every((n) => n >= 0 && n <= 2)).toBe(true);
      expect(result.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
      expect(result.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(6);
    }
  });
  it('breaks ties by sportsmanship then roster order', () => {
    const equal = [std('a', 6, 0, 2), std('b', 6, 0, 4), std('c', 6, 0, 4), std('d', 6, 0, 1), std('e', 6, 0, 1), std('f', 6, 0, 1), goalie('g1'), goalie('g2')];
    expect(starsOf(limitTeamStars(equal))).toEqual([0, 1, 1, 0, 0, 0]);
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => std(id, 6, 2, 3));
    expect(starsOf(limitTeamStars(many))).toEqual([1, 1, 1, 1, 1, 1]);
    const seven = [std('a', 6, 2, 3), std('b', 6, 2, 3), std('c', 6, 2, 3), std('d', 6, 1, 3), std('e', 6, 0, 3), std('f', 6, 0, 3)];
    expect(starsOf(limitTeamStars(seven))).toEqual([2, 2, 2, 0, 0, 0]);
  });
  it('leaves goaltenders, dice and the input alone', () => {
    const t = team([0, 0, 0, 0, 0, 0]);
    const before = JSON.stringify(t);
    const result = limitTeamStars(t);
    expect(JSON.stringify(t)).toBe(before);
    expect(result[6]).toBe(t[6]);
    expect(result.map((p) => p.id)).toEqual(t.map((p) => p.id));
    expect((result[0] as StandardRosterPlayer).rolls).toEqual((t[0] as StandardRosterPlayer).rolls);
  });
});
