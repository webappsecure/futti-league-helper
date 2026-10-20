import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { deleteLeague } from '@/leagues/league-repository';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, listFranchises } from '@/teams/franchise-repository';
import { OFFSEASON_PLAN_COLLECTION } from './offseason-plan';
import { getOffseasonPlan, planErrorText, saveOffseasonPlan } from './offseason-plan-repository';

const league: League = { id: 'L1', name: 'Premier', size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 2, demotedCount: 1 };

let counter = 0;
const nextId = () => `t-${++counter}`;

async function setup(end = true) {
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
  const a = await acceptLeague(db, league, () => 's-1');
  if (!a.ok) throw new Error('accept');
  const teams = await listFranchises(db, league);
  if (!teams.ok) throw new Error('teams');
  const ids = teams.value.teams.map((t) => t.id);
  if (end) await finishSeason(db, league, ids);
  return { db, ids };
}

describe('saveOffseasonPlan', () => {
  it('saves the plan and saves a changed one over it', async () => {
    const { db, ids } = await setup();
    const first = await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[5]]);
    expect(first.ok).toBe(true);
    expect(await getOffseasonPlan(db, 's-1')).toEqual({
      ok: true,
      value: { seasonId: 's-1', leagueId: 'L1', promoted: [ids[0], ids[1]], demoted: [ids[5]] },
    });
    const second = await saveOffseasonPlan(db, league, [ids[1], ids[2]], [ids[4]]);
    expect(second.ok).toBe(true);
    const stored = await getOffseasonPlan(db, 's-1');
    expect(stored.ok && stored.value?.promoted).toEqual([ids[1], ids[2]]);
  });

  it('rejects a season that has not ended', async () => {
    const { db, ids } = await setup(false);
    const r = await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[5]]);
    expect(r).toMatchObject({ ok: false, error: { kind: 'not-offseason' } });
    expect(await getOffseasonPlan(db, 's-1')).toEqual({ ok: true, value: null });
  });

  it('rejects a league with no season', async () => {
    const db = createMemoryDatabase();
    expect(await saveOffseasonPlan(db, league, [], [])).toMatchObject({ ok: false, error: { kind: 'no-season' } });
  });

  it('rejects a missing archive', async () => {
    const { db, ids } = await setup();
    await db.batch([{ type: 'delete', collection: 'season-archives', id: 's-1' }]);
    const r = await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[5]]);
    expect(r).toMatchObject({ ok: false, error: { kind: 'no-archive' } });
  });

  it('rejects invalid departures without writing', async () => {
    const { db, ids } = await setup();
    expect(await saveOffseasonPlan(db, league, [ids[0]], [ids[5]])).toMatchObject({ ok: false, error: { kind: 'promoted-count' } });
    expect(await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[1]])).toMatchObject({ ok: false, error: { kind: 'overlap' } });
    expect(await saveOffseasonPlan(db, league, [ids[0], 'zz'], [ids[5]])).toMatchObject({ ok: false, error: { kind: 'unknown-team' } });
    expect(await getOffseasonPlan(db, 's-1')).toEqual({ ok: true, value: null });
  });

  it('keeps the previous plan when the batch fails', async () => {
    const { db, ids } = await setup();
    await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[5]]);
    const failing: Database = { ...db, get: db.get.bind(db), list: db.list.bind(db), close: db.close.bind(db), batch: async () => ({ ok: false, error: new Error('disk full') }) };
    const r = await saveOffseasonPlan(failing, league, [ids[1], ids[2]], [ids[4]]);
    expect(r).toMatchObject({ ok: false, error: { kind: 'storage' } });
    const stored = await getOffseasonPlan(db, 's-1');
    expect(stored.ok && stored.value?.promoted).toEqual([ids[0], ids[1]]);
  });

  it('has text for each error', () => {
    for (const kind of ['no-season', 'not-offseason', 'no-archive', 'overlap'] as const) {
      expect(planErrorText({ kind }, league).length).toBeGreaterThan(0);
    }
    expect(planErrorText({ kind: 'storage', error: new Error('x') }, league)).toBe('x');
  });
});

describe('getOffseasonPlan', () => {
  it('fails closed on an unreadable document', async () => {
    const { db } = await setup();
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 's-1', value: { seasonId: 's-1' } }]);
    expect((await getOffseasonPlan(db, 's-1')).ok).toBe(false);
  });
});

describe('deleteLeague', () => {
  it('removes the plan with the season', async () => {
    const { db, ids } = await setup();
    await saveOffseasonPlan(db, league, [ids[0], ids[1]], [ids[5]]);
    expect((await deleteLeague(db, league.id)).ok).toBe(true);
    expect(await getOffseasonPlan(db, 's-1')).toEqual({ ok: true, value: null });
  });
});
