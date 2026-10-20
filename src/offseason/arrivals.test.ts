import type { League } from '@/leagues/league';
import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import { rngFromDice } from '@/rules/test-rng';
import type { SeasonArchive } from '@/seasons/season-archive';
import { arrivalsAreCurrent, buildArrivals, expectedArrivals, type ArrivalSource } from './arrivals';
import { isOffseasonPlan, type OffseasonPlan } from './offseason-plan';

const league = (id: string): League => ({ id, name: id, size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1 });

let n = 0;
// Names must be upper-case letters only to pass the roster check.
const letters = (i: number) => String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26));
const standard = (offense: number, defense: number): StandardRosterPlayer => ({
  id: `p${++n}`, kind: 'standard', name: letters(n), age: 24, offense, defense, sportsmanship: 3, controlStars: 0,
  rolls: { age: 7, total: 7, split: 3, stars: 2, sportsmanship: 6 },
});
const goalie = (goaltending: number): GoalieRosterPlayer => ({
  id: `g${++n}`, kind: 'goalie', name: letters(n), age: 27, goaltending, sportsmanship: 4,
  rolls: { age: 8, goaltending: 6, sportsmanship: 7 },
});
const roster = (): RosterPlayer[] => [
  standard(3, 3), standard(3, 3), standard(3, 3), standard(3, 3), standard(3, 3), standard(3, 3), goalie(36), goalie(36),
];

const archive = (leagueId: string, ids: string[]): SeasonArchive => ({
  seasonId: `s-${leagueId}`,
  leagueId,
  seasonIndex: 1,
  teams: ids.map((franchiseId, i) => ({ franchiseId, position: i + 1, players: roster() }) as SeasonArchive['teams'][number]),
});
const plan = (leagueId: string, promoted: string[], demoted: string[]): OffseasonPlan => ({ seasonId: `s-${leagueId}`, leagueId, promoted, demoted });

const above: ArrivalSource = { league: league('U'), direction: 'above', archive: archive('U', ['u1', 'u2']), plan: plan('U', ['u1'], ['u2']) };
const below: ArrivalSource = { league: league('L'), direction: 'below', archive: archive('L', ['l1', 'l2']), plan: plan('L', ['l1'], ['l2']) };
// Two teams: twelve d6 faces each cover six standard players' 2d6 star rolls.
const dice = () => rngFromDice(...Array(24).fill(3));

describe('expectedArrivals', () => {
  it('takes the demoted teams from above', () => {
    expect(expectedArrivals([above])).toEqual([{ franchiseId: 'u2', fromLeagueId: 'U', sourceSeasonId: 's-U', movement: 'demoted' }]);
  });
  it('takes the promoted teams from below', () => {
    expect(expectedArrivals([below])).toEqual([{ franchiseId: 'l1', fromLeagueId: 'L', sourceSeasonId: 's-L', movement: 'promoted' }]);
  });
  it('combines both sources', () => {
    expect(expectedArrivals([above, below]).map((a) => a.franchiseId)).toEqual(['u2', 'l1']);
  });
  it('gives nothing for a source with no plan', () => {
    expect(expectedArrivals([{ ...above, plan: null }, below]).map((a) => a.franchiseId)).toEqual(['l1']);
  });
});

describe('buildArrivals', () => {
  it('raises demoted rosters and lowers promoted ones on copies', () => {
    const sources = [above, below];
    const before = structuredClone(sources);
    const built = buildArrivals(expectedArrivals(sources), sources, dice());
    if (!built.ok) throw new Error('build');
    expect(built.value.map((a) => a.franchiseId)).toEqual(['u2', 'l1']);
    const demoted = built.value[0].players[0] as StandardRosterPlayer;
    const promoted = built.value[1].players[0] as StandardRosterPlayer;
    expect([demoted.offense, demoted.defense]).toEqual([4, 4]);
    expect([promoted.offense, promoted.defense]).toEqual([2, 2]);
    expect((built.value[0].players[6] as GoalieRosterPlayer).goaltending).toBe(42);
    expect((built.value[1].players[6] as GoalieRosterPlayer).goaltending).toBe(34);
    expect(sources).toEqual(before);
  });
  it('fails when a team is not in its archive', () => {
    const bad = { ...above, archive: archive('U', ['u1']) };
    expect(buildArrivals(expectedArrivals([bad]), [bad], dice())).toEqual({ ok: false, franchiseId: 'u2' });
    expect(buildArrivals(expectedArrivals([above]), [{ ...above, archive: null }], dice())).toEqual({ ok: false, franchiseId: 'u2' });
  });
});

describe('arrivalsAreCurrent', () => {
  const a = { franchiseId: 'x', fromLeagueId: 'U', sourceSeasonId: 's', movement: 'demoted' as const };
  const b = { franchiseId: 'y', fromLeagueId: 'L', sourceSeasonId: 't', movement: 'promoted' as const };
  it('accepts the same teams in any order', () => {
    expect(arrivalsAreCurrent([a, b], [b, a])).toBe(true);
    expect(arrivalsAreCurrent([], [])).toBe(true);
  });
  it('rejects extra, missing and changed teams', () => {
    expect(arrivalsAreCurrent([a, b], [a])).toBe(false);
    expect(arrivalsAreCurrent([a], [a, b])).toBe(false);
    expect(arrivalsAreCurrent([a], [{ ...a, franchiseId: 'z' }])).toBe(false);
    expect(arrivalsAreCurrent([a], [{ ...a, sourceSeasonId: 'other' }])).toBe(false);
    expect(arrivalsAreCurrent([a], [{ ...a, movement: 'promoted' }])).toBe(false);
    expect(arrivalsAreCurrent([a], [{ ...a, fromLeagueId: 'Z' }])).toBe(false);
  });
});

describe('isOffseasonPlan with arrivals', () => {
  const base = plan('U', ['a'], ['b']);
  const arrival = { franchiseId: 'x', fromLeagueId: 'L', sourceSeasonId: 's-L', movement: 'promoted' as const, players: roster() };
  it('accepts a plan with and without arrivals', () => {
    expect(isOffseasonPlan(base)).toBe(true);
    expect(isOffseasonPlan({ ...base, arrivals: [] })).toBe(true);
    expect(isOffseasonPlan({ ...base, arrivals: [arrival] })).toBe(true);
  });
  it('rejects malformed or repeated arrivals', () => {
    expect(isOffseasonPlan({ ...base, arrivals: 'x' })).toBe(false);
    expect(isOffseasonPlan({ ...base, arrivals: [{ ...arrival, movement: 'up' }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, arrivals: [{ ...arrival, players: [] }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, arrivals: [{ ...arrival, sourceSeasonId: '' }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, arrivals: [arrival, { ...arrival, players: roster() }] })).toBe(false);
  });
});
