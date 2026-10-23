import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import { draftOrder } from './free-agency';
import { openVacancies, newTeamsFit } from './new-teams';
import { isOffseasonPlan, type OffseasonPlan, type StagedFormerTeam, type StagedNewTeam } from './offseason-plan';
import { participatingTeams } from './roster-changes';

const std = (id: string): StandardRosterPlayer => ({
  id, kind: 'standard', name: id.toUpperCase().replace(/[^A-Z]/g, 'X'), age: 25, offense: 3, defense: 3, sportsmanship: 3, controlStars: 0, rolls: { age: 7, total: 7, split: null, stars: 3, sportsmanship: 3 },
});
const goalie = (id: string): GoalieRosterPlayer => ({ id, kind: 'goalie', name: id.toUpperCase().replace(/[^A-Z]/g, 'X'), age: 25, goaltending: 33, sportsmanship: 3, rolls: { age: 7, goaltending: 7, sportsmanship: 3 } });
const eight = (id: string): RosterPlayer[] => [...[1, 2, 3, 4, 5, 6].map((i) => std(`${id}s${i}`)), goalie(`${id}ga`), goalie(`${id}gb`)];
const identity = { fromSeason: 1, city: 'Oldtown', name: 'Elders', primaryColor: '#000000', secondaryColor: '#ffffff' };
const former = (franchiseId: string, vacancy: 'promoted' | 'demoted'): StagedFormerTeam => ({ franchiseId, vacancy, identity, players: eight(franchiseId) });
const plan = (extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ seasonId: 's', leagueId: 'L', promoted: ['x'], demoted: ['y'], ...extra });
const archive: SeasonArchive = {
  seasonId: 's', leagueId: 'L', seasonIndex: 1,
  teams: ['x', 'a', 'b', 'y'].map((franchiseId, i) => ({ franchiseId, position: i + 1, players: eight(franchiseId) }) as SeasonArchive['teams'][number]),
};

describe('formerTeams in the plan', () => {
  it('accepts former teams and an old plan without them', () => {
    expect(isOffseasonPlan(plan())).toBe(true);
    expect(isOffseasonPlan(plan({ formerTeams: [former('f1', 'promoted'), former('f2', 'demoted')] }))).toBe(true);
  });
  it('rejects a bad vacancy, identity, roster or repeated id', () => {
    const bad = (value: unknown) => isOffseasonPlan(plan({ formerTeams: value as StagedFormerTeam[] }));
    expect(bad('x')).toBe(false);
    expect(bad([{ ...former('f1', 'promoted'), vacancy: 'up' }])).toBe(false);
    expect(bad([{ ...former('f1', 'promoted'), identity: null }])).toBe(false);
    expect(bad([{ ...former('f1', 'promoted'), identity: { ...identity, fromSeason: 0 } }])).toBe(false);
    expect(bad([{ ...former('f1', 'promoted'), players: eight('f1').slice(1) }])).toBe(false);
    expect(bad([former('f1', 'promoted'), former('f1', 'demoted')])).toBe(false);
    expect(isOffseasonPlan(plan({ formerTeams: [former('f1', 'promoted')], arrivals: [{ franchiseId: 'f1', fromLeagueId: 'M', sourceSeasonId: 'sm', movement: 'promoted', players: eight('f1') }] }))).toBe(false);
  });
});

describe('participation and order', () => {
  it('lists former teams after staying teams and arrivals, as non-new teams', () => {
    const teams = participatingTeams(archive, plan({ formerTeams: [former('f1', 'promoted')] }));
    expect(teams.map((t) => [t.franchiseId, t.origin])).toEqual([['a', 'staying'], ['b', 'staying'], ['f1', 'former']]);
  });
  it('puts a former team with the arrivals that move the same way, after them', () => {
    const arrival = (id: string, movement: 'promoted' | 'demoted') => ({ franchiseId: id, fromLeagueId: 'M', sourceSeasonId: 'sm', movement, players: eight(id) });
    const p = plan({ arrivals: [arrival('u', 'demoted'), arrival('v', 'promoted')], formerTeams: [former('f1', 'promoted'), former('f2', 'demoted')] });
    const source: SeasonArchive = { seasonId: 'sm', leagueId: 'M', seasonIndex: 1, teams: [{ franchiseId: 'u', position: 1 }, { franchiseId: 'v', position: 2 }] as SeasonArchive['teams'] };
    // f1 fills the place of a promoted team, so it came down and goes with the demoted arrivals; f2 came up and goes last.
    expect(draftOrder(archive, p, [source])).toEqual(['u', 'f1', 'a', 'b', 'v', 'f2']);
  });
});

describe('places for new and former teams', () => {
  const links = { hasAbove: false, hasBelow: false };
  const fresh = (id: string, vacancy: 'promoted' | 'demoted'): StagedNewTeam => ({ id, vacancy, gradeRoll: 1, grade: vacancy === 'promoted' ? 'A' : 'C', city: 'C', name: 'N', primaryColor: '#000000', secondaryColor: '#ffffff', players: eight(id) });
  it('counts a former team against the same place as a new team', () => {
    expect(openVacancies(plan(), links)).toEqual({ promoted: 1, demoted: 1 });
    expect(openVacancies(plan({ formerTeams: [former('f1', 'promoted')] }), links)).toEqual({ promoted: 0, demoted: 1 });
    expect(openVacancies(plan({ formerTeams: [former('f1', 'promoted')], newTeams: [fresh('n', 'demoted')] }), links)).toEqual({ promoted: 0, demoted: 0 });
  });
  it('does not fit when two teams take one place, or when a link fills it', () => {
    expect(newTeamsFit(plan({ formerTeams: [former('f1', 'promoted')], newTeams: [fresh('n', 'promoted')] }), links)).toBe(false);
    expect(newTeamsFit(plan({ formerTeams: [former('f1', 'promoted')] }), { hasAbove: true, hasBelow: false })).toBe(false);
    expect(newTeamsFit(plan({ formerTeams: [former('f1', 'promoted')] }), links)).toBe(true);
  });
});
