import type { RosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { OffseasonPlan } from './offseason-plan';
import { draftOrder, pickedBy, rosterCounts, rosterNeeds, type RosterCounts } from './free-agency';
import type { ParticipatingTeam } from './roster-changes';

/** Extra draftees on top of the total need. */
export const EXTRA_STANDARD = 2;
export const EXTRA_GOALIES = 1;

/** What a team still needs after retirement, release, its free agency picks and its rookie picks. */
export function teamNeeds(team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): RosterCounts {
  const change = (plan.teamChanges ?? []).find((c) => c.franchiseId === team.franchiseId);
  const rookies = rookiesPickedBy(team.franchiseId, plan);
  return rosterNeeds(rosterCounts(team, change, [...pickedBy(team.franchiseId, teams, plan.freeAgentPicks ?? []), ...rookies]));
}

/** The draftees a team has taken so far. */
export function rookiesPickedBy(franchiseId: string, plan: OffseasonPlan): RosterPlayer[] {
  const pool = plan.draftPool ?? [];
  return (plan.draftPicks ?? []).filter((p) => p.franchiseId === franchiseId).flatMap((p) => pool.filter((x) => x.id === p.playerId));
}

/** Pool size for the total need: two extra position players and one extra goaltender. */
export function poolSize(needs: readonly RosterCounts[]): RosterCounts {
  return {
    standard: needs.reduce((sum, n) => sum + n.standard, 0) + EXTRA_STANDARD,
    goalies: needs.reduce((sum, n) => sum + n.goalies, 0) + EXTRA_GOALIES,
  };
}

/** True once aging has run and every participating team has made its free agency pick. */
export function freeAgencyComplete(teams: readonly ParticipatingTeam[], plan: OffseasonPlan): boolean {
  const changes = plan.teamChanges ?? [];
  const picks = plan.freeAgentPicks ?? [];
  return (
    teams.length > 0 &&
    teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId && c.releasedId !== undefined) && picks.some((p) => p.franchiseId === t.franchiseId))
  );
}

/** The reverse of the free agency order: promoted arrivals first, demoted arrivals last. */
export function rookieDraftOrder(archive: SeasonArchive, plan: OffseasonPlan, sourceArchives: readonly SeasonArchive[]): string[] {
  return draftOrder(archive, plan, sourceArchives).reverse();
}

/** Draftees not yet picked, in pool order. */
export function rookiePool(plan: OffseasonPlan): RosterPlayer[] {
  const taken = new Set((plan.draftPicks ?? []).map((p) => p.playerId));
  return (plan.draftPool ?? []).filter((p) => !taken.has(p.id));
}

const total = (n: RosterCounts) => n.standard + n.goalies;

/** True when every participating team has a full roster. */
export const draftIsComplete = (teams: readonly ParticipatingTeam[], plan: OffseasonPlan): boolean => teams.every((t) => total(teamNeeds(t, teams, plan)) === 0);

/**
 * Teams pick in rounds: among teams that still need someone, the one with the fewest rookie picks goes next,
 * the first in draft order on a tie. Null when every team is full.
 */
export function rookieOnTheClock(order: readonly string[], teams: readonly ParticipatingTeam[], plan: OffseasonPlan): string | null {
  const picks = plan.draftPicks ?? [];
  const open = order.filter((id) => {
    const team = teams.find((t) => t.franchiseId === id);
    return team !== undefined && total(teamNeeds(team, teams, plan)) > 0;
  });
  if (open.length === 0) return null;
  const made = (id: string) => picks.filter((p) => p.franchiseId === id).length;
  const fewest = Math.min(...open.map(made));
  return open.find((id) => made(id) === fewest) ?? null;
}

export type RookiePickError = 'free-agency-incomplete' | 'pool-not-generated' | 'draft-complete' | 'not-on-the-clock' | 'not-in-pool' | 'kind-not-needed';
export type RookiePickValidation = { ok: true } | { ok: false; error: RookiePickError };

export function validateRookiePick(
  state: { order: readonly string[]; teams: readonly ParticipatingTeam[]; plan: OffseasonPlan },
  franchiseId: string,
  playerId: string,
): RookiePickValidation {
  const { order, teams, plan } = state;
  const bad = (error: RookiePickError): RookiePickValidation => ({ ok: false, error });
  if (!freeAgencyComplete(teams, plan)) return bad('free-agency-incomplete');
  if (plan.draftPool === undefined) return bad('pool-not-generated');
  const clock = rookieOnTheClock(order, teams, plan);
  if (clock === null) return bad('draft-complete');
  if (clock !== franchiseId) return bad('not-on-the-clock');
  const player = rookiePool(plan).find((p) => p.id === playerId);
  if (player === undefined) return bad('not-in-pool');
  const needs = teamNeeds(teams.find((t) => t.franchiseId === franchiseId)!, teams, plan);
  if ((player.kind === 'goalie' ? needs.goalies : needs.standard) === 0) return bad('kind-not-needed');
  return { ok: true };
}
