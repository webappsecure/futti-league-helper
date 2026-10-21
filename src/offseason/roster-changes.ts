import type { RosterPlayer } from '@/rosters/roster';
import type { Rng } from '@/rules/dice';
import type { SeasonArchive } from '@/seasons/season-archive';
import type { OffseasonPlan, StagedTeamChange } from './offseason-plan';
import type { ArrivalStatus } from './offseason-plan-repository';

/** Years every player of a participating team ages when the offseason is applied. */
export const AGING_YEARS = 1;

/** A team that takes part in protection, aging and release. */
export interface ParticipatingTeam {
  franchiseId: string;
  origin: 'staying' | 'arrival';
  players: RosterPlayer[];
}

/** Teams staying in the league (finishing order, departures removed) then staged arrivals. New teams never take part. */
export function participatingTeams(archive: SeasonArchive, plan: OffseasonPlan): ParticipatingTeam[] {
  const leaving = new Set([...plan.promoted, ...plan.demoted]);
  const staying = [...archive.teams]
    .sort((a, b) => a.position - b.position)
    .filter((t) => !leaving.has(t.franchiseId))
    .map((t): ParticipatingTeam => ({ franchiseId: t.franchiseId, origin: 'staying', players: t.players }));
  const arrivals = (plan.arrivals ?? []).map((a): ParticipatingTeam => ({ franchiseId: a.franchiseId, origin: 'arrival', players: a.players }));
  return [...staying, ...arrivals];
}

function pickRandom<T>(items: readonly T[], rng: Rng): T {
  const value = rng();
  if (!(value >= 0 && value < 1)) throw new RangeError(`Rng must return a value in [0, 1), got ${value}`);
  return items[Math.floor(value * items.length)];
}

/** Position players are rated by offense plus defense, goaltenders by goaltending. */
const rating = (p: RosterPlayer) => (p.kind === 'goalie' ? p.goaltending : p.offense + p.defense);

/** The oldest unprotected player. Ties: goaltender first, then lowest rating, then lowest SP, then random. */
export function pickRetiree(players: readonly RosterPlayer[], protectedId: string, rng: Rng): string {
  const open = players.filter((p) => p.id !== protectedId);
  if (open.length === 0) throw new RangeError('No player is available to retire');
  const keep = <T>(items: T[], score: (item: T) => number): T[] => {
    const best = Math.min(...items.map(score));
    return items.filter((item) => score(item) === best);
  };
  let tied = keep(open, (p) => -p.age);
  if (tied.some((p) => p.kind === 'goalie')) tied = tied.filter((p) => p.kind === 'goalie');
  tied = keep(tied, rating);
  tied = keep(tied, (p) => p.sportsmanship);
  return (tied.length === 1 ? tied[0] : pickRandom(tied, rng)).id;
}

/** A random player who is neither protected nor retired. */
export function pickRelease(players: readonly RosterPlayer[], protectedId: string, retiredId: string, rng: Rng): string {
  const open = players.filter((p) => p.id !== protectedId && p.id !== retiredId);
  if (open.length === 0) throw new RangeError('No player is available to release');
  return pickRandom(open, rng).id;
}

export type BuiltChanges = { ok: true; value: StagedTeamChange[] } | { ok: false; missing: string[] };

/** Retire and release for every team; `protections` maps franchise id to protected player id. Fails listing teams without one. */
export function buildTeamChanges(teams: readonly ParticipatingTeam[], protections: ReadonlyMap<string, string>, rng: Rng): BuiltChanges {
  const missing = teams.filter((t) => !protections.has(t.franchiseId)).map((t) => t.franchiseId);
  if (missing.length > 0) return { ok: false, missing };
  const value = teams.map((t): StagedTeamChange => {
    const protectedId = protections.get(t.franchiseId)!;
    const retiredId = pickRetiree(t.players, protectedId, rng);
    return { franchiseId: t.franchiseId, protectedId, retiredId, releasedId: pickRelease(t.players, protectedId, retiredId, rng) };
  });
  return { ok: true, value };
}

/** True when every change is for a participating team and names players on its roster. Protections are set one team at a time, so teams may still be missing. */
export function changesAreCurrent(changes: readonly StagedTeamChange[], teams: readonly ParticipatingTeam[]): boolean {
  return changes.every((c) => {
    const team = teams.find((t) => t.franchiseId === c.franchiseId);
    if (team === undefined) return false;
    const onRoster = (id: string | undefined) => id === undefined || team.players.some((p) => p.id === id);
    return onRoster(c.protectedId) && onRoster(c.retiredId) && onRoster(c.releasedId);
  });
}

/** True when nothing blocks and the staged arrivals match what the linked leagues send (or none are expected). */
export function arrivalsReady(status: Pick<ArrivalStatus, 'expected' | 'staged' | 'current' | 'blocked'>): boolean {
  if (status.blocked.length > 0) return false;
  if (status.expected.length === 0) return (status.staged ?? []).length === 0;
  return status.current;
}
