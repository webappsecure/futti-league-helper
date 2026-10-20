import type { League } from '@/leagues/league';
import { acceptQueue } from '@/seasons/accept-queue';
import { getSeasonArchive } from '@/seasons/season-archive-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import { fail as failResult, ok, type Database, type Result } from '@/storage/types';
import {
  departureErrorText,
  isOffseasonPlan,
  OFFSEASON_PLAN_COLLECTION,
  validateDepartures,
  type DepartureError,
  type OffseasonPlan,
} from './offseason-plan';

export type PlanError =
  | { kind: DepartureError }
  | { kind: 'no-season' }
  | { kind: 'not-offseason' }
  | { kind: 'no-archive' }
  | { kind: 'storage'; error: Error };

export type PlanResult = { ok: true; value: OffseasonPlan } | { ok: false; error: PlanError };

const fail = (error: PlanError): PlanResult => ({ ok: false, error });
const storage = (error: Error): PlanResult => fail({ kind: 'storage', error });

/** The season's plan, or null when none is saved. Fails closed on an unreadable document. */
export async function getOffseasonPlan(db: Database, seasonId: string): Promise<Result<OffseasonPlan | null>> {
  const stored = await db.get<unknown>(OFFSEASON_PLAN_COLLECTION, seasonId);
  if (!stored.ok) return stored;
  if (stored.value === null) return ok(null);
  if (isOffseasonPlan(stored.value) && stored.value.seasonId === seasonId) return ok(stored.value);
  return failResult(new Error(`Saved offseason plan ${seasonId} could not be read`));
}

/** Saves which teams leave the league while the season is in `offseason`; live teams and rosters are not touched. */
export const saveOffseasonPlan = (db: Database, league: League, promoted: string[], demoted: string[]) =>
  acceptQueue(() => saveNow(db, league, promoted, demoted));

async function saveNow(db: Database, league: League, promoted: string[], demoted: string[]): Promise<PlanResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });

  const archive = await getSeasonArchive(db, season.id);
  if (!archive.ok) return storage(archive.error);
  if (archive.value === null) return fail({ kind: 'no-archive' });

  const checked = validateDepartures({ archive: archive.value, league, promoted, demoted });
  if (!checked.ok) return fail({ kind: checked.error });

  const plan: OffseasonPlan = { seasonId: season.id, leagueId: league.id, promoted: [...promoted], demoted: [...demoted] };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: season.id, value: plan }]);
  return written.ok ? { ok: true, value: plan } : storage(written.error);
}

export function planErrorText(error: PlanError, league: League): string {
  switch (error.kind) {
    case 'no-season':
      return 'This league has not been accepted yet.';
    case 'not-offseason':
      return 'The offseason plan can only be changed while the season is in the offseason.';
    case 'no-archive':
      return 'The saved season results could not be found.';
    case 'storage':
      return error.error.message;
    default:
      return departureErrorText(error.kind, league);
  }
}
