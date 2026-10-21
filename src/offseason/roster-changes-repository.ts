import type { League } from '@/leagues/league';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import { getSeasonArchive } from '@/seasons/season-archive-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import type { Database } from '@/storage/types';
import { OFFSEASON_PLAN_COLLECTION, type OffseasonPlan, type StagedTeamChange } from './offseason-plan';
import { getArrivalStatus, getOffseasonPlan, type PlanError, type PlanResult } from './offseason-plan-repository';
import { arrivalsReady, buildTeamChanges, participatingTeams, type ParticipatingTeam } from './roster-changes';

const fail = (error: PlanError): { ok: false; error: PlanError } => ({ ok: false, error });
const storage = (error: Error) => fail({ kind: 'storage', error });

type Loaded = { ok: true; plan: OffseasonPlan; teams: ParticipatingTeam[] } | { ok: false; error: PlanError };

/** The offseason plan and its participating teams, once the season, archive and arrivals are ready for roster changes. */
async function load(db: Database, league: League): Promise<Loaded> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });
  const plan = await getOffseasonPlan(db, season.id);
  if (!plan.ok) return storage(plan.error);
  if (plan.value === null) return fail({ kind: 'no-plan' });
  const archive = await getSeasonArchive(db, season.id);
  if (!archive.ok) return storage(archive.error);
  if (archive.value === null) return fail({ kind: 'no-archive' });
  const status = await getArrivalStatus(db, league);
  if (!status.ok) return storage(status.error);
  if (!arrivalsReady(status.value)) return fail({ kind: 'arrivals-not-ready' });
  return { ok: true, plan: plan.value, teams: participatingTeams(archive.value, plan.value) };
}

async function write(db: Database, plan: OffseasonPlan, teamChanges: StagedTeamChange[]): Promise<PlanResult> {
  const next: OffseasonPlan = { ...plan, teamChanges };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: plan.seasonId, value: next }]);
  return written.ok ? { ok: true, value: next } : storage(written.error);
}

/** Protects one player on a participating team, replacing its earlier choice, and clears any aging results. */
export const setProtection = (db: Database, league: League, franchiseId: string, playerId: string) =>
  acceptQueue(() => protectNow(db, league, franchiseId, playerId));

async function protectNow(db: Database, league: League, franchiseId: string, playerId: string): Promise<PlanResult> {
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const team = loaded.teams.find((t) => t.franchiseId === franchiseId);
  if (team === undefined || !team.players.some((p) => p.id === playerId)) return fail({ kind: 'unknown-player' });
  const kept = (loaded.plan.teamChanges ?? []).filter((c) => c.franchiseId !== franchiseId).map((c): StagedTeamChange => ({ franchiseId: c.franchiseId, protectedId: c.protectedId }));
  return write(db, loaded.plan, [...kept, { franchiseId, protectedId: playerId }]);
}

/** Ages every participating team: picks each team's retiree and released player. Re-running rerolls the random parts. */
export const ageAndRelease = (db: Database, league: League, options: { rng?: Rng } = {}) =>
  acceptQueue(() => ageNow(db, league, options.rng ?? Math.random));

async function ageNow(db: Database, league: League, rng: Rng): Promise<PlanResult> {
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const protections = new Map((loaded.plan.teamChanges ?? []).map((c) => [c.franchiseId, c.protectedId]));
  const built = buildTeamChanges(loaded.teams, protections, rng);
  if (!built.ok) return fail({ kind: 'protection-incomplete' });
  return write(db, loaded.plan, built.value);
}
