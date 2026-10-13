import { createMemoryDatabase } from '@/storage/memory-database';
import { createFranchise } from '@/teams/franchise-repository';
import type { LeagueInput } from './league';
import { linkLeagues, unlinkLeagues } from './league-link-repository';
import { createLeague, deleteLeague, getLeague, listLeagues, updateLeague } from './league-repository';

type Db = ReturnType<typeof createMemoryDatabase>;

const input = (o: Partial<LeagueInput> = {}): LeagueInput => ({
  name: 'L',
  size: 10,
  namingStyle: 'nameOnly',
  relegation: true,
  promotedCount: 2,
  demotedCount: 2,
  ...o,
});

async function make(db: Db, id: string, o: Partial<LeagueInput> = {}) {
  const r = await createLeague(db, input({ name: id, ...o }), () => id);
  if (!r.ok) throw new Error('create failed');
  return r.value;
}

const get = async (db: Db, id: string) => {
  const r = await getLeague(db, id);
  return r.ok ? r.value : null;
};

async function pair() {
  const db = createMemoryDatabase();
  const upper = await make(db, 'U', { promotedCount: 0 });
  const lower = await make(db, 'L', { demotedCount: 0 });
  return { db, upper, lower };
}

describe('linkLeagues and unlinkLeagues', () => {
  it('links both sides and unlinks both sides', async () => {
    const { db } = await pair();
    expect(await linkLeagues(db, 'U', 'L')).toEqual({ ok: true });
    expect((await get(db, 'U'))?.leagueBelowId).toBe('L');
    expect((await get(db, 'L'))?.leagueAboveId).toBe('U');
    expect(await unlinkLeagues(db, 'U', 'L')).toEqual({ ok: true });
    expect(await get(db, 'U')).not.toHaveProperty('leagueBelowId');
    expect(await get(db, 'L')).not.toHaveProperty('leagueAboveId');
  });

  it('refuses a mismatch without writing', async () => {
    const { db } = await pair();
    await make(db, 'X', { namingStyle: 'cityAndName', promotedCount: 0 });
    const r = await linkLeagues(db, 'U', 'X');
    expect(r.ok === false && r.error.kind === 'link' && r.error.message).toMatch(/differently/);
    expect(await get(db, 'U')).not.toHaveProperty('leagueBelowId');
  });

  it('refuses stale data when a slot was taken meanwhile', async () => {
    const { db } = await pair();
    await make(db, 'M');
    await linkLeagues(db, 'U', 'L');
    const r = await linkLeagues(db, 'U', 'M');
    expect(r.ok === false && r.error.kind === 'link' && r.error.message).toMatch(/already has a league below/);
  });

  it('reports a missing league', async () => {
    const { db } = await pair();
    expect(await linkLeagues(db, 'U', 'nope')).toEqual({ ok: false, error: { kind: 'not-found' } });
    expect(await unlinkLeagues(db, 'nope', 'L')).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('refuses a team name shared across the two chains', async () => {
    const { db, upper, lower } = await pair();
    const team = (name: string) => ({ city: 'Bath', name, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' });
    await createFranchise(db, upper, team('Rovers'));
    await createFranchise(db, lower, team(' rovers '));
    const r = await linkLeagues(db, 'U', 'L');
    expect(r.ok === false && r.error.kind === 'link' && r.error.message).toContain('"rovers"');
    expect(await get(db, 'L')).not.toHaveProperty('leagueAboveId');
  });

  it('replaces a dangling link', async () => {
    const { db } = await pair();
    await db.batch([{ type: 'put', collection: 'leagues', id: 'U', value: { ...(await get(db, 'U')), leagueBelowId: 'gone' } }]);
    expect(await linkLeagues(db, 'U', 'L')).toEqual({ ok: true });
    expect((await get(db, 'U'))?.leagueBelowId).toBe('L');
  });
});

describe('linked league edit and delete', () => {
  it('keeps link ids when a linked league is edited, including size', async () => {
    const { db } = await pair();
    await linkLeagues(db, 'U', 'L');
    const r = await updateLeague(db, 'U', input({ name: 'Renamed', size: 12, promotedCount: 0 }));
    expect(r.ok && r.value.leagueBelowId).toBe('L');
    expect((await get(db, 'U'))?.leagueBelowId).toBe('L');
  });

  it('rejects naming style, relegation-off and count changes while linked', async () => {
    const { db } = await pair();
    await linkLeagues(db, 'U', 'L');
    const fields = async (o: Partial<LeagueInput>) => {
      const r = await updateLeague(db, 'U', input({ promotedCount: 0, ...o }));
      return r.ok ? null : r.error.kind === 'validation' ? r.error.fields : r.error;
    };
    expect(await fields({ namingStyle: 'cityAndName' })).toHaveProperty('namingStyle');
    expect(await fields({ relegation: false })).toHaveProperty('counts');
    expect(await fields({ demotedCount: 3 })).toHaveProperty('demotedCount');
    expect((await get(db, 'U'))?.demotedCount).toBe(2);
  });

  it('allows free edits once unlinked', async () => {
    const { db } = await pair();
    await linkLeagues(db, 'U', 'L');
    await unlinkLeagues(db, 'U', 'L');
    expect((await updateLeague(db, 'U', input({ namingStyle: 'cityAndName' }))).ok).toBe(true);
  });

  it('clears the neighbor link when a linked league is deleted', async () => {
    const { db } = await pair();
    await make(db, 'M', { promotedCount: 2, demotedCount: 2 });
    await linkLeagues(db, 'U', 'M');
    await linkLeagues(db, 'M', 'L');
    expect(await deleteLeague(db, 'M')).toEqual({ ok: true, value: undefined });
    expect(await get(db, 'U')).not.toHaveProperty('leagueBelowId');
    expect(await get(db, 'L')).not.toHaveProperty('leagueAboveId');
    const listed = await listLeagues(db);
    expect(listed.ok && listed.value.leagues.map((l) => l.id).sort()).toEqual(['L', 'U']);
  });
});
