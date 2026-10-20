import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { deleteLeague } from '@/leagues/league-repository';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { FRANCHISE_COLLECTION, createFranchise, listFranchises } from '@/teams/franchise-repository';
import { acceptLeague } from './accept-league';
import { SEASON_COLLECTION } from './season';
import { SEASON_ARCHIVE_COLLECTION } from './season-archive';
import { finishErrorText, finishSeason, getSeasonArchive, updateFinishingOrder } from './season-archive-repository';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: false, promotedCount: 0, demotedCount: 0 };

let counter = 0;
const nextId = () => `t-${++counter}`;

async function setup(accept = true) {
  const db = createMemoryDatabase();
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(
      db,
      league,
      { city: 'City', name: `Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
      nextId,
    );
    if (!r.ok) throw new Error('team');
  }
  await generateLeagueRosters(db, league);
  if (accept) {
    const a = await acceptLeague(db, league, () => 's-1');
    if (!a.ok) throw new Error('accept');
  }
  const teams = await listFranchises(db, league);
  if (!teams.ok) throw new Error('teams');
  return { db, ids: teams.value.teams.map((t) => t.id) };
}

const season = async (db: Database) => {
  const r = await db.get<{ status: string }>(SEASON_COLLECTION, 's-1');
  if (!r.ok) throw r.error;
  return r.value;
};

describe('finishSeason', () => {
  it('saves the snapshot and moves the season to offseason together', async () => {
    const { db, ids } = await setup();
    const order = [...ids].reverse();
    const r = await finishSeason(db, league, order);
    expect(r.ok).toBe(true);
    expect((await season(db))?.status).toBe('offseason');
    const archive = await getSeasonArchive(db, 's-1');
    if (!archive.ok || archive.value === null) throw new Error('archive');
    expect(archive.value.teams.map((t) => t.franchiseId)).toEqual(order);
    expect(archive.value.teams.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(archive.value.teams.every((t) => t.players.length === 8)).toBe(true);
  });

  it('rejects a second finish and changes nothing', async () => {
    const { db, ids } = await setup();
    await finishSeason(db, league, ids);
    const before = await getSeasonArchive(db, 's-1');
    const r = await finishSeason(db, league, [...ids].reverse());
    expect(r).toEqual({ ok: false, error: { kind: 'not-active' } });
    expect(await getSeasonArchive(db, 's-1')).toEqual(before);
  });

  it('rejects a league that was not accepted', async () => {
    const { db, ids } = await setup(false);
    expect(await finishSeason(db, league, ids)).toEqual({ ok: false, error: { kind: 'no-season' } });
  });

  it('rejects an order that does not list every team once, without writing', async () => {
    const { db, ids } = await setup();
    const r = await finishSeason(db, league, [ids[0], ids[0], ...ids.slice(2)]);
    expect(r).toEqual({ ok: false, error: { kind: 'invalid-order' } });
    expect((await season(db))?.status).toBe('active');
    expect(await getSeasonArchive(db, 's-1')).toEqual({ ok: true, value: null });
  });

  it('rejects an unreadable team', async () => {
    const { db, ids } = await setup();
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: 'bad', value: { leagueId: 'L1' } }]);
    expect(await finishSeason(db, league, ids)).toEqual({ ok: false, error: { kind: 'unreadable' } });
    expect((await season(db))?.status).toBe('active');
  });

  it('rejects an unreadable roster', async () => {
    const { db, ids } = await setup();
    await db.batch([{ type: 'put', collection: ROSTER_COLLECTION, id: ids[0], value: { franchiseId: ids[0], leagueId: 'L1', players: [] } }]);
    expect(await finishSeason(db, league, ids)).toEqual({ ok: false, error: { kind: 'unreadable' } });
  });

  it('rejects a league with fewer teams than its size', async () => {
    const { db, ids } = await setup();
    await db.batch([{ type: 'delete', collection: FRANCHISE_COLLECTION, id: ids[0] }]);
    expect(await finishSeason(db, league, ids.slice(1))).toEqual({ ok: false, error: { kind: 'incomplete', teams: 5, size: 6 } });
  });

  it('leaves both documents unchanged when the batch fails', async () => {
    const { db, ids } = await setup();
    const failing: Database = { ...db, get: db.get.bind(db), list: db.list.bind(db), close: db.close.bind(db), batch: async () => ({ ok: false, error: new Error('disk full') }) };
    const r = await finishSeason(failing, league, ids);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(finishErrorText(r.error)).toBe('disk full');
    expect((await season(db))?.status).toBe('active');
    expect(await getSeasonArchive(db, 's-1')).toEqual({ ok: true, value: null });
  });
});

describe('updateFinishingOrder', () => {
  it('is rejected while the season is active', async () => {
    const { db, ids } = await setup();
    expect(await updateFinishingOrder(db, league, ids)).toEqual({ ok: false, error: { kind: 'not-offseason' } });
  });

  it('changes only the positions in offseason', async () => {
    const { db, ids } = await setup();
    await finishSeason(db, league, ids);
    const before = await getSeasonArchive(db, 's-1');
    const order = [...ids].reverse();
    const r = await updateFinishingOrder(db, league, order);
    expect(r.ok).toBe(true);
    const after = await getSeasonArchive(db, 's-1');
    if (!before.ok || !after.ok || !before.value || !after.value) throw new Error('archive');
    expect(after.value.teams.map((t) => t.franchiseId)).toEqual(order);
    expect(after.value.teams.find((t) => t.franchiseId === ids[0])?.players).toEqual(
      before.value.teams.find((t) => t.franchiseId === ids[0])?.players,
    );
    expect((await season(db))?.status).toBe('offseason');
  });

  it('rejects a bad order and keeps the saved one', async () => {
    const { db, ids } = await setup();
    await finishSeason(db, league, ids);
    const r = await updateFinishingOrder(db, league, ids.slice(1));
    expect(r).toEqual({ ok: false, error: { kind: 'invalid-order' } });
    const archive = await getSeasonArchive(db, 's-1');
    expect(archive.ok && archive.value?.teams.map((t) => t.franchiseId)).toEqual(ids);
  });

  it('reports a missing archive', async () => {
    const { db, ids } = await setup();
    await finishSeason(db, league, ids);
    await db.batch([{ type: 'delete', collection: SEASON_ARCHIVE_COLLECTION, id: 's-1' }]);
    expect(await updateFinishingOrder(db, league, ids)).toEqual({ ok: false, error: { kind: 'no-archive' } });
  });
});

describe('getSeasonArchive', () => {
  it('fails closed on an unreadable document', async () => {
    const { db } = await setup();
    await db.batch([{ type: 'put', collection: SEASON_ARCHIVE_COLLECTION, id: 's-1', value: { seasonId: 's-1' } }]);
    expect((await getSeasonArchive(db, 's-1')).ok).toBe(false);
  });
});

describe('deleteLeague', () => {
  it('removes the archive with the season', async () => {
    const { db, ids } = await setup();
    await finishSeason(db, league, ids);
    expect((await deleteLeague(db, league.id)).ok).toBe(true);
    expect(await getSeasonArchive(db, 's-1')).toEqual({ ok: true, value: null });
    expect(await season(db)).toBeNull();
  });
});
