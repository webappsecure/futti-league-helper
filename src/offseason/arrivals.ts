import type { League } from '@/leagues/league';
import type { Rng } from '@/rules/dice';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { OffseasonPlan, StagedArrival } from './offseason-plan';
import { adjustRoster } from './rating-adjust';

/** A linked league next to this one, with its saved season results and plan (either may be missing). */
export interface ArrivalSource {
  league: League;
  direction: 'above' | 'below';
  archive: SeasonArchive | null;
  plan: OffseasonPlan | null;
}

export type ExpectedArrival = Pick<StagedArrival, 'franchiseId' | 'fromLeagueId' | 'sourceSeasonId' | 'movement'>;

/** The teams the linked leagues' plans send here: demoted ones from above, promoted ones from below. */
export function expectedArrivals(sources: readonly ArrivalSource[]): ExpectedArrival[] {
  return sources.flatMap(({ league, direction, plan }) => {
    if (plan === null) return [];
    const ids = direction === 'above' ? plan.demoted : plan.promoted;
    const movement = direction === 'above' ? 'demoted' : 'promoted';
    return ids.map((franchiseId): ExpectedArrival => ({ franchiseId, fromLeagueId: league.id, sourceSeasonId: plan.seasonId, movement }));
  });
}

export type BuildArrivalsResult = { ok: true; value: StagedArrival[] } | { ok: false; franchiseId: string };

/** Copies each expected team's season-end roster and adjusts it for its move; the archives are left unchanged. */
export function buildArrivals(expected: readonly ExpectedArrival[], sources: readonly ArrivalSource[], rng: Rng): BuildArrivalsResult {
  const value: StagedArrival[] = [];
  for (const arrival of expected) {
    const archive = sources.find((s) => s.league.id === arrival.fromLeagueId)?.archive;
    const team = archive?.teams.find((t) => t.franchiseId === arrival.franchiseId);
    if (team === undefined) return { ok: false, franchiseId: arrival.franchiseId };
    value.push({ ...arrival, players: adjustRoster(team.players, arrival.movement, rng) });
  }
  return { ok: true, value };
}

const keyOf = (a: ExpectedArrival) => [a.franchiseId, a.fromLeagueId, a.sourceSeasonId, a.movement].join('|');

/** True when the staged teams are exactly the ones the linked leagues' plans currently send, in any order. */
export function arrivalsAreCurrent(staged: readonly ExpectedArrival[], expected: readonly ExpectedArrival[]): boolean {
  if (staged.length !== expected.length) return false;
  const want = new Set(expected.map(keyOf));
  return want.size === expected.length && staged.every((a) => want.has(keyOf(a)));
}
