import type { League } from './league';
import { chainLeagueIds, leagueAbove, leagueBelow, linkProblem, linkedEditProblems } from './league-links';

const make = (id: string, o: Partial<League> = {}): League => ({
  id,
  name: id,
  size: 10,
  namingStyle: 'nameOnly',
  relegation: true,
  promotedCount: 2,
  demotedCount: 2,
  ...o,
});

describe('linkProblem', () => {
  const upper = make('U', { promotedCount: 0 });
  const lower = make('L', { demotedCount: 0 });

  it('accepts a matching pair', () => {
    expect(linkProblem(upper, lower, [upper, lower])).toBeNull();
  });

  it('rejects each problem', () => {
    expect(linkProblem(upper, upper, [upper])).toMatch(/itself/);
    expect(linkProblem({ ...upper, relegation: false }, lower, [])).toMatch(/turned on/);
    expect(linkProblem(upper, { ...lower, relegation: false }, [])).toMatch(/turned on/);
    expect(linkProblem(upper, { ...lower, namingStyle: 'cityAndName' }, [])).toMatch(/differently/);
    expect(linkProblem(upper, { ...lower, promotedCount: 3 }, [])).toBe('U demotes 2 but L promotes 3.');
  });

  it('rejects taken slots and loops', () => {
    const a = make('A', { leagueBelowId: 'B' });
    const b = make('B', { leagueAboveId: 'A', leagueBelowId: 'C' });
    const c = make('C', { leagueAboveId: 'B' });
    const all = [a, b, c];
    expect(linkProblem(a, make('X'), all)).toMatch(/already has a league below/);
    expect(linkProblem(make('X'), b, all)).toMatch(/already has a league above/);
    expect(linkProblem(c, a, all)).toMatch(/same chain/);
  });
});

describe('chain helpers', () => {
  const a = make('A', { leagueBelowId: 'B' });
  const b = make('B', { leagueAboveId: 'A', leagueBelowId: 'C' });
  const c = make('C', { leagueAboveId: 'B' });

  it('walks a three-league chain from any member', () => {
    for (const l of [a, b, c]) expect(chainLeagueIds(l, [a, b, c]).sort()).toEqual(['A', 'B', 'C']);
    expect(leagueBelow(a, [a, b, c])).toBe(b);
    expect(leagueAbove(c, [a, b, c])).toBe(b);
  });

  it('treats one-sided and missing links as no link', () => {
    const oneSided = make('X', { leagueBelowId: 'Y' });
    expect(leagueBelow(oneSided, [oneSided, make('Y')])).toBeNull();
    expect(leagueBelow(oneSided, [oneSided])).toBeNull();
    expect(chainLeagueIds(oneSided, [oneSided, make('Y')])).toEqual(['X']);
  });

  it('survives a corrupt loop', () => {
    const p = make('P', { leagueAboveId: 'Q', leagueBelowId: 'Q' });
    const q = make('Q', { leagueAboveId: 'P', leagueBelowId: 'P' });
    expect(chainLeagueIds(p, [p, q]).sort()).toEqual(['P', 'Q']);
  });
});

describe('linkedEditProblems', () => {
  const above = make('A', { demotedCount: 2 });
  const below = make('B', { promotedCount: 3 });
  const edited = make('M', { promotedCount: 2, demotedCount: 3 });

  it('is empty when unlinked or still matching', () => {
    expect(linkedEditProblems(make('M', { namingStyle: 'cityAndName' }), null, null)).toEqual({});
    expect(linkedEditProblems(edited, above, below)).toEqual({});
  });

  it('flags naming style, relegation off and count changes', () => {
    expect(linkedEditProblems({ ...edited, namingStyle: 'cityAndName' }, above, null).namingStyle).toMatch(/Unlink/);
    expect(linkedEditProblems({ ...edited, relegation: false }, above, null).counts).toMatch(/Unlink/);
    const f = linkedEditProblems({ ...edited, promotedCount: 1, demotedCount: 1 }, above, below);
    expect(f.promotedCount).toMatch(/A demotes 2/);
    expect(f.demotedCount).toMatch(/B promotes 3/);
  });
});
