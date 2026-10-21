import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import { isOffseasonPlan, type OffseasonPlan, type StagedFreeAgentPick, type StagedTeamChange } from './offseason-plan';
import { draftOrder, freeAgentPool, needsText, overLimit, pickedBy, rosterCounts, rosterNeeds, teamOnTheClock, validatePick } from './free-agency';
import type { ParticipatingTeam } from './roster-changes';

const std = (id: string): StandardRosterPlayer => ({ id, kind: 'standard', name: id, age: 25, offense: 3, defense: 3, sportsmanship: 3, controlStars: 0, rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 } });
const goalie = (id: string): GoalieRosterPlayer => ({ id, kind: 'goalie', name: id, age: 25, goaltending: 35, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 } });
const roster = (p: string): RosterPlayer[] => [...[1, 2, 3, 4, 5, 6].map((n) => std(`${p}s${n}`)), goalie(`${p}g1`), goalie(`${p}g2`)];
const archiveOf = (seasonId: string, ids: string[]): SeasonArchive => ({
  seasonId, leagueId: 'L', seasonIndex: 1, teams: ids.map((franchiseId, i) => ({ franchiseId, position: i + 1, players: roster(franchiseId) })),
}) as unknown as SeasonArchive;

const own = archiveOf('s', ['a', 'b', 'c', 'd']);
const above = archiveOf('su', ['u1', 'u2', 'u3', 'u4']);
const below = archiveOf('sl', ['l1', 'l2', 'l3', 'l4']);
const arrival = (franchiseId: string, sourceSeasonId: string, movement: 'promoted' | 'demoted') => ({ franchiseId, fromLeagueId: 'X', sourceSeasonId, movement, players: roster(franchiseId) });
const plan = (extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ seasonId: 's', leagueId: 'L', promoted: [], demoted: [], ...extra });

describe('draftOrder', () => {
  it('uses the finishing order with no links', () => expect(draftOrder(own, plan(), [])).toEqual(['a', 'b', 'c', 'd']));
  it('removes departing teams', () => expect(draftOrder(own, plan({ promoted: ['a'], demoted: ['d'] }), [])).toEqual(['b', 'c']));
  it('puts demoted arrivals first and promoted arrivals last, each by their own finish', () => {
    const p = plan({ promoted: ['a'], demoted: ['d'], arrivals: [arrival('l3', 'sl', 'promoted'), arrival('u4', 'su', 'demoted'), arrival('l1', 'sl', 'promoted'), arrival('u2', 'su', 'demoted')] });
    expect(draftOrder(own, p, [above, below])).toEqual(['u2', 'u4', 'b', 'c', 'l1', 'l3']);
  });
  it('sorts an arrival missing from its source archive last in its group', () => {
    const p = plan({ arrivals: [arrival('u9', 'su', 'demoted'), arrival('u3', 'su', 'demoted')] });
    expect(draftOrder(own, p, [above]).slice(0, 2)).toEqual(['u3', 'u9']);
  });
});

const teams: ParticipatingTeam[] = ['a', 'b', 'c'].map((id) => ({ franchiseId: id, origin: 'staying', players: roster(id) }));
const changes: StagedTeamChange[] = [
  { franchiseId: 'a', protectedId: 'as1', retiredId: 'as2', releasedId: 'as3' },
  { franchiseId: 'b', protectedId: 'bs1', retiredId: 'bg1', releasedId: 'bg2' },
  { franchiseId: 'c', protectedId: 'cs1', retiredId: 'cs2', releasedId: 'cs3' },
];
const order = ['a', 'b', 'c'];

describe('freeAgentPool and teamOnTheClock', () => {
  it('lists released players in team order and drops picked ones', () => {
    expect(freeAgentPool(teams, changes, []).map((e) => [e.player.id, e.fromFranchiseId])).toEqual([['as3', 'a'], ['bg2', 'b'], ['cs3', 'c']]);
    expect(freeAgentPool(teams, changes, [{ franchiseId: 'a', playerId: 'bg2' }]).map((e) => e.player.id)).toEqual(['as3', 'cs3']);
  });
  it('is empty before aging', () => expect(freeAgentPool(teams, [{ franchiseId: 'a', protectedId: 'as1' }], [])).toEqual([]));
  it('finds the team on the clock at the start, middle and end', () => {
    expect(teamOnTheClock(order, [])).toBe('a');
    expect(teamOnTheClock(order, [{ franchiseId: 'a', playerId: 'x' }])).toBe('b');
    expect(teamOnTheClock(order, order.map((franchiseId, i) => ({ franchiseId, playerId: `p${i}` })))).toBeNull();
  });
});

describe('validatePick', () => {
  const check = (picks: StagedFreeAgentPick[], franchiseId: string, playerId: string, c = changes) => validatePick({ order, teams, changes: c, picks }, franchiseId, playerId);
  it('accepts the team on the clock picking from the pool, including its own player', () => {
    expect(check([], 'a', 'bg2')).toEqual({ ok: true });
    expect(check([], 'a', 'as3')).toEqual({ ok: true });
  });
  it('reports each error', () => {
    expect(check([], 'a', 'bg2', [])).toEqual({ ok: false, error: 'aging-not-run' });
    expect(check([], 'b', 'bg2')).toEqual({ ok: false, error: 'not-on-the-clock' });
    expect(check([], 'a', 'as1')).toEqual({ ok: false, error: 'not-in-pool' });
    expect(check([{ franchiseId: 'a', playerId: 'bg2' }], 'b', 'bg2')).toEqual({ ok: false, error: 'not-in-pool' });
    const full = [{ franchiseId: 'a', playerId: 'cs3' }, { franchiseId: 'b', playerId: 'bg2' }, { franchiseId: 'c', playerId: 'as3' }];
    expect(check(full, 'a', 'as3')).toEqual({ ok: false, error: 'draft-complete' });
  });
});

describe('rosterCounts and overLimit', () => {
  it('counts a normal team that picks a replacement of the same kind', () => {
    const counts = rosterCounts(teams[0], changes[0], pickedBy('a', teams, [{ franchiseId: 'a', playerId: 'cs3' }]));
    expect(counts).toEqual({ standard: 5, goalies: 2 });
    expect(overLimit(counts)).toBe(false);
  });
  it('flags a team that lost both goaltenders and picked a position player', () => {
    const lost: StagedTeamChange = { franchiseId: 'b', protectedId: 'bs1', retiredId: 'bg1', releasedId: 'bg2' };
    const counts = rosterCounts(teams[1], lost, pickedBy('b', teams, [{ franchiseId: 'b', playerId: 'as3' }]));
    expect(counts).toEqual({ standard: 7, goalies: 0 });
    expect(overLimit(counts)).toBe(true);
  });
  it('is back to full when a team picks its own released player after a retirement elsewhere', () => {
    const counts = rosterCounts(teams[0], changes[0], pickedBy('a', teams, [{ franchiseId: 'a', playerId: 'as3' }]));
    expect(counts).toEqual({ standard: 5, goalies: 2 });
  });
  it('flags three goaltenders', () => expect(overLimit({ standard: 3, goalies: 3 })).toBe(true));
});

describe('isOffseasonPlan freeAgentPicks', () => {
  const ok = (freeAgentPicks: unknown) => isOffseasonPlan({ seasonId: 's', leagueId: 'L', promoted: [], demoted: [], freeAgentPicks });
  it('accepts valid picks and an empty list', () => {
    expect(ok([{ franchiseId: 'a', playerId: 'p' }, { franchiseId: 'b', playerId: 'q' }])).toBe(true);
    expect(ok([])).toBe(true);
  });
  it('rejects invalid picks', () => {
    expect(ok('x')).toBe(false);
    expect(ok([{ franchiseId: '', playerId: 'p' }])).toBe(false);
    expect(ok([{ franchiseId: 'a' }])).toBe(false);
    expect(ok([null])).toBe(false);
    expect(ok([{ franchiseId: 'a', playerId: 'p' }, { franchiseId: 'a', playerId: 'q' }])).toBe(false);
    expect(ok([{ franchiseId: 'a', playerId: 'p' }, { franchiseId: 'b', playerId: 'p' }])).toBe(false);
  });
});

describe('rosterNeeds and needsText', () => {
  it('describes what a team needs', () => {
    expect(needsText(rosterNeeds({ standard: 5, goalies: 1 }))).toBe('1 position player and 1 goaltender');
    expect(needsText(rosterNeeds({ standard: 6, goalies: 0 }))).toBe('2 goaltenders');
    expect(needsText(rosterNeeds({ standard: 4, goalies: 2 }))).toBe('2 position players');
    expect(needsText(rosterNeeds({ standard: 6, goalies: 2 }))).toBe('nothing');
  });
  it('never goes below zero for a team over the limit', () => {
    expect(rosterNeeds({ standard: 7, goalies: 0 })).toEqual({ standard: 0, goalies: 2 });
  });
});
