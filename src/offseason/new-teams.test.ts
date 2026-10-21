import type { Grade } from '@/rules/charts';
import { rngFromDice } from '@/rules/test-rng';
import { buildNewTeam, newTeamsFit, openVacancies } from './new-teams';
import { isOffseasonPlan, type OffseasonPlan, type StagedNewTeam } from './offseason-plan';

const plan = (promoted: string[], demoted: string[], newTeams?: StagedNewTeam[]): OffseasonPlan => ({
  seasonId: 's-1',
  leagueId: 'L1',
  promoted,
  demoted,
  ...(newTeams ? { newTeams } : {}),
});

// Unique two-letter upper-case names, which pass the roster name check.
const picker = () => {
  let i = 0;
  return () => String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i++ / 26));
};

// The grade die first, then the rest of the roster rolls are 3s (age 25, sportsmanship 3, and so on).
const rng = (first: number) => {
  const first6 = rngFromDice(first);
  let used = false;
  return () => {
    if (!used) {
      used = true;
      return first6();
    }
    return (3 - 0.5) / 6;
  };
};

const identity = { city: 'Richmond', name: 'Greyhounds', primaryColor: '#112233', secondaryColor: '#ffffff' };
const team = (vacancy: 'promoted' | 'demoted', gradeRoll: number, id = 'n1', pick = picker()): StagedNewTeam =>
  buildNewTeam({ id, vacancy, identity, leagueId: 'L1', rng: rng(gradeRoll), pickName: pick });

describe('openVacancies', () => {
  const p = plan(['a', 'b'], ['c']);
  it('leaves every place open with no linked league', () => {
    expect(openVacancies(p, { hasAbove: false, hasBelow: false })).toEqual({ promoted: 2, demoted: 1 });
  });
  it('lets a league above fill the promoted places', () => {
    expect(openVacancies(p, { hasAbove: true, hasBelow: false })).toEqual({ promoted: 0, demoted: 1 });
  });
  it('lets a league below fill the demoted places', () => {
    expect(openVacancies(p, { hasAbove: false, hasBelow: true })).toEqual({ promoted: 2, demoted: 0 });
  });
  it('has no open places with both neighbors', () => {
    expect(openVacancies(p, { hasAbove: true, hasBelow: true })).toEqual({ promoted: 0, demoted: 0 });
  });
  it('handles no promoted or no demoted teams', () => {
    expect(openVacancies(plan([], ['c']), { hasAbove: false, hasBelow: false })).toEqual({ promoted: 0, demoted: 1 });
    expect(openVacancies(plan(['a'], []), { hasAbove: false, hasBelow: false })).toEqual({ promoted: 1, demoted: 0 });
  });
  it('subtracts staged new teams and never goes below zero', () => {
    const one = plan(['a', 'b'], ['c'], [team('promoted', 4)]);
    expect(openVacancies(one, { hasAbove: false, hasBelow: false })).toEqual({ promoted: 1, demoted: 1 });
    expect(openVacancies(one, { hasAbove: true, hasBelow: false })).toEqual({ promoted: 0, demoted: 1 });
  });
});

describe('newTeamsFit', () => {
  it('fits while staged teams stay within the open places', () => {
    const p = plan(['a'], ['c'], [team('promoted', 1)]);
    expect(newTeamsFit(p, { hasAbove: false, hasBelow: false })).toBe(true);
    expect(newTeamsFit(plan(['a'], ['c']), { hasAbove: true, hasBelow: true })).toBe(true);
  });
  it('does not fit once a side is filled by a linked league', () => {
    const p = plan(['a'], ['c'], [team('promoted', 1)]);
    expect(newTeamsFit(p, { hasAbove: true, hasBelow: false })).toBe(false);
  });
  it('does not fit with more teams than places', () => {
    const p = plan(['a'], ['c'], [team('promoted', 1, 'x'), team('promoted', 2, 'y')]);
    expect(newTeamsFit(p, { hasAbove: false, hasBelow: false })).toBe(false);
  });
});

describe('buildNewTeam', () => {
  const cases: [StagedNewTeam['vacancy'], number, Grade][] = [
    ['promoted', 1, 'A'], ['promoted', 2, 'B'], ['promoted', 3, 'B'], ['promoted', 4, 'C'], ['promoted', 6, 'C'],
    ['demoted', 1, 'C'], ['demoted', 2, 'D'], ['demoted', 3, 'D'], ['demoted', 4, 'F'], ['demoted', 6, 'F'],
  ];
  it.each(cases)('a %s vacancy with a roll of %i gets grade %s', (vacancy, roll, grade) => {
    const t = team(vacancy, roll);
    expect(t).toMatchObject({ id: 'n1', vacancy, gradeRoll: roll, grade, ...identity });
    expect(t.players).toHaveLength(8);
    expect(t.players.map((p) => p.kind)).toEqual(['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'goalie', 'goalie']);
    expect(new Set(t.players.map((p) => p.name)).size).toBe(8);
  });
  it('stores a plan that passes the plan check', () => {
    expect(isOffseasonPlan(plan(['a'], ['c'], [team('demoted', 5)]))).toBe(true);
  });
});

describe('isOffseasonPlan with new teams', () => {
  const good = team('promoted', 2);
  const ok = (t: unknown) => isOffseasonPlan({ ...plan(['a'], ['c']), newTeams: [t] });
  it('accepts valid teams and plans without them', () => {
    expect(isOffseasonPlan(plan(['a'], ['c']))).toBe(true);
    expect(isOffseasonPlan({ ...plan(['a'], ['c']), newTeams: [] })).toBe(true);
    expect(ok(good)).toBe(true);
  });
  it('rejects each kind of bad team', () => {
    expect(ok({ ...good, id: '' })).toBe(false);
    expect(ok({ ...good, vacancy: 'up' })).toBe(false);
    expect(ok({ ...good, gradeRoll: 7 })).toBe(false);
    expect(ok({ ...good, gradeRoll: 2.5 })).toBe(false);
    expect(ok({ ...good, grade: 'F' })).toBe(false);
    expect(ok({ ...good, city: ' Richmond ' })).toBe(false);
    expect(ok({ ...good, name: '' })).toBe(false);
    expect(ok({ ...good, primaryColor: '#FFF' })).toBe(false);
    expect(ok({ ...good, players: [] })).toBe(false);
    expect(ok({ ...good, city: 5 })).toBe(false);
    expect(isOffseasonPlan({ ...plan(['a'], ['c']), newTeams: 'x' })).toBe(false);
  });
  it('rejects repeated ids and an id shared with an arrival', () => {
    const other = team('promoted', 2, 'n1', picker());
    expect(isOffseasonPlan({ ...plan(['a'], ['c']), newTeams: [good, other] })).toBe(false);
    const arrival = { franchiseId: 'n1', fromLeagueId: 'U', sourceSeasonId: 's-U', movement: 'demoted', players: good.players };
    expect(isOffseasonPlan({ ...plan(['a'], ['c']), arrivals: [arrival], newTeams: [good] })).toBe(false);
  });
});
