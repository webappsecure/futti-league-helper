import type { League } from '@/leagues/league';
import { limitTeamStars } from '@/rosters/control-stars';
import { isRoster, ROSTER_COLLECTION, type RosterPlayer } from '@/rosters/roster';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import { isSeason, SEASON_COLLECTION } from '@/seasons/season';
import { fail as failResult, ok, type Database, type Result } from '@/storage/types';
import { FRANCHISE_COLLECTION } from '@/teams/franchise-repository';
import { identityForSeason, isFranchise, type FranchiseIdentity } from '@/teams/franchise';
import { isOffseasonPlan, OFFSEASON_PLAN_COLLECTION, type OffseasonPlan, type StagedFormerTeam } from './offseason-plan';
import { DUPLICATE_NAME, loadForNewTeams, norm, type PlanError, type PlanResult } from './offseason-plan-repository';
import { adjustRoster } from './rating-adjust';
import { openVacancies } from './new-teams';
import { putClearingDraft } from './roster-changes-repository';

/** An unassigned team that left this league in an earlier offseason and could return. */
export interface FormerCandidate {
  franchiseId: string;
  /** The identity it had in the newest season it played. */
  identity: FranchiseIdentity;
  players: RosterPlayer[];
  /** The index of the season after which it left. */
  leftSeason: number;
}

const fail = (error: PlanError): PlanResult => ({ ok: false, error });
const storage = (error: Error): PlanResult => fail({ kind: 'storage', error });

const latestIdentity = (identities: readonly FranchiseIdentity[]) => identities.reduce((a, b) => (b.fromSeason > a.fromSeason ? b : a));

/**
 * Teams without a league whose id is in the departures of a saved plan for this league, newest departure first, leaving out
 * the ones already staged in `staged`. Fails closed on an unreadable plan, season, team or roster.
 */
export async function listFormerTeams(db: Database, league: League, staged: readonly StagedFormerTeam[] = []): Promise<Result<FormerCandidate[]>> {
  const plans = await db.list<unknown>(OFFSEASON_PLAN_COLLECTION);
  if (!plans.ok) return plans;
  const seasons = await db.list<unknown>(SEASON_COLLECTION);
  if (!seasons.ok) return seasons;
  const index = new Map(seasons.value.flatMap(({ value }) => (isSeason(value) ? [[value.id, value.index] as const] : [])));
  const left = new Map<string, number>();
  for (const { id, value } of plans.value) {
    if (!isOffseasonPlan(value) || value.seasonId !== id) return failResult(new Error(`Saved offseason plan ${id} could not be read`));
    if (value.leagueId !== league.id) continue;
    const season = index.get(value.seasonId);
    if (season === undefined) continue;
    for (const franchiseId of [...value.promoted, ...value.demoted]) left.set(franchiseId, Math.max(left.get(franchiseId) ?? 0, season));
  }
  const taken = new Set(staged.map((t) => t.franchiseId));
  const out: FormerCandidate[] = [];
  for (const [franchiseId, leftSeason] of left) {
    if (taken.has(franchiseId)) continue;
    const franchise = await db.get<unknown>(FRANCHISE_COLLECTION, franchiseId);
    if (!franchise.ok) return franchise;
    if (franchise.value === null) continue;
    if (!isFranchise(franchise.value) || franchise.value.id !== franchiseId) return failResult(new Error(`Saved team ${franchiseId} could not be read`));
    if (franchise.value.leagueId !== undefined) continue;
    const roster = await db.get<unknown>(ROSTER_COLLECTION, franchiseId);
    if (!roster.ok) return roster;
    if (roster.value === null) continue;
    if (!isRoster(roster.value) || roster.value.franchiseId !== franchiseId) return failResult(new Error(`Saved roster ${franchiseId} could not be read`));
    out.push({ franchiseId, identity: latestIdentity(franchise.value.identities), players: roster.value.players, leftSeason });
  }
  return ok(out.sort((a, b) => b.leftSeason - a.leftSeason || (a.franchiseId < b.franchiseId ? -1 : 1)));
}

/** Saves the plan with its former teams replaced. Who takes part changed, so every later result is dropped. */
async function writeFormer(db: Database, plan: OffseasonPlan, formerTeams: StagedFormerTeam[]): Promise<PlanResult> {
  const next: OffseasonPlan = { ...plan, formerTeams };
  if (formerTeams.length === 0) delete next.formerTeams;
  delete next.teamChanges;
  delete next.freeAgentPicks;
  return putClearingDraft(db, next);
}

/** Stages an unassigned former team to fill an open place; its ratings follow the program specs for the team it replaces: replacing a promoted team raises them, replacing a demoted team lowers them. */
export const addFormerTeam = (db: Database, league: League, franchiseId: string, vacancy: StagedFormerTeam['vacancy'], options: { rng?: Rng } = {}) =>
  acceptQueue(() => addNow(db, league, franchiseId, vacancy, options.rng ?? Math.random));

async function addNow(db: Database, league: League, franchiseId: string, vacancy: StagedFormerTeam['vacancy'], rng: Rng): Promise<PlanResult> {
  const loaded = await loadForNewTeams(db, league);
  if (!loaded.ok) return loaded;
  const staged = loaded.plan.formerTeams ?? [];
  if (openVacancies(loaded.plan, loaded.links)[vacancy] <= 0) return fail({ kind: 'no-vacancy' });
  const candidates = await listFormerTeams(db, league, staged);
  if (!candidates.ok) return storage(candidates.error);
  const team = candidates.value.find((c) => c.franchiseId === franchiseId);
  if (team === undefined) return fail({ kind: 'not-former' });

  const franchises = await db.list<unknown>(FRANCHISE_COLLECTION);
  if (!franchises.ok) return storage(franchises.error);
  const wanted = norm(team.identity.name);
  const usedByTeam = franchises.value.some(({ value }) => {
    if (!isFranchise(value) || value.leagueId === undefined || !loaded.chain.includes(value.leagueId)) return false;
    return norm((identityForSeason(value, loaded.season.index) ?? value.identities[0]).name) === wanted;
  });
  const usedByStaged =
    loaded.staged.teams.some(({ leagueId, team: t }) => loaded.chain.includes(leagueId) && norm(t.name) === wanted) || staged.some((f) => norm(f.identity.name) === wanted);
  if (usedByTeam || usedByStaged) return fail({ kind: 'validation', fields: { name: DUPLICATE_NAME } });

  const players = limitTeamStars(adjustRoster(team.players, vacancy, rng));
  return writeFormer(db, loaded.plan, [...staged, { franchiseId, vacancy, identity: team.identity, players }]);
}

/** Removes a staged former team, freeing its place. */
export const removeFormerTeam = (db: Database, league: League, franchiseId: string) => acceptQueue(() => removeNow(db, league, franchiseId));

async function removeNow(db: Database, league: League, franchiseId: string): Promise<PlanResult> {
  const loaded = await loadForNewTeams(db, league);
  if (!loaded.ok) return loaded;
  const staged = loaded.plan.formerTeams ?? [];
  if (!staged.some((f) => f.franchiseId === franchiseId)) return fail({ kind: 'not-found' });
  return writeFormer(db, loaded.plan, staged.filter((f) => f.franchiseId !== franchiseId));
}
