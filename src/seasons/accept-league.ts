import { createId } from '@/leagues/ids';
import type { League } from '@/leagues/league';
import { burnNamesOp, getBurnedNames } from '@/names/name-registry';
import { listRosters } from '@/rosters/roster-repository';
import type { Database } from '@/storage/types';
import { listFranchises } from '@/teams/franchise-repository';
import { SEASON_COLLECTION, type Season } from './season';
import { acceptQueue } from './accept-queue';
import { getLeagueSeason } from './season-repository';

export type AcceptError =
  | { kind: 'already-accepted' }
  | { kind: 'incomplete'; teams: number; size: number }
  | { kind: 'missing-rosters'; count: number }
  | { kind: 'unreadable' }
  | { kind: 'burned-names'; names: string[] }
  | { kind: 'storage'; error: Error };

export type AcceptResult = { ok: true; value: Season } | { ok: false; error: AcceptError };

const fail = (error: AcceptError): AcceptResult => ({ ok: false, error });
const storage = (error: Error): AcceptResult => fail({ kind: 'storage', error });

/**
 * Accepts the league: writes season 1 as active and burns every roster name in one batch.
 * Locking is derived from that season existing.
 */
export function acceptLeague(
  db: Database,
  league: League,
  newId: () => string = createId,
): Promise<AcceptResult> {
  return acceptQueue(() => accept(db, league, newId));
}

async function accept(
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

  const names = rosters.value.rosters
    .filter((r) => teams.value.teams.some((t) => t.id === r.franchiseId))
    .flatMap((r) => r.players.map((p) => p.name));
  const burned = await getBurnedNames(db);
  if (!burned.ok) return storage(burned.error);
  const clashes = names.filter((name) => burned.value.has(name));
  if (clashes.length > 0) return fail({ kind: 'burned-names', names: clashes });

  const season: Season = { id: newId(), leagueId: league.id, index: 1, status: 'active' };
  const written = await db.batch([
    { type: 'put', collection: SEASON_COLLECTION, id: season.id, value: season },
    burnNamesOp(burned.value, names),
  ]);
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
    case 'burned-names':
      return `${error.names.length === 1 ? 'A player name has' : 'Some player names have'} already been burned (${error.names.join(', ')}). Rename ${error.names.length === 1 ? 'that player' : 'those players'} before accepting.`;
    case 'storage':
      return error.error.message;
  }
}
