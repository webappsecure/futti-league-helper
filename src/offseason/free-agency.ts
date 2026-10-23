import type { RosterPlayer } from '@/rosters/roster';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { OffseasonPlan, StagedFreeAgentPick, StagedTeamChange } from './offseason-plan';
import { replacementMovement } from './rating-adjust';
import type { ParticipatingTeam } from './roster-changes';

export const MAX_STANDARD = 6;
export const MAX_GOALIES = 2;

/**
 * Pick order: demoted arrivals (then former teams replacing a promoted team), the staying teams, then promoted arrivals (then former teams replacing a demoted team). Staying teams go by
 * their finish this season and arrivals by their finish in their own league, best first.
 */
export function draftOrder(archive: SeasonArchive, plan: OffseasonPlan, sourceArchives: readonly SeasonArchive[]): string[] {
  const leaving = new Set([...plan.promoted, ...plan.demoted]);
  const staying = [...archive.teams]
    .filter((t) => !leaving.has(t.franchiseId))
    .sort((a, b) => a.position - b.position)
    .map((t) => t.franchiseId);
  const arrivals = plan.arrivals ?? [];
  const positionOf = (a: { franchiseId: string; sourceSeasonId: string }) =>
    sourceArchives.find((s) => s.seasonId === a.sourceSeasonId)?.teams.find((t) => t.franchiseId === a.franchiseId)?.position ?? Number.MAX_SAFE_INTEGER;
  const group = (movement: 'promoted' | 'demoted') => [
    ...arrivals
      .filter((a) => a.movement === movement)
      .sort((a, b) => positionOf(a) - positionOf(b))
      .map((a) => a.franchiseId),
    // A former team fills the place of a departed team like a team from a linked league does, so it goes with the arrivals that move the same way, after them.
    ...(plan.formerTeams ?? []).filter((f) => replacementMovement(f.vacancy) === movement).map((f) => f.franchiseId),
  ];
  return [...group('demoted'), ...staying, ...group('promoted')];
}

export interface PoolEntry {
  player: RosterPlayer;
  fromFranchiseId: string;
}

/** Released players not yet picked, in team order. Empty until aging has run. */
export function freeAgentPool(teams: readonly ParticipatingTeam[], changes: readonly StagedTeamChange[], picks: readonly StagedFreeAgentPick[]): PoolEntry[] {
  const taken = new Set(picks.map((p) => p.playerId));
  return teams.flatMap((team) => {
    const releasedId = changes.find((c) => c.franchiseId === team.franchiseId)?.releasedId;
    const player = team.players.find((p) => p.id === releasedId);
    return player !== undefined && !taken.has(player.id) ? [{ player, fromFranchiseId: team.franchiseId }] : [];
  });
}

/** The first team without a pick, or null when every team has picked. */
export function teamOnTheClock(order: readonly string[], picks: readonly StagedFreeAgentPick[]): string | null {
  const done = new Set(picks.map((p) => p.franchiseId));
  return order.find((id) => !done.has(id)) ?? null;
}

export type PickError = 'aging-not-run' | 'draft-complete' | 'not-on-the-clock' | 'not-in-pool';
export type PickValidation = { ok: true } | { ok: false; error: PickError };

export function validatePick(
  state: { order: readonly string[]; teams: readonly ParticipatingTeam[]; changes: readonly StagedTeamChange[]; picks: readonly StagedFreeAgentPick[] },
  franchiseId: string,
  playerId: string,
): PickValidation {
  const { order, teams, changes, picks } = state;
  const bad = (error: PickError): PickValidation => ({ ok: false, error });
  const aged = teams.length > 0 && teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId && c.releasedId !== undefined));
  if (!aged) return bad('aging-not-run');
  if (teamOnTheClock(order, picks) === null) return bad('draft-complete');
  if (teamOnTheClock(order, picks) !== franchiseId) return bad('not-on-the-clock');
  if (!freeAgentPool(teams, changes, picks).some((e) => e.player.id === playerId)) return bad('not-in-pool');
  return { ok: true };
}

export interface RosterCounts {
  standard: number;
  goalies: number;
}

/** Players on a team after retirement, release and the picks it made. */
export function rosterCounts(team: ParticipatingTeam, change: StagedTeamChange | undefined, picked: readonly RosterPlayer[]): RosterCounts {
  const kept = team.players.filter((p) => p.id !== change?.retiredId && p.id !== change?.releasedId);
  const all = [...kept, ...picked];
  return { standard: all.filter((p) => p.kind === 'standard').length, goalies: all.filter((p) => p.kind === 'goalie').length };
}

/** How many position players and goaltenders a team still needs to reach a full roster of 6 and 2. */
export function rosterNeeds(counts: RosterCounts): RosterCounts {
  return { standard: Math.max(0, MAX_STANDARD - counts.standard), goalies: Math.max(0, MAX_GOALIES - counts.goalies) };
}

/** For example "1 position player and 1 goaltender", or "nothing" for a full roster. */
export function needsText(needs: RosterCounts): string {
  const parts = [
    needs.standard > 0 ? `${needs.standard} position ${needs.standard === 1 ? 'player' : 'players'}` : null,
    needs.goalies > 0 ? `${needs.goalies} ${needs.goalies === 1 ? 'goaltender' : 'goaltenders'}` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'nothing' : parts.join(' and ');
}

export const overLimit = (counts: RosterCounts): boolean => counts.standard > MAX_STANDARD || counts.goalies > MAX_GOALIES;

/** The players a team picked, found among every team's roster. */
export function pickedBy(franchiseId: string, teams: readonly ParticipatingTeam[], picks: readonly StagedFreeAgentPick[]): RosterPlayer[] {
  const all = teams.flatMap((t) => t.players);
  return picks.filter((p) => p.franchiseId === franchiseId).flatMap((p) => all.filter((x) => x.id === p.playerId));
}
