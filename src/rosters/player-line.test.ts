import type { GoalieRosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import { acceptErrorText } from '@/seasons/accept-league';
import { playerLine } from '@/rosters/player-line';

const standard: StandardRosterPlayer = {
  id: 'p1',
  kind: 'standard',
  name: 'SMITH',
  age: 24,
  offense: 4,
  defense: 3,
  sportsmanship: 2,
  controlStars: 2,
  rolls: { age: 6, total: 7, split: 3, stars: 9, sportsmanship: 6 },
};
const goalie: GoalieRosterPlayer = {
  id: 'g1',
  kind: 'goalie',
  name: 'JONES',
  age: 27,
  goaltending: 41,
  sportsmanship: 3,
  rolls: { age: 9, goaltending: 7, sportsmanship: 7 },
};

describe('playerLine', () => {
  it('summarizes a standard player with stars and a spoken variant', () => {
    expect(playerLine(standard)).toEqual({
      label: 'SMITH',
      details: 'Age 24 · OF 4 · DE 3 · SP 2 · CO ★★',
      spoken: 'Age 24 · OF 4 · DE 3 · SP 2 · 2 control stars',
    });
  });

  it('shows a dash for no control stars', () => {
    expect(playerLine({ ...standard, controlStars: 0 }).details).toBe('Age 24 · OF 4 · DE 3 · SP 2 · CO -');
  });

  it('marks goalies and has no separate spoken text', () => {
    expect(playerLine(goalie)).toEqual({ label: 'JONES (G)', details: 'Age 27 · GO 41 · SP 3' });
  });
});

describe('acceptErrorText', () => {
  it('words each accept failure', () => {
    expect(acceptErrorText({ kind: 'already-accepted' })).toMatch(/already been accepted/);
    expect(acceptErrorText({ kind: 'incomplete', teams: 5, size: 6 })).toBe(
      'This league has 5 of 6 teams. Add the rest before accepting.',
    );
    expect(acceptErrorText({ kind: 'missing-rosters', count: 1 })).toMatch(/^1 team has no roster/);
    expect(acceptErrorText({ kind: 'missing-rosters', count: 3 })).toMatch(/^3 teams have no roster/);
    expect(acceptErrorText({ kind: 'unreadable' })).toMatch(/could not be read/);
    expect(acceptErrorText({ kind: 'storage', error: new Error('disk full') })).toBe('disk full');
  });
});
