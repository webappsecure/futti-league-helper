import type { League } from '@/leagues/league';
import { createId } from '@/leagues/ids';
import { NAME_POOL } from '@/names/name-pool';
import { getBurnedNames } from '@/names/name-registry';
import { generateDraftGoalie, generateDraftStandard, isRoster, NamesExhaustedError, ROSTER_COLLECTION, type RosterPlayer } from '@/rosters/roster';
import { namePicker } from '@/rosters/roster-repository';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import type { Database } from '@/storage/types';
import { isOffseasonPlan, OFFSEASON_PLAN_COLLECTION, type OffseasonPlan } from './offseason-plan';
import type { PlanError, PlanResult } from './offseason-plan-repository';
import { load, putRaw } from './roster-changes-repository';
import { freeAgencyComplete, poolSize, rookieDraftOrder, rookieOnTheClock, teamNeeds, validateRookiePick } from './rookie-draft';

const fail = (error: PlanError): PlanResult => ({ ok: false, error });
const storage = (error: Error) => fail({ kind: 'storage', error });

export interface DraftPoolOptions {
  rng?: Rng;
  newId?: () => string;
  pool?: readonly string[];
}

type NameResult = { ok: true; names: Set<string> } | { ok: false; error: Error };

/** Burned names, names on any stored roster, and names on staged new teams or draftees in any saved plan except this league's own pool. */
async function unavailableNames(db: Database, seasonId: string): Promise<NameResult> {
  const burned = await getBurnedNames(db);
  if (!burned.ok) return burned;
  const rosters = await db.list<unknown>(ROSTER_COLLECTION);
  if (!rosters.ok) return rosters;
  const plans = await db.list<unknown>(OFFSEASON_PLAN_COLLECTION);
  if (!plans.ok) return plans;
  const names = new Set(burned.value);
  for (const { value } of rosters.value) if (isRoster(value)) for (const p of value.players) names.add(p.name);
  for (const { id, value } of plans.value) {
    if (!isOffseasonPlan(value) || value.seasonId !== id) return { ok: false, error: new Error(`Saved offseason plan ${id} could not be read`) };
    for (const team of value.newTeams ?? []) for (const p of team.players) names.add(p.name);
    if (id !== seasonId) for (const p of value.draftPool ?? []) names.add(p.name);
  }
  return { ok: true, names };
}

/** Generates (or regenerates) the draft pool from the current needs. Rookie picks must be undone first. */
export const generateDraftPool = (db: Database, league: League, options: DraftPoolOptions = {}) => acceptQueue(() => generateNow(db, league, options));

async function generateNow(db: Database, league: League, options: DraftPoolOptions): Promise<PlanResult> {
  const { rng = Math.random, newId = createId, pool = NAME_POOL } = options;
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const { plan, teams } = loaded;
  if (!freeAgencyComplete(teams, plan)) return fail({ kind: 'free-agency-incomplete' });
  if ((plan.draftPicks ?? []).length > 0) return fail({ kind: 'picks-exist' });
  const names = await unavailableNames(db, plan.seasonId);
  if (!names.ok) return storage(names.error);
  const size = poolSize(teams.map((t) => teamNeeds(t, teams, plan)));
  const pickName = namePicker(names.names, rng, pool);
  const players: RosterPlayer[] = [];
  try {
    for (let i = 0; i < size.standard; i += 1) players.push(generateDraftStandard(rng, pickName, newId));
    for (let i = 0; i < size.goalies; i += 1) players.push(generateDraftGoalie(rng, pickName, newId));
  } catch (e) {
    if (e instanceof NamesExhaustedError) return fail({ kind: 'no-names' });
    throw e;
  }
  const next: OffseasonPlan = { ...plan, draftPool: players };
  delete next.draftPicks;
  return putRaw(db, next);
}

/** Records a rookie pick for the team on the clock. */
export const makeRookiePick = (db: Database, league: League, playerId: string) => acceptQueue(() => pickNow(db, league, playerId));

async function pickNow(db: Database, league: League, playerId: string): Promise<PlanResult> {
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const { plan, teams } = loaded;
  const order = rookieDraftOrder(loaded.archive, plan, loaded.sourceArchives);
  const clock = rookieOnTheClock(order, teams, plan);
  const checked = validateRookiePick({ order, teams, plan }, clock ?? '', playerId);
  // The pick is always for the team on the clock, so `not-on-the-clock` cannot come back.
  if (!checked.ok) return fail({ kind: checked.error as Exclude<typeof checked.error, 'not-on-the-clock'> });
  return putRaw(db, { ...plan, draftPicks: [...(plan.draftPicks ?? []), { franchiseId: clock!, playerId }] });
}

/** Removes the last rookie pick. */
export const undoRookiePick = (db: Database, league: League) => acceptQueue(() => undoNow(db, league));

async function undoNow(db: Database, league: League): Promise<PlanResult> {
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const picks = loaded.plan.draftPicks ?? [];
  if (picks.length === 0) return fail({ kind: 'no-picks' });
  const next: OffseasonPlan = { ...loaded.plan };
  if (picks.length === 1) delete next.draftPicks;
  else next.draftPicks = picks.slice(0, -1);
  return putRaw(db, next);
}
