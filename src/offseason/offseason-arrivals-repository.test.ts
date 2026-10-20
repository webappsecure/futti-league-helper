import { LEAGUE_COLLECTION, type League } from '@/leagues/league';
import { generateLeagueRosters } from '@/rosters/roster-repository';
import type { StandardRosterPlayer } from '@/rosters/roster';
import { rngFromDice } from '@/rules/test-rng';
import { acceptLeague } from '@/seasons/accept-league';
import { finishSeason, getSeasonArchive } from '@/seasons/season-archive-repository';
import { createMemoryDatabase } from '@/storage/memory-database';
import type { Database } from '@/storage/types';
import { createFranchise, listFranchises } from '@/teams/franchise-repository';
import { OFFSEASON_PLAN_COLLECTION } from './offseason-plan';
import { blockedText, getArrivalStatus, getOffseasonPlan, planErrorText, saveOffseasonPlan, stageArrivals } from './offseason-plan-repository';

const make = (id: string, extra: Partial<League> = {}): League => ({
  id, name: `League ${id}`, size: 6, namingStyle: 'cityAndName', relegation: true, promotedCount: 1, demotedCount: 1, ...extra,
});
const upper = make('U', { leagueBelowId: 'M' });
const middle = make('M', { leagueAboveId: 'U', leagueBelowId: 'L' });
const lower = make('L', { leagueAboveId: 'M' });

let counter = 0;
const nextId = () => `t-${++counter}`;

/** Creates, fills, accepts and (optionally) ends a league; returns its franchise ids in listed order. */
async function build(db: Database, league: League, end = true) {
  await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: league.id, value: league }]);
  for (let i = 0; i < league.size; i += 1) {
    const r = await createFranchise(
      db,
      league,
      { city: 'City', name: `${league.id}-Team${i}`, primaryColor: '#000000', secondaryColor: '#ffffff', initialGrade: 'B' },
      nextId,
    );
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

/** Upper and lower leagues, both ended; `M` is unused here so the pair link directly. */
async function pair(end = true) {
  const db = createMemoryDatabase();
  const u = make('U', { leagueBelowId: 'L' });
  const l = make('L', { leagueAboveId: 'U' });
  const uIds = await build(db, u, end);
  const lIds = await build(db, l, end);
  return { db, u, l, uIds, lIds };
}

const dice = () => rngFromDice(...Array(24).fill(3));

describe('stageArrivals', () => {
  it('stages raised rosters for the lower league from the upper league\'s demoted team', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    const r = await stageArrivals(db, l, dice());
    expect(r.ok).toBe(true);
    const plan = await getOffseasonPlan(db, 's-L');
    if (!plan.ok || plan.value === null) throw new Error('plan');
    const arrivals = plan.value.arrivals ?? [];
    expect(arrivals).toHaveLength(1);
    const archive = await getSeasonArchive(db, 's-U');
    if (!archive.ok || archive.value === null) throw new Error('archive');
    const from = archive.value.teams.find((t) => t.franchiseId === uIds[5])!;
    expect(arrivals[0]).toMatchObject({ franchiseId: uIds[5], fromLeagueId: 'U', sourceSeasonId: 's-U', movement: 'demoted' });
    const before = from.players[0] as StandardRosterPlayer;
    const after = arrivals[0].players[0] as StandardRosterPlayer;
    expect(after.offense + after.defense).toBeGreaterThanOrEqual(before.offense + before.defense);
    expect(after.id).toBe(before.id);
  });

  it('stages reduced rosters for the upper league from the lower league\'s promoted team', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    expect((await stageArrivals(db, u, dice())).ok).toBe(true);
    const plan = await getOffseasonPlan(db, 's-U');
    const arrivals = (plan.ok && plan.value?.arrivals) || [];
    expect(arrivals.map((a) => [a.franchiseId, a.movement])).toEqual([[lIds[0], 'promoted']]);
    const archive = await getSeasonArchive(db, 's-L');
    if (!archive.ok || archive.value === null) throw new Error('archive');
    const before = archive.value.teams[0].players[0] as StandardRosterPlayer;
    const after = arrivals[0].players[0] as StandardRosterPlayer;
    expect(after.offense + after.defense).toBeLessThanOrEqual(before.offense + before.defense);
  });

  it('stages from both neighbors for a league in the middle', async () => {
    const db = createMemoryDatabase();
    const uIds = await build(db, upper);
    const mIds = await build(db, middle);
    const lIds = await build(db, lower);
    await saveOffseasonPlan(db, upper, [uIds[0]], [uIds[5]]);
    await saveOffseasonPlan(db, middle, [mIds[0]], [mIds[5]]);
    await saveOffseasonPlan(db, lower, [lIds[0]], [lIds[5]]);
    expect((await stageArrivals(db, middle, rngFromDice(...Array(24).fill(3)))).ok).toBe(true);
    const plan = await getOffseasonPlan(db, 's-M');
    const arrivals = (plan.ok && plan.value?.arrivals) || [];
    expect(arrivals.map((a) => [a.franchiseId, a.movement]).sort()).toEqual([[lIds[0], 'promoted'], [uIds[5], 'demoted']].sort());
  });

  it('replaces earlier arrivals when restaged and keeps them when departures are saved again', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    await stageArrivals(db, l, rngFromDice(...Array(12).fill(1)));
    const first = await getOffseasonPlan(db, 's-L');
    await stageArrivals(db, l, rngFromDice(...Array(12).fill(6)));
    const second = await getOffseasonPlan(db, 's-L');
    expect(first.ok && second.ok && first.value?.arrivals).not.toEqual(second.ok && second.value?.arrivals);
    expect((await saveOffseasonPlan(db, l, [lIds[1]], [lIds[4]])).ok).toBe(true);
    const kept = await getOffseasonPlan(db, 's-L');
    expect(kept.ok && kept.value?.arrivals).toEqual(second.ok && second.value?.arrivals);
    expect(kept.ok && kept.value?.promoted).toEqual([lIds[1]]);
  });

  it('stages an empty list for an unlinked league', async () => {
    const db = createMemoryDatabase();
    const solo = make('S');
    const ids = await build(db, solo);
    await saveOffseasonPlan(db, solo, [ids[0]], [ids[5]]);
    expect((await stageArrivals(db, solo)).ok).toBe(true);
    const plan = await getOffseasonPlan(db, 's-S');
    expect(plan.ok && plan.value?.arrivals).toEqual([]);
  });

  it('is blocked until the neighbor has saved its plan, and says why', async () => {
    const { db, u, l, lIds } = await pair();
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    const r = await stageArrivals(db, l);
    expect(r).toMatchObject({ ok: false, error: { kind: 'blocked', blocked: [{ leagueId: 'U', direction: 'above', reason: 'no-plan' }] } });
    if (r.ok || r.error.kind !== 'blocked') throw new Error('blocked');
    expect(blockedText(r.error.blocked[0])).toContain('has not saved its plan yet');
    expect(planErrorText(r.error, l)).toContain(u.name);
    const plan = await getOffseasonPlan(db, 's-L');
    expect(plan.ok && plan.value?.arrivals).toBeUndefined();
  });

  it('is blocked while the neighbor season is still active', async () => {
    const db = createMemoryDatabase();
    const u = make('U', { leagueBelowId: 'L' });
    const l = make('L', { leagueAboveId: 'U' });
    await build(db, u, false);
    const lIds = await build(db, l);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    const r = await stageArrivals(db, l);
    expect(r).toMatchObject({ ok: false, error: { kind: 'blocked', blocked: [{ reason: 'not-offseason' }] } });
  });

  it('is blocked when the neighbor was never accepted or lost its results', async () => {
    const db = createMemoryDatabase();
    const u = make('U', { leagueBelowId: 'L' });
    const l = make('L', { leagueAboveId: 'U' });
    await db.batch([{ type: 'put', collection: LEAGUE_COLLECTION, id: 'U', value: u }]);
    const lIds = await build(db, l);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    expect(await stageArrivals(db, l)).toMatchObject({ ok: false, error: { kind: 'blocked', blocked: [{ reason: 'no-season' }] } });
    const uIds = await build(db, u);
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await db.batch([{ type: 'delete', collection: 'season-archives', id: 's-U' }]);
    expect(await stageArrivals(db, l)).toMatchObject({ ok: false, error: { kind: 'blocked', blocked: [{ reason: 'no-archive' }] } });
  });

  it('needs this league\'s own plan and an ended season', async () => {
    const { db, l } = await pair();
    expect(await stageArrivals(db, l)).toMatchObject({ ok: false, error: { kind: 'no-plan' } });
    const early = createMemoryDatabase();
    const e = make('E');
    await build(early, e, false);
    expect(await stageArrivals(early, e)).toMatchObject({ ok: false, error: { kind: 'not-offseason' } });
    expect(await stageArrivals(createMemoryDatabase(), e)).toMatchObject({ ok: false, error: { kind: 'no-season' } });
  });

  it('keeps the old plan when the batch fails', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    const before = await getOffseasonPlan(db, 's-L');
    const failing: Database = { ...db, get: db.get.bind(db), list: db.list.bind(db), close: db.close.bind(db), batch: async () => ({ ok: false, error: new Error('disk full') }) };
    expect(await stageArrivals(failing, l, dice())).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect(await getOffseasonPlan(db, 's-L')).toEqual(before);
  });

  it('fails closed on an unreadable neighbor plan', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: 's-U', value: { seasonId: 's-U' } }]);
    expect(await stageArrivals(db, l)).toMatchObject({ ok: false, error: { kind: 'storage' } });
    expect((await getArrivalStatus(db, l)).ok).toBe(false);
  });
});

describe('getArrivalStatus', () => {
  it('reports expected, staged and whether staging is current, and notices a changed neighbor plan', async () => {
    const { db, u, l, uIds, lIds } = await pair();
    await saveOffseasonPlan(db, l, [lIds[0]], [lIds[5]]);
    const blocked = await getArrivalStatus(db, l);
    expect(blocked.ok && blocked.value.blocked.map((b) => b.reason)).toEqual(['no-plan']);
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[5]]);
    const ready = await getArrivalStatus(db, l);
    expect(ready.ok && [ready.value.blocked.length, ready.value.expected.map((e) => e.franchiseId), ready.value.staged, ready.value.current]).toEqual([0, [uIds[5]], null, false]);
    await stageArrivals(db, l, dice());
    const staged = await getArrivalStatus(db, l);
    expect(staged.ok && [staged.value.staged?.length, staged.value.current]).toEqual([1, true]);
    await saveOffseasonPlan(db, u, [uIds[0]], [uIds[4]]);
    const stale = await getArrivalStatus(db, l);
    expect(stale.ok && [stale.value.staged?.length, stale.value.current]).toEqual([1, false]);
  });

  it('is current and empty for an unlinked league', async () => {
    const db = createMemoryDatabase();
    const solo = make('S');
    const ids = await build(db, solo);
    await saveOffseasonPlan(db, solo, [ids[0]], [ids[5]]);
    await stageArrivals(db, solo);
    const status = await getArrivalStatus(db, solo);
    expect(status.ok && [status.value.expected, status.value.staged, status.value.current]).toEqual([[], [], true]);
  });
});
