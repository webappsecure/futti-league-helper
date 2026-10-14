import { isSeason, type Season } from './season';

const season: Season = { id: 's1', leagueId: 'L1', index: 1, status: 'active' };

describe('isSeason', () => {
  it('accepts a valid season', () => {
    expect(isSeason(season)).toBe(true);
  });

  it.each([
    ['null', null],
    ['empty id', { ...season, id: '' }],
    ['missing league', { ...season, leagueId: undefined }],
    ['index 0', { ...season, index: 0 }],
    ['fractional index', { ...season, index: 1.5 }],
    ['unknown status', { ...season, status: 'done' }],
  ])('rejects %s', (_label, value) => {
    expect(isSeason(value)).toBe(false);
  });
});
