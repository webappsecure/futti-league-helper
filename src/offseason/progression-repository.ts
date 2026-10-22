import { createId } from '@/leagues/ids';
import type { League } from '@/leagues/league';
import { NAME_POOL } from '@/names/name-pool';
import { generateDraftGoalie, generateDraftStandard, NamesExhaustedError } from '@/rosters/roster';
import { namePicker } from '@/rosters/roster-repository';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import type { Database } from '@/storage/types';
import type { PlanError, PlanResult } from './offseason-plan-repository';
import { buildProgression } from './progression';
import { load, putRaw } from './roster-changes-repository';
import { draftIsComplete, freeAgencyComplete } from './rookie-draft';
import { unavailableNames } from './rookie-draft-repository';

const fail = (error: PlanError): PlanResult => ({ ok: false, error });

export interface ProgressionOptions {
  rng?: Rng;
  newId?: () => string;
  pool?: readonly string[];
}

/** Rolls progression for every eligible player and stages the results and replacements; running again rerolls everything. */
export const runProgression = (db: Database, league: League, options: ProgressionOptions = {}) => acceptQueue(() => runNow(db, league, options));

async function runNow(db: Database, league: League, options: ProgressionOptions): Promise<PlanResult> {
  const { rng = Math.random, newId = createId, pool = NAME_POOL } = options;
  const loaded = await load(db, league);
  if (!loaded.ok) return loaded;
  const { plan, teams } = loaded;
  if (!freeAgencyComplete(teams, plan)) return fail({ kind: 'free-agency-incomplete' });
  if (plan.draftPool === undefined) return fail({ kind: 'pool-not-generated' });
  if (!draftIsComplete(teams, plan)) return fail({ kind: 'rookie-draft-incomplete' });
  const names = await unavailableNames(db, plan.seasonId, ['progression']);
  if (!names.ok) return fail({ kind: 'storage', error: names.error });
  const pickName = namePicker(names.names, rng, pool);
  try {
    const progression = buildProgression(
      teams,
      plan,
      rng,
      () => generateDraftStandard(rng, pickName, newId),
      () => generateDraftGoalie(rng, pickName, newId),
    );
    return await putRaw(db, { ...plan, progression });
  } catch (e) {
    if (e instanceof NamesExhaustedError) return fail({ kind: 'no-names' });
    throw e;
  }
}
