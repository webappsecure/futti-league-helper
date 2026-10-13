import type { League } from '@/leagues/league';
import { burnNames, NAME_REGISTRY_COLLECTION } from '@/names/name-registry';
import { createMemoryDatabase } from '@/storage/memory-database';
import { createFranchise, deleteFranchise } from '@/teams/franchise-repository';
import { deleteLeague } from '@/leagues/league-repository';
import { LEAGUE_COLLECTION } from '@/leagues/league';
import { ROSTER_COLLECTION, isRoster, type Roster } from './roster';
import {
  generateLeagueRosters,
  listRosters,
  rerollLeague,
  rerollPlayer,
  rerollTeam,
} from './roster-repository';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: false, promotedCount: 0, demotedCount: 0 };
const other: League = { ...league, id: 'L2', name: 'Second' };

let counter = 0;
const nextId = () => `f-${++counter}`;

async function setup() {
  const db = createMemoryDatabase();
  await db.batch([
    { type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league },
    { type: 'put', collection: LEAGUE_COLLECTION, id: other.id, value: other },
  ]);
  return db;
}

async function addTeam(db: Awaited<ReturnType<typeof setup>>, l: League, name: string) {
  const r = await createFranchise(
    db,
    l,
    { city: 'City', name, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
    nextId,
  );
  if (!r.ok) throw new Error('team');
  return r.value;
}

const allNames = (rosters: Roster[]) => rosters.flatMap((r) => r.players.map((p) => p.name));

describe('generateLeagueRosters', () => {
  it('fails with no-teams for an empty league', async () => {
    const db = await setup();
    const r = await generateLeagueRosters(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'no-teams' } });
  });

  it('generates for teams without a roster and leaves existing ones alone', async () => {
    const db = await setup();
    const a = await addTeam(db, league, 'A');
    const first = await generateLeagueRosters(db, league);
    expect(first.ok && first.value.length).toBe(1);
    const before = await listRosters(db, league);
    await addTeam(db, league, 'B');
    const second = await generateLeagueRosters(db, league);
    expect(second.ok && second.value.map((r) => r.franchiseId)).not.toContain(a.id);
    const after = await listRosters(db, league);
    if (!before.ok || !after.ok) throw new Error('list');
    expect(after.value.rosters).toHaveLength(2);
    expect(after.value.rosters.find((r) => r.franchiseId === a.id)).toEqual(
      before.value.rosters.find((r) => r.franchiseId === a.id),
    );
    expect(after.value.rosters.every(isRoster)).toBe(true);
  });

  it('never repeats a name across teams, leagues or burned names', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    await addTeam(db, league, 'B');
    await addTeam(db, other, 'C');
    const pool = Array.from({ length: 40 }, (_, i) => `N${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'X' : ''}`);
    await burnNames(db, pool.slice(0, 10));
    await generateLeagueRosters(db, league, { pool });
    await generateLeagueRosters(db, other, { pool });
    const a = await listRosters(db, league);
    const b = await listRosters(db, other);
    if (!a.ok || !b.ok) throw new Error('list');
    const names = allNames([...a.value.rosters, ...b.value.rosters]);
    expect(names).toHaveLength(24);
    expect(new Set(names).size).toBe(24);
    expect(names.some((n) => pool.slice(0, 10).includes(n))).toBe(false);
  });

  it('returns no-names and writes nothing when the pool runs out', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    const r = await generateLeagueRosters(db, league, { pool: ['ONE', 'TWO'] });
    expect(r).toEqual({ ok: false, error: { kind: 'no-names' } });
    const listed = await listRosters(db, league);
    expect(listed.ok && listed.value.rosters).toEqual([]);
  });

  it('returns a storage error and writes nothing when the burned registry is damaged', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    await db.batch([{ type: 'put', collection: NAME_REGISTRY_COLLECTION, id: 'burned', value: { names: 5 } }]);
    const r = await generateLeagueRosters(db, league);
    expect(r.ok === false && r.error.kind).toBe('storage');
    const listed = await listRosters(db, league);
    expect(listed.ok && listed.value.rosters).toEqual([]);
  });
});

describe('rerolls', () => {
  it('rerolls one player in place and nothing else', async () => {
    const db = await setup();
    const a = await addTeam(db, league, 'A');
    const b = await addTeam(db, league, 'B');
    await generateLeagueRosters(db, league);
    const before = await listRosters(db, league);
    if (!before.ok) throw new Error('list');
    const ra = before.value.rosters.find((r) => r.franchiseId === a.id)!;
    const result = await rerollPlayer(db, league, a.id, ra.players[2].id);
    if (!result.ok) throw new Error('reroll');
    expect(result.value.players[2].id).not.toBe(ra.players[2].id);
    expect(result.value.players.filter((_, i) => i !== 2)).toEqual(ra.players.filter((_, i) => i !== 2));
    const after = await listRosters(db, league);
    if (!after.ok) throw new Error('list');
    expect(after.value.rosters.find((r) => r.franchiseId === b.id)).toEqual(
      before.value.rosters.find((r) => r.franchiseId === b.id),
    );
  });

  it('reports not-found for an unknown player or team', async () => {
    const db = await setup();
    const a = await addTeam(db, league, 'A');
    await generateLeagueRosters(db, league);
    expect(await rerollPlayer(db, league, a.id, 'nope')).toEqual({ ok: false, error: { kind: 'not-found' } });
    expect(await rerollTeam(db, league, 'nope')).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('rerolls a team without touching other teams', async () => {
    const db = await setup();
    const a = await addTeam(db, league, 'A');
    const b = await addTeam(db, league, 'B');
    await generateLeagueRosters(db, league);
    const before = await listRosters(db, league);
    if (!before.ok) throw new Error('list');
    const result = await rerollTeam(db, league, a.id);
    if (!result.ok) throw new Error('reroll');
    const old = before.value.rosters.find((r) => r.franchiseId === a.id)!;
    expect(result.value.players.map((p) => p.id)).not.toEqual(old.players.map((p) => p.id));
    const after = await listRosters(db, league);
    if (!after.ok) throw new Error('list');
    expect(after.value.rosters.find((r) => r.franchiseId === b.id)).toEqual(
      before.value.rosters.find((r) => r.franchiseId === b.id),
    );
  });

  it('rerolls every roster in the league but not other leagues', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    await addTeam(db, league, 'B');
    await addTeam(db, other, 'C');
    await generateLeagueRosters(db, league);
    await generateLeagueRosters(db, other);
    const before = await listRosters(db, league);
    const otherBefore = await listRosters(db, other);
    const result = await rerollLeague(db, league);
    if (!before.ok || !otherBefore.ok || !result.ok) throw new Error('reroll');
    expect(result.value).toHaveLength(2);
    const oldIds = new Set(before.value.rosters.flatMap((r) => r.players.map((p) => p.id)));
    expect(result.value.flatMap((r) => r.players).every((p) => !oldIds.has(p.id))).toBe(true);
    const otherAfter = await listRosters(db, other);
    expect(otherAfter.ok && otherAfter.value.rosters).toEqual(otherBefore.value.rosters);
  });

  it('rerollLeague reports not-found when no roster exists', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    expect(await rerollLeague(db, league)).toEqual({ ok: false, error: { kind: 'not-found' } });
  });
});

describe('cascade deletes', () => {
  it('deleting a team removes its roster', async () => {
    const db = await setup();
    const a = await addTeam(db, league, 'A');
    await generateLeagueRosters(db, league);
    await deleteFranchise(db, a.id);
    const stored = await db.list(ROSTER_COLLECTION);
    expect(stored.ok && stored.value).toEqual([]);
  });

  it('deleting a league removes its rosters only', async () => {
    const db = await setup();
    await addTeam(db, league, 'A');
    const c = await addTeam(db, other, 'C');
    await generateLeagueRosters(db, league);
    await generateLeagueRosters(db, other);
    const r = await deleteLeague(db, league.id);
    expect(r.ok).toBe(true);
    const stored = await db.list(ROSTER_COLLECTION);
    expect(stored.ok && stored.value.map((d) => d.id)).toEqual([c.id]);
  });
});
