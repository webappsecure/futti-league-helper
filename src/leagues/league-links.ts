import type { FieldErrors, League } from './league';

/** The league directly above, when it exists and points back. One-sided links count as no link. */
export function leagueAbove(league: League, leagues: League[]): League | null {
  if (!league.leagueAboveId) return null;
  const other = leagues.find((l) => l.id === league.leagueAboveId);
  return other && other.leagueBelowId === league.id ? other : null;
}

/** The league directly below, when it exists and points back. */
export function leagueBelow(league: League, leagues: League[]): League | null {
  if (!league.leagueBelowId) return null;
  const other = leagues.find((l) => l.id === league.leagueBelowId);
  return other && other.leagueAboveId === league.id ? other : null;
}

/** Ids of every league connected to this one, itself included. Safe on looping data. */
export function chainLeagueIds(league: League, leagues: League[]): string[] {
  const seen = new Set<string>([league.id]);
  for (const step of [leagueAbove, leagueBelow]) {
    let current: League | null = step(league, leagues);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      current = step(current, leagues);
    }
  }
  return [...seen];
}

/** Why `upper` cannot be linked directly above `lower`, or null when it can. */
export function linkProblem(upper: League, lower: League, leagues: League[]): string | null {
  if (upper.id === lower.id) return 'A league cannot be linked to itself.';
  if (!upper.relegation || !lower.relegation) return 'Both leagues need promotion and relegation turned on.';
  if (upper.namingStyle !== lower.namingStyle) return 'The leagues show team names differently.';
  if (upper.demotedCount !== lower.promotedCount) {
    return `${upper.name} demotes ${upper.demotedCount} but ${lower.name} promotes ${lower.promotedCount}.`;
  }
  if (leagueBelow(upper, leagues)) return `${upper.name} already has a league below.`;
  if (leagueAbove(lower, leagues)) return `${lower.name} already has a league above.`;
  if (chainLeagueIds(upper, leagues).includes(lower.id)) return 'These leagues are already in the same chain.';
  return null;
}

const UNLINK_FIRST = 'Unlink this league first to change this.';

/** Field errors for an edited league whose current neighbors are `above` and `below`. */
export function linkedEditProblems(updated: League, above: League | null, below: League | null): FieldErrors {
  const fields: FieldErrors = {};
  if (!above && !below) return fields;
  for (const other of [above, below]) {
    if (other && other.namingStyle !== updated.namingStyle) fields.namingStyle = UNLINK_FIRST;
  }
  if (!updated.relegation) {
    fields.counts = 'Promotion and relegation must stay on while linked. Unlink this league first.';
    return fields;
  }
  if (above && above.demotedCount !== updated.promotedCount) fields.promotedCount = `${above.name} demotes ${above.demotedCount}. ${UNLINK_FIRST}`;
  if (below && below.promotedCount !== updated.demotedCount) fields.demotedCount = `${below.name} promotes ${below.promotedCount}. ${UNLINK_FIRST}`;
  return fields;
}
