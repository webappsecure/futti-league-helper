import { fail, ok, type Database, type Result } from '@/storage/types';
import { isSeason, SEASON_COLLECTION, type Season } from './season';

/**
 * The league's latest season (highest index), or null when it has not been accepted. Fails closed: a document that names this
 * league but cannot be read is an error, never "no season".
 */
export async function getLeagueSeason(db: Database, leagueId: string): Promise<Result<Season | null>> {
  const stored = await db.list<unknown>(SEASON_COLLECTION);
  if (!stored.ok) return stored;
  let latest: Season | null = null;
  for (const { id, value } of stored.value) {
    if (isSeason(value) && value.id === id) {
      if (value.leagueId === leagueId && (latest === null || value.index > latest.index)) latest = value;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      (value as { leagueId?: unknown }).leagueId === leagueId
    ) {
      return fail(new Error(`Saved season ${id} could not be read`));
    }
  }
  return ok(latest);
}
