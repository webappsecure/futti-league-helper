import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { burnNames, getBurnedNames, NAME_REGISTRY_COLLECTION } from '@/names/name-registry';
import { ROSTER_COLLECTION } from '@/rosters/roster';
import { deleteLeague } from '@/leagues/league-repository';
import {
  generateLeagueRosters,
  listRosters,
  renamePlayer,
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
import { acceptLeague, acceptErrorText } from './accept-league';
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

describe('acceptLeague burning', () => {
  const rosterNames = async (db: Database, l: League) => {
    const r = await listRosters(db, l);
    if (!r.ok) throw new Error('list');
    return r.value.rosters.flatMap((x) => x.players.map((p) => p.name));
  };
  const burned = async (db: Database) => {
    const r = await getBurnedNames(db);
    if (!r.ok) throw r.error;
    return r.value;
  };

  it('burns every roster name with the season', async () => {
    const db = await setup(6);
    const names = await rosterNames(db, league);
    expect((await acceptLeague(db, league)).ok).toBe(true);
    expect(await burned(db)).toEqual(new Set(names));
    expect(names).toHaveLength(48);
  });

  it('does not burn names that were rerolled away', async () => {
    const db = await setup(6);
    const before = await rosterNames(db, league);
    await rerollLeague(db, league);
    const after = await rosterNames(db, league);
    await acceptLeague(db, league);
    const set = await burned(db);
    expect(set).toEqual(new Set(after));
    for (const name of before) if (!after.includes(name)) expect(set.has(name)).toBe(false);
  });

  it('burns a hand-typed name', async () => {
    const db = await setup(6);
    const r = await listRosters(db, league);
    if (!r.ok) throw new Error('list');
    const { franchiseId, players } = r.value.rosters[0];
    await renamePlayer(db, league, franchiseId, players[0].id, 'Zzyzx');
    await acceptLeague(db, league);
    expect((await burned(db)).has('ZZYZX')).toBe(true);
  });

  it('keeps earlier burned names when another league is accepted', async () => {
    const db = await setup(6);
    const second: League = { ...league, id: 'L2', name: 'Second' };
    await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: second.id, value: second }]);
    for (let i = 0; i < 6; i += 1) {
      await createFranchise(db, second, { city: 'Town', name: `Other${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' }, nextId);
    }
    await generateLeagueRosters(db, second);
    const [first, next] = [await rosterNames(db, league), await rosterNames(db, second)];
    const [a, b] = await Promise.all([acceptLeague(db, league, () => 's-a'), acceptLeague(db, second, () => 's-b')]);
    expect(a.ok && b.ok).toBe(true);
    expect(await burned(db)).toEqual(new Set([...first, ...next]));
  });

  it('rejects an already-burned roster name and writes nothing', async () => {
    const db = await setup(6);
    const [taken] = await rosterNames(db, league);
    await burnNames(db, [taken]);
    const r = await acceptLeague(db, league);
    expect(r).toEqual({ ok: false, error: { kind: 'burned-names', names: [taken] } });
    expect(r.ok === false && acceptErrorText(r.error)).toContain(taken);
    expect(await seasons(db)).toEqual([]);
    expect(await burned(db)).toEqual(new Set([taken]));
  });

  it('rejects an unreadable registry and writes nothing', async () => {
    const db = await setup(6);
    await db.batch([{ type: 'put', collection: NAME_REGISTRY_COLLECTION, id: 'burned', value: { names: 'x' } }]);
    const r = await acceptLeague(db, league);
    expect(r.ok === false && r.error.kind).toBe('storage');
    expect(await seasons(db)).toEqual([]);
  });

  it('burns nothing and creates no season when the batch fails', async () => {
    const db = await setup(6);
    const broken: Database = { ...db, batch: async () => ({ ok: false, error: new Error('disk') }) };
    expect((await acceptLeague(broken, league)).ok).toBe(false);
    expect(await seasons(db)).toEqual([]);
    expect((await burned(db)).size).toBe(0);
  });

  it.each(['rename first', 'accept first'])('keeps renames and burning consistent when started together (%s)', async (order) => {
    const db = await setup(6);
    const r = await listRosters(db, league);
    if (!r.ok) throw new Error('list');
    const { franchiseId, players } = r.value.rosters[0];
    const rename = () => renamePlayer(db, league, franchiseId, players[0].id, 'Zzyzx');
    const accept = () => acceptLeague(db, league);
    const results = order === 'rename first' ? await Promise.all([rename(), accept()]) : (await Promise.all([accept(), rename()])).reverse();
    expect(results[1].ok).toBe(true);
    expect(results[0].ok).toBe(order === 'rename first');
    expect(await burned(db)).toEqual(new Set(await rosterNames(db, league)));
  });
});
