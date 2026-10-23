import type { Stars } from '@/rules/charts';
import type { RosterPlayer, StandardRosterPlayer } from './roster';

export const MIN_TEAM_STARS = 2;
export const MAX_TEAM_STARS = 6;

/** Control stars on the whole team. */
export const teamStars = (players: readonly RosterPlayer[]): number =>
  players.reduce((sum, p) => sum + (p.kind === 'standard' ? p.controlStars : 0), 0);

const strength = (p: StandardRosterPlayer) => p.offense + p.defense;

/**
 * Keeps a team's control stars between `MIN_TEAM_STARS` and `MAX_TEAM_STARS`. Too few: one star at a time goes to the best
 * position players (offense plus defense, then sportsmanship, then roster order), each pass giving a player at most one
 * and no player more than two. Too many: one star at a time comes off the worst players that have stars, the same way.
 * Returns a new array in the same order; the dice behind each player are left alone.
 */
export function limitTeamStars(players: readonly RosterPlayer[]): RosterPlayer[] {
  const stars = new Map<number, number>();
  players.forEach((p, i) => {
    if (p.kind === 'standard') stars.set(i, p.controlStars);
  });
  const standard = (i: number) => players[i] as StandardRosterPlayer;
  const best = [...stars.keys()].sort((a, b) => strength(standard(b)) - strength(standard(a)) || standard(b).sportsmanship - standard(a).sportsmanship || a - b);
  const worst = [...stars.keys()].sort((a, b) => strength(standard(a)) - strength(standard(b)) || standard(a).sportsmanship - standard(b).sportsmanship || b - a);
  const total = () => [...stars.values()].reduce((sum, n) => sum + n, 0);

  const pass = (order: number[], step: 1 | -1, target: number): boolean => {
    let changed = false;
    for (const i of order) {
      if (step === 1 ? total() >= target : total() <= target) break;
      const next = stars.get(i)! + step;
      if (next < 0 || next > 2) continue;
      stars.set(i, next);
      changed = true;
    }
    return changed;
  };
  while (total() < MIN_TEAM_STARS && pass(best, 1, MIN_TEAM_STARS));
  while (total() > MAX_TEAM_STARS && pass(worst, -1, MAX_TEAM_STARS));

  return players.map((p, i): RosterPlayer => (p.kind === 'standard' && stars.get(i) !== p.controlStars ? { ...p, controlStars: stars.get(i) as Stars } : p));
}
