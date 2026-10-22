import { createId } from '@/leagues/ids';
import { LEAGUE_COLLECTION, isLeague, type League } from '@/leagues/league';
import { chainLeagueIds } from '@/leagues/league-links';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { getLeagueSeason } from '@/seasons/season-repository';
import { acceptQueue } from '@/seasons/accept-queue';
import type { Database } from '@/storage/types';
import {
  displayName,
  findDuplicateName,
  isFranchise,
  validateFranchiseInput,
  type Franchise,
  type FranchiseFieldErrors,
  type FranchiseInput,
} from './franchise';

export const FRANCHISE_COLLECTION = 'franchises';

export type FranchiseError =
  | { kind: 'validation'; fields: FranchiseFieldErrors }
  | { kind: 'full' }
  | { kind: 'locked' }
  | { kind: 'not-found' }
  | { kind: 'storage'; error: Error };

export type FranchiseResult<T> = { ok: true; value: T } | { ok: false; error: FranchiseError };

const done = <T>(value: T): FranchiseResult<T> => ({ ok: true, value });
const storage = (error: Error): FranchiseResult<never> => ({ ok: false, error: { kind: 'storage', error } });
/** `locked` once the league has an accepted season; a failed lookup is a storage error, never "unlocked". */
async function lockFailure(db: Database, leagueId: string): Promise<FranchiseResult<never> | null> {
  const season = await getLeagueSeason(db, leagueId);
  if (!season.ok) return storage(season.error);
  return season.value === null ? null : { ok: false, error: { kind: 'locked' } };
}

const DUPLICATE = 'A team with this name already exists in this league.';
const DUPLICATE_LINKED = 'A team with this name already exists in this league or a linked league.';

/** Teams in every league of this league's linked chain (just this league's when unlinked). */
async function listChainTeams(
  db: Database,
  league: League,
): Promise<FranchiseResult<{ teams: Franchise[]; linked: boolean }>> {
  const leagues = await db.list<unknown>(LEAGUE_COLLECTION);
  if (!leagues.ok) return storage(leagues.error);
  const known = leagues.value.map((doc) => doc.value).filter(isLeague);
  const current = known.find((l) => l.id === league.id) ?? league;
  const ids = chainLeagueIds(current, known);
  const stored = await db.list<unknown>(FRANCHISE_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const teams = stored.value.map((doc) => doc.value).filter(isFranchise).filter((t) => t.leagueId !== undefined && ids.includes(t.leagueId));
  return done({ teams, linked: ids.length > 1 });
}

/** The field error for a team name already used in this league's chain, null when free, or a storage failure. */
async function chainDuplicateError(
  db: Database,
  league: League,
  name: string,
  exceptId?: string,
): Promise<FranchiseResult<FranchiseFieldErrors | null>> {
  const chain = await listChainTeams(db, league);
  if (!chain.ok) return chain;
  if (!findDuplicateName(chain.value.teams, name, exceptId)) return done(null);
  return done({ name: chain.value.linked ? DUPLICATE_LINKED : DUPLICATE });
}

export async function listFranchises(
  db: Database,
  league: League,
): Promise<FranchiseResult<{ teams: Franchise[]; unreadable: number }>> {
  const stored = await db.list<unknown>(FRANCHISE_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const teams: Franchise[] = [];
  let unreadable = 0;
  for (const { id, value } of stored.value) {
    if (isFranchise(value) && value.id === id) {
      if (value.leagueId === league.id) teams.push(value);
    } else if (
      typeof value === 'object' &&
      value !== null &&
      (value as { leagueId?: unknown }).leagueId === league.id
    ) {
      unreadable += 1;
    }
  }
  const label = (t: Franchise) => displayName(t.identities[0], league.namingStyle).toLowerCase();
  teams.sort((a, b) => (label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : a.id < b.id ? -1 : 1));
  return done({ teams, unreadable });
}

async function createFranchiseNow(
  db: Database,
  league: League,
  input: FranchiseInput,
  newId: () => string = createId,
): Promise<FranchiseResult<Franchise>> {
  const locked = await lockFailure(db, league.id);
  if (locked) return locked;
  const checked = validateFranchiseInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const listed = await listFranchises(db, league);
  if (!listed.ok) return listed;
  if (listed.value.teams.length >= league.size) return { ok: false, error: { kind: 'full' } };
  const duplicate = await chainDuplicateError(db, league, checked.value.identity.name);
  if (!duplicate.ok) return duplicate;
  if (duplicate.value) return { ok: false, error: { kind: 'validation', fields: duplicate.value } };
  const franchise: Franchise = {
    id: newId(),
    leagueId: league.id,
    initialGrade: checked.value.initialGrade,
    identities: [checked.value.identity],
  };
  const written = await db.batch([
    { type: 'put', collection: FRANCHISE_COLLECTION, id: franchise.id, value: franchise },
  ]);
  return written.ok ? done(franchise) : storage(written.error);
}

async function updateFranchiseNow(
  db: Database,
  league: League,
  id: string,
  input: FranchiseInput,
): Promise<FranchiseResult<Franchise>> {
  const locked = await lockFailure(db, league.id);
  if (locked) return locked;
  const checked = validateFranchiseInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const listed = await listFranchises(db, league);
  if (!listed.ok) return listed;
  const existing = listed.value.teams.find((t) => t.id === id);
  if (!existing) return { ok: false, error: { kind: 'not-found' } };
  const duplicate = await chainDuplicateError(db, league, checked.value.identity.name, id);
  if (!duplicate.ok) return duplicate;
  if (duplicate.value) return { ok: false, error: { kind: 'validation', fields: duplicate.value } };
  const franchise: Franchise = {
    ...existing,
    initialGrade: checked.value.initialGrade,
    identities: [checked.value.identity, ...existing.identities.slice(1)],
  };
  const written = await db.batch([
    { type: 'put', collection: FRANCHISE_COLLECTION, id, value: franchise },
  ]);
  return written.ok ? done(franchise) : storage(written.error);
}

async function deleteFranchiseNow(db: Database, id: string): Promise<FranchiseResult<void>> {
  const stored = await db.get<unknown>(FRANCHISE_COLLECTION, id);
  if (!stored.ok) return storage(stored.error);
  const leagueId = (stored.value as { leagueId?: unknown } | null)?.leagueId;
  if (typeof leagueId === 'string') {
    const locked = await lockFailure(db, leagueId);
    if (locked) return locked;
  }
  const removed = await db.batch([
    { type: 'delete', collection: ROSTER_COLLECTION, id },
    { type: 'delete', collection: FRANCHISE_COLLECTION, id },
  ]);
  return removed.ok ? done(undefined) : storage(removed.error);
}

// Team writes run one at a time with accept, so a write cannot land between accept's reads and its season write.
export const createFranchise = (...args: Parameters<typeof createFranchiseNow>) =>
  acceptQueue(() => createFranchiseNow(...args));
export const updateFranchise = (...args: Parameters<typeof updateFranchiseNow>) =>
  acceptQueue(() => updateFranchiseNow(...args));
export const deleteFranchise = (...args: Parameters<typeof deleteFranchiseNow>) =>
  acceptQueue(() => deleteFranchiseNow(...args));
