import type { LeagueInput } from './league';
import {
  createLeague,
  deleteLeague,
  getLeague,
  listLeagues,
  updateLeague,
} from './league-repository';
import { listFranchises, createFranchise } from '@/teams/franchise-repository';
import { createMemoryDatabase } from '@/storage/memory-database';

const input = (overrides: Partial<LeagueInput> = {}): LeagueInput => ({
  name: 'Premier',
  size: 20,
  namingStyle: 'nameOnly',
  relegation: false,
  promotedCount: 0,
  demotedCount: 0,
  ...overrides,
});

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

async function created(db: ReturnType<typeof createMemoryDatabase>, overrides: Partial<LeagueInput> = {}, newId = ids()) {
  const result = await createLeague(db, input(overrides), newId);
  if (!result.ok) throw new Error('create failed');
  return result.value;
}

describe('league repository', () => {
  it('creates a league that can be read back and listed', async () => {
    const db = createMemoryDatabase();
    const league = await created(db);
    expect(league).toEqual({ id: 'id-1', name: 'Premier', size: 20, namingStyle: 'nameOnly', relegation: false, promotedCount: 0, demotedCount: 0 });
    expect(await getLeague(db, 'id-1')).toEqual({ ok: true, value: league });
    expect(await listLeagues(db)).toEqual({ ok: true, value: { leagues: [league], unreadable: 0 } });
  });

  it('lists by name ignoring case, then id', async () => {
    const db = createMemoryDatabase();
    const newId = ids();
    await created(db, { name: 'beta' }, newId);
    await created(db, { name: 'Alpha' }, newId);
    await created(db, { name: 'alpha' }, newId);
    await created(db, { name: 'Charlie' }, newId);
    const listed = await listLeagues(db);
    expect(listed.ok && listed.value.leagues.map((l) => `${l.name}:${l.id}`)).toEqual([
      'Alpha:id-2',
      'alpha:id-3',
      'beta:id-1',
      'Charlie:id-4',
    ]);
  });

  it('updates settings and keeps the id', async () => {
    const db = createMemoryDatabase();
    await created(db);
    const result = await updateLeague(db, 'id-1', input({ name: 'Championship', size: 12, relegation: true, promotedCount: 2 }));
    expect(result).toEqual({
      ok: true,
      value: { id: 'id-1', name: 'Championship', size: 12, namingStyle: 'nameOnly', relegation: true, promotedCount: 2, demotedCount: 0 },
    });
    const listed = await listLeagues(db);
    expect(listed.ok && listed.value.leagues).toHaveLength(1);
  });

  it('fails to update a missing league without writing', async () => {
    const db = createMemoryDatabase();
    expect(await updateLeague(db, 'nope', input())).toEqual({ ok: false, error: { kind: 'not-found' } });
    expect(await listLeagues(db)).toEqual({ ok: true, value: { leagues: [], unreadable: 0 } });
  });

  it('returns field errors and writes nothing when the input is invalid', async () => {
    const db = createMemoryDatabase();
    const result = await createLeague(db, input({ name: '' }), ids());
    expect(result.ok === false && result.error.kind).toBe('validation');
    expect(await listLeagues(db)).toEqual({ ok: true, value: { leagues: [], unreadable: 0 } });

    await created(db);
    const update = await updateLeague(db, 'id-1', input({ name: '' }));
    expect(update.ok === false && update.error.kind).toBe('validation');
    const kept = await getLeague(db, 'id-1');
    expect(kept.ok && kept.value?.name).toBe('Premier');
  });

  it('deletes a league, and deleting a missing one succeeds', async () => {
    const db = createMemoryDatabase();
    await created(db);
    expect(await deleteLeague(db, 'id-1')).toEqual({ ok: true, value: undefined });
    expect(await getLeague(db, 'id-1')).toEqual({ ok: true, value: null });
    expect(await deleteLeague(db, 'id-1')).toEqual({ ok: true, value: undefined });
  });

  it('counts invalid stored documents as unreadable without listing or changing them', async () => {
    const db = createMemoryDatabase();
    await created(db);
    await db.batch([
      { type: 'put', collection: 'leagues', id: 'bad-1', value: { id: 'bad-1', name: 'x' } },
      { type: 'put', collection: 'leagues', id: 'bad-2', value: 'not an object' },
      { type: 'put', collection: 'leagues', id: 'mismatch', value: { id: 'other', name: 'M', size: 8, namingStyle: 'nameOnly', relegation: false, promotedCount: 0, demotedCount: 0 } },
    ]);
    const listed = await listLeagues(db);
    expect(listed.ok && listed.value.leagues).toHaveLength(1);
    expect(listed.ok && listed.value.unreadable).toBe(3);
    expect(await db.get('leagues', 'bad-1')).toEqual({ ok: true, value: { id: 'bad-1', name: 'x' } });
    const read = await getLeague(db, 'bad-1');
    expect(read.ok === false && read.error.kind).toBe('storage');
  });

  it('refuses to overwrite an unreadable stored league', async () => {
    const db = createMemoryDatabase();
    await db.batch([{ type: 'put', collection: 'leagues', id: 'bad', value: { broken: true } }]);
    const result = await updateLeague(db, 'bad', input());
    expect(result.ok === false && result.error.kind).toBe('storage');
    expect(await db.get('leagues', 'bad')).toEqual({ ok: true, value: { broken: true } });
  });

  it('reports a storage failure', async () => {
    const real = createMemoryDatabase();
    const failing = { ...real, batch: async () => ({ ok: false as const, error: new Error('disk full') }) };
    const result = await createLeague(failing, input(), ids());
    expect(result).toEqual({ ok: false, error: { kind: 'storage', error: new Error('disk full') } });
  });
});

describe('league repository with teams', () => {
  const team = { city: 'Richmond', name: 'Greyhounds', primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'A' };

  async function withTeams(count: number, otherLeagueTeams = 0) {
    const db = createMemoryDatabase();
    const newId = ids();
    const league = await created(db, { size: 10 }, newId);
    const other = await created(db, { name: 'Other' }, newId);
    for (let i = 0; i < count; i += 1) await createFranchise(db, league, { ...team, name: `T${i}` });
    for (let i = 0; i < otherLeagueTeams; i += 1) await createFranchise(db, other, { ...team, name: `O${i}` });
    return { db, league, other };
  }

  it('deletes only its own franchises with the league', async () => {
    const { db, league, other } = await withTeams(3, 2);
    expect((await deleteLeague(db, league.id)).ok).toBe(true);
    expect(await listFranchises(db, league)).toEqual({ ok: true, value: { teams: [], unreadable: 0 } });
    const rest = await listFranchises(db, other);
    expect(rest.ok && rest.value.teams).toHaveLength(2);
    expect(await getLeague(db, league.id)).toEqual({ ok: true, value: null });
  });

  it('refuses a size below the team count and writes nothing', async () => {
    const { db, league } = await withTeams(10);
    const result = await updateLeague(db, league.id, input({ name: 'Renamed', size: 8 }));
    expect(result).toEqual({ ok: false, error: { kind: 'validation', fields: { size: expect.any(String) } } });
    const stored = await getLeague(db, league.id);
    expect(stored.ok && stored.value?.name).toBe('Premier');
  });

  it('allows a size at or above the team count', async () => {
    const { db, league } = await withTeams(10);
    expect((await updateLeague(db, league.id, input({ size: 10 }))).ok).toBe(true);
    expect((await updateLeague(db, league.id, input({ size: 12 }))).ok).toBe(true);
  });
});
