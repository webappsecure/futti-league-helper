import type { League } from '@/leagues/league';
import { NAME_POOL } from '@/names/name-pool';
import { getBurnedNames } from '@/names/name-registry';
import { pickRandomName } from '@/names/pick-name';
import type { Rng } from '@/rules/dice';
import { getLeagueSeason } from '@/seasons/season-repository';
import type { Database, Op } from '@/storage/types';
import type { Franchise } from '@/teams/franchise';
import { listFranchises } from '@/teams/franchise-repository';
import {
  generateRoster,
  isRoster,
  NamesExhaustedError,
  rerollPlayer as rerollRosterPlayer,
  ROSTER_COLLECTION,
  type PickName,
  type Roster,
} from './roster';

export type RosterError =
  | { kind: 'no-teams' }
  | { kind: 'not-found' }
  | { kind: 'no-names' }
  | { kind: 'locked' }
  | { kind: 'storage'; error: Error };

export type RosterResult<T> = { ok: true; value: T } | { ok: false; error: RosterError };

const done = <T>(value: T): RosterResult<T> => ({ ok: true, value });
const fail = (error: RosterError): RosterResult<never> => ({ ok: false, error });
const storage = (error: Error): RosterResult<never> => fail({ kind: 'storage', error });

/** `locked` once the league has a season; a failed lookup is a storage error, never "unlocked". */
async function lockFailure(db: Database, league: League): Promise<RosterResult<never> | null> {
  const season = await getLeagueSeason(db, league.id);
  if (!season.ok) return storage(season.error);
  return season.value === null ? null : fail({ kind: 'locked' });
}

interface Options {
  rng?: Rng;
  pool?: readonly string[];
}

export async function listRosters(
  db: Database,
  league: League,
): Promise<RosterResult<{ rosters: Roster[]; unreadable: number }>> {
  const stored = await db.list<unknown>(ROSTER_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const rosters: Roster[] = [];
  let unreadable = 0;
  for (const { id, value } of stored.value) {
    if (isRoster(value) && value.franchiseId === id) {
      if (value.leagueId === league.id) rosters.push(value);
    } else if (
      typeof value === 'object' &&
      value !== null &&
      (value as { leagueId?: unknown }).leagueId === league.id
    ) {
      unreadable += 1;
    }
  }
  return done({ rosters, unreadable });
}

/** Names that cannot be handed out: burned, or already on a stored roster other than the ones being replaced. */
async function unavailableNames(
  db: Database,
  keep: (roster: Roster) => string[],
): Promise<RosterResult<Set<string>>> {
  const burned = await getBurnedNames(db);
  if (!burned.ok) return storage(burned.error);
  const stored = await db.list<unknown>(ROSTER_COLLECTION);
  if (!stored.ok) return storage(stored.error);
  const names = new Set(burned.value);
  for (const { value } of stored.value) {
    if (isRoster(value)) for (const name of keep(value)) names.add(name);
  }
  return done(names);
}

/** A name picker that reserves each name it hands out, so one batch never repeats a name. */
function namePicker(unavailable: Set<string>, rng: Rng, pool: readonly string[]): PickName {
  return () => {
    const name = pickRandomName(pool, unavailable, rng);
    if (name === null) throw new NamesExhaustedError();
    unavailable.add(name);
    return name;
  };
}

/** Runs a roster build, mapping pool exhaustion to `no-names`; anything else is unexpected and propagates. */
function build<T>(make: () => T): RosterResult<T> {
  try {
    return done(make());
  } catch (e) {
    if (e instanceof NamesExhaustedError) return fail({ kind: 'no-names' });
    throw e;
  }
}

async function write(db: Database, rosters: Roster[]): Promise<RosterResult<Roster[]>> {
  const ops: Op[] = rosters.map((r) => ({ type: 'put', collection: ROSTER_COLLECTION, id: r.franchiseId, value: r }));
  const written = await db.batch(ops);
  return written.ok ? done(rosters) : storage(written.error);
}

/** Generates rosters for the league's teams that have none; existing rosters are untouched. */
export async function generateLeagueRosters(
  db: Database,
  league: League,
  { rng = Math.random, pool = NAME_POOL }: Options = {},
): Promise<RosterResult<Roster[]>> {
  const locked = await lockFailure(db, league);
  if (locked) return locked;
  const teams = await listFranchises(db, league);
  if (!teams.ok) return teams.error.kind === 'storage' ? storage(teams.error.error) : fail({ kind: 'no-teams' });
  if (teams.value.teams.length === 0) return fail({ kind: 'no-teams' });
  const have = await listRosters(db, league);
  if (!have.ok) return have;
  const existing = new Set(have.value.rosters.map((r) => r.franchiseId));
  const missing = teams.value.teams.filter((t) => !existing.has(t.id));
  if (missing.length === 0) return done([]);
  const used = await unavailableNames(db, (r) => r.players.map((p) => p.name));
  if (!used.ok) return used;
  const pick = namePicker(used.value, rng, pool);
  const made = build(() => missing.map((t) => generateRoster(t.id, league.id, t.initialGrade, rng, pick)));
  if (!made.ok) return made;
  return write(db, made.value);
}

/** Rerolls every roster in the league, replacing each team's players. */
export async function rerollLeague(
  db: Database,
  league: League,
  { rng = Math.random, pool = NAME_POOL }: Options = {},
): Promise<RosterResult<Roster[]>> {
  const locked = await lockFailure(db, league);
  if (locked) return locked;
  const teams = await listFranchises(db, league);
  if (!teams.ok) return teams.error.kind === 'storage' ? storage(teams.error.error) : fail({ kind: 'no-teams' });
  const have = await listRosters(db, league);
  if (!have.ok) return have;
  const targets = teams.value.teams.filter((t) => have.value.rosters.some((r) => r.franchiseId === t.id));
  if (targets.length === 0) return fail({ kind: 'not-found' });
  const replaced = new Set(targets.map((t) => t.id));
  const used = await unavailableNames(db, (r) => (replaced.has(r.franchiseId) ? [] : r.players.map((p) => p.name)));
  if (!used.ok) return used;
  const pick = namePicker(used.value, rng, pool);
  const made = build(() => targets.map((t) => generateRoster(t.id, league.id, t.initialGrade, rng, pick)));
  if (!made.ok) return made;
  return write(db, made.value);
}

async function loadTeam(
  db: Database,
  league: League,
  franchiseId: string,
): Promise<RosterResult<{ team: Franchise; roster: Roster }>> {
  const teams = await listFranchises(db, league);
  if (!teams.ok) return teams.error.kind === 'storage' ? storage(teams.error.error) : fail({ kind: 'not-found' });
  const team = teams.value.teams.find((t) => t.id === franchiseId);
  if (!team) return fail({ kind: 'not-found' });
  const have = await listRosters(db, league);
  if (!have.ok) return have;
  const roster = have.value.rosters.find((r) => r.franchiseId === franchiseId);
  if (!roster) return fail({ kind: 'not-found' });
  return done({ team, roster });
}

/** Rerolls one team's whole roster. */
export async function rerollTeam(
  db: Database,
  league: League,
  franchiseId: string,
  { rng = Math.random, pool = NAME_POOL }: Options = {},
): Promise<RosterResult<Roster>> {
  const locked = await lockFailure(db, league);
  if (locked) return locked;
  const loaded = await loadTeam(db, league, franchiseId);
  if (!loaded.ok) return loaded;
  const used = await unavailableNames(db, (r) => (r.franchiseId === franchiseId ? [] : r.players.map((p) => p.name)));
  if (!used.ok) return used;
  const pick = namePicker(used.value, rng, pool);
  const made = build(() => generateRoster(franchiseId, league.id, loaded.value.team.initialGrade, rng, pick));
  if (!made.ok) return made;
  const written = await write(db, [made.value]);
  return written.ok ? done(made.value) : written;
}

/** Rerolls one player in place. */
export async function rerollPlayer(
  db: Database,
  league: League,
  franchiseId: string,
  playerId: string,
  { rng = Math.random, pool = NAME_POOL }: Options = {},
): Promise<RosterResult<Roster>> {
  const locked = await lockFailure(db, league);
  if (locked) return locked;
  const loaded = await loadTeam(db, league, franchiseId);
  if (!loaded.ok) return loaded;
  const { team, roster } = loaded.value;
  const old = roster.players.find((p) => p.id === playerId);
  if (!old) return fail({ kind: 'not-found' });
  const used = await unavailableNames(db, (r) =>
    r.players.filter((p) => !(r.franchiseId === franchiseId && p.id === playerId)).map((p) => p.name),
  );
  if (!used.ok) return used;
  const pick = namePicker(used.value, rng, pool);
  const made = build(() => rerollRosterPlayer(roster, playerId, team.initialGrade, rng, pick));
  if (!made.ok) return made;
  const written = await write(db, [made.value as Roster]);
  return written.ok ? done(made.value as Roster) : written;
}
