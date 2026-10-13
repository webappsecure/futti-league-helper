import { createId } from '@/leagues/ids';
import type { League } from '@/leagues/league';
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
  | { kind: 'not-found' }
  | { kind: 'storage'; error: Error };

export type FranchiseResult<T> = { ok: true; value: T } | { ok: false; error: FranchiseError };

const done = <T>(value: T): FranchiseResult<T> => ({ ok: true, value });
const storage = (error: Error): FranchiseResult<never> => ({ ok: false, error: { kind: 'storage', error } });
const DUPLICATE = 'A team with this name already exists in this league.';

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

export async function createFranchise(
  db: Database,
  league: League,
  input: FranchiseInput,
  newId: () => string = createId,
): Promise<FranchiseResult<Franchise>> {
  const checked = validateFranchiseInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const listed = await listFranchises(db, league);
  if (!listed.ok) return listed;
  if (listed.value.teams.length >= league.size) return { ok: false, error: { kind: 'full' } };
  if (findDuplicateName(listed.value.teams, checked.value.identity.name)) {
    return { ok: false, error: { kind: 'validation', fields: { name: DUPLICATE } } };
  }
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

export async function updateFranchise(
  db: Database,
  league: League,
  id: string,
  input: FranchiseInput,
): Promise<FranchiseResult<Franchise>> {
  const checked = validateFranchiseInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const listed = await listFranchises(db, league);
  if (!listed.ok) return listed;
  const existing = listed.value.teams.find((t) => t.id === id);
  if (!existing) return { ok: false, error: { kind: 'not-found' } };
  if (findDuplicateName(listed.value.teams, checked.value.identity.name, id)) {
    return { ok: false, error: { kind: 'validation', fields: { name: DUPLICATE } } };
  }
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

export async function deleteFranchise(db: Database, id: string): Promise<FranchiseResult<void>> {
  const removed = await db.batch([{ type: 'delete', collection: FRANCHISE_COLLECTION, id }]);
  return removed.ok ? done(undefined) : storage(removed.error);
}
