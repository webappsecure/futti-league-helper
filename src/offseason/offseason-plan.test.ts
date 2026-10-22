import type { League } from '@/leagues/league';
import type { SeasonArchive } from '@/seasons/season-archive';
import { generateDraftGoalie, generateDraftStandard } from '@/rosters/roster';
import { rngFromDice } from '@/rules/test-rng';
import { departureErrorText, isOffseasonPlan, stagedPlayerNames, suggestDepartures, validateDepartures } from './offseason-plan';

const league = (promotedCount: number, demotedCount: number, relegation = true): League => ({
  id: 'L1',
  name: 'Premier',
  size: 6,
  namingStyle: 'cityAndName',
  relegation,
  promotedCount,
  demotedCount,
});

const archive: SeasonArchive = {
  seasonId: 's-1',
  leagueId: 'L1',
  seasonIndex: 1,
  teams: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ franchiseId: id, position: i + 1 }) as SeasonArchive['teams'][number]),
};

describe('suggestDepartures', () => {
  it('takes the best finishers up and the worst down', () => {
    expect(suggestDepartures(archive, league(2, 1))).toEqual({ promoted: ['a', 'b'], demoted: ['f'] });
  });
  it('handles no promoted teams', () => {
    expect(suggestDepartures(archive, league(0, 2))).toEqual({ promoted: [], demoted: ['e', 'f'] });
  });
  it('handles no demoted teams', () => {
    expect(suggestDepartures(archive, league(2, 0))).toEqual({ promoted: ['a', 'b'], demoted: [] });
  });
  it('orders by position, not by list order', () => {
    const shuffled = { ...archive, teams: [...archive.teams].reverse() };
    expect(suggestDepartures(shuffled, league(1, 1))).toEqual({ promoted: ['a'], demoted: ['f'] });
  });
});

describe('validateDepartures', () => {
  const check = (l: League, promoted: string[], demoted: string[]) => validateDepartures({ archive, league: l, promoted, demoted });
  it('accepts a valid choice', () => {
    expect(check(league(2, 1), ['c', 'a'], ['d'])).toEqual({ ok: true });
  });
  it('rejects a league without relegation', () => {
    expect(check(league(0, 0, false), [], [])).toEqual({ ok: false, error: 'not-relegation' });
  });
  it('rejects wrong counts', () => {
    expect(check(league(2, 1), ['a'], ['f'])).toEqual({ ok: false, error: 'promoted-count' });
    expect(check(league(1, 2), ['a'], ['f'])).toEqual({ ok: false, error: 'demoted-count' });
  });
  it('rejects an unknown team', () => {
    expect(check(league(1, 1), ['zz'], ['f'])).toEqual({ ok: false, error: 'unknown-team' });
  });
  it('rejects overlap and repeats', () => {
    expect(check(league(1, 1), ['a'], ['a'])).toEqual({ ok: false, error: 'overlap' });
    expect(check(league(2, 0), ['a', 'a'], [])).toEqual({ ok: false, error: 'overlap' });
  });
  it('rejects more departures than teams', () => {
    const small = { ...archive, teams: archive.teams.slice(0, 2) };
    const r = validateDepartures({ archive: small, league: league(2, 2), promoted: ['a', 'b'], demoted: ['a', 'b'] });
    expect(r).toEqual({ ok: false, error: 'too-few-teams' });
  });
  it('has text for every error', () => {
    for (const e of ['not-relegation', 'promoted-count', 'demoted-count', 'unknown-team', 'overlap', 'too-few-teams'] as const) {
      expect(departureErrorText(e, league(1, 2)).length).toBeGreaterThan(0);
    }
  });
});

describe('isOffseasonPlan', () => {
  const good = { seasonId: 's-1', leagueId: 'L1', promoted: ['a'], demoted: ['f'] };
  it('accepts a good document', () => {
    expect(isOffseasonPlan(good)).toBe(true);
    expect(isOffseasonPlan({ ...good, promoted: [], demoted: [] })).toBe(true);
  });
  it('rejects missing, wrong-typed and duplicate ids', () => {
    expect(isOffseasonPlan(null)).toBe(false);
    expect(isOffseasonPlan({ ...good, seasonId: '' })).toBe(false);
    expect(isOffseasonPlan({ ...good, leagueId: undefined })).toBe(false);
    expect(isOffseasonPlan({ ...good, promoted: 'a' })).toBe(false);
    expect(isOffseasonPlan({ ...good, demoted: [1] })).toBe(false);
    expect(isOffseasonPlan({ ...good, promoted: ['a'], demoted: ['a'] })).toBe(false);
    expect(isOffseasonPlan({ ...good, promoted: ['a', 'a'] })).toBe(false);
  });
});

describe('isOffseasonPlan draft pool and picks', () => {
  const base = { seasonId: 's-1', leagueId: 'L1', promoted: [], demoted: [] };
  const draftee = (id: string) => generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => `ROE${id === 'd1' ? 'A' : 'B'}`, () => id);
  const pool = [draftee('d1'), draftee('d2')];
  it('accepts a pool with picks, several for one team', () => {
    expect(isOffseasonPlan({ ...base, draftPool: pool })).toBe(true);
    expect(isOffseasonPlan({ ...base, draftPool: pool, draftPicks: [{ franchiseId: 'a', playerId: 'd1' }, { franchiseId: 'a', playerId: 'd2' }] })).toBe(true);
  });
  it('rejects bad pool entries', () => {
    expect(isOffseasonPlan({ ...base, draftPool: [{ ...pool[0], age: 25 }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: [{ ...pool[0], offense: 9 }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: [pool[0], pool[0]] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: 'x' })).toBe(false);
  });
  it('rejects bad picks', () => {
    expect(isOffseasonPlan({ ...base, draftPicks: [] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: pool, draftPicks: [{ franchiseId: 'a', playerId: 'zz' }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: pool, draftPicks: [{ franchiseId: 'a', playerId: 'd1' }, { franchiseId: 'b', playerId: 'd1' }] })).toBe(false);
    expect(isOffseasonPlan({ ...base, draftPool: pool, draftPicks: [{ franchiseId: '', playerId: 'd1' }] })).toBe(false);
  });
});

describe('isOffseasonPlan progression', () => {
  const base = { seasonId: 's-1', leagueId: 'L1', promoted: [], demoted: [] };
  const draftee = (id: string, name: string) => generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => name, () => id);
  const goalie = (id: string, name: string) => generateDraftGoalie(rngFromDice(6, 6, 4, 4, 1, 1), () => name, () => id);
  const aged = { ...draftee('p1', 'AAA'), age: 31 };
  const entry = (extra: Record<string, unknown> = {}) => ({ franchiseId: 'a', playerId: 'p1', roll: 3, ...extra });
  const ok = (progression: unknown) => isOffseasonPlan({ ...base, progression });
  it('accepts unchanged, changed and retired entries', () => {
    expect(ok([])).toBe(true);
    expect(ok([entry(), entry({ playerId: 'p2', after: aged }), entry({ playerId: 'p3', replacement: goalie('r1', 'BBB') })])).toBe(true);
  });
  it('rejects each invalid case', () => {
    expect(ok('x')).toBe(false);
    expect(ok([null])).toBe(false);
    expect(ok([entry({ roll: 0 })])).toBe(false);
    expect(ok([entry({ roll: 7 })])).toBe(false);
    expect(ok([entry({ roll: 2.5 })])).toBe(false);
    expect(ok([entry({ franchiseId: '' })])).toBe(false);
    expect(ok([entry(), entry()])).toBe(false);
    expect(ok([entry({ after: aged, replacement: draftee('r1', 'BBB') })])).toBe(false);
    expect(ok([entry({ replacement: { ...draftee('r1', 'BBB'), age: 25 } })])).toBe(false);
    expect(ok([entry({ after: { ...aged, age: 17 } })])).toBe(false);
    expect(ok([entry({ after: { ...aged, offense: 9 } })])).toBe(false);
  });
});

describe('stagedPlayerNames', () => {
  it('lists new team players, draftees and replacements', () => {
    const d = generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => 'DRAFTEE', () => 'd');
    const r = generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => 'REPLACE', () => 'r');
    const plan = { seasonId: 's', leagueId: 'L', promoted: [], demoted: [], draftPool: [d], progression: [{ franchiseId: 'a', playerId: 'x', roll: 1, replacement: r }, { franchiseId: 'a', playerId: 'y', roll: 2 }] };
    expect(stagedPlayerNames(plan)).toEqual(['DRAFTEE', 'REPLACE']);
    expect(stagedPlayerNames({ ...plan, draftPool: undefined, progression: undefined })).toEqual([]);
  });
});
