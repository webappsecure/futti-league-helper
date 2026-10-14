import { createId } from '@/leagues/ids';
import type { League } from '@/leagues/league';
import { listRosters } from '@/rosters/roster-repository';
import type { Database } from '@/storage/types';
import { listFranchises } from '@/teams/franchise-repository';
import { SEASON_COLLECTION, type Season } from './season';
import { getLeagueSeason } from './season-repository';

export type AcceptError =
  | { kind: 'already-accepted' }
  | { kind: 'incomplete'; teams: number; size: number }
  | { kind: 'missing-rosters'; count: number }
  | { kind: 'unreadable' }
  | { kind: 'storage'; error: Error };

export type AcceptResult = { ok: true; value: Season } | { ok: false; error: AcceptError };

const fail = (error: AcceptError): AcceptResult => ({ ok: false, error });
const storage = (error: Error): AcceptResult => fail({ kind: 'storage', error });

/** Accepts the league: writes season 1 as active in one batch. Locking is derived from that season existing. */
export async function acceptLeague(
  db: Database,
  league: League,
  newId: () => string = createId,
): Promise<AcceptResult> {
  const existing = await getLeagueSeason(db, league.id);
  if (!existing.ok) return storage(existing.error);
  if (existing.value !== null) return fail({ kind: 'already-accepted' });

  const teams = await listFranchises(db, league);
  if (!teams.ok) return storage(teams.error.kind === 'storage' ? teams.error.error : new Error('Could not read teams'));
  const rosters = await listRosters(db, league);
  if (!rosters.ok) return storage(rosters.error.kind === 'storage' ? rosters.error.error : new Error('Could not read rosters'));

  if (teams.value.unreadable > 0 || rosters.value.unreadable > 0) return fail({ kind: 'unreadable' });
  if (teams.value.teams.length !== league.size) {
    return fail({ kind: 'incomplete', teams: teams.value.teams.length, size: league.size });
  }
  const have = new Set(rosters.value.rosters.map((r) => r.franchiseId));
  const missing = teams.value.teams.filter((t) => !have.has(t.id)).length;
  if (missing > 0) return fail({ kind: 'missing-rosters', count: missing });

  const season: Season = { id: newId(), leagueId: league.id, index: 1, status: 'active' };
  const written = await db.batch([{ type: 'put', collection: SEASON_COLLECTION, id: season.id, value: season }]);
  return written.ok ? { ok: true, value: season } : storage(written.error);
}

export function acceptErrorText(error: AcceptError): string {
  switch (error.kind) {
    case 'already-accepted':
      return 'This league has already been accepted.';
    case 'incomplete':
      return `This league has ${error.teams} of ${error.size} teams. Add the rest before accepting.`;
    case 'missing-rosters':
      return error.count === 1
        ? '1 team has no roster. Generate rosters before accepting.'
        : `${error.count} teams have no roster. Generate rosters before accepting.`;
    case 'unreadable':
      return 'A saved team or roster could not be read, so the league cannot be accepted.';
    case 'storage':
      return error.error.message;
  }
}
