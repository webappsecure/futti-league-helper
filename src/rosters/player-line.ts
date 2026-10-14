import type { RosterPlayer } from './roster';

function stars(count: number): string {
  return count === 0 ? '-' : '★'.repeat(count);
}

/** One-line player summary plus a screen-reader variant that spells out the control stars. */
export function playerLine(player: RosterPlayer): { label: string; details: string; spoken?: string } {
  if (player.kind === 'goalie') {
    return {
      label: `${player.name} (G)`,
      details: `Age ${player.age} · GO ${player.goaltending} · SP ${player.sportsmanship}`,
    };
  }
  const base = `Age ${player.age} · OF ${player.offense} · DE ${player.defense} · SP ${player.sportsmanship}`;
  return {
    label: player.name,
    details: `${base} · CO ${stars(player.controlStars)}`,
    spoken: `${base} · ${player.controlStars} control stars`,
  };
}
