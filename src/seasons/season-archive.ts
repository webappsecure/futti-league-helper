import { GRADES, type Grade } from '@/rules/charts';
import { isRoster, type Roster, type RosterPlayer } from '@/rosters/roster';
import { identityForSeason, type Franchise, type FranchiseIdentity } from '@/teams/franchise';
import type { Season } from './season';

export const SEASON_ARCHIVE_COLLECTION = 'season-archives';

export interface ArchivedTeam {
  franchiseId: string;
  /** 1 is the best finish; unique within the archive. */
  position: number;
  /** The identity in effect for the season. */
  identity: FranchiseIdentity;
  initialGrade: Grade;
  /** A copy of the roster when the season ended. */
  players: RosterPlayer[];
}

/** One document per ended season; its id is the season id. `teams` is sorted by `position`. */
export interface SeasonArchive {
  seasonId: string;
  leagueId: string;
  seasonIndex: number;
  teams: ArchivedTeam[];
}

export type ArchiveError =
  | { kind: 'invalid-order' }
  | { kind: 'missing-roster'; franchiseId: string }
  | { kind: 'missing-identity'; franchiseId: string };

export type ArchiveResult<T> = { ok: true; value: T } | { ok: false; error: ArchiveError };

/** True when `order` lists every id exactly once. */
export function isCompleteOrder(order: string[], ids: string[]): boolean {
  return order.length === ids.length && new Set(order).size === order.length && order.every((id) => ids.includes(id));
}

/** Builds the snapshot; `order` is the franchise ids from first place to last. */
export function buildSeasonArchive(input: {
  season: Season;
  franchises: Franchise[];
  rosters: Roster[];
  order: string[];
}): ArchiveResult<SeasonArchive> {
  const { season, franchises, rosters, order } = input;
  if (!isCompleteOrder(order, franchises.map((f) => f.id))) return { ok: false, error: { kind: 'invalid-order' } };
  const teams: ArchivedTeam[] = [];
  for (const [i, id] of order.entries()) {
    const franchise = franchises.find((f) => f.id === id)!;
    const roster = rosters.find((r) => r.franchiseId === id);
    if (roster === undefined) return { ok: false, error: { kind: 'missing-roster', franchiseId: id } };
    const identity = identityForSeason(franchise, season.index);
    if (identity === null) return { ok: false, error: { kind: 'missing-identity', franchiseId: id } };
    teams.push({
      franchiseId: id,
      position: i + 1,
      identity: structuredClone(identity),
      initialGrade: franchise.initialGrade,
      players: structuredClone(roster.players),
    });
  }
  return { ok: true, value: { seasonId: season.id, leagueId: season.leagueId, seasonIndex: season.index, teams } };
}

/** Changes only the positions; the saved identities and rosters stay as they were. */
export function applyFinishingOrder(archive: SeasonArchive, order: string[]): ArchiveResult<SeasonArchive> {
  if (!isCompleteOrder(order, archive.teams.map((t) => t.franchiseId))) return { ok: false, error: { kind: 'invalid-order' } };
  const teams = order.map((id, i) => ({ ...archive.teams.find((t) => t.franchiseId === id)!, position: i + 1 }));
  return { ok: true, value: { ...archive, teams } };
}

/** Moves the item at `from` to `to`; out-of-range moves return the order unchanged. */
export function reorderTeams(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function isArchivedTeam(value: unknown, leagueId: string, position: number): value is ArchivedTeam {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const identity = v.identity as Record<string, unknown> | null;
  return (
    typeof v.franchiseId === 'string' &&
    v.franchiseId.length > 0 &&
    v.position === position &&
    GRADES.includes(v.initialGrade as Grade) &&
    typeof identity === 'object' &&
    identity !== null &&
    typeof identity.city === 'string' &&
    typeof identity.name === 'string' &&
    typeof identity.primaryColor === 'string' &&
    typeof identity.secondaryColor === 'string' &&
    typeof identity.fromSeason === 'number' &&
    isRoster({ franchiseId: v.franchiseId, leagueId, players: v.players })
  );
}

export function isSeasonArchive(value: unknown): value is SeasonArchive {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.seasonId !== 'string' || v.seasonId.length === 0) return false;
  if (typeof v.leagueId !== 'string' || v.leagueId.length === 0) return false;
  if (typeof v.seasonIndex !== 'number' || !Number.isInteger(v.seasonIndex) || v.seasonIndex < 1) return false;
  const teams = v.teams;
  if (!Array.isArray(teams) || teams.length === 0) return false;
  if (!teams.every((t, i) => isArchivedTeam(t, v.leagueId as string, i + 1))) return false;
  return new Set(teams.map((t: ArchivedTeam) => t.franchiseId)).size === teams.length;
}

/** The index a row dragged from `from` lands on after moving `translationY` pixels, kept within the list. */
export function dropIndex(from: number, translationY: number, rowPitch: number, count: number): number {
  'worklet';
  const target = Math.round(from + translationY / rowPitch);
  return Math.max(0, Math.min(count - 1, target));
}
