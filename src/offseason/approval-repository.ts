import { createId } from '@/leagues/ids';
import type { League } from '@/leagues/league';
import { chainLeagueIds } from '@/leagues/league-links';
import { listLeagues } from '@/leagues/league-repository';
import { burnNamesOp, getBurnedNames } from '@/names/name-registry';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { acceptQueue } from '@/seasons/accept-queue';
import { SEASON_COLLECTION } from '@/seasons/season';
import { getSeasonArchive } from '@/seasons/season-archive-repository';
import { getLeagueSeason } from '@/seasons/season-repository';
import type { Database, Op } from '@/storage/types';
import { isFranchise, type Franchise } from '@/teams/franchise';
import { FRANCHISE_COLLECTION, listFranchises } from '@/teams/franchise-repository';
import { approvalErrorText, buildApproval, type Approval, type ApprovalError, type ChainLeague } from './approval';
import { OFFSEASON_PLAN_COLLECTION } from './offseason-plan';
import { getArrivalStatus, getOffseasonPlan } from './offseason-plan-repository';
import { participatingTeams } from './roster-changes';
import { STEP_INFO, stepStatuses, WIZARD_STEPS } from './wizard';

/** Why one league of the chain cannot be approved yet. */
export interface ApprovalProblem {
  leagueId: string;
  leagueName: string;
  text: string;
}

export type ApprovalFailure =
  | { kind: 'not-ready'; problems: ApprovalProblem[] }
  | { kind: 'burned-names'; names: string[] }
  | { kind: 'inconsistent'; error: ApprovalError }
  | { kind: 'storage'; error: Error };

export interface PreparedApproval {
  /** The leagues that are approved together, this one first. */
  leagues: League[];
  approval: Approval;
}

export type PrepareResult = { ok: true; value: PreparedApproval } | { ok: false; error: ApprovalFailure };

const fail = (error: ApprovalFailure): PrepareResult => ({ ok: false, error });
const storage = (error: Error): PrepareResult => fail({ kind: 'storage', error });

type Loaded<T> = { ok: true; value: T } | { ok: false; error: Error };

/** Every league linked to `league` (itself included), or a read failure. */
async function loadChain(db: Database, league: League): Promise<Loaded<League[]>> {
  const all = await listLeagues(db);
  if (!all.ok) return { ok: false, error: all.error.kind === 'storage' ? all.error.error : new Error('Could not read leagues') };
  if (all.value.unreadable > 0) return { ok: false, error: new Error('A saved league could not be read') };
  const current = all.value.leagues.find((l) => l.id === league.id) ?? league;
  const ids = chainLeagueIds(current, all.value.leagues);
  return { ok: true, value: [current, ...all.value.leagues.filter((l) => l.id !== current.id && ids.includes(l.id))] };
}

/** Loads one league's offseason state, or the problem that stops it. Read failures come back as errors. */
async function loadLeague(db: Database, league: League): Promise<Loaded<{ ready: ChainLeague } | { problem: string }>> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return found;
  const season = found.value;
  if (season === null) return { ok: true, value: { problem: 'has not been accepted yet.' } };
  if (season.status !== 'offseason') return { ok: true, value: { problem: 'has not ended its season yet.' } };
  const archive = await getSeasonArchive(db, season.id);
  if (!archive.ok) return archive;
  if (archive.value === null) return { ok: true, value: { problem: 'has no saved season results.' } };
  const plan = await getOffseasonPlan(db, season.id);
  if (!plan.ok) return plan;
  if (plan.value === null) return { ok: true, value: { problem: 'has not saved its plan yet.' } };
  const arrivals = await getArrivalStatus(db, league);
  if (!arrivals.ok) return arrivals;
  const teams = participatingTeams(archive.value, plan.value);
  const statuses = stepStatuses({ plan: plan.value, teams, arrivals: arrivals.value });
  const open = WIZARD_STEPS.find((step) => step !== 'approval' && statuses[step] === 'incomplete');
  if (open !== undefined) return { ok: true, value: { problem: `has not finished the ${STEP_INFO[open].title.toLowerCase()} step.` } };
  return { ok: true, value: { ready: { league, season, archive: archive.value, plan: plan.value, teams } } };
}

/** Everything approving `league` would write, or what is in the way. Reads only. */
export async function prepareApproval(db: Database, league: League, newId: () => string = createId): Promise<PrepareResult> {
  const chain = await loadChain(db, league);
  if (!chain.ok) return storage(chain.error);
  const ready: ChainLeague[] = [];
  const problems: ApprovalProblem[] = [];
  for (const member of chain.value) {
    const loaded = await loadLeague(db, member);
    if (!loaded.ok) return storage(loaded.error);
    if ('ready' in loaded.value) ready.push(loaded.value.ready);
    else problems.push({ leagueId: member.id, leagueName: member.name, text: `${member.name} ${loaded.value.problem}` });
  }
  if (problems.length > 0) return fail({ kind: 'not-ready', problems });

  const franchises: Franchise[] = [];
  for (const member of chain.value) {
    const listed = await listFranchises(db, member);
    if (!listed.ok) return storage(listed.error.kind === 'storage' ? listed.error.error : new Error('Could not read teams'));
    if (listed.value.unreadable > 0) return storage(new Error('A saved team could not be read'));
    franchises.push(...listed.value.teams);
  }
  // Returning former teams have no league yet, so they are not in the chain's lists.
  for (const { plan } of ready) {
    for (const { franchiseId } of plan.formerTeams ?? []) {
      const stored = await db.get<unknown>(FRANCHISE_COLLECTION, franchiseId);
      if (!stored.ok) return storage(stored.error);
      if (stored.value !== null && !isFranchise(stored.value)) return storage(new Error(`Saved team ${franchiseId} could not be read`));
      if (stored.value !== null) franchises.push(stored.value);
    }
  }
  const built = buildApproval({ leagues: ready, franchises, newId });
  if (!built.ok) return fail({ kind: 'inconsistent', error: built.error });

  const burned = await getBurnedNames(db);
  if (!burned.ok) return storage(burned.error);
  const clashes = [...new Set(built.value.newNames.filter((name) => burned.value.has(name)))];
  if (clashes.length > 0) return fail({ kind: 'burned-names', names: clashes });
  return { ok: true, value: { leagues: chain.value, approval: built.value } };
}

const putOps = (collection: string, docs: { id: string; value: unknown }[]): Op[] => docs.map(({ id, value }) => ({ type: 'put', collection, id, value }));

/**
 * Approves the offseason of `league` and every league linked to it: closes their seasons, opens the next ones, applies the
 * staged rosters and moves, and burns the new names, all in one batch.
 */
export const approveOffseason = (db: Database, league: League, newId: () => string = createId) => acceptQueue(() => approveNow(db, league, newId));

async function approveNow(db: Database, league: League, newId: () => string): Promise<PrepareResult> {
  const prepared = await prepareApproval(db, league, newId);
  if (!prepared.ok) return prepared;
  const { approval } = prepared.value;
  const burned = await getBurnedNames(db);
  if (!burned.ok) return storage(burned.error);
  const written = await db.batch([
    ...putOps(SEASON_COLLECTION, approval.seasons.map((s) => ({ id: s.id, value: s }))),
    ...putOps(FRANCHISE_COLLECTION, approval.franchises.map((f) => ({ id: f.id, value: f }))),
    ...putOps(ROSTER_COLLECTION, approval.rosters.map((r) => ({ id: r.franchiseId, value: r }))),
    ...putOps(OFFSEASON_PLAN_COLLECTION, approval.plans.map((p) => ({ id: p.seasonId, value: p }))),
    burnNamesOp(burned.value, approval.names),
  ]);
  return written.ok ? prepared : storage(written.error);
}

export function approvalFailureText(error: ApprovalFailure): string {
  switch (error.kind) {
    case 'not-ready':
      return error.problems.map((p) => p.text).join(' ');
    case 'burned-names':
      return `${error.names.length === 1 ? 'A new player name has' : 'Some new player names have'} been burned since it was staged (${error.names.join(', ')}). Redo the draft pool and progression.`;
    case 'inconsistent':
      return approvalErrorText(error.error);
    case 'storage':
      return error.error.message;
  }
}

