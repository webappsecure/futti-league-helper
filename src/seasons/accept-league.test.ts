import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { deleteLeague } from '@/leagues/league-repository';
import {
  generateLeagueRosters,
  listRosters,
  rerollLeague,
  rerollPlayer,
  rerollTeam,
} from '@/rosters/roster-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import {
  FRANCHISE_COLLECTION,
  createFranchise,
  deleteFranchise,
  listFranchises,
  updateFranchise,
} from '@/teams/franchise-repository';
import { acceptLeague } from './accept-league';
import { SEASON_COLLECTION } from './season';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: false, promotedCount: 0, demotedCount: 0 };

let counter = 0;
const nextId = () => `t-${++counter}`;

async function setup(teams: number, withRosters = true) {
  const db = createMemoryDatabase();
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < teams; i += 1) {
    const r = await createFranchise(
      db,
      league,
      { city: 'City', name: `Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
      nextId,
    );
    if (!r.ok) throw new Error('team');
  }
  if (withRosters) await generateLeagueRosters(db, league);
  return db;
}

const seasons = async (db: Database) => {
  const r = await db.list(SEASON_COLLECTION);
  if (!r.ok) throw r.error;
  return r.value;
};

describe('acceptLeague', () => {
  it('writes season 1 as active in one document', async () => {
    const db = await setup(6);
    const r = await acceptLeague(db, league, () => 's-1');
    expect(r).toEqual({ ok: true, value: { id: 's-1', leagueId: 'L1', index: 1, status: 'active' } });
    expect((await seasons(db)).length).toBe(1);
  });

  it('rejects a second accept', async () => {
    const db = await setup(6);
    await acceptLeague(db, league, () => 's-1');
    const r = await acceptLeague(db, league, () => 's-2');
    expect(r).toEqual({ ok: false, error: { kind: 'already-accepted' } });
    expect((await seasons(db)).length).toBe(1);
  });

  it('rejects a league that is not full', async () => {
    const db = await setup(5);
    const r = await acceptLeague(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'incomplete', teams: 5, size: 6 } });
    expect(await seasons(db)).toEqual([]);
  });

  it('rejects teams without rosters', async () => {
    const db = await setup(6, false);
    const r = await acceptLeague(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'missing-rosters', count: 6 } });
    expect(await seasons(db)).toEqual([]);
  });

  it('rejects an unreadable roster', async () => {
    const db = await setup(6);
    const rosters = await db.list<{ franchiseId: string }>(ROSTER_COLLECTION);
    if (!rosters.ok) throw rosters.error;
    const first = rosters.value[0];
    await db.batch([{ type: 'put', collection: ROSTER_COLLECTION, id: first.id, value: { ...first.value, players: [] } }]);
    const r = await acceptLeague(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'unreadable' } });
    expect(await seasons(db)).toEqual([]);
  });

  it('rejects an unreadable team', async () => {
    const db = await setup(6);
    await db.batch([{ type: 'put', collection: FRANCHISE_COLLECTION, id: 'bad', value: { leagueId: 'L1' } }]);
    const r = await acceptLeague(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'unreadable' } });
  });

  it('returns a storage error when a read fails', async () => {
    const db = await setup(6);
    const broken: Database = { ...db, list: async () => ({ ok: false, error: new Error('boom') }) };
    const r = await acceptLeague(broken, league);
    expect(r.ok === false && r.error.kind).toBe('storage');
  });

  it('returns a storage error when the write fails and writes nothing', async () => {
    const db = await setup(6);
    const broken: Database = { ...db, batch: async () => ({ ok: false, error: new Error('disk') }) };
    const r = await acceptLeague(broken, league);
    expect(r.ok === false && r.error.kind).toBe('storage');
    expect(await seasons(db)).toEqual([]);
  });
});

describe('locking after accept', () => {
  const input = { city: 'City', name: 'Late', primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' as const };

  it('rejects every roster and team change once accepted, and allows them before', async () => {
    const db = await setup(6);
    const teams = await listFranchises(db, league);
    if (!teams.ok) throw new Error('teams');
    const team = teams.value.teams[0];
    const rosters = await listRosters(db, league);
    if (!rosters.ok) throw new Error('rosters');
    const player = rosters.value.rosters[0].players[0];

    expect((await rerollTeam(db, league, team.id)).ok).toBe(true);
    await acceptLeague(db, league, () => 's-1');
    const before = await db.list(ROSTER_COLLECTION);

    const locked = { ok: false, error: { kind: 'locked' } };
    expect(await generateLeagueRosters(db, league)).toEqual(locked);
    expect(await rerollLeague(db, league)).toEqual(locked);
    expect(await rerollTeam(db, league, team.id)).toEqual(locked);
    expect(await rerollPlayer(db, league, team.id, player.id)).toEqual(locked);
    expect(await createFranchise(db, league, input)).toEqual(locked);
    expect(await updateFranchise(db, league, team.id, input)).toEqual(locked);
    expect(await deleteFranchise(db, team.id)).toEqual(locked);
    expect(await db.list(ROSTER_COLLECTION)).toEqual(before);
    const after = await listFranchises(db, league);
    expect(after.ok && after.value.teams.length).toBe(6);
  });

  it('does not lock other leagues', async () => {
    const db = await setup(6);
    await acceptLeague(db, league, () => 's-1');
    const other: League = { ...league, id: 'L2', name: 'Second' };
    await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: other.id, value: other }]);
    expect((await createFranchise(db, other, input, nextId)).ok).toBe(true);
  });

  it('fails closed when the season lookup fails', async () => {
    const db = await setup(6);
    const broken: Database = { ...db, list: async () => ({ ok: false, error: new Error('boom') }) };
    const r = await rerollLeague(broken, league);
    expect(r.ok === false && r.error.kind).toBe('storage');
  });

  it('deleting the league removes its season', async () => {
    const db = await setup(6);
    await acceptLeague(db, league, () => 's-1');
    expect((await deleteLeague(db, league.id)).ok).toBe(true);
    expect(await seasons(db)).toEqual([]);
  });
});
