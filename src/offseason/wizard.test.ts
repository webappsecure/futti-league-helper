import type { RosterPlayer } from '@/rosters/roster';
import type { OffseasonPlan } from './offseason-plan';
import type { ParticipatingTeam } from './roster-changes';
import { canOpenStep, firstIncompleteStep, isWizardStep, nextBlocked, nextStep, previousStep, stepStatuses, WIZARD_STEPS, type WizardInput } from './wizard';

const team = (id: string): ParticipatingTeam => ({ franchiseId: id, origin: 'staying', players: [] as RosterPlayer[] });
const quiet: WizardInput['arrivals'] = { expected: [], staged: null, current: false, blocked: [] };
const exp = [{ franchiseId: 'x', fromLeagueId: 'M', sourceSeasonId: 's', movement: 'promoted' as const }];
const plan = (extra: Partial<OffseasonPlan> = {}): OffseasonPlan => ({ seasonId: 's', leagueId: 'L', promoted: [], demoted: [], ...extra });
const input = (p: OffseasonPlan | null, arrivals: WizardInput['arrivals'] = quiet, teams = [team('a'), team('b')]): WizardInput => ({ plan: p, teams, arrivals });

describe('steps', () => {
  it('lists the steps in order and recognizes their ids', () => {
    expect([...WIZARD_STEPS]).toEqual(['order', 'departures', 'arrivals', 'new-teams', 'protection', 'aging', 'free-agency', 'rookie-draft', 'progression']);
    expect(isWizardStep('aging')).toBe(true);
    expect(isWizardStep('nope')).toBe(false);
    expect(isWizardStep(undefined)).toBe(false);
  });
  it('has previous and next at both ends', () => {
    expect(previousStep('order')).toBeNull();
    expect(nextStep('free-agency')).toBe('rookie-draft');
    expect(nextStep('rookie-draft')).toBe('progression');
    expect(nextStep('progression')).toBeNull();
    expect(previousStep('arrivals')).toBe('departures');
    expect(nextStep('arrivals')).toBe('new-teams');
  });
});

describe('stepStatuses', () => {
  it('has only the order complete with no plan', () => {
    expect(stepStatuses(input(null))).toEqual({ order: 'complete', departures: 'incomplete', arrivals: 'incomplete', 'new-teams': 'incomplete', protection: 'incomplete', aging: 'incomplete', 'free-agency': 'incomplete', 'rookie-draft': 'incomplete', progression: 'incomplete' });
  });
  it('completes departures, arrivals and new teams for a plan with nothing expected', () => {
    const s = stepStatuses(input(plan()));
    expect([s.departures, s.arrivals, s['new-teams'], s.protection]).toEqual(['complete', 'complete', 'complete', 'incomplete']);
  });
  it('handles arrivals expected, stale, current and blocked', () => {
    expect(stepStatuses(input(plan(), { ...quiet, expected: exp })).arrivals).toBe('incomplete');
    expect(stepStatuses(input(plan(), { expected: exp, staged: [], current: false, blocked: [] })).arrivals).toBe('incomplete');
    expect(stepStatuses(input(plan(), { expected: exp, staged: [], current: true, blocked: [] })).arrivals).toBe('complete');
    expect(stepStatuses(input(plan(), { ...quiet, blocked: [{ leagueId: 'M', leagueName: 'M', direction: 'above', reason: 'no-plan' }] })).arrivals).toBe('incomplete');
  });
  it('tracks partial and full protection and aging results', () => {
    const partial = plan({ teamChanges: [{ franchiseId: 'a', protectedId: 'p' }] });
    expect(stepStatuses(input(partial)).protection).toBe('incomplete');
    const full = plan({ teamChanges: [{ franchiseId: 'a', protectedId: 'p' }, { franchiseId: 'b', protectedId: 'p' }] });
    const s = stepStatuses(input(full));
    expect([s.protection, s.aging]).toEqual(['complete', 'incomplete']);
    const aged = plan({ teamChanges: [{ franchiseId: 'a', protectedId: 'p', retiredId: 'r', releasedId: 'q' }, { franchiseId: 'b', protectedId: 'p', retiredId: 'r', releasedId: 'q' }] });
    expect(stepStatuses(input(aged)).aging).toBe('complete');
    expect(stepStatuses(input(aged))['free-agency']).toBe('incomplete');
    const partialPicks = { ...aged, freeAgentPicks: [{ franchiseId: 'a', playerId: 'q' }] };
    expect(stepStatuses(input(partialPicks))['free-agency']).toBe('incomplete');
    const allPicks = { ...aged, freeAgentPicks: [{ franchiseId: 'a', playerId: 'q' }, { franchiseId: 'b', playerId: 'r' }] };
    expect(stepStatuses(input(allPicks))['free-agency']).toBe('complete');
    expect(stepStatuses(input(plan({ freeAgentPicks: allPicks.freeAgentPicks })))['free-agency']).toBe('incomplete');
  });
  it('completes the rookie draft only with a pool and every team full', () => {
    const changes = ['a', 'b'].map((franchiseId) => ({ franchiseId, protectedId: 'p', retiredId: 'r', releasedId: 'q' }));
    const picks = [{ franchiseId: 'a', playerId: 'q' }, { franchiseId: 'b', playerId: 'r' }];
    // The changes name players who are not on these rosters, so each team keeps exactly the players it was given.
    const withPlayers = (id: string, standard: number): ParticipatingTeam => ({
      franchiseId: id,
      origin: 'staying',
      players: [...Array.from({ length: standard }, (_, i) => ({ id: `${id}s${i}`, kind: 'standard' })), { id: `${id}g1`, kind: 'goalie' }, { id: `${id}g2`, kind: 'goalie' }] as RosterPlayer[],
    });
    const base = plan({ teamChanges: changes, freeAgentPicks: picks });
    const full = [withPlayers('a', 6), withPlayers('b', 6)];
    const short = [withPlayers('a', 6), withPlayers('b', 5)];
    expect(stepStatuses(input(base, quiet, full))['rookie-draft']).toBe('incomplete');
    expect(stepStatuses(input({ ...base, draftPool: [] }, quiet, full))['rookie-draft']).toBe('complete');
    expect(stepStatuses(input({ ...base, draftPool: [] }, quiet, short))['rookie-draft']).toBe('incomplete');
    expect(stepStatuses(input({ ...base, freeAgentPicks: [], draftPool: [] }, quiet, full))['rookie-draft']).toBe('incomplete');
    // Progression also needs its results.
    expect(stepStatuses(input({ ...base, draftPool: [] }, quiet, full)).progression).toBe('incomplete');
    expect(stepStatuses(input({ ...base, draftPool: [], progression: [] }, quiet, full)).progression).toBe('complete');
    expect(stepStatuses(input({ ...base, draftPool: [], progression: [] }, quiet, short)).progression).toBe('incomplete');
  });
  it('completes the team steps when a plan is saved and no team takes part', () => {
    const s = stepStatuses(input(plan(), quiet, []));
    expect([s.protection, s.aging, s['free-agency'], s['rookie-draft'], s.progression]).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
  });
  it('keeps the team steps incomplete without a plan', () => {
    const s = stepStatuses(input(null, quiet, []));
    expect([s.protection, s.aging, s['free-agency'], s['rookie-draft'], s.progression]).toEqual(['incomplete', 'incomplete', 'incomplete', 'incomplete', 'incomplete']);
  });
});

describe('navigation rules', () => {
  const state = (p: OffseasonPlan | null, arrivals = quiet) => stepStatuses(input(p, arrivals));
  it('finds the first incomplete blocking step', () => {
    expect(firstIncompleteStep(state(null))).toBe('departures');
    expect(firstIncompleteStep(state(plan(), { ...quiet, expected: exp }))).toBe('arrivals');
    expect(firstIncompleteStep(state(plan()))).toBe('protection');
    const aged = plan({ teamChanges: ['a', 'b'].map((franchiseId) => ({ franchiseId, protectedId: 'p', retiredId: 'r', releasedId: 'q' })) });
    expect(firstIncompleteStep(state(aged))).toBe('free-agency');
    expect(firstIncompleteStep(state({ ...aged, freeAgentPicks: [{ franchiseId: 'a', playerId: 'q' }, { franchiseId: 'b', playerId: 'r' }] }))).toBe('rookie-draft');
  });
  it('opens earlier and current steps but not later ones', () => {
    const s = state(null);
    expect(canOpenStep('order', s)).toBe(true);
    expect(canOpenStep('departures', s)).toBe(true);
    expect(canOpenStep('arrivals', s)).toBe(false);
    expect(canOpenStep('aging', s)).toBe(false);
    const withPlan = state(plan());
    expect(canOpenStep('new-teams', withPlan)).toBe(true);
    expect(canOpenStep('protection', withPlan)).toBe(true);
    expect(canOpenStep('aging', withPlan)).toBe(false);
    expect(canOpenStep('free-agency', withPlan)).toBe(false);
  });
  it('never blocks Next on the order or new-teams step', () => {
    const s = state(null);
    expect(nextBlocked('order', s)).toBe(false);
    expect(nextBlocked('new-teams', s)).toBe(false);
    expect(nextBlocked('departures', s)).toBe(true);
    expect(nextBlocked('departures', state(plan()))).toBe(false);
  });
});
