import { teamControls, type TeamControlInputs } from './team-controls';

const base: TeamControlInputs = {
  accepted: false,
  seasonKnown: true,
  teamsReady: true,
  rostersReady: true,
  busy: false,
  teamCount: 4,
  size: 6,
  rosterCount: 4,
  missingRosters: 0,
};

describe('teamControls', () => {
  it('enables what applies to a ready, unaccepted league', () => {
    expect(teamControls(base)).toEqual({
      showActions: true,
      addEnabled: true,
      full: false,
      generateEnabled: false,
      rerollAllEnabled: true,
      reviewEnabled: true,
    });
  });

  it('enables generate only while a team has no roster', () => {
    expect(teamControls({ ...base, missingRosters: 2 }).generateEnabled).toBe(true);
  });

  it('disables add when the league is full', () => {
    const c = teamControls({ ...base, teamCount: 6 });
    expect(c.full).toBe(true);
    expect(c.addEnabled).toBe(false);
  });

  it('enables nothing until the season is known', () => {
    const c = teamControls({ ...base, seasonKnown: false, missingRosters: 1 });
    expect([c.addEnabled, c.generateEnabled, c.rerollAllEnabled, c.reviewEnabled]).toEqual([false, false, false, false]);
  });

  it('disables roster actions while busy or before rosters load', () => {
    for (const patch of [{ busy: true }, { rostersReady: false }]) {
      const c = teamControls({ ...base, missingRosters: 1, ...patch });
      expect([c.generateEnabled, c.rerollAllEnabled, c.reviewEnabled]).toEqual([false, false, false]);
    }
  });

  it('disables add before teams load, and review and reroll with nothing to act on', () => {
    expect(teamControls({ ...base, teamsReady: false }).addEnabled).toBe(false);
    const empty = teamControls({ ...base, teamCount: 0, rosterCount: 0 });
    expect([empty.rerollAllEnabled, empty.reviewEnabled]).toEqual([false, false]);
  });

  it('hides actions once accepted', () => {
    expect(teamControls({ ...base, accepted: true }).showActions).toBe(false);
  });
});
