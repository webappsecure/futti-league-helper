import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { OffseasonPlan } from './offseason-plan';
import type { ParticipatingTeam } from './roster-changes';
import { draftIsComplete, EXTRA_GOALIES, EXTRA_STANDARD, freeAgencyComplete, poolSize, rookieDraftOrder, rookieOnTheClock, rookiePool, teamNeeds, validateRookiePick } from './rookie-draft';

const std = (id: string): StandardRosterPlayer => ({ id, kind: 'standard', name: id, age: 25, offense: 3, defense: 3, sportsmanship: 3, controlStars: 0, rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 } });
const goalie = (id: string): GoalieRosterPlayer => ({ id, kind: 'goalie', name: id, age: 25, goaltending: 35, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 } });
const roster = (p: string): RosterPlayer[] => [...[1, 2, 3, 4, 5, 6].map((n) => std(`${p}s${n}`)), goalie(`${p}g1`), goalie(`${p}g2`)];
const archiveOf = (seasonId: string, ids: string[]): SeasonArchive =>
  ({ seasonId, leagueId: 'L', seasonIndex: 1, teams: ids.map((franchiseId, i) => ({ franchiseId, position: i + 1, players: roster(franchiseId) })) }) as unknown as SeasonArchive;
const arrival = (franchiseId: string, sourceSeasonId: string, movement: 'promoted' | 'demoted') => ({ franchiseId, fromLeagueId: 'X', sourceSeasonId, movement, players: roster(franchiseId) });

const teams: ParticipatingTeam[] = ['a', 'b', 'c'].map((id) => ({ franchiseId: id, origin: 'staying', players: roster(id) }));
const draftee = (id: string, kind: 'standard' | 'goalie') => (kind === 'standard' ? { ...std(id), age: 19 } : { ...goalie(id), age: 19 });
const pool = [draftee('r1', 'standard'), draftee('r2', 'standard'), draftee('r3', 'standard'), draftee('r4', 'standard'), draftee('r5', 'standard'), draftee('g1', 'goalie'), draftee('g2', 'goalie'), draftee('g3', 'goalie')];

/** a needs 1 position player, b needs 2 goaltenders, c needs 2 position players (and has 3 goaltenders). */
const base: OffseasonPlan = {
  seasonId: 's', leagueId: 'L', promoted: [], demoted: [],
  teamChanges: [
    { franchiseId: 'a', protectedId: 'as1', retiredId: 'as2', releasedId: 'as3' },
    { franchiseId: 'b', protectedId: 'bs1', retiredId: 'bg1', releasedId: 'bg2' },
    { franchiseId: 'c', protectedId: 'cs1', retiredId: 'cs2', releasedId: 'cs3' },
  ],
  freeAgentPicks: [{ franchiseId: 'a', playerId: 'cs3' }, { franchiseId: 'b', playerId: 'as3' }, { franchiseId: 'c', playerId: 'bg2' }],
};
const withPool = (extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ ...base, draftPool: pool, ...extra });
const order = ['c', 'b', 'a'];
const [a, b, c] = teams;

describe('teamNeeds and poolSize', () => {
  it('counts what each team lacks after retirement, release and free agency', () => {
    expect(teamNeeds(a, teams, base)).toEqual({ standard: 1, goalies: 0 });
    expect(teamNeeds(b, teams, base)).toEqual({ standard: 0, goalies: 2 });
    expect(teamNeeds(c, teams, base)).toEqual({ standard: 2, goalies: 0 });
  });
  it('is zero for a full team', () => {
    const full: OffseasonPlan = { ...base, teamChanges: [], freeAgentPicks: [] };
    expect(teamNeeds(a, teams, full)).toEqual({ standard: 0, goalies: 0 });
  });
  it('is zero for a team over the limit and does not offset others', () => {
    expect(teamNeeds(c, teams, base).goalies).toBe(0);
    expect(poolSize(teams.map((t) => teamNeeds(t, teams, base)))).toEqual({ standard: 3 + EXTRA_STANDARD, goalies: 2 + EXTRA_GOALIES });
  });
  it('is only the extras when nobody needs anyone', () => {
    expect(poolSize([{ standard: 0, goalies: 0 }])).toEqual({ standard: 2, goalies: 1 });
  });
  it('counts rookies already picked', () => {
    const p = withPool({ draftPicks: [{ franchiseId: 'a', playerId: 'r1' }, { franchiseId: 'b', playerId: 'g1' }] });
    expect(teamNeeds(a, teams, p)).toEqual({ standard: 0, goalies: 0 });
    expect(teamNeeds(b, teams, p)).toEqual({ standard: 0, goalies: 1 });
  });
});

describe('freeAgencyComplete', () => {
  it('needs aging and a pick from every team', () => {
    expect(freeAgencyComplete(teams, base)).toBe(true);
    expect(freeAgencyComplete(teams, { ...base, freeAgentPicks: base.freeAgentPicks!.slice(1) })).toBe(false);
    expect(freeAgencyComplete(teams, { ...base, teamChanges: [{ franchiseId: 'a', protectedId: 'as1' }] })).toBe(false);
    expect(freeAgencyComplete([], base)).toBe(false);
  });
});

describe('rookieDraftOrder', () => {
  const own = archiveOf('s', ['a', 'b', 'c', 'd']);
  const above = archiveOf('su', ['u1', 'u2', 'u3', 'u4']);
  const below = archiveOf('sl', ['l1', 'l2', 'l3', 'l4']);
  const plan = (extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ seasonId: 's', leagueId: 'L', promoted: [], demoted: [], ...extra });
  it('is worst to best with no links', () => expect(rookieDraftOrder(own, plan(), [])).toEqual(['d', 'c', 'b', 'a']));
  it('removes departing teams', () => expect(rookieDraftOrder(own, plan({ promoted: ['a'], demoted: ['d'] }), [])).toEqual(['c', 'b']));
  it('puts promoted arrivals first and demoted arrivals last, each worst finish first', () => {
    const p = plan({ promoted: ['a'], demoted: ['d'], arrivals: [arrival('l3', 'sl', 'promoted'), arrival('u4', 'su', 'demoted'), arrival('l1', 'sl', 'promoted'), arrival('u2', 'su', 'demoted')] });
    expect(rookieDraftOrder(own, p, [above, below])).toEqual(['l3', 'l1', 'c', 'b', 'u4', 'u2']);
  });
});

describe('rookieOnTheClock', () => {
  it('starts with the first team in order that needs someone', () => expect(rookieOnTheClock(order, teams, withPool())).toBe('c'));
  it('moves round by round and skips a full team', () => {
    const picks = (...list: [string, string][]) => withPool({ draftPicks: list.map(([franchiseId, playerId]) => ({ franchiseId, playerId })) });
    expect(rookieOnTheClock(order, teams, picks(['c', 'r1']))).toBe('b');
    expect(rookieOnTheClock(order, teams, picks(['c', 'r1'], ['b', 'g1']))).toBe('a');
    // round two: a is full, so c then b
    expect(rookieOnTheClock(order, teams, picks(['c', 'r1'], ['b', 'g1'], ['a', 'r2']))).toBe('c');
    expect(rookieOnTheClock(order, teams, picks(['c', 'r1'], ['b', 'g1'], ['a', 'r2'], ['c', 'r3']))).toBe('b');
  });
  it('is null when every team is full', () => {
    const done = withPool({ draftPicks: [['c', 'r1'], ['b', 'g1'], ['a', 'r2'], ['c', 'r3'], ['b', 'g2']].map(([franchiseId, playerId]) => ({ franchiseId, playerId })) });
    expect(rookieOnTheClock(order, teams, done)).toBeNull();
    expect(draftIsComplete(teams, done)).toBe(true);
    expect(draftIsComplete(teams, withPool())).toBe(false);
  });
});

describe('rookiePool', () => {
  it('drops picked draftees and is empty without a pool', () => {
    expect(rookiePool(withPool({ draftPicks: [{ franchiseId: 'a', playerId: 'r1' }] })).map((p) => p.id)).not.toContain('r1');
    expect(rookiePool(base)).toEqual([]);
  });
});

describe('validateRookiePick', () => {
  const check = (plan: OffseasonPlan, franchiseId: string, playerId: string) => validateRookiePick({ order, teams, plan }, franchiseId, playerId);
  it('accepts the team on the clock taking a needed kind', () => expect(check(withPool(), 'c', 'r1')).toEqual({ ok: true }));
  it('reports each error', () => {
    expect(check({ ...withPool(), freeAgentPicks: [] }, 'c', 'r1')).toEqual({ ok: false, error: 'free-agency-incomplete' });
    expect(check(base, 'c', 'r1')).toEqual({ ok: false, error: 'pool-not-generated' });
    expect(check(withPool(), 'b', 'g1')).toEqual({ ok: false, error: 'not-on-the-clock' });
    expect(check(withPool(), 'c', 'zz')).toEqual({ ok: false, error: 'not-in-pool' });
    expect(check(withPool({ draftPicks: [{ franchiseId: 'c', playerId: 'r1' }] }), 'b', 'r1')).toEqual({ ok: false, error: 'not-in-pool' });
    expect(check(withPool(), 'c', 'g1')).toEqual({ ok: false, error: 'kind-not-needed' });
    const done = withPool({ draftPicks: [['c', 'r1'], ['b', 'g1'], ['a', 'r2'], ['c', 'r3'], ['b', 'g2']].map(([franchiseId, playerId]) => ({ franchiseId, playerId })) });
    expect(check(done, 'c', 'r4')).toEqual({ ok: false, error: 'draft-complete' });
  });
});
