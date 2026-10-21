import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason, getSeasonArchive } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, FRANCHISE_COLLECTION, listFranchises } from '@/teams/franchise-repository';
import { addNewTeam, getOffseasonPlan, saveOffseasonPlan, stageArrivals } from './offseason-plan-repository';
import { ageAndRelease, setProtection } from './roster-changes-repository';

const make = (id: string, extra: Partial<League> = {}): League => ({
  id, name: `League ${id}`, size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1, ...extra,
});

let counter = 0;
const nextId = () => `t-${++counter}`;

async function build(db: Database, league: League, end = true) {
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(db, league, { city: 'City', name: `${league.id}-Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' }, nextId);
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, league);
  const a = await acceptLeague(db, league, () => `s-${league.id}`);
  if (!a.ok) throw new Error('accept');
  const teams = await listFranchises(db, league);
  if (!teams.ok) throw new Error('teams');
  const ids = teams.value.teams.map((t) => t.id);
  if (end) await finishSeason(db, league, ids);
  return ids;
}

async function solo() {
  const db = createMemoryDatabase();
  const l = make('S');
  const ids = await build(db, l);
  await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
  return { db, l, ids };
}

async function pair() {
  const db = createMemoryDatabase();
  const u = make('U', { leagueBelowId: 'L' });
  const l = make('L', { leagueAboveId: 'U' });
  const uIds = await build(db, u);
  const lIds = await build(db, l);
  await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
  await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
  return { db, u, l, uIds, lIds };
}

const planOf = async (db: Database, seasonId: string) => {
  const r = await getOffseasonPlan(db, seasonId);
  if (!r.ok || r.value === null) throw new Error('plan');
  return r.value;
};

/** The first player id of each archived team, by franchise. */
async function firstPlayers(db: Database, seasonId: string) {
  const a = await getSeasonArchive(db, seasonId);
  if (!a.ok || a.value === null) throw new Error('archive');
  return new Map(a.value.teams.map((t) => [t.franchiseId, t.players.map((p) => p.id)]));
}

async function protectAll(db: Database, league: League, seasonId: string, ids: string[]) {
  const players = await firstPlayers(db, seasonId);
  for (const id of ids) expect((await setProtection(db, league, id, players.get(id)![0])).ok).toBe(true);
  return players;
}

const snapshot = async (db: Database) => JSON.stringify([await db.list(ROSTER_COLLECTION), await db.list(FRANCHISE_COLLECTION), await db.list('name-registry')]);

describe('protect and run for an unlinked league', () => {
  it('covers only the staying teams and picks a distinct retiree and release for each', async () => {
    const { db, l, ids } = await solo();
    const before = await snapshot(db);
    const staying = ids.slice(1, 5);
    const players = await protectAll(db, l, 's-S', staying);
    const protectedPlan = await planOf(db, 's-S');
    expect(protectedPlan.teamChanges?.map((c) => c.franchiseId).sort()).toEqual([...staying].sort());
    expect(protectedPlan.teamChanges?.every((c) => c.retiredId === undefined)).toBe(true);

    const r = await ageAndRelease(db, l, { rng: () => 0 });
    expect(r.ok).toBe(true);
    const plan = await planOf(db, 's-S');
    expect(plan.teamChanges).toHaveLength(4);
    for (const c of plan.teamChanges!) {
      expect(new Set([c.protectedId, c.retiredId, c.releasedId]).size).toBe(3);
      expect(players.get(c.franchiseId)).toEqual(expect.arrayContaining([c.protectedId, c.retiredId!, c.releasedId!]));
    }
    expect(await snapshot(db)).toBe(before);
  });

  it('replaces an earlier protection and clears results when a protection changes', async () => {
    const { db, l, ids } = await solo();
    const staying = ids.slice(1, 5);
    const players = await protectAll(db, l, 's-S', staying);
    await ageAndRelease(db, l, { rng: () => 0 });
    expect((await setProtection(db, l, staying[0], players.get(staying[0])![1])).ok).toBe(true);
    const plan = await planOf(db, 's-S');
    expect(plan.teamChanges).toHaveLength(4);
    expect(plan.teamChanges?.find((c) => c.franchiseId === staying[0])?.protectedId).toBe(players.get(staying[0])![1]);
    expect(plan.teamChanges?.every((c) => c.retiredId === undefined && c.releasedId === undefined)).toBe(true);
  });

  it('needs a protection for every participating team', async () => {
    const { db, l, ids } = await solo();
    await protectAll(db, l, 's-S', ids.slice(1, 4));
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'protection-incomplete' } });
    expect((await planOf(db, 's-S')).teamChanges?.every((c) => c.retiredId === undefined)).toBe(true);
  });

  it('rejects a departing team, a new team and a player from another team', async () => {
    const { db, l, ids } = await solo();
    const players = await firstPlayers(db, 's-S');
    expect(await setProtection(db, l, ids[0], players.get(ids[0])![0])).toMatchObject({ ok: false, error: { kind: 'unknown-player' } });
    expect(await setProtection(db, l, 'nope', 'x')).toMatchObject({ ok: false, error: { kind: 'unknown-player' } });
    expect(await setProtection(db, l, ids[1], players.get(ids[2])![0])).toMatchObject({ ok: false, error: { kind: 'unknown-player' } });
    const added = await addNewTeam(db, l, { city: 'Richmond', name: 'Falcons', primaryColor: '#112233', secondaryColor: '#ffffff' }, 'promoted', { newId: () => 'n-1' });
    expect(added.ok).toBe(true);
    expect(await setProtection(db, l, 'n-1', (await planOf(db, 's-S')).newTeams![0].players[0].id)).toMatchObject({ ok: false, error: { kind: 'unknown-player' } });
  });

  it('rerolls the release on a re-run', async () => {
    const { db, l, ids } = await solo();
    await protectAll(db, l, 's-S', ids.slice(1, 5));
    await ageAndRelease(db, l, { rng: () => 0 });
    const first = (await planOf(db, 's-S')).teamChanges![0].releasedId;
    await ageAndRelease(db, l, { rng: () => 0.999 });
    expect((await planOf(db, 's-S')).teamChanges![0].releasedId).not.toBe(first);
  });

  it('is cleared when departures are saved again but newTeams stay', async () => {
    const { db, l, ids } = await solo();
    await addNewTeam(db, l, { city: 'Richmond', name: 'Falcons', primaryColor: '#112233', secondaryColor: '#ffffff' }, 'promoted', { newId: () => 'n-1' });
    await protectAll(db, l, 's-S', ids.slice(1, 5));
    await saveOffseasonPlan(db, l, [ids[0]], [ids[5]]);
    const plan = await planOf(db, 's-S');
    expect(plan.teamChanges).toBeUndefined();
    expect(plan.newTeams).toHaveLength(1);
  });
});

describe('errors', () => {
  it('reports no season, not offseason, no plan and no archive', async () => {
    const db = createMemoryDatabase();
    const l = make('S');
    await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: l.id, value: l }]);
    expect(await setProtection(db, l, 'a', 'b')).toMatchObject({ ok: false, error: { kind: 'no-season' } });
    const ids = await build(db, l, false);
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'not-offseason' } });
    await finishSeason(db, l, ids);
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'no-plan' } });
    await db.batch([{ type: 'delete', collection: 'season-archives', id: 's-S' }]);
    await db.batch([{ type: 'put', collection: 'offseason-plans', id: 's-S', value: { seasonId: 's-S', leagueId: 'S', promoted: [ids[0]], demoted: [ids[5]] } }]);
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'no-archive' } });
  });

  it('fails closed on an unreadable plan and keeps the old plan when the write fails', async () => {
    const { db, l, ids } = await solo();
    const players = await firstPlayers(db, 's-S');
    const failing: Database = { ...db, get: db.get.bind(db), list: db.list.bind(db), close: db.close.bind(db), batch: async () => ({ ok: false, error: new Error('disk full') }) };
    expect(await setProtection(failing, l, ids[1], players.get(ids[1])![0])).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect((await planOf(db, 's-S')).teamChanges).toBeUndefined();
    await db.batch([{ type: 'put', collection: 'offseason-plans', id: 's-S', value: { seasonId: 's-S' } }]);
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'storage' } });
  });
});

describe('arrivals', () => {
  it('requires current staged arrivals, then includes them and drops results on restage', async () => {
    const { db, l, u, lIds, uIds } = await pair();
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'arrivals-not-ready' } });
    expect(await setProtection(db, l, uIds[5], 'x')).toMatchObject({ ok: false, error: { kind: 'arrivals-not-ready' } });
    expect((await stageArrivals(db, l)).ok).toBe(true);
    const stayingAndArrival = [...lIds.slice(1, 5), uIds[5]];
    const lPlayers = await firstPlayers(db, 's-L');
    const uPlayers = await firstPlayers(db, 's-U');
    for (const id of stayingAndArrival) {
      const pid = (lPlayers.get(id) ?? uPlayers.get(id))![0];
      expect((await setProtection(db, l, id, pid)).ok).toBe(true);
    }
    expect((await ageAndRelease(db, l)).ok).toBe(true);
    expect((await planOf(db, 's-L')).teamChanges).toHaveLength(5);
    // The upper league has no arrivals staged yet, so it is not ready.
    expect(await ageAndRelease(db, u)).toMatchObject({ ok: false, error: { kind: 'arrivals-not-ready' } });
    await stageArrivals(db, l);
    expect((await planOf(db, 's-L')).teamChanges).toBeUndefined();
  });

  it('is not ready when the linked league changes its departures after staging', async () => {
    const { db, l, u, uIds } = await pair();
    await stageArrivals(db, l);
    await saveOffseasonPlan(db, u, [uIds[1]], [uIds[4]]);
    expect(await ageAndRelease(db, l)).toMatchObject({ ok: false, error: { kind: 'arrivals-not-ready' } });
  });
});
