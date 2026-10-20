import type { League } from '@/leagues/league';
import type { SeasonArchive } from '@/seasons/season-archive';

export const OFFSEASON_PLAN_COLLECTION = 'offseason-plans';

/** The teams leaving the league this offseason, by franchise id. One document per season; its id is the season id. */
export interface OffseasonPlan {
  seasonId: string;
  leagueId: string;
  promoted: string[];
  demoted: string[];
}

export type DepartureError =
  | 'not-relegation'
  | 'promoted-count'
  | 'demoted-count'
  | 'unknown-team'
  | 'overlap'
  | 'too-few-teams';

export type DepartureValidation = { ok: true } | { ok: false; error: DepartureError };

/** The best `promotedCount` finishers go up and the worst `demotedCount` go down. */
export function suggestDepartures(archive: SeasonArchive, league: League): { promoted: string[]; demoted: string[] } {
  const ids = [...archive.teams].sort((a, b) => a.position - b.position).map((t) => t.franchiseId);
  const promoted = ids.slice(0, league.promotedCount);
  const demoted = league.demotedCount === 0 ? [] : ids.slice(-league.demotedCount);
  return { promoted, demoted };
}

export function validateDepartures(input: {
  archive: SeasonArchive;
  league: League;
  promoted: string[];
  demoted: string[];
}): DepartureValidation {
  const { archive, league, promoted, demoted } = input;
  const bad = (error: DepartureError): DepartureValidation => ({ ok: false, error });
  if (!league.relegation) return bad('not-relegation');
  if (promoted.length !== league.promotedCount) return bad('promoted-count');
  if (demoted.length !== league.demotedCount) return bad('demoted-count');
  if (promoted.length + demoted.length > archive.teams.length) return bad('too-few-teams');
  const known = new Set(archive.teams.map((t) => t.franchiseId));
  const all = [...promoted, ...demoted];
  if (!all.every((id) => known.has(id))) return bad('unknown-team');
  if (new Set(all).size !== all.length) return bad('overlap');
  return { ok: true };
}

export function departureErrorText(error: DepartureError, league: League): string {
  switch (error) {
    case 'not-relegation':
      return 'This league does not use promotion and relegation.';
    case 'promoted-count':
      return `Choose exactly ${league.promotedCount} promoted ${league.promotedCount === 1 ? 'team' : 'teams'}.`;
    case 'demoted-count':
      return `Choose exactly ${league.demotedCount} demoted ${league.demotedCount === 1 ? 'team' : 'teams'}.`;
    case 'unknown-team':
      return 'A chosen team is not in this season.';
    case 'overlap':
      return 'A team cannot be both promoted and demoted.';
    case 'too-few-teams':
      return 'This league does not have enough teams for that many promotions and demotions.';
  }
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length > 0);
}

export function isOffseasonPlan(value: unknown): value is OffseasonPlan {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.seasonId !== 'string' || v.seasonId.length === 0) return false;
  if (typeof v.leagueId !== 'string' || v.leagueId.length === 0) return false;
  if (!isIdList(v.promoted) || !isIdList(v.demoted)) return false;
  const all = [...v.promoted, ...v.demoted];
  return new Set(all).size === all.length;
}
