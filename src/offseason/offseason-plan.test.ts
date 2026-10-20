import type { League } from '@/leagues/league';
import type { SeasonArchive } from '@/seasons/season-archive';
import { departureErrorText, isOffseasonPlan, suggestDepartures, validateDepartures } from './offseason-plan';

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
