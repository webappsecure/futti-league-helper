import type { League } from '@/leagues/league';
import { leagueAbove, leagueBelow } from '@/leagues/league-links';
import { listLeagues } from '@/leagues/league-repository';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import { getSeasonArchive } from '@/seasons/season-archive-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import { fail as failResult, ok, type Database, type Result } from '@/storage/types';
import { arrivalsAreCurrent, buildArrivals, expectedArrivals, type ArrivalSource, type ExpectedArrival } from './arrivals';
import {
  departureErrorText,
  isOffseasonPlan,
  OFFSEASON_PLAN_COLLECTION,
  validateDepartures,
  type DepartureError,
  type OffseasonPlan,
  type StagedArrival,
} from './offseason-plan';

export type BlockedReason = 'no-season' | 'not-offseason' | 'no-archive' | 'no-plan';

/** A linked league whose teams cannot be staged yet, and why. */
export interface BlockedNeighbor {
  leagueId: string;
  leagueName: string;
  direction: 'above' | 'below';
  reason: BlockedReason;
}

export type PlanError =
  | { kind: DepartureError }
  | { kind: 'no-plan' }
  | { kind: 'blocked'; blocked: BlockedNeighbor[] }
  | { kind: 'missing-team'; franchiseId: string }
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

  const existing = await getOffseasonPlan(db, season.id);
  if (!existing.ok) return storage(existing.error);
  const plan: OffseasonPlan = {
    ...(existing.value?.arrivals ? { arrivals: existing.value.arrivals } : {}),
    seasonId: season.id,
    leagueId: league.id,
    promoted: [...promoted],
    demoted: [...demoted],
  };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: season.id, value: plan }]);
  return written.ok ? { ok: true, value: plan } : storage(written.error);
}

type Loaded<T> = { ok: true; value: T } | { ok: false; error: Error };

/** The linked leagues next to `league`, each with its season results and plan, and the ones that cannot send teams yet. */
async function loadSources(db: Database, league: League): Promise<Loaded<{ sources: ArrivalSource[]; blocked: BlockedNeighbor[] }>> {
  const all = await listLeagues(db);
  if (!all.ok) return { ok: false, error: all.error.kind === 'storage' ? all.error.error : new Error('Could not read leagues') };
  if (all.value.unreadable > 0) return { ok: false, error: new Error('A saved league could not be read') };
  const current = all.value.leagues.find((l) => l.id === league.id) ?? league;
  const neighbors = [
    { direction: 'above' as const, league: leagueAbove(current, all.value.leagues) },
    { direction: 'below' as const, league: leagueBelow(current, all.value.leagues) },
  ];
  const sources: ArrivalSource[] = [];
  const blocked: BlockedNeighbor[] = [];
  for (const { direction, league: other } of neighbors) {
    if (other === null) continue;
    const block = (reason: BlockedReason) => blocked.push({ leagueId: other.id, leagueName: other.name, direction, reason });
    const season = await getLeagueSeason(db, other.id);
    if (!season.ok) return season;
    if (season.value === null) {
      block('no-season');
      continue;
    }
    if (season.value.status !== 'offseason') {
      block('not-offseason');
      continue;
    }
    const archive = await getSeasonArchive(db, season.value.id);
    if (!archive.ok) return archive;
    if (archive.value === null) {
      block('no-archive');
      continue;
    }
    const plan = await getOffseasonPlan(db, season.value.id);
    if (!plan.ok) return plan;
    if (plan.value === null) block('no-plan');
    sources.push({ league: other, direction, archive: archive.value, plan: plan.value });
  }
  return { ok: true, value: { sources, blocked } };
}

export interface ArrivalStatus {
  sources: ArrivalSource[];
  blocked: BlockedNeighbor[];
  expected: ExpectedArrival[];
  /** The arrivals saved in this league's plan, or null when none were staged (or there is no plan yet). */
  staged: StagedArrival[] | null;
  /** True when `staged` matches what the linked leagues' plans send now. */
  current: boolean;
}

export type ArrivalStatusResult = Result<ArrivalStatus>;

/** Who should arrive here, who is staged, and what blocks staging. Fails closed on unreadable data. */
export async function getArrivalStatus(db: Database, league: League): Promise<ArrivalStatusResult> {
  const loaded = await loadSources(db, league);
  if (!loaded.ok) return failResult(loaded.error);
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return found;
  let staged: StagedArrival[] | null = null;
  if (found.value !== null) {
    const plan = await getOffseasonPlan(db, found.value.id);
    if (!plan.ok) return plan;
    staged = plan.value?.arrivals ?? null;
  }
  const expected = expectedArrivals(loaded.value.sources);
  return ok({ ...loaded.value, expected, staged, current: staged !== null && arrivalsAreCurrent(staged, expected) });
}

/** Stages (or restages, rerolling control stars) the teams arriving from linked leagues into this league's plan. */
export const stageArrivals = (db: Database, league: League, rng: Rng = Math.random) =>
  acceptQueue(() => stageNow(db, league, rng));

async function stageNow(db: Database, league: League, rng: Rng): Promise<PlanResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });
  const own = await getOffseasonPlan(db, season.id);
  if (!own.ok) return storage(own.error);
  if (own.value === null) return fail({ kind: 'no-plan' });

  const loaded = await loadSources(db, league);
  if (!loaded.ok) return storage(loaded.error);
  if (loaded.value.blocked.length > 0) return fail({ kind: 'blocked', blocked: loaded.value.blocked });

  const built = buildArrivals(expectedArrivals(loaded.value.sources), loaded.value.sources, rng);
  if (!built.ok) return fail({ kind: 'missing-team', franchiseId: built.franchiseId });

  const plan: OffseasonPlan = { ...own.value, arrivals: built.value };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: season.id, value: plan }]);
  return written.ok ? { ok: true, value: plan } : storage(written.error);
}

export function blockedText(blocked: BlockedNeighbor): string {
  const where = blocked.direction === 'above' ? 'above' : 'below';
  switch (blocked.reason) {
    case 'no-season':
      return `${blocked.leagueName} (${where}) has not been accepted yet.`;
    case 'not-offseason':
      return `${blocked.leagueName} (${where}) has not ended its season yet.`;
    case 'no-archive':
      return `The saved season results for ${blocked.leagueName} (${where}) could not be found.`;
    case 'no-plan':
      return `${blocked.leagueName} (${where}) has not saved its plan yet.`;
  }
}

export function planErrorText(error: PlanError, league: League): string {
  switch (error.kind) {
    case 'no-plan':
      return 'Save this league\'s plan first.';
    case 'blocked':
      return error.blocked.map(blockedText).join(' ');
    case 'missing-team':
      return 'A team from the linked league could not be found in its saved results.';
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
