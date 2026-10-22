import { createMemoryDatabase } from '@/storage/memory-database';
import { SEASON_COLLECTION, type Season } from './season';
import { getLeagueSeason } from './season-repository';

const season: Season = { id: 's1', leagueId: 'L1', index: 1, status: 'active' };
const put = (id: string, value: unknown) => ({ type: 'put' as const, collection: SEASON_COLLECTION, id, value });

describe('getLeagueSeason', () => {
  it('returns null when there is no season', async () => {
    const db = createMemoryDatabase();
    expect(await getLeagueSeason(db, 'L1')).toEqual({ ok: true, value: null });
  });

  it('returns the league season and ignores other leagues', async () => {
    const db = createMemoryDatabase();
    await db.batch([put('s1', season), put('s2', { ...season, id: 's2', leagueId: 'L2' })]);
    expect(await getLeagueSeason(db, 'L1')).toEqual({ ok: true, value: season });
    expect(await getLeagueSeason(db, 'L3')).toEqual({ ok: true, value: null });
  });

  it('fails closed on a damaged document for the league', async () => {
    const db = createMemoryDatabase();
    await db.batch([put('s1', { ...season, status: 'bogus' })]);
    const r = await getLeagueSeason(db, 'L1');
    expect(r.ok).toBe(false);
  });

  it('ignores a damaged document for another league', async () => {
    const db = createMemoryDatabase();
    await db.batch([put('s2', { id: 's2', leagueId: 'L2', index: 0, status: 'active' })]);
    expect(await getLeagueSeason(db, 'L1')).toEqual({ ok: true, value: null });
  });

  it('returns the highest-index season of the league', async () => {
    const db = createMemoryDatabase();
    const next = { ...season, id: 's0', index: 2 };
    await db.batch([put('s1', { ...season, status: 'archived' }), put('s0', next)]);
    expect(await getLeagueSeason(db, 'L1')).toEqual({ ok: true, value: next });
  });
});
