import type { Grade } from '@/rules/charts';
import type { Rng } from '@/rules/dice';
import { addGoaltending } from '@/rules/goaltending';
import { controlStars } from '@/rules/player-generation';
import type { RosterPlayer, StandardRosterPlayer } from '@/rosters/roster';

/** The way a team moves between leagues: `promoted` goes up to stronger play, `demoted` down to weaker play. */
export type Movement = 'promoted' | 'demoted';

const MAX_SIDE = 5;
const MAX_TOTAL = 8;
const GOALIE_STEPS = 2;

/** One point less offense and defense (each at least 1), then control stars rerolled from the new total. */
function lower(player: StandardRosterPlayer, rng: Rng): StandardRosterPlayer {
  return withNewStars({ ...player, offense: Math.max(1, player.offense - 1), defense: Math.max(1, player.defense - 1) }, rng);
}

/** One point more offense and defense, capped at 5 each and 8 in all; when both cannot rise only the lower one does. */
function raise(player: StandardRosterPlayer, rng: Rng): StandardRosterPlayer {
  const { offense, defense } = player;
  let next = { offense: Math.min(MAX_SIDE, offense + 1), defense: Math.min(MAX_SIDE, defense + 1) };
  if (next.offense + next.defense > MAX_TOTAL) {
    next = { offense, defense };
    const lowerSide = offense <= defense ? 'offense' : 'defense';
    const risen = Math.min(MAX_SIDE, next[lowerSide] + 1);
    if (offense + defense - next[lowerSide] + risen <= MAX_TOTAL) next[lowerSide] = risen;
  }
  return withNewStars({ ...player, ...next }, rng);
}

function withNewStars(player: StandardRosterPlayer, rng: Rng): StandardRosterPlayer {
  const stars = controlStars(player.offense + player.defense, rng);
  return { ...player, controlStars: stars.value, rolls: { ...player.rolls, stars: stars.roll ?? player.rolls.stars } };
}

/** Rating changes for a team that moves leagues; returns new players in the same order and leaves `players` alone. */
export function adjustRoster(players: readonly RosterPlayer[], movement: Movement, rng: Rng): RosterPlayer[] {
  return players.map((player): RosterPlayer => {
    if (player.kind === 'goalie') {
      const goaltending =
        movement === 'promoted'
          ? addGoaltending(player.goaltending, -GOALIE_STEPS, { min: 31 })
          : addGoaltending(player.goaltending, GOALIE_STEPS, { max: 46 });
      return { ...player, goaltending, rolls: { ...player.rolls } };
    }
    return movement === 'promoted' ? lower(player, rng) : raise(player, rng);
  });
}

/** Grade for a new team by a d6; `vacancy` is the movement of the team it replaces. */
export function replacementGrade(vacancy: Movement, roll: number): Grade {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new RangeError(`Grade roll must be 1 to 6, got ${roll}`);
  const grades: readonly Grade[] = vacancy === 'promoted' ? ['A', 'B', 'B', 'C', 'C', 'C'] : ['C', 'D', 'D', 'F', 'F', 'F'];
  return grades[roll - 1];
}
