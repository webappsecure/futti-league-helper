import type { League } from '@/leagues/league';
import { listRosters } from '@/rosters/roster-repository';
import { fail as failResult, ok, type Database, type Result } from '@/storage/types';
import { listFranchises } from '@/teams/franchise-repository';
import { acceptQueue } from './accept-queue';
import { SEASON_COLLECTION } from './season';
import { applyFinishingOrder, buildSeasonArchive, isSeasonArchive, SEASON_ARCHIVE_COLLECTION, type SeasonArchive } from './season-archive';
import { getLeagueSeason } from './season-repository';

export type FinishError =
  | { kind: 'no-season' }
  | { kind: 'not-active' }
  | { kind: 'not-offseason' }
  | { kind: 'incomplete'; teams: number; size: number }
  | { kind: 'unreadable' }
  | { kind: 'invalid-order' }
  | { kind: 'no-archive' }
  | { kind: 'storage'; error: Error };

export type FinishResult = { ok: true; value: SeasonArchive } | { ok: false; error: FinishError };

const fail = (error: FinishError): FinishResult => ({ ok: false, error });
const storage = (error: Error): FinishResult => fail({ kind: 'storage', error });

/** The season's archive, or null when the season has not ended. Fails closed on an unreadable document. */
export async function getSeasonArchive(db: Database, seasonId: string): Promise<Result<SeasonArchive | null>> {
  const stored = await db.get<unknown>(SEASON_ARCHIVE_COLLECTION, seasonId);
  if (!stored.ok) return stored;
  if (stored.value === null) return ok(null);
  if (isSeasonArchive(stored.value) && stored.value.seasonId === seasonId) return ok(stored.value);
  return failResult(new Error(`Saved season archive ${seasonId} could not be read`));
}

/**
 * Ends the active season: saves the snapshot with `order` (franchise ids, first place to last) and moves the
 * season to `offseason` in one batch.
 */
export const finishSeason = (db: Database, league: League, order: string[]) =>
  acceptQueue(() => finishNow(db, league, order));

/** Corrects the finishing order while the season is in `offseason`; the saved rosters and identities stay. */
export const updateFinishingOrder = (db: Database, league: League, order: string[]) =>
  acceptQueue(() => updateNow(db, league, order));

async function finishNow(db: Database, league: League, order: string[]): Promise<FinishResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'active') return fail({ kind: 'not-active' });

  const teams = await listFranchises(db, league);
  if (!teams.ok) return storage(teams.error.kind === 'storage' ? teams.error.error : new Error('Could not read teams'));
  const rosters = await listRosters(db, league);
  if (!rosters.ok) return storage(rosters.error.kind === 'storage' ? rosters.error.error : new Error('Could not read rosters'));
  if (teams.value.unreadable > 0 || rosters.value.unreadable > 0) return fail({ kind: 'unreadable' });
  if (teams.value.teams.length !== league.size) {
    return fail({ kind: 'incomplete', teams: teams.value.teams.length, size: league.size });
  }

  const built = buildSeasonArchive({ season, franchises: teams.value.teams, rosters: rosters.value.rosters, order });
  if (!built.ok) return fail({ kind: built.error.kind === 'invalid-order' ? 'invalid-order' : 'unreadable' });

  const written = await db.batch([
    { type: 'put', collection: SEASON_COLLECTION, id: season.id, value: { ...season, status: 'offseason' } },
    { type: 'put', collection: SEASON_ARCHIVE_COLLECTION, id: season.id, value: built.value },
  ]);
  return written.ok ? { ok: true, value: built.value } : storage(written.error);
}

async function updateNow(db: Database, league: League, order: string[]): Promise<FinishResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });

  const archive = await getSeasonArchive(db, season.id);
  if (!archive.ok) return storage(archive.error);
  if (archive.value === null) return fail({ kind: 'no-archive' });

  const next = applyFinishingOrder(archive.value, order);
  if (!next.ok) return fail({ kind: 'invalid-order' });
  const written = await db.batch([{ type: 'put', collection: SEASON_ARCHIVE_COLLECTION, id: season.id, value: next.value }]);
  return written.ok ? { ok: true, value: next.value } : storage(written.error);
}

export function finishErrorText(error: FinishError): string {
  switch (error.kind) {
    case 'no-season':
      return 'This league has not been accepted yet.';
    case 'not-active':
      return 'This season has already ended.';
    case 'not-offseason':
      return 'The finishing order can only be changed after the season has ended, until the offseason moves on.';
    case 'incomplete':
      return `This league has ${error.teams} of ${error.size} teams.`;
    case 'unreadable':
      return 'Some saved teams or rosters could not be read, so nothing was changed.';
    case 'invalid-order':
      return 'The finishing order must list every team exactly once.';
    case 'no-archive':
      return 'The saved season results could not be found.';
    case 'storage':
      return error.error.message;
  }
}
