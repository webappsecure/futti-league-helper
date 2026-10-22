import { rollDie, type Rng } from '@/rules/dice';
import { addGoaltending, isGoaltendingRetired } from '@/rules/goaltending';
import { controlStars, splitTotal } from '@/rules/player-generation';
import type { GoalieRosterPlayer, RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';
import { pickedBy } from './free-agency';
import type { OffseasonPlan, StagedProgression } from './offseason-plan';
import { AGING_YEARS, type ParticipatingTeam } from './roster-changes';

const MAX_TOTAL = 8;
const MAX_GOALTENDING = 46;

/** The players of a team that progress: those kept after retirement and release, plus its free agency picks. Rookies and new-team players are not included. */
export function progressionPlayers(team: ParticipatingTeam, teams: readonly ParticipatingTeam[], plan: OffseasonPlan): RosterPlayer[] {
  const change = (plan.teamChanges ?? []).find((c) => c.franchiseId === team.franchiseId);
  const kept = team.players.filter((p) => p.id !== change?.retiredId && p.id !== change?.releasedId);
  return [...kept, ...pickedBy(team.franchiseId, teams, plan.freeAgentPicks ?? [])];
}

/** Change to the offense and defense total for a d6, by age after this offseason's aging. */
function totalChange(age: number, roll: number): number {
  if (age <= 23) return roll <= 2 ? 1 : 0;
  if (age < 30) return roll === 1 ? 1 : roll === 6 ? -1 : 0;
  return roll >= 5 ? -1 : 0;
}

/** Steps added to a goaltending rating for a d6, by age after this offseason's aging. */
function goaltendingSteps(age: number, roll: number): number {
  if (age <= 23) return roll === 1 ? 2 : roll <= 3 ? 1 : 0;
  if (age < 30) return roll <= 2 ? 1 : roll >= 5 ? -1 : 0;
  return roll === 6 ? -2 : roll >= 4 ? -1 : 0;
}

export interface ProgressResult<T extends RosterPlayer> {
  /** The player with changed ratings; absent when nothing changed or the player retires. */
  after?: T;
  retired: boolean;
}

/**
 * Progression for a position player. A changed total is split again with the split chart (offense and defense swap
 * when that reverses which side was higher), and control stars are rerolled. A total of 1 retires the player.
 */
export function progressStandard(player: StandardRosterPlayer, roll: number, rng: Rng): ProgressResult<StandardRosterPlayer> {
  const total = player.offense + player.defense;
  const next = Math.min(MAX_TOTAL, total + totalChange(player.age + AGING_YEARS, roll));
  if (next === total) return { retired: false };
  if (next <= 1) return { retired: true };
  const split = splitTotal(next, rng);
  let { offense, defense } = split;
  if ((player.offense > player.defense && defense > offense) || (player.defense > player.offense && offense > defense)) [offense, defense] = [defense, offense];
  const stars = controlStars(next, rng);
  return {
    retired: false,
    after: { ...player, offense, defense, controlStars: stars.value, rolls: { ...player.rolls, split: split.roll, stars: stars.roll ?? player.rolls.stars } },
  };
}

/** Progression for a goaltender; a rating at or below 26 retires. */
export function progressGoalie(player: GoalieRosterPlayer, roll: number): ProgressResult<GoalieRosterPlayer> {
  const steps = goaltendingSteps(player.age + AGING_YEARS, roll);
  if (steps === 0) return { retired: false };
  const goaltending = addGoaltending(player.goaltending, steps, { max: MAX_GOALTENDING });
  if (isGoaltendingRetired(goaltending)) return { retired: true };
  if (goaltending === player.goaltending) return { retired: false };
  return { retired: false, after: { ...player, goaltending } };
}

/**
 * Rolls progression for every progressing player, teams in order and players in roster order, then builds a replacement
 * for each retiree after all rolls. `makeStandard` and `makeGoalie` create the replacements.
 */
export function buildProgression(
  teams: readonly ParticipatingTeam[],
  plan: OffseasonPlan,
  rng: Rng,
  makeStandard: () => StandardRosterPlayer,
  makeGoalie: () => GoalieRosterPlayer,
): StagedProgression[] {
  const results: StagedProgression[] = [];
  const retirees: { entry: StagedProgression; kind: RosterPlayer['kind'] }[] = [];
  for (const team of teams) {
    for (const player of progressionPlayers(team, teams, plan)) {
      const roll = rollDie(rng);
      const result = player.kind === 'goalie' ? progressGoalie(player, roll) : progressStandard(player, roll, rng);
      const entry: StagedProgression = { franchiseId: team.franchiseId, playerId: player.id, roll, ...(result.after ? { after: result.after } : {}) };
      results.push(entry);
      if (result.retired) retirees.push({ entry, kind: player.kind });
    }
  }
  for (const { entry, kind } of retirees) entry.replacement = kind === 'goalie' ? makeGoalie() : makeStandard();
  return results;
}
