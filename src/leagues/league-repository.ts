import { LEAGUE_COLLECTION, createLeagueId, isLeague, validateLeagueInput, type FieldErrors, type League, type LeagueInput } from './league';
import { leagueAbove, leagueBelow, linkedEditProblems } from './league-links';
import type { Database, Op } from '@/storage/types';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { FRANCHISE_COLLECTION } from '@/teams/franchise-repository';

const COLLECTION = LEAGUE_COLLECTION;

export type LeagueError =
  | { kind: 'validation'; fields: FieldErrors }
  | { kind: 'not-found' }
  | { kind: 'storage'; error: Error };

export type LeagueResult<T> = { ok: true; value: T } | { ok: false; error: LeagueError };

const done = <T>(value: T): LeagueResult<T> => ({ ok: true, value });
const storage = (error: Error): LeagueResult<never> => ({ ok: false, error: { kind: 'storage', error } });

function byName(a: League, b: League): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function listLeagues(
  db: Database,
): Promise<LeagueResult<{ leagues: League[]; unreadable: number }>> {
  const stored = await db.list<unknown>(COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const leagues: League[] = [];
  let unreadable = 0;
  for (const { id, value } of stored.value) {
    if (isLeague(value) && value.id === id) leagues.push(value);
    else unreadable += 1;
  }
  return done({ leagues: leagues.sort(byName), unreadable });
}

export async function getLeague(db: Database, id: string): Promise<LeagueResult<League | null>> {
  const stored = await db.get<unknown>(COLLECTION, id);
  if (!stored.ok) return storage(stored.error);
  if (stored.value === null) return done(null);
  if (!isLeague(stored.value) || stored.value.id !== id) {
    return storage(new Error(`Saved league ${id} could not be read`));
  }
  return done(stored.value);
}

export async function createLeague(
  db: Database,
  input: LeagueInput,
  newId: () => string = createLeagueId,
): Promise<LeagueResult<League>> {
  const checked = validateLeagueInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const league: League = { id: newId(), ...checked.value };
  const written = await db.batch([{ type: 'put', collection: COLLECTION, id: league.id, value: league }]);
  return written.ok ? done(league) : storage(written.error);
}

export async function updateLeague(
  db: Database,
  id: string,
  input: LeagueInput,
): Promise<LeagueResult<League>> {
  const checked = validateLeagueInput(input);
  if (!checked.ok) return { ok: false, error: { kind: 'validation', fields: checked.fields } };
  const existing = await getLeague(db, id);
  if (!existing.ok) return existing;
  if (existing.value === null) return { ok: false, error: { kind: 'not-found' } };
  const links: Pick<League, 'leagueAboveId' | 'leagueBelowId'> = {};
  if (existing.value.leagueAboveId) links.leagueAboveId = existing.value.leagueAboveId;
  if (existing.value.leagueBelowId) links.leagueBelowId = existing.value.leagueBelowId;
  if (links.leagueAboveId || links.leagueBelowId) {
    const all = await listLeagues(db);
    if (!all.ok) return all;
    const draft: League = { id, ...checked.value, ...links };
    const fields = linkedEditProblems(
      draft,
      leagueAbove(existing.value, all.value.leagues),
      leagueBelow(existing.value, all.value.leagues),
    );
    if (Object.keys(fields).length > 0) return { ok: false, error: { kind: 'validation', fields } };
  }
  const stored = await db.list<{ leagueId?: unknown }>(FRANCHISE_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const teamCount = stored.value.filter((doc) => doc.value?.leagueId === id).length;
  if (checked.value.size < teamCount) {
    const noun = teamCount === 1 ? 'team' : 'teams';
    return {
      ok: false,
      error: { kind: 'validation', fields: { size: `This league has ${teamCount} ${noun}. Remove teams first or choose ${teamCount} or more.` } },
    };
  }
  const league: League = { id, ...checked.value, ...links };
  const written = await db.batch([{ type: 'put', collection: COLLECTION, id, value: league }]);
  return written.ok ? done(league) : storage(written.error);
}

export async function deleteLeague(db: Database, id: string): Promise<LeagueResult<void>> {
  const stored = await db.list<{ leagueId?: unknown }>(FRANCHISE_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const teamDocs = stored.value.filter((doc) => doc.value?.leagueId === id);
  const teamOps = teamDocs.flatMap((doc): Op[] => [
    { type: 'delete', collection: ROSTER_COLLECTION, id: doc.id },
    { type: 'delete', collection: FRANCHISE_COLLECTION, id: doc.id },
  ]);
  const all = await listLeagues(db);
  if (!all.ok) return all;
  const unlinkOps = all.value.leagues
    .filter((l) => l.leagueAboveId === id || l.leagueBelowId === id)
    .map((l): Op => {
      const { leagueAboveId, leagueBelowId, ...rest } = l;
      return {
        type: 'put',
        collection: COLLECTION,
        id: l.id,
        value: {
          ...rest,
          ...(leagueAboveId && leagueAboveId !== id ? { leagueAboveId } : {}),
          ...(leagueBelowId && leagueBelowId !== id ? { leagueBelowId } : {}),
        },
      };
    });
  const removed = await db.batch([...teamOps, ...unlinkOps, { type: 'delete', collection: COLLECTION, id }]);
  return removed.ok ? done(undefined) : storage(removed.error);
}
