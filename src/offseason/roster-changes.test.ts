import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import { isOffseasonPlan, type OffseasonPlan, type StagedTeamChange } from './offseason-plan';
import { arrivalsReady, buildTeamChanges, changesAreCurrent, participatingTeams, pickRelease, pickRetiree, type ParticipatingTeam } from './roster-changes';

const std = (id: string, age: number, offense: number, defense: number, sportsmanship = 3): StandardRosterPlayer => ({
  id, kind: 'standard', name: id.toUpperCase(), age, offense, defense, sportsmanship, controlStars: 0,
  rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 },
});
const goalie = (id: string, age: number, goaltending: number, sportsmanship = 3): GoalieRosterPlayer => ({
  id, kind: 'goalie', name: id.toUpperCase(), age, goaltending, sportsmanship, rolls: { age: 7, goaltending: 7, sportsmanship: 3 },
});

const low = () => 0;
const high = () => 0.999;

describe('pickRetiree', () => {
  it('takes the oldest player', () => {
    expect(pickRetiree([std('a', 25, 3, 3), std('b', 28, 4, 4), goalie('g', 26, 35)], 'zz', low)).toBe('b');
  });
  it('skips the protected player', () => {
    expect(pickRetiree([std('a', 25, 3, 3), std('b', 28, 4, 4), std('c', 27, 4, 4)], 'b', low)).toBe('c');
  });
  it('sends a goaltender first on an age tie', () => {
    expect(pickRetiree([std('a', 30, 1, 1), goalie('g', 30, 46), std('b', 30, 2, 2)], 'zz', low)).toBe('g');
  });
  it('breaks ties among position players by lowest OF+DE, then lowest SP, then random', () => {
    expect(pickRetiree([std('a', 30, 4, 3), std('b', 30, 3, 3), std('c', 30, 4, 4)], 'zz', low)).toBe('b');
    expect(pickRetiree([std('a', 30, 3, 3, 4), std('b', 30, 3, 3, 2), std('c', 30, 3, 3, 3)], 'zz', low)).toBe('b');
    const tied = [std('a', 30, 3, 3), std('b', 30, 3, 3), std('c', 30, 3, 3)];
    expect(pickRetiree(tied, 'zz', low)).toBe('a');
    expect(pickRetiree(tied, 'zz', high)).toBe('c');
  });
  it('breaks ties among goaltenders by lowest GO, then SP, then random', () => {
    expect(pickRetiree([goalie('g', 30, 41), goalie('h', 30, 36), std('a', 30, 1, 1)], 'zz', low)).toBe('h');
    expect(pickRetiree([goalie('g', 30, 36, 5), goalie('h', 30, 36, 2)], 'zz', low)).toBe('h');
    expect(pickRetiree([goalie('g', 30, 36), goalie('h', 30, 36)], 'zz', high)).toBe('h');
  });
  it('rejects an empty choice', () => {
    expect(() => pickRetiree([std('a', 25, 3, 3)], 'a', low)).toThrow(RangeError);
  });
});

describe('pickRelease', () => {
  const players: RosterPlayer[] = [std('a', 25, 3, 3), std('b', 26, 3, 3), std('c', 27, 3, 3), goalie('g', 28, 35)];
  it('never returns the protected or retired player and is uniform over the rest', () => {
    expect(pickRelease(players, 'a', 'b', low)).toBe('c');
    expect(pickRelease(players, 'a', 'b', high)).toBe('g');
  });
});

const team = (franchiseId: string, players: RosterPlayer[], origin: 'staying' | 'arrival' = 'staying'): ParticipatingTeam => ({ franchiseId, origin, players });
const roster = (p: string) => [std(`${p}1`, 25, 3, 3), std(`${p}2`, 27, 3, 3), goalie(`${p}g`, 26, 35)];

describe('buildTeamChanges', () => {
  const teams = [team('a', roster('a')), team('b', roster('b'))];
  it('builds retire and release for every team', () => {
    const r = buildTeamChanges(teams, new Map([['a', 'a2'], ['b', 'bg']]), low);
    expect(r).toEqual({
      ok: true,
      value: [
        { franchiseId: 'a', protectedId: 'a2', retiredId: 'ag', releasedId: 'a1' },
        { franchiseId: 'b', protectedId: 'bg', retiredId: 'b2', releasedId: 'b1' },
      ],
    });
  });
  it('lists teams without a protection', () => {
    expect(buildTeamChanges(teams, new Map([['a', 'a1']]), low)).toEqual({ ok: false, missing: ['b'] });
  });
});

describe('changesAreCurrent', () => {
  const teams = [team('a', roster('a')), team('b', roster('b'))];
  const changes: StagedTeamChange[] = [
    { franchiseId: 'a', protectedId: 'a1', retiredId: 'a2', releasedId: 'ag' },
    { franchiseId: 'b', protectedId: 'b1' },
  ];
  it('accepts matching teams and players', () => expect(changesAreCurrent(changes, teams)).toBe(true));
  it('accepts protections for only some teams', () => expect(changesAreCurrent(changes.slice(0, 1), teams)).toBe(true));
  it('rejects a team that no longer takes part', () => {
    expect(changesAreCurrent([changes[0], { ...changes[1], franchiseId: 'c' }], teams)).toBe(false);
  });
  it('rejects unknown players', () => {
    expect(changesAreCurrent([changes[0], { franchiseId: 'b', protectedId: 'zz' }], teams)).toBe(false);
    expect(changesAreCurrent([{ ...changes[0], releasedId: 'zz' }, changes[1]], teams)).toBe(false);
  });
});

describe('participatingTeams', () => {
  const archive = {
    seasonId: 's', leagueId: 'L', seasonIndex: 1,
    teams: ['c', 'a', 'b', 'd'].map((id, i) => ({ franchiseId: id, position: [3, 1, 2, 4][i], players: roster(id) })),
  } as unknown as SeasonArchive;
  const arrival = { franchiseId: 'x', fromLeagueId: 'M', sourceSeasonId: 'sm', movement: 'promoted' as const, players: roster('x') };
  const plan = (promoted: string[], demoted: string[], extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ seasonId: 's', leagueId: 'L', promoted, demoted, ...extra });
  const ids = (p: OffseasonPlan) => participatingTeams(archive, p).map((t) => t.franchiseId);
  it('lists every team in finishing order with no departures', () => expect(ids(plan([], []))).toEqual(['a', 'b', 'c', 'd']));
  it('leaves out departing teams', () => expect(ids(plan(['a'], ['d']))).toEqual(['b', 'c']));
  it('adds arrivals after the staying teams', () => {
    const teams = participatingTeams(archive, plan(['a'], [], { arrivals: [arrival] }));
    expect(teams.map((t) => [t.franchiseId, t.origin])).toEqual([['b', 'staying'], ['c', 'staying'], ['d', 'staying'], ['x', 'arrival']]);
    expect(teams[3].players).toBe(arrival.players);
  });
  it('ignores new teams', () => {
    const newTeams = [{ id: 'n1' }] as unknown as OffseasonPlan['newTeams'];
    expect(ids(plan(['a'], [], { newTeams }))).toEqual(['b', 'c', 'd']);
  });
});

describe('arrivalsReady', () => {
  const exp = [{ franchiseId: 'x', fromLeagueId: 'M', sourceSeasonId: 's', movement: 'promoted' as const }];
  it('is ready with nothing expected or staged', () => expect(arrivalsReady({ expected: [], staged: null, current: false, blocked: [] })).toBe(true));
  it('is not ready with stale staged arrivals and nothing expected', () => {
    expect(arrivalsReady({ expected: [], staged: [{ ...exp[0], players: [] }], current: false, blocked: [] })).toBe(false);
  });
  it('needs current staged arrivals when some are expected', () => {
    expect(arrivalsReady({ expected: exp, staged: null, current: false, blocked: [] })).toBe(false);
    expect(arrivalsReady({ expected: exp, staged: [], current: true, blocked: [] })).toBe(true);
  });
  it('is not ready when blocked', () => {
    expect(arrivalsReady({ expected: [], staged: null, current: false, blocked: [{ leagueId: 'M', leagueName: 'M', direction: 'above', reason: 'no-plan' }] })).toBe(false);
  });
});

describe('isOffseasonPlan teamChanges', () => {
  const base = { seasonId: 's', leagueId: 'L', promoted: [], demoted: [] };
  const ok = (teamChanges: unknown) => isOffseasonPlan({ ...base, teamChanges });
  it('accepts protections only and full results', () => {
    expect(ok([{ franchiseId: 'a', protectedId: 'p' }, { franchiseId: 'b', protectedId: 'p', retiredId: 'r', releasedId: 'q' }])).toBe(true);
  });
  it('accepts a plan without them', () => expect(isOffseasonPlan(base)).toBe(true));
  it('rejects invalid entries', () => {
    expect(ok('x')).toBe(false);
    expect(ok([{ franchiseId: '', protectedId: 'p' }])).toBe(false);
    expect(ok([{ franchiseId: 'a' }])).toBe(false);
    expect(ok([{ franchiseId: 'a', protectedId: 'p', retiredId: 'r' }])).toBe(false);
    expect(ok([{ franchiseId: 'a', protectedId: 'p', retiredId: 'p', releasedId: 'q' }])).toBe(false);
    expect(ok([{ franchiseId: 'a', protectedId: 'p', retiredId: 'r', releasedId: 'r' }])).toBe(false);
    expect(ok([{ franchiseId: 'a', protectedId: 'p' }, { franchiseId: 'a', protectedId: 'q' }])).toBe(false);
  });
});
